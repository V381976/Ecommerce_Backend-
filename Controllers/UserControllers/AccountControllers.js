const crypto = require("crypto");
const User = require("../../models/UserModel");
const Notification = require("../../models/NotificationModel");
const Review = require("../../models/ReviewModel");
const SupportTicket = require("../../models/SupportTicketModel");
const Subscriber = require("../../models/SubscriberModel");
const Product = require("../../models/productmodel");
const { getSettings } = require("../../utils/settings");
const { VISIBLE, effectiveFields, CARD_PROJECTION } = require("../../utils/catalog");
const { fail, str, isObjectId, paging, bool } = require("../../utils/http");
const mongoose = require("mongoose");

/* ================= ADDRESSES ================= */
const cleanAddress = (a = {}) => ({
  label: str(a.label, 40) || "Home",
  fullName: str(a.fullName, 100),
  phone: str(a.phone, 20),
  address: str(a.address, 300),
  city: str(a.city, 80),
  state: str(a.state, 80),
  pincode: str(a.pincode, 10),
});

const validateAddress = (a) => {
  const errors = {};
  if (!a.fullName) errors.fullName = "Full name is required";
  if (!/^[6-9]\d{9}$/.test(a.phone.replace(/[\s-]/g, "").replace(/^(\+91|0)/, ""))) errors.phone = "Enter a valid 10-digit mobile number";
  if (!a.address) errors.address = "Address is required";
  if (!a.city) errors.city = "City is required";
  if (!/^\d{6}$/.test(a.pincode)) errors.pincode = "Pincode must be 6 digits";
  if (Object.keys(errors).length) fail(400, "Please check the address details", { errors });
};

const listAddresses = async (req, res) => {
  const user = await User.findById(req.user.id).select("addresses").lean();
  res.json(user?.addresses || []);
};

const addAddress = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (user.addresses.length >= 10) fail(400, "You can save up to 10 addresses");
  const a = cleanAddress(req.body);
  validateAddress(a);
  const makeDefault = bool(req.body.isDefault) || user.addresses.length === 0;
  if (makeDefault) user.addresses.forEach((x) => (x.isDefault = false));
  user.addresses.push({ ...a, isDefault: makeDefault });
  await user.save();
  res.status(201).json(user.addresses);
};

const updateAddress = async (req, res) => {
  const user = await User.findById(req.user.id);
  const addr = isObjectId(req.params.id) && user.addresses.id(req.params.id);
  if (!addr) fail(404, "Address not found");
  const a = cleanAddress(req.body);
  validateAddress(a);
  Object.assign(addr, a);
  if (bool(req.body.isDefault)) user.addresses.forEach((x) => (x.isDefault = String(x._id) === String(addr._id)));
  await user.save();
  res.json(user.addresses);
};

const deleteAddress = async (req, res) => {
  const user = await User.findById(req.user.id);
  const addr = isObjectId(req.params.id) && user.addresses.id(req.params.id);
  if (!addr) fail(404, "Address not found");
  const wasDefault = addr.isDefault;
  addr.deleteOne();
  if (wasDefault && user.addresses[0]) user.addresses[0].isDefault = true;
  await user.save();
  res.json(user.addresses);
};

/* ================= WISHLIST ================= */
const wishlistCards = async (ids) => {
  if (!ids.length) return [];
  const settings = await getSettings();
  const docs = await Product.aggregate([
    { $match: { ...VISIBLE, _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(String(id))) } } },
    effectiveFields(settings),
    { $project: CARD_PROJECTION },
  ]);
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  return ids.map((id) => byId.get(String(id))).filter(Boolean);
};

const getWishlist = async (req, res) => {
  const user = await User.findById(req.user.id).select("wishlist").lean();
  const ids = (user?.wishlist || []).slice().reverse(); // newest first
  res.json({ ids: ids.map(String), products: await wishlistCards(ids) });
};

const addWishlist = async (req, res) => {
  const id = req.params.productId;
  if (!isObjectId(id) || !(await Product.exists({ _id: id }))) fail(404, "Product not found");
  const user = await User.findByIdAndUpdate(req.user.id, { $addToSet: { wishlist: id } }, { returnDocument: "after" })
    .select("wishlist")
    .lean();
  if (user.wishlist.length > 200) {
    await User.updateOne({ _id: req.user.id }, { $pop: { wishlist: -1 } });
  }
  res.json({ ids: user.wishlist.map(String) });
};

const removeWishlist = async (req, res) => {
  const user = await User.findByIdAndUpdate(req.user.id, { $pull: { wishlist: req.params.productId } }, { returnDocument: "after" })
    .select("wishlist")
    .lean();
  res.json({ ids: user.wishlist.map(String) });
};

// guest wishlist (localStorage) → account after login
const mergeWishlist = async (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter(isObjectId).slice(0, 100);
  const existing = await Product.find({ _id: { $in: ids } }).select("_id").lean();
  const user = await User.findByIdAndUpdate(
    req.user.id,
    { $addToSet: { wishlist: { $each: existing.map((p) => p._id) } } },
    { returnDocument: "after" }
  )
    .select("wishlist")
    .lean();
  res.json({ ids: user.wishlist.map(String) });
};

/* ================= NOTIFICATIONS ================= */
const listNotifications = async (req, res) => {
  const p = paging(req.query, 20, 50);
  const [items, total, unread] = await Promise.all([
    Notification.find({ user: req.user.id }).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
    Notification.countDocuments({ user: req.user.id }),
    Notification.countDocuments({ user: req.user.id, read: false }),
  ]);
  res.json({ notifications: items, total, unread, page: p.page, pages: Math.max(1, Math.ceil(total / p.limit)) });
};

const unreadCount = async (req, res) => {
  res.json({ unread: await Notification.countDocuments({ user: req.user.id, read: false }) });
};

const markRead = async (req, res) => {
  const filter = { user: req.user.id };
  if (req.params.id !== "all") {
    if (!isObjectId(req.params.id)) fail(404, "Not found");
    filter._id = req.params.id;
  }
  await Notification.updateMany(filter, { read: true });
  res.json({ ok: true });
};

/* ================= PREFERENCES ================= */
const PREF_KEYS = ["orderUpdates", "backInStock", "priceDrop", "promotions", "abandonedCart"];

const getPreferences = async (req, res) => {
  const user = await User.findById(req.user.id).select("email notificationPrefs").lean();
  const sub = await Subscriber.findOne({ email: user.email.toLowerCase() }).lean();
  res.json({ ...user.notificationPrefs, newsletter: sub?.status === "subscribed" });
};

const updatePreferences = async (req, res) => {
  const set = {};
  PREF_KEYS.forEach((k) => {
    if (k in req.body) set[`notificationPrefs.${k}`] = bool(req.body[k]);
  });
  const user = await User.findByIdAndUpdate(req.user.id, { $set: set }, { returnDocument: "after" }).select("email notificationPrefs").lean();

  if ("newsletter" in req.body) {
    const email = user.email.toLowerCase();
    await Subscriber.updateOne(
      { email },
      {
        $set: { status: bool(req.body.newsletter) ? "subscribed" : "unsubscribed", user: user._id },
        $setOnInsert: { email, token: crypto.randomBytes(16).toString("hex"), source: "account" },
      },
      { upsert: true }
    );
  }
  res.json({ message: "Preferences saved", prefs: user.notificationPrefs });
};

/* ================= MY REVIEWS / TICKETS ================= */
const myReviews = async (req, res) => {
  const reviews = await Review.find({ user: req.user.id }).sort({ createdAt: -1 }).populate("product", "title thumbnail slug").lean();
  res.json(reviews);
};

const myTickets = async (req, res) => {
  const tickets = await SupportTicket.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(50).populate("product", "title slug").lean();
  res.json(tickets);
};

const replyTicket = async (req, res) => {
  const message = str(req.body.message, 4000);
  if (!message) fail(400, "Write a message");
  const t = await SupportTicket.findOne({ _id: req.params.id, user: req.user.id });
  if (!t) fail(404, "Ticket not found");
  if (t.status === "closed") fail(400, "This conversation is closed");
  t.replies.push({ from: "customer", by: req.account?.name, message });
  t.status = "open";
  await t.save();
  res.json(t);
};

module.exports = {
  listAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  getWishlist,
  addWishlist,
  removeWishlist,
  mergeWishlist,
  listNotifications,
  unreadCount,
  markRead,
  getPreferences,
  updatePreferences,
  myReviews,
  myTickets,
  replyTicket,
};
