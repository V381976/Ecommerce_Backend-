const Coupon = require("../../models/CouponModel");
const Order = require("../../models/OrderDitealsModel");
const { audit } = require("../../utils/audit");
const { fail, str, num, bool, isObjectId, escapeRegex, paging } = require("../../utils/http");

const parseCoupon = (b) => {
  const errors = {};
  const c = {
    code: str(b.code, 30).toUpperCase().replace(/\s+/g, ""),
    description: str(b.description, 200),
    type: b.type === "fixed" ? "fixed" : b.type === "percent" ? "percent" : null,
    value: num(b.value),
    minCartValue: num(b.minCartValue, 0),
    maxDiscount: num(b.maxDiscount, null), // empty clears the cap
    usageLimit: num(b.usageLimit, null),
    perCustomerLimit: num(b.perCustomerLimit, 1),
    startsAt: b.startsAt ? new Date(b.startsAt) : null,
    expiresAt: b.expiresAt ? new Date(b.expiresAt) : null,
    applicableCategories: (Array.isArray(b.applicableCategories) ? b.applicableCategories : []).map((x) => str(x, 80)).filter(Boolean),
    applicableProducts: (Array.isArray(b.applicableProducts) ? b.applicableProducts : []).filter(isObjectId),
    freeShipping: bool(b.freeShipping),
    active: b.active === undefined ? true : bool(b.active),
  };
  if (!/^[A-Z0-9_-]{3,30}$/.test(c.code)) errors.code = "Use 3–30 letters, numbers, - or _";
  if (!c.type) errors.type = "Choose a discount type";
  if (c.value == null || c.value < 0) errors.value = "Enter a discount value";
  if (c.type === "percent" && c.value > 100) errors.value = "Percentage can't exceed 100";
  if (c.value === 0 && !c.freeShipping) errors.value = "Discount must be more than 0 (or enable free shipping)";
  if (c.minCartValue < 0) errors.minCartValue = "Can't be negative";
  if (c.expiresAt && isNaN(c.expiresAt)) errors.expiresAt = "Invalid date";
  if (c.startsAt && isNaN(c.startsAt)) errors.startsAt = "Invalid date";
  if (c.startsAt && c.expiresAt && c.expiresAt <= c.startsAt) errors.expiresAt = "Expiry must be after the start date";
  // expiry date means "valid through that day"
  if (c.expiresAt && !isNaN(c.expiresAt) && /^\d{4}-\d{2}-\d{2}$/.test(String(b.expiresAt))) c.expiresAt.setHours(23, 59, 59, 999);
  if (Object.keys(errors).length) fail(400, "Please fix the highlighted fields", { errors });
  return c;
};

const CouponList = async (req, res) => {
  const p = paging(req.query, 20, 100);
  const filter = {};
  const q = str(req.query.q, 40);
  if (q) filter.code = new RegExp(escapeRegex(q), "i");
  const now = new Date();
  if (req.query.status === "active")
    Object.assign(filter, {
      active: true,
      $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }, { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] }],
    });
  if (req.query.status === "expired") filter.expiresAt = { $lte: now };
  if (req.query.status === "inactive") filter.active = false;

  const [coupons, total] = await Promise.all([
    Coupon.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate("applicableProducts", "title").lean(),
    Coupon.countDocuments(filter),
  ]);

  // revenue + discount given per coupon (non-cancelled orders)
  const codes = coupons.map((c) => c.code);
  const usage = await Order.aggregate([
    { $match: { "coupon.code": { $in: codes }, orderStatus: { $ne: "CANCELLED" } } },
    { $group: { _id: "$coupon.code", orders: { $sum: 1 }, discount: { $sum: "$coupon.discount" }, revenue: { $sum: "$totalAmount" } } },
  ]);
  const byCode = new Map(usage.map((u) => [u._id, u]));

  res.json({
    coupons: coupons.map((c) => ({ ...c, stats: byCode.get(c.code) || { orders: 0, discount: 0, revenue: 0 } })),
    total,
    page: p.page,
    pages: Math.max(1, Math.ceil(total / p.limit)),
  });
};

const CouponCreate = async (req, res) => {
  const data = parseCoupon(req.body);
  if (await Coupon.exists({ code: data.code })) fail(400, "A coupon with this code already exists", { errors: { code: "Code already exists" } });
  const coupon = await Coupon.create(data);
  audit(req, "coupon.create", { entity: "coupon", entityId: coupon._id, summary: `Created coupon ${coupon.code}` });
  res.status(201).json(coupon);
};

const CouponUpdate = async (req, res) => {
  if (!isObjectId(req.params.id)) fail(404, "Coupon not found");
  const data = parseCoupon(req.body);
  if (await Coupon.exists({ code: data.code, _id: { $ne: req.params.id } })) fail(400, "Another coupon uses this code", { errors: { code: "Code already exists" } });
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, data, { returnDocument: "after", runValidators: true });
  if (!coupon) fail(404, "Coupon not found");
  audit(req, "coupon.update", { entity: "coupon", entityId: coupon._id, summary: `Updated coupon ${coupon.code}` });
  res.json(coupon);
};

const CouponToggle = async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) fail(404, "Coupon not found");
  coupon.active = !coupon.active;
  await coupon.save();
  audit(req, "coupon.toggle", { entity: "coupon", entityId: coupon._id, summary: `${coupon.active ? "Activated" : "Paused"} ${coupon.code}` });
  res.json(coupon);
};

const CouponDelete = async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (coupon) audit(req, "coupon.delete", { entity: "coupon", entityId: coupon._id, summary: `Deleted coupon ${coupon.code}` });
  res.json({ message: "Coupon deleted" });
};

module.exports = { CouponList, CouponCreate, CouponUpdate, CouponToggle, CouponDelete };
