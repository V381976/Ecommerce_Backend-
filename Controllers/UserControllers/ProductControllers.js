const mongoose = require("mongoose");
const Product = require("../../models/productmodel");
const Order = require("../../models/OrderDitealsModel");
const Review = require("../../models/ReviewModel");
const SupportTicket = require("../../models/SupportTicketModel");
const StockAlert = require("../../models/StockAlertModel");
const Counter = require("../../models/CounterModel");
const { getSettings } = require("../../utils/settings");
const { VISIBLE, effectiveFields, CARD_PROJECTION, decorate } = require("../../utils/catalog");
const { escapeRegex, str, num, bool, isObjectId, isEmail, paging, fail } = require("../../utils/http");

const list = (v) =>
  String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const ciIn = (values) => ({ $in: values.map((v) => new RegExp(`^${escapeRegex(v)}$`, "i")) });

// ================= ALL PRODUCTS (original contract: plain array) =================
const Productlist = async (req, res) => {
  try {
    const settings = await getSettings();
    // naye (admin added) pehle, phir dummyjson wale apne order me
    const products = await Product.find(VISIBLE).sort({ sourceId: 1, createdAt: -1 }).lean();
    res.json(products.map((p) => decorate(p, settings)));
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ================= SINGLE PRODUCT (id or slug) =================
const ProductShow = async (req, res) => {
  const key = req.params.id;
  const filter = isObjectId(key) ? { _id: key } : { slug: String(key).toLowerCase() };
  const product = await Product.findOne({ ...filter, ...VISIBLE }).lean();
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.json(decorate(product, await getSettings()));
};

// ================= CATALOG: search + filters + facets + pagination =================
const buildMatch = (q) => {
  const match = { ...VISIBLE };
  const and = [];
  const term = str(q.q, 100);
  if (term.length >= 1) {
    const rx = new RegExp(escapeRegex(term), "i");
    and.push({ $or: [{ title: rx }, { brand: rx }, { category: rx }, { subcategory: rx }, { tags: rx }] });
  }
  const cats = list(q.category);
  if (cats.length) match.category = ciIn(cats);
  const subs = list(q.subcategory);
  if (subs.length) match.subcategory = ciIn(subs);
  if (q.label) match.labels = { $in: list(q.label) };
  if (and.length) match.$and = and;
  return match;
};

const SORTS = {
  "price-asc": { finalPrice: 1, _id: 1 },
  "price-desc": { finalPrice: -1, _id: 1 },
  rating: { ratingValue: -1, reviewTotal: -1, _id: 1 },
  newest: { createdAt: -1, _id: 1 },
  popular: { soldCount: -1, ratingValue: -1, _id: 1 },
  discount: { discountPercent: -1, _id: 1 },
};

const Catalog = async (req, res) => {
  const settings = await getSettings();
  const q = req.query;
  const { page, limit, skip } = paging(q, 24, 60);
  const baseMatch = buildMatch(q);

  // filters on computed fields
  const post = {};
  const brands = list(q.brand);
  if (brands.length) post.brand = ciIn(brands);
  const minPrice = num(q.minPrice);
  const maxPrice = num(q.maxPrice);
  if (minPrice != null || maxPrice != null) {
    post.finalPrice = {};
    if (minPrice != null) post.finalPrice.$gte = minPrice;
    if (maxPrice != null) post.finalPrice.$lte = maxPrice;
  }
  const minRating = num(q.rating);
  if (minRating) post.ratingValue = { $gte: minRating };
  if (bool(q.inStock)) post.$or = [{ stockTotal: { $gt: 0 } }, { stockTotal: null }];
  if (bool(q.onSale)) post.$expr = { $lt: ["$finalPrice", "$price"] };

  const sort = SORTS[q.sort] || { sourceId: 1, createdAt: -1, _id: 1 };

  const [result] = await Product.aggregate([
    { $match: baseMatch },
    effectiveFields(settings),
    {
      $facet: {
        items: [{ $match: post }, { $sort: sort }, { $skip: skip }, { $limit: limit }, { $project: CARD_PROJECTION }],
        total: [{ $match: post }, { $count: "n" }],
        // facet counts ignore their own filter so options don't disappear when picked
        brands: [
          { $match: { ...post, brand: { $nin: [null, ""] } } },
          { $group: { _id: "$brand", count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 40 },
        ],
        allBrands: [
          { $match: { brand: { $nin: [null, ""] } } },
          { $group: { _id: "$brand", count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 40 },
        ],
        price: [{ $group: { _id: null, min: { $min: "$finalPrice" }, max: { $max: "$finalPrice" } } }],
      },
    },
  ]);

  // category counts use search term only (not the category filter itself)
  const catMatch = buildMatch({ ...q, category: "", subcategory: "" });
  const categories = await Product.aggregate([
    { $match: catMatch },
    { $group: { _id: { $toLower: "$category" }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const total = result.total[0]?.n || 0;
  res.json({
    products: result.items,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    limit,
    facets: {
      brands: (brands.length ? result.allBrands : result.brands).map((b) => ({ name: b._id, count: b.count })),
      categories: categories.map((c) => ({ name: c._id, count: c.count })),
      price: { min: Math.floor(result.price[0]?.min || 0), max: Math.ceil(result.price[0]?.max || 0) },
    },
  });
};

// ================= SEARCH SUGGESTIONS =================
const Suggest = async (req, res) => {
  const term = str(req.query.q, 60);
  if (term.length < 2) return res.json({ products: [], categories: [], brands: [] });
  const rx = new RegExp(escapeRegex(term), "i");
  const settings = await getSettings();

  const [products, categories, brands] = await Promise.all([
    Product.aggregate([
      { $match: { ...VISIBLE, $or: [{ title: rx }, { brand: rx }, { tags: rx }] } },
      effectiveFields(settings),
      { $sort: { soldCount: -1, ratingValue: -1 } },
      { $limit: 6 },
      { $project: { title: 1, slug: 1, thumbnail: 1, finalPrice: 1, price: 1, brand: 1 } },
    ]),
    Product.distinct("category", { ...VISIBLE, category: rx }),
    Product.distinct("brand", { ...VISIBLE, brand: rx }),
  ]);
  res.json({ products, categories: categories.slice(0, 4), brands: brands.slice(0, 4) });
};

// ================= CARDS BY IDS (recently viewed, guest wishlist) =================
const cardsByIds = async (ids, settings) => {
  const valid = ids.filter(isObjectId).slice(0, 50);
  if (!valid.length) return [];
  const docs = await Product.aggregate([
    { $match: { ...VISIBLE, _id: { $in: valid.map((id) => new mongoose.Types.ObjectId(id)) } } },
    effectiveFields(settings),
    { $project: CARD_PROJECTION },
  ]);
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  return valid.map((id) => byId.get(id)).filter(Boolean);
};

const ByIds = async (req, res) => {
  res.json(await cardsByIds(list(req.query.ids), await getSettings()));
};

// ================= RELATED + FREQUENTLY BOUGHT TOGETHER =================
const Related = async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return res.json({ related: [], boughtTogether: [] });
  const settings = await getSettings();
  const product = await Product.findById(id).select("category brand").lean();
  if (!product) return res.json({ related: [], boughtTogether: [] });

  const [related, pairs] = await Promise.all([
    Product.aggregate([
      { $match: { ...VISIBLE, _id: { $ne: product._id }, category: product.category } },
      effectiveFields(settings),
      { $sort: { soldCount: -1, ratingValue: -1 } },
      { $limit: 8 },
      { $project: CARD_PROJECTION },
    ]),
    Order.aggregate([
      { $match: { "items.product": product._id, orderStatus: { $nin: ["CANCELLED"] } } },
      { $sort: { createdAt: -1 } },
      { $limit: 500 },
      { $unwind: "$items" },
      { $match: { "items.product": { $ne: product._id } } },
      { $group: { _id: "$items.product", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 4 },
    ]),
  ]);

  const boughtTogether = await cardsByIds(pairs.map((p) => String(p._id)), settings);
  res.json({ related, boughtTogether });
};

// ================= RECOMMENDATIONS (from recently viewed) =================
const Recommendations = async (req, res) => {
  const settings = await getSettings();
  const viewed = list(req.query.ids).filter(isObjectId).slice(0, 20);
  let match = { ...VISIBLE };
  if (viewed.length) {
    const seen = await Product.find({ _id: { $in: viewed } }).select("category").lean();
    const cats = [...new Set(seen.map((p) => p.category))];
    match = { ...VISIBLE, category: { $in: cats }, _id: { $nin: viewed.map((v) => new mongoose.Types.ObjectId(v)) } };
  }
  const products = await Product.aggregate([
    { $match: match },
    effectiveFields(settings),
    { $sort: { soldCount: -1, ratingValue: -1 } },
    { $limit: 8 },
    { $project: CARD_PROJECTION },
  ]);
  res.json({ products, personalized: viewed.length > 0 });
};

// ================= REVIEWS =================
const ReviewList = async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) fail(404, "Product not found");
  const product = await Product.findById(id).select("reviews rating ratingAvg reviewCount").lean();
  if (!product) fail(404, "Product not found");
  const { page, limit, skip } = paging(req.query, 10, 50);

  const approvedFilter = { product: id, status: "approved" };
  const [reviews, total, dist] = await Promise.all([
    Review.find(approvedFilter).sort({ createdAt: -1 }).skip(skip).limit(limit).select("rating title comment userName verified createdAt").lean(),
    Review.countDocuments(approvedFilter),
    Review.aggregate([{ $match: { product: product._id, status: "approved" } }, { $group: { _id: "$rating", n: { $sum: 1 } } }]),
  ]);

  // imported (dummyjson) reviews still count towards the distribution
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  dist.forEach((d) => (distribution[d._id] = d.n));
  (product.reviews || []).forEach((r) => {
    const k = Math.min(5, Math.max(1, Math.round(r.rating || 0)));
    distribution[k] += 1;
  });

  let canReview = false;
  let myReview = null;
  if (req.user) {
    myReview = await Review.findOne({ product: id, user: req.user.id }).lean();
    const purchased = await Order.exists({ user: req.user.id, orderStatus: "DELIVERED", "items.product": id });
    canReview = !!purchased;
  }

  res.json({
    stats: {
      average: product.ratingAvg ?? product.rating ?? 0,
      count: product.reviewCount ?? (product.reviews || []).length,
      distribution,
    },
    reviews,
    imported: page === 1 ? product.reviews || [] : [],
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    canReview,
    myReview,
  });
};

const ReviewUpsert = async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) fail(404, "Product not found");
  const rating = Math.round(num(req.body.rating, 0));
  const title = str(req.body.title, 120);
  const comment = str(req.body.comment, 2000);
  if (rating < 1 || rating > 5) fail(400, "Please choose a rating from 1 to 5");
  if (comment.length < 10) fail(400, "Please write at least 10 characters");

  // verified purchasers only
  const order = await Order.findOne({ user: req.user.id, orderStatus: "DELIVERED", "items.product": id }).select("_id").lean();
  if (!order) fail(403, "Only customers who have received this product can review it");

  const existing = await Review.findOne({ product: id, user: req.user.id });
  if (existing) {
    Object.assign(existing, { rating, title, comment, status: "pending" }); // edits go back to moderation
    await existing.save();
    return res.json({ review: existing, message: "Your review was updated and will appear after moderation" });
  }
  const review = await Review.create({
    product: id,
    user: req.user.id,
    userName: req.account?.name,
    order: order._id,
    rating,
    title,
    comment,
    verified: true,
  });
  await Order.updateOne({ _id: order._id, "items.product": id }, { $set: { "items.$.reviewed": true } });
  res.status(201).json({ review, message: "Thanks! Your review will appear after moderation" });
};

// ================= PRODUCT QUESTIONS =================
const QuestionList = async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return res.json([]);
  const items = await SupportTicket.find({ product: id, type: "product_question", isPublic: true, answer: { $nin: [null, ""] } })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("message answer name createdAt")
    .lean();
  res.json(items.map((t) => ({ _id: t._id, question: t.message, answer: t.answer, askedBy: (t.name || "Customer").split(" ")[0], createdAt: t.createdAt })));
};

const QuestionAsk = async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id) || !(await Product.exists({ _id: id }))) fail(404, "Product not found");
  const message = str(req.body.question, 1000);
  if (message.length < 5) fail(400, "Please write your question");
  const recent = await SupportTicket.countDocuments({ user: req.user.id, createdAt: { $gt: new Date(Date.now() - 3600000) } });
  if (recent >= 10) fail(429, "You've asked a lot of questions — please try again later");

  const n = await Counter.next("ticket");
  await SupportTicket.create({
    ticketNumber: `T${10000 + n}`,
    type: "product_question",
    user: req.user.id,
    name: req.account?.name,
    email: req.account?.email,
    subject: "Product question",
    message,
    product: id,
  });
  res.status(201).json({ message: "Thanks! We'll answer your question soon." });
};

// ================= BACK-IN-STOCK ALERT =================
const NotifyMe = async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id) || !(await Product.exists({ _id: id }))) fail(404, "Product not found");
  const email = str(req.account?.email || req.body.email, 200).toLowerCase();
  if (!isEmail(email)) fail(400, "Please enter a valid email");
  await StockAlert.updateOne(
    { product: id, email },
    { $setOnInsert: { product: id, email, user: req.user?.id } },
    { upsert: true }
  );
  res.json({ message: "We'll let you know as soon as it's back in stock" });
};

module.exports = {
  Productlist,
  ProductShow,
  Catalog,
  Suggest,
  ByIds,
  Related,
  Recommendations,
  ReviewList,
  ReviewUpsert,
  QuestionList,
  QuestionAsk,
  NotifyMe,
};
