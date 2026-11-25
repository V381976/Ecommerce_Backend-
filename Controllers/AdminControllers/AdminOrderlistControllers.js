const Order = require("../../models/OrderDitealsModel");
const { ORDER_STATUSES, PAYMENT_STATUSES } = require("../../models/OrderDitealsModel");
const { changeStatus, resolveReturn, processRefund, TRANSITIONS } = require("../../utils/orderService");
const { releaseStock } = require("../../utils/inventory");
const { audit } = require("../../utils/audit");
const { toCSV, sendCSV } = require("../../utils/csv");
const { fail, str, escapeRegex, isObjectId, paging, dateRange } = require("../../utils/http");

const buildFilter = (q) => {
  const filter = {};
  if (ORDER_STATUSES.includes(q.status)) filter.orderStatus = q.status;
  if (PAYMENT_STATUSES.includes(q.paymentStatus)) filter.paymentStatus = q.paymentStatus;
  if (["COD", "ONLINE"].includes(q.paymentMethod)) filter.paymentMethod = q.paymentMethod;
  if (q.returns === "1") filter["returnRequest.status"] = { $exists: true };
  if (q.returnStatus) filter["returnRequest.status"] = str(q.returnStatus, 20);
  if (q.refund === "pending") filter["refund.status"] = "PENDING";
  if (q.customer && isObjectId(q.customer)) filter.user = q.customer;
  const range = dateRange(q);
  if (range) filter.createdAt = range;
  return filter;
};

// search across order number, customer and address fields
const searchStages = (term) => {
  if (!term) return [];
  const rx = new RegExp(escapeRegex(term), "i");
  const or = [{ orderNumber: rx }, { "guest.email": rx }, { "guest.name": rx }, { "shippingAddress.fullName": rx }, { "shippingAddress.phone": rx }, { "u.name": rx }, { "u.email": rx }];
  if (/^[a-f\d]{6,24}$/i.test(term)) or.push({ $expr: { $regexMatch: { input: { $toString: "$_id" }, regex: escapeRegex(term), options: "i" } } });
  return [{ $match: { $or: or } }];
};

// ================= GET ALL ORDERS =================
// no ?page → original contract (plain array of every order)
const Orderlist = async (req, res) => {
  if (!req.query.page) {
    const orders = await Order.find().populate("user", "name email").sort({ createdAt: -1 });
    return res.json(orders);
  }

  const p = paging(req.query, 20, 100);
  const filter = buildFilter(req.query);
  const term = str(req.query.q, 100);
  const sort = req.query.sort === "amount-desc" ? { totalAmount: -1 } : req.query.sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };

  const pipeline = [
    { $match: filter },
    { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "u", pipeline: [{ $project: { name: 1, email: 1 } }] } },
    ...searchStages(term),
  ];

  const [result] = await Order.aggregate([
    ...pipeline,
    {
      $facet: {
        items: [
          { $sort: sort },
          { $skip: p.skip },
          { $limit: p.limit },
          { $addFields: { user: { $first: "$u" } } },
          { $project: { u: 0, notes: 0, statusHistory: 0 } },
        ],
        total: [{ $count: "n" }],
      },
    },
  ]);

  // tab counts (ignoring the status filter itself)
  const { orderStatus, ...countFilter } = filter;
  const countsRaw = await Order.aggregate([
    { $match: countFilter },
    { $group: { _id: "$orderStatus", n: { $sum: 1 } } },
  ]);
  const counts = { ALL: countsRaw.reduce((s, c) => s + c.n, 0) };
  ORDER_STATUSES.forEach((s) => (counts[s] = countsRaw.find((c) => c._id === s)?.n || 0));
  counts.RETURNS = await Order.countDocuments({ ...countFilter, "returnRequest.status": "REQUESTED" });

  const total = result.total[0]?.n || 0;
  res.json({ orders: result.items, total, page: p.page, pages: Math.max(1, Math.ceil(total / p.limit)), counts });
};

const OrderGet = async (req, res) => {
  if (!isObjectId(req.params.id)) fail(404, "Order not found");
  const order = await Order.findById(req.params.id).populate("user", "name email phone createdAt").lean();
  if (!order) fail(404, "Order not found");
  const unpaidOnline = order.paymentMethod === "ONLINE" && order.paymentStatus !== "PAID";
  const allowedNext = (TRANSITIONS[order.orderStatus] || []).filter((s) => !unpaidOnline || s === "CANCELLED");
  res.json({ order, allowedNext });
};

// ================= UPDATE STATUS =================
// { status, note?, tracking?: { courier, number, url, estimatedDelivery } }
const OrderUpdate = async (req, res) => {
  const { status } = req.body;
  if (!isObjectId(req.params.id)) fail(404, "Order not found");
  if (!ORDER_STATUSES.includes(status)) fail(400, "Invalid status");
  const tracking = req.body.tracking
    ? {
        courier: str(req.body.tracking.courier, 60),
        number: str(req.body.tracking.number, 80),
        url: str(req.body.tracking.url, 300),
        estimatedDelivery: req.body.tracking.estimatedDelivery ? new Date(req.body.tracking.estimatedDelivery) : undefined,
      }
    : undefined;

  const order = await changeStatus(req.params.id, status, { by: req.admin?.name || "admin", note: str(req.body.note, 500), tracking });
  audit(req, "order.status", { entity: "order", entityId: order._id, summary: `${order.orderNumber || order._id} → ${status}` });
  res.json(order);
};

const OrderTracking = async (req, res) => {
  if (!isObjectId(req.params.id)) fail(404, "Order not found");
  const t = req.body || {};
  const current = await Order.findById(req.params.id).select("orderStatus").lean();
  if (!current) fail(404, "Order not found");
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    {
      tracking: {
        courier: str(t.courier, 60),
        number: str(t.number, 80),
        url: str(t.url, 300),
        estimatedDelivery: t.estimatedDelivery ? new Date(t.estimatedDelivery) : undefined,
      },
      $push: { statusHistory: { status: current.orderStatus, note: `Tracking updated: ${str(t.courier, 60)} ${str(t.number, 80)}`.trim(), by: req.admin?.name } },
    },
    { returnDocument: "after" }
  );
  if (!order) fail(404, "Order not found");
  audit(req, "order.tracking", { entity: "order", entityId: order._id, summary: `Tracking ${t.courier || ""} ${t.number || ""}` });
  res.json(order);
};

const OrderNote = async (req, res) => {
  const text = str(req.body.text, 2000);
  if (!text) fail(400, "Write a note");
  const order = await Order.findByIdAndUpdate(req.params.id, { $push: { notes: { text, by: req.admin?.name } } }, { returnDocument: "after" });
  if (!order) fail(404, "Order not found");
  res.json(order.notes);
};

// { action: approve|reject|receive, note }
const OrderReturn = async (req, res) => {
  const order = await resolveReturn(req.params.id, req.body.action, { note: str(req.body.note, 500), by: req.admin?.name });
  audit(req, "order.return", { entity: "order", entityId: order._id, summary: `Return ${req.body.action} on ${order.orderNumber || order._id}` });
  res.json(order);
};

// { amount?, reference?, note? }
const OrderRefund = async (req, res) => {
  const order = await processRefund(req.params.id, {
    amount: req.body.amount === undefined || req.body.amount === "" ? undefined : Number(req.body.amount),
    reference: str(req.body.reference, 100),
    note: str(req.body.note, 300),
    by: req.admin?.name,
  });
  audit(req, "order.refund", { entity: "order", entityId: order._id, summary: `Refund ₹${order.refund?.amount} on ${order.orderNumber || order._id}` });
  res.json(order);
};

// ================= DELETE (Super Admin only, see route) =================
const OrderDelete = async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.json({ msg: "Deleted" });
  // deleting a live order must not swallow its reserved stock
  if (order.stockReserved && !["CANCELLED", "RETURNED", "DELIVERED"].includes(order.orderStatus)) {
    await releaseStock(order, { reason: "cancel", by: req.admin?.name });
  }
  await order.deleteOne();
  audit(req, "order.delete", { entity: "order", entityId: order._id, summary: `Deleted order ${order.orderNumber || order._id}` });
  res.json({ msg: "Deleted" });
};

// ================= EXPORT =================
const OrderExport = async (req, res) => {
  const term = str(req.query.q, 100);
  const matched = await Order.aggregate([
    { $match: buildFilter(req.query) },
    { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "u", pipeline: [{ $project: { name: 1, email: 1 } }] } },
    ...searchStages(term),
    { $sort: { createdAt: -1 } },
    { $limit: 20000 },
    { $addFields: { user: { $first: "$u" } } },
    { $project: { u: 0 } },
  ]);
  const orders = matched;
  const csv = toCSV(orders, [
    { key: "orderNumber", header: "order", get: (o) => o.orderNumber || String(o._id) },
    { key: "createdAt", header: "date" },
    { key: "customer", header: "customer", get: (o) => o.user?.name || o.guest?.name || o.shippingAddress?.fullName },
    { key: "email", header: "email", get: (o) => o.user?.email || o.guest?.email },
    { key: "phone", header: "phone", get: (o) => o.shippingAddress?.phone },
    { key: "city", header: "city", get: (o) => o.shippingAddress?.city },
    { key: "pincode", header: "pincode", get: (o) => o.shippingAddress?.pincode },
    { key: "items", header: "items", get: (o) => o.items.map((i) => `${i.title} x${i.quantity}`).join("; ") },
    { key: "subtotal", header: "subtotal", get: (o) => o.subtotal ?? o.totalAmount },
    { key: "discount", header: "discount", get: (o) => (o.offerDiscount || 0) + (o.coupon?.discount || 0) },
    { key: "coupon", header: "coupon", get: (o) => o.coupon?.code },
    { key: "shippingFee", header: "shipping" },
    { key: "tax", header: "tax", get: (o) => o.tax?.amount || 0 },
    { key: "totalAmount", header: "total" },
    { key: "paymentMethod", header: "payment method" },
    { key: "paymentStatus", header: "payment status" },
    { key: "orderStatus", header: "order status" },
    { key: "tracking", header: "tracking", get: (o) => [o.tracking?.courier, o.tracking?.number].filter(Boolean).join(" ") },
    { key: "refund", header: "refund", get: (o) => (o.refund?.status ? `${o.refund.status} ${o.refund.amount ?? ""}` : "") },
  ]);
  audit(req, "order.export", { entity: "order", summary: `Exported ${orders.length} orders` });
  sendCSV(res, `orders-${new Date().toISOString().slice(0, 10)}.csv`, csv);
};

module.exports = {
  Orderlist,
  OrderGet,
  OrderUpdate,
  OrderTracking,
  OrderNote,
  OrderReturn,
  OrderRefund,
  OrderDelete,
  OrderExport,
};
