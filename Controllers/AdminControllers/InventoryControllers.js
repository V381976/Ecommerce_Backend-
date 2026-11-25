const Product = require("../../models/productmodel");
const InventoryLog = require("../../models/InventoryLogModel");
const { getSettings } = require("../../utils/settings");
const { adjustStock } = require("../../utils/inventory");
const { optionsOf } = require("../../utils/pricing");
const { audit } = require("../../utils/audit");
const { toCSV, sendCSV } = require("../../utils/csv");
const { fail, str, num, escapeRegex, isObjectId, paging } = require("../../utils/http");

const totalStockExpr = {
  $cond: [{ $gt: [{ $size: { $ifNull: ["$variants", []] } }, 0] }, { $sum: "$variants.stock" }, "$stock"],
};

// GET /inventory?filter=all|low|out|untracked&q&page&limit&sort
const InventoryList = async (req, res) => {
  const settings = await getSettings();
  const defaultLow = settings.inventory?.lowStockThreshold ?? 5;
  const p = paging(req.query, 20, 100);
  const q = str(req.query.q, 100);
  const match = {};
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    match.$or = [{ title: rx }, { sku: rx }, { "variants.sku": rx }, { brand: rx }, { category: rx }];
  }

  const stage = [
    { $match: match },
    {
      $addFields: {
        totalStock: totalStockExpr,
        threshold: { $ifNull: ["$lowStockThreshold", defaultLow] },
      },
    },
  ];
  const filter = req.query.filter;
  if (filter === "out") stage.push({ $match: { totalStock: { $lte: 0 } } });
  if (filter === "low") stage.push({ $match: { $expr: { $and: [{ $gt: ["$totalStock", 0] }, { $lte: ["$totalStock", "$threshold"] }] } } });
  if (filter === "untracked") stage.push({ $match: { totalStock: null } });

  const sort = req.query.sort === "stock-desc" ? { totalStock: -1 } : req.query.sort === "title" ? { title: 1 } : { totalStock: 1, title: 1 };

  const [result] = await Product.aggregate([
    ...stage,
    {
      $facet: {
        items: [
          { $sort: sort },
          { $skip: p.skip },
          { $limit: p.limit },
          { $project: { title: 1, sku: 1, thumbnail: 1, category: 1, brand: 1, stock: 1, variants: 1, totalStock: 1, threshold: 1, lowStockThreshold: 1, status: 1, soldCount: 1 } },
        ],
        total: [{ $count: "n" }],
      },
    },
  ]);

  // headline counts for the tabs
  const [counts] = await Product.aggregate([
    { $addFields: { totalStock: totalStockExpr, threshold: { $ifNull: ["$lowStockThreshold", defaultLow] } } },
    {
      $group: {
        _id: null,
        all: { $sum: 1 },
        out: { $sum: { $cond: [{ $and: [{ $ne: ["$totalStock", null] }, { $lte: ["$totalStock", 0] }] }, 1, 0] } },
        low: { $sum: { $cond: [{ $and: [{ $gt: ["$totalStock", 0] }, { $lte: ["$totalStock", "$threshold"] }] }, 1, 0] } },
        untracked: { $sum: { $cond: [{ $eq: ["$totalStock", null] }, 1, 0] } },
        units: { $sum: { $ifNull: ["$totalStock", 0] } },
      },
    },
  ]);

  const total = result.total[0]?.n || 0;
  res.json({
    items: result.items.map((i) => ({ ...i, variants: (i.variants || []).map((v) => ({ ...v, options: optionsOf(v) })) })),
    total,
    page: p.page,
    pages: Math.max(1, Math.ceil(total / p.limit)),
    counts: counts || { all: 0, out: 0, low: 0, untracked: 0, units: 0 },
    defaultLowStockThreshold: defaultLow,
  });
};

// POST /inventory/adjust { productId, variantId?, mode: set|add, quantity, reason, note }
const InventoryAdjust = async (req, res) => {
  const { productId, variantId } = req.body;
  if (!isObjectId(productId)) fail(400, "Invalid product");
  const reason = ["adjustment", "restock"].includes(req.body.reason) ? req.body.reason : "adjustment";
  const quantity = num(req.body.quantity);
  if (quantity == null) fail(400, "Enter a quantity");

  const result = await adjustStock({
    productId,
    variantId: isObjectId(variantId) ? variantId : undefined,
    mode: req.body.mode === "set" ? "set" : "add",
    quantity,
    reason,
    note: str(req.body.note, 300),
    by: req.admin?.name,
  });
  audit(req, "inventory.adjust", {
    entity: "product",
    entityId: productId,
    summary: `Stock ${result.before} → ${result.after} for “${result.product.title}”`,
    meta: { variantId, reason },
  });
  res.json({ before: result.before, after: result.after });
};

// GET /inventory/logs?product&page&reason
const InventoryLogs = async (req, res) => {
  const p = paging(req.query, 30, 100);
  const filter = {};
  if (isObjectId(req.query.product)) filter.product = req.query.product;
  if (req.query.reason) filter.reason = str(req.query.reason, 20);
  const [logs, total] = await Promise.all([
    InventoryLog.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
    InventoryLog.countDocuments(filter),
  ]);

  if (req.query.format === "csv") {
    const all = await InventoryLog.find(filter).sort({ createdAt: -1 }).limit(10000).lean();
    return sendCSV(
      res,
      "stock-movements.csv",
      toCSV(all, [
        { key: "createdAt", header: "date" },
        { key: "productTitle", header: "product" },
        { key: "variantLabel", header: "variant" },
        { key: "reason", header: "reason" },
        { key: "change", header: "change" },
        { key: "before", header: "before" },
        { key: "after", header: "after" },
        { key: "refId", header: "reference" },
        { key: "by", header: "by" },
        { key: "note", header: "note" },
      ])
    );
  }
  res.json({ logs, total, page: p.page, pages: Math.max(1, Math.ceil(total / p.limit)) });
};

// PUT /inventory/threshold/:id { lowStockThreshold }
const InventoryThreshold = async (req, res) => {
  if (!isObjectId(req.params.id)) fail(404, "Product not found");
  const v = num(req.body.lowStockThreshold);
  if (v != null && v < 0) fail(400, "Threshold can't be negative");
  await Product.updateOne({ _id: req.params.id }, v == null ? { $unset: { lowStockThreshold: 1 } } : { lowStockThreshold: Math.floor(v) });
  res.json({ ok: true });
};

module.exports = { InventoryList, InventoryAdjust, InventoryLogs, InventoryThreshold };
