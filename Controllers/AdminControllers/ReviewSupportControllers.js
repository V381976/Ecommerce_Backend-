const Review = require("../../models/ReviewModel");
const Product = require("../../models/productmodel");
const SupportTicket = require("../../models/SupportTicketModel");
const { notifyUser, notifyEmail } = require("../../utils/notify");
const { audit } = require("../../utils/audit");
const { fail, str, isObjectId, escapeRegex, paging, bool } = require("../../utils/http");

/* ================= REVIEWS ================= */
// product rating = imported (dummyjson) reviews + approved customer reviews
const recomputeRating = async (productId) => {
  const product = await Product.findById(productId).select("reviews rating").lean();
  if (!product) return;
  const approved = await Review.find({ product: productId, status: "approved" }).select("rating").lean();
  const all = [...(product.reviews || []).map((r) => r.rating || 0), ...approved.map((r) => r.rating)];
  const update = all.length
    ? { ratingAvg: Math.round((all.reduce((s, r) => s + r, 0) / all.length) * 10) / 10, reviewCount: all.length }
    : { $unset: { ratingAvg: 1, reviewCount: 1 } };
  await Product.updateOne({ _id: productId }, update);
};

const ReviewList = async (req, res) => {
  const p = paging(req.query, 20, 100);
  const filter = {};
  if (["pending", "approved", "rejected", "flagged"].includes(req.query.status)) filter.status = req.query.status;
  if (isObjectId(req.query.product)) filter.product = req.query.product;
  if (req.query.rating) filter.rating = Number(req.query.rating);
  const q = str(req.query.q, 100);
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ comment: rx }, { title: rx }, { userName: rx }];
  }
  const [reviews, total, counts] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate("product", "title thumbnail slug").populate("user", "email").lean(),
    Review.countDocuments(filter),
    Review.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  res.json({
    reviews,
    total,
    page: p.page,
    pages: Math.max(1, Math.ceil(total / p.limit)),
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
  });
};

// PUT /reviews/:id/status { status, note }
const ReviewModerate = async (req, res) => {
  const status = req.body.status;
  if (!["approved", "rejected", "flagged", "pending"].includes(status)) fail(400, "Invalid status");
  const review = await Review.findById(req.params.id);
  if (!review) fail(404, "Review not found");
  const wasApproved = review.status === "approved";
  review.status = status;
  if (req.body.note !== undefined) review.adminNote = str(req.body.note, 300);
  await review.save();
  if (wasApproved || status === "approved") await recomputeRating(review.product);

  if (status === "approved" || status === "rejected") {
    const product = await Product.findById(review.product).select("title slug").lean();
    notifyUser(review.user, {
      type: "review",
      title: status === "approved" ? "Your review is live" : "Your review wasn't published",
      message:
        status === "approved"
          ? `Thanks! Your review of ${product?.title} is now visible to other shoppers.`
          : `Your review of ${product?.title} didn't meet our guidelines.${review.adminNote ? ` ${review.adminNote}` : ""}`,
      link: `/products/${product?.slug || review.product}`,
    });
  }
  audit(req, "review.moderate", { entity: "review", entityId: review._id, summary: `Review marked ${status}` });
  res.json(review);
};

const ReviewDelete = async (req, res) => {
  const review = await Review.findByIdAndDelete(req.params.id);
  if (review) {
    await recomputeRating(review.product);
    audit(req, "review.delete", { entity: "review", entityId: review._id, summary: "Deleted review" });
  }
  res.json({ message: "Review deleted" });
};

/* ================= SUPPORT / QUESTIONS ================= */
const TicketList = async (req, res) => {
  const p = paging(req.query, 20, 100);
  const filter = {};
  if (["open", "pending", "resolved", "closed"].includes(req.query.status)) filter.status = req.query.status;
  if (["contact", "order", "product_question"].includes(req.query.type)) filter.type = req.query.type;
  const q = str(req.query.q, 100);
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ ticketNumber: rx }, { email: rx }, { name: rx }, { subject: rx }, { message: rx }];
  }
  const [tickets, total, counts] = await Promise.all([
    SupportTicket.find(filter).sort({ updatedAt: -1 }).skip(p.skip).limit(p.limit).populate("product", "title slug thumbnail").populate("order", "orderNumber").lean(),
    SupportTicket.countDocuments(filter),
    SupportTicket.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  res.json({ tickets, total, page: p.page, pages: Math.max(1, Math.ceil(total / p.limit)), counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) });
};

const TicketGet = async (req, res) => {
  if (!isObjectId(req.params.id)) fail(404, "Ticket not found");
  const t = await SupportTicket.findById(req.params.id).populate("product", "title slug thumbnail").populate("order", "orderNumber totalAmount orderStatus").populate("user", "name email").lean();
  if (!t) fail(404, "Ticket not found");
  res.json(t);
};

// POST /support/:id/reply { message, publish? (product questions) , status? }
const TicketReply = async (req, res) => {
  const message = str(req.body.message, 4000);
  if (!message) fail(400, "Write a reply");
  const t = await SupportTicket.findById(req.params.id);
  if (!t) fail(404, "Ticket not found");
  t.replies.push({ from: "admin", by: req.admin?.name, message });
  if (t.type === "product_question") {
    t.answer = message;
    t.isPublic = req.body.publish === undefined ? true : bool(req.body.publish);
  }
  t.status = ["open", "pending", "resolved", "closed"].includes(req.body.status) ? req.body.status : "pending";
  await t.save();

  const payload = {
    type: "support",
    title: `Reply to your ${t.type === "product_question" ? "question" : `request ${t.ticketNumber}`}`,
    message: message.length > 300 ? `${message.slice(0, 297)}…` : message,
    link: t.type === "product_question" ? undefined : "/account/support",
  };
  if (t.user) notifyUser(t.user, payload);
  else notifyEmail(t.email, payload);

  audit(req, "support.reply", { entity: "ticket", entityId: t._id, summary: `Replied to ${t.ticketNumber}` });
  res.json(t);
};

const TicketStatus = async (req, res) => {
  const status = req.body.status;
  if (!["open", "pending", "resolved", "closed"].includes(status)) fail(400, "Invalid status");
  const update = { status };
  if (req.body.isPublic !== undefined) update.isPublic = bool(req.body.isPublic);
  const t = await SupportTicket.findByIdAndUpdate(req.params.id, update, { returnDocument: "after" });
  if (!t) fail(404, "Ticket not found");
  res.json(t);
};

module.exports = { ReviewList, ReviewModerate, ReviewDelete, TicketList, TicketGet, TicketReply, TicketStatus, recomputeRating };
