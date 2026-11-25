const SiteContent = require("../../models/SiteContentModel");
const Settings = require("../../models/SettingsModel");
const Subscriber = require("../../models/SubscriberModel");
const AuditLog = require("../../models/AuditLogModel");
const { getSettings, clearSettingsCache } = require("../../utils/settings");
const { razorpayConfigured } = require("../../utils/razorpay");
const { mailEnabled } = require("../../utils/mailer");
const { withDefaults } = require("../UserControllers/PublicControllers");
const { audit } = require("../../utils/audit");
const { toCSV, sendCSV } = require("../../utils/csv");
const { fail, str, num, bool, paging, escapeRegex, dateRange } = require("../../utils/http");

const HOME_KEYS = ["categories", "featured", "deals", "top_rated", "new", "trending", "bestsellers", "recently_viewed", "recommended", "newsletter"];

const safeLink = (to) => {
  const t = str(to, 300);
  return /^(\/|https?:\/\/|mailto:|tel:)/i.test(t) ? t : "";
};

const parseContent = (b = {}) => ({
  announcement: {
    text: str(b.announcement?.text, 200),
    link: safeLink(b.announcement?.link),
    active: bool(b.announcement?.active),
  },
  homeSections: (Array.isArray(b.homeSections) ? b.homeSections : [])
    .filter((s) => HOME_KEYS.includes(s.key))
    .map((s) => ({ key: s.key, title: str(s.title, 80), enabled: bool(s.enabled) })),
  featuredCategories: (Array.isArray(b.featuredCategories) ? b.featuredCategories : []).map((c) => str(c, 80)).filter(Boolean).slice(0, 24),
  navLinks: (Array.isArray(b.navLinks) ? b.navLinks : [])
    .map((l) => ({ label: str(l.label, 40), to: safeLink(l.to) }))
    .filter((l) => l.label && l.to)
    .slice(0, 8),
  footerColumns: (Array.isArray(b.footerColumns) ? b.footerColumns : []).slice(0, 4).map((c) => ({
    title: str(c.title, 40),
    links: (Array.isArray(c.links) ? c.links : [])
      .map((l) => ({ label: str(l.label, 40), to: safeLink(l.to) }))
      .filter((l) => l.label && l.to)
      .slice(0, 8),
  })),
  faqs: (Array.isArray(b.faqs) ? b.faqs : [])
    .map((f) => ({ question: str(f.question, 200), answer: str(f.answer, 2000) }))
    .filter((f) => f.question && f.answer)
    .slice(0, 50),
  policies: {
    shipping: str(b.policies?.shipping, 10000),
    returns: str(b.policies?.returns, 10000),
    privacy: str(b.policies?.privacy, 10000),
    terms: str(b.policies?.terms, 10000),
  },
  contact: {
    email: str(b.contact?.email, 200),
    phone: str(b.contact?.phone, 40),
    address: str(b.contact?.address, 300),
    hours: str(b.contact?.hours, 100),
  },
});

/* ================= CONTENT ================= */
const ContentGet = async (req, res) => {
  const doc = await SiteContent.findOne({ key: "site" }).lean();
  const draft = withDefaults(doc?.draft || doc?.published);
  const published = withDefaults(doc?.published);
  res.json({
    draft,
    published,
    hasUnpublishedChanges: JSON.stringify(draft) !== JSON.stringify(published),
    publishedAt: doc?.publishedAt,
    publishedBy: doc?.publishedBy,
    updatedAt: doc?.updatedAt,
  });
};

const ContentSave = async (req, res) => {
  const draft = parseContent(req.body);
  await SiteContent.updateOne({ key: "site" }, { $set: { draft } }, { upsert: true });
  audit(req, "content.save", { entity: "content", summary: "Saved content draft" });
  res.json({ message: "Draft saved" });
};

const ContentPublish = async (req, res) => {
  const doc = await SiteContent.findOne({ key: "site" }).lean();
  if (!doc?.draft) fail(400, "Nothing to publish yet");
  await SiteContent.updateOne({ key: "site" }, { $set: { published: doc.draft, publishedAt: new Date(), publishedBy: req.admin?.name } });
  audit(req, "content.publish", { entity: "content", summary: "Published storefront content" });
  res.json({ message: "Published — changes are live on the storefront" });
};

const ContentDiscard = async (req, res) => {
  const doc = await SiteContent.findOne({ key: "site" }).lean();
  await SiteContent.updateOne({ key: "site" }, { $set: { draft: doc?.published || {} } }, { upsert: true });
  res.json({ message: "Draft discarded" });
};

/* ================= SETTINGS ================= */
const SettingsGet = async (req, res) => {
  const s = await getSettings();
  res.json({
    ...s,
    integrations: {
      razorpay: razorpayConfigured(),
      razorpayWebhook: !!process.env.RAZORPAY_WEBHOOK_SECRET,
      email: mailEnabled(),
      cloudinary: !!process.env.CLOUDINARY_CLOUD_NAME,
    },
  });
};

const SettingsUpdate = async (req, res) => {
  const b = req.body || {};
  const set = {};
  const errors = {};
  const n = (path, v, min, max) => {
    if (v === undefined) return;
    const x = num(v);
    if (x == null || x < min || (max != null && x > max)) errors[path] = `Must be between ${min} and ${max ?? "∞"}`;
    else set[path] = x;
  };

  if (b.store) {
    ["name", "email", "phone", "address"].forEach((k) => b.store[k] !== undefined && (set[`store.${k}`] = str(b.store[k], 300)));
    if (b.store.currency) set["store.currency"] = str(b.store.currency, 3).toUpperCase();
  }
  if (b.tax) {
    n("tax.rate", b.tax.rate, 0, 50);
    if (b.tax.inclusive !== undefined) set["tax.inclusive"] = bool(b.tax.inclusive);
    if (b.tax.label !== undefined) set["tax.label"] = str(b.tax.label, 20) || "Tax";
  }
  if (b.shipping) {
    n("shipping.flatRate", b.shipping.flatRate, 0);
    n("shipping.freeThreshold", b.shipping.freeThreshold, 0);
    n("shipping.defaultEtaMin", b.shipping.defaultEtaMin, 0, 60);
    n("shipping.defaultEtaMax", b.shipping.defaultEtaMax, 0, 60);
    if (b.shipping.restrictToZones !== undefined) set["shipping.restrictToZones"] = bool(b.shipping.restrictToZones);
    if (Array.isArray(b.shipping.zones)) {
      set["shipping.zones"] = b.shipping.zones.slice(0, 50).map((z) => ({
        name: str(z.name, 60),
        pincodePrefixes: (Array.isArray(z.pincodePrefixes) ? z.pincodePrefixes : String(z.pincodePrefixes || "").split(","))
          .map((p) => String(p).trim())
          .filter((p) => /^\d{1,6}$/.test(p)),
        charge: Math.max(0, num(z.charge, 0)),
        etaMin: num(z.etaMin),
        etaMax: num(z.etaMax),
        active: z.active === undefined ? true : bool(z.active),
      }));
    }
  }
  if (b.payments) {
    ["codEnabled", "onlineEnabled", "guestCheckout"].forEach((k) => b.payments[k] !== undefined && (set[`payments.${k}`] = bool(b.payments[k])));
    n("payments.codMaxAmount", b.payments.codMaxAmount, 0);
  }
  if (b.pricing?.applyProductDiscounts !== undefined) set["pricing.applyProductDiscounts"] = bool(b.pricing.applyProductDiscounts);
  if (b.inventory) n("inventory.lowStockThreshold", b.inventory.lowStockThreshold, 0, 100000);
  if (b.orders) {
    n("orders.returnWindowDays", b.orders.returnWindowDays, 0, 365);
    n("orders.paymentTimeoutMinutes", b.orders.paymentTimeoutMinutes, 5, 1440);
  }

  if (Object.keys(errors).length) fail(400, "Please fix the highlighted fields", { errors });
  await Settings.updateOne({ key: "store" }, { $set: set }, { upsert: true, setDefaultsOnInsert: true });
  clearSettingsCache();
  audit(req, "settings.update", { entity: "settings", summary: `Updated settings: ${Object.keys(set).join(", ")}` });
  res.json({ message: "Settings saved", settings: await getSettings() });
};

/* ================= AUDIT LOG ================= */
const AuditList = async (req, res) => {
  const p = paging(req.query, 30, 100);
  const filter = {};
  const q = str(req.query.q, 100);
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ action: rx }, { summary: rx }, { "actor.name": rx }];
  }
  if (req.query.entity) filter.entity = str(req.query.entity, 30);
  const range = dateRange(req.query);
  if (range) filter.createdAt = range;
  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ logs, total, page: p.page, pages: Math.max(1, Math.ceil(total / p.limit)) });
};

/* ================= NEWSLETTER ================= */
const SubscriberList = async (req, res) => {
  const p = paging(req.query, 30, 100);
  const filter = {};
  if (["subscribed", "unsubscribed"].includes(req.query.status)) filter.status = req.query.status;
  const q = str(req.query.q, 100);
  if (q) filter.email = new RegExp(escapeRegex(q), "i");

  if (req.query.format === "csv") {
    const all = await Subscriber.find(filter).sort({ createdAt: -1 }).lean();
    audit(req, "newsletter.export", { entity: "subscriber", summary: `Exported ${all.length} subscribers` });
    return sendCSV(res, "subscribers.csv", toCSV(all, [{ key: "email", header: "email" }, { key: "status", header: "status" }, { key: "source", header: "source" }, { key: "createdAt", header: "subscribed" }]));
  }
  const [subscribers, total, active] = await Promise.all([
    Subscriber.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
    Subscriber.countDocuments(filter),
    Subscriber.countDocuments({ status: "subscribed" }),
  ]);
  res.json({ subscribers, total, active, page: p.page, pages: Math.max(1, Math.ceil(total / p.limit)) });
};

module.exports = { ContentGet, ContentSave, ContentPublish, ContentDiscard, SettingsGet, SettingsUpdate, AuditList, SubscriberList };
