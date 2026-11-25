const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const SiteContent = require("../../models/SiteContentModel");
const Subscriber = require("../../models/SubscriberModel");
const SupportTicket = require("../../models/SupportTicketModel");
const Counter = require("../../models/CounterModel");
const { getSettings } = require("../../utils/settings");
const { shippingQuote } = require("../../utils/pricing");
const { razorpayConfigured } = require("../../utils/razorpay");
const { STAFF_ROLES } = require("../../Config/permissions");
const { DEFAULT_CONTENT } = require("../../Config/defaultContent");
const { fail, str, isEmail, num } = require("../../utils/http");

/* ================= STORE CONFIG (what the storefront may know) ================= */
const Config = async (req, res) => {
  const s = await getSettings();
  res.json({
    store: s.store,
    currency: s.store?.currency || "INR",
    codEnabled: !!s.payments?.codEnabled,
    codMaxAmount: s.payments?.codMaxAmount || 0,
    onlineEnabled: !!s.payments?.onlineEnabled && razorpayConfigured(),
    razorpayKeyId: razorpayConfigured() ? process.env.RAZORPAY_KEY_ID : null, // public key id only
    guestCheckout: !!s.payments?.guestCheckout,
    freeShippingThreshold: s.shipping?.freeThreshold || 0,
    flatShipping: s.shipping?.flatRate || 0,
    returnWindowDays: s.orders?.returnWindowDays ?? 7,
    tax: s.tax,
    lowStockThreshold: s.inventory?.lowStockThreshold ?? 5,
  });
};

/* ================= SITE CONTENT ================= */
const isAdminRequest = (req) => {
  try {
    const d = jwt.verify(req.cookies.adminToken, process.env.JWT_SECRET);
    return STAFF_ROLES.includes(d.role);
  } catch {
    return false;
  }
};

const withDefaults = (content) => {
  const c = content || {};
  const pick = (k) => (Array.isArray(c[k]) ? (c[k].length ? c[k] : DEFAULT_CONTENT[k]) : c[k] ?? DEFAULT_CONTENT[k]);
  return {
    announcement: c.announcement || DEFAULT_CONTENT.announcement,
    homeSections: pick("homeSections"),
    featuredCategories: c.featuredCategories || [],
    navLinks: pick("navLinks"),
    footerColumns: pick("footerColumns"),
    faqs: pick("faqs"),
    policies: { ...DEFAULT_CONTENT.policies, ...Object.fromEntries(Object.entries(c.policies || {}).filter(([, v]) => v)) },
    contact: { ...DEFAULT_CONTENT.contact, ...Object.fromEntries(Object.entries(c.contact || {}).filter(([, v]) => v)) },
  };
};

// ?preview=1 returns the unpublished draft — only for a signed-in admin
const Content = async (req, res) => {
  const doc = await SiteContent.findOne({ key: "site" }).lean();
  const preview = req.query.preview === "1" && isAdminRequest(req);
  res.setHeader("Cache-Control", preview ? "no-store" : "public, max-age=60");
  res.json({ ...withDefaults(preview ? doc?.draft || doc?.published : doc?.published), preview });
};

/* ================= DELIVERY CHECK ================= */
const ShippingCheck = async (req, res) => {
  const pincode = str(req.query.pincode, 10);
  if (!/^\d{6}$/.test(pincode)) fail(400, "Enter a valid 6-digit pincode");
  const s = await getSettings();
  const q = shippingQuote(s, pincode, num(req.query.amount, 0));
  const eta = (days) => new Date(Date.now() + days * 86400000);
  res.json({
    pincode,
    serviceable: q.serviceable,
    fee: q.fee,
    freeThreshold: q.freeThreshold,
    etaMin: q.etaMin,
    etaMax: q.etaMax,
    deliverBy: { from: eta(q.etaMin), to: eta(q.etaMax) },
    codAvailable: !!s.payments?.codEnabled && q.serviceable,
  });
};

/* ================= NEWSLETTER ================= */
const Subscribe = async (req, res) => {
  const email = str(req.body.email, 200).toLowerCase();
  if (!isEmail(email)) fail(400, "Please enter a valid email address");
  const existing = await Subscriber.findOne({ email });
  if (existing?.status === "subscribed") return res.json({ message: "You're already subscribed — thanks!" });
  await Subscriber.updateOne(
    { email },
    { $set: { status: "subscribed", source: str(req.body.source, 40) || "website" }, $setOnInsert: { email, token: crypto.randomBytes(16).toString("hex") } },
    { upsert: true }
  );
  res.status(201).json({ message: "Thanks for subscribing! Look out for our next update." });
};

const Unsubscribe = async (req, res) => {
  const token = str(req.body.token || req.query.token, 64);
  const sub = token && (await Subscriber.findOneAndUpdate({ token }, { status: "unsubscribed" }));
  if (!sub) fail(404, "This unsubscribe link is invalid");
  res.json({ message: "You have been unsubscribed." });
};

/* ================= CONTACT / SUPPORT ================= */
const ContactSupport = async (req, res) => {
  const name = str(req.account?.name || req.body.name, 100);
  const email = str(req.account?.email || req.body.email, 200).toLowerCase();
  const subject = str(req.body.subject, 200) || "Support request";
  const message = str(req.body.message, 4000);
  const errors = {};
  if (!name) errors.name = "Please enter your name";
  if (!isEmail(email)) errors.email = "Please enter a valid email";
  if (message.length < 10) errors.message = "Please write at least 10 characters";
  if (Object.keys(errors).length) fail(400, "Please check the form", { errors });

  const n = await Counter.next("ticket");
  const ticket = await SupportTicket.create({
    ticketNumber: `T${10000 + n}`,
    type: req.body.orderId ? "order" : "contact",
    user: req.user?.id,
    name,
    email,
    subject,
    message,
    order: /^[a-f\d]{24}$/i.test(String(req.body.orderId || "")) ? req.body.orderId : undefined,
  });
  res.status(201).json({ message: `Thanks ${name.split(" ")[0]}! Your request ${ticket.ticketNumber} has been received.`, ticketNumber: ticket.ticketNumber });
};

module.exports = { Config, Content, ShippingCheck, Subscribe, Unsubscribe, ContactSupport, withDefaults };
