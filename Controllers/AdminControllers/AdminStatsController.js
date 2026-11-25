const User = require("../../models/UserModel");
const Product = require("../../models/productmodel");
const Category = require("../../models/CategoryModel");
const Order = require("../../models/OrderDitealsModel");
const Brand = require("../../models/BrandModel");
const Review = require("../../models/ReviewModel");
const SupportTicket = require("../../models/SupportTicketModel");
const { getSettings } = require("../../utils/settings");
const { toCSV, sendCSV } = require("../../utils/csv");
const { dateRange, round2 } = require("../../utils/http");

const TZ = process.env.REPORT_TIMEZONE || "Asia/Kolkata";

// a "sale": not cancelled/returned, and either COD or actually paid online
const REVENUE_MATCH = {
  orderStatus: { $nin: ["CANCELLED", "RETURNED"] },
  $or: [{ paymentMethod: "COD" }, { paymentStatus: { $in: ["PAID", "PARTIALLY_REFUNDED"] } }],
};

const startOf = (unit) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (unit === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  if (unit === "month") d.setDate(1);
  if (unit === "year") d.setMonth(0, 1);
  return d;
};

const revenueSince = async (since) => {
  const [r] = await Order.aggregate([
    { $match: { ...REVENUE_MATCH, createdAt: { $gte: since } } },
    { $group: { _id: null, revenue: { $sum: "$totalAmount" }, orders: { $sum: 1 } } },
  ]);
  return { revenue: round2(r?.revenue || 0), orders: r?.orders || 0 };
};

/* =========================================
   1️⃣ STATS (counts + today sales) — original fields kept
========================================= */
const getStats = async (req, res) => {
  try {
    const settings = await getSettings();
    const low = settings.inventory?.lowStockThreshold ?? 5;
    const stockExpr = { $cond: [{ $gt: [{ $size: { $ifNull: ["$variants", []] } }, 0] }, { $sum: "$variants.stock" }, "$stock"] };

    const [users, customers, products, categories, orders, brands, today, week, month, year, all, stock, pending, returns, refunds, reviews, tickets] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: "User" }),
        Product.countDocuments(),
        Category.countDocuments(),
        Order.countDocuments(),
        Brand.countDocuments(),
        revenueSince(startOf("day")),
        revenueSince(startOf("week")),
        revenueSince(startOf("month")),
        revenueSince(startOf("year")),
        revenueSince(new Date(0)),
        Product.aggregate([
          { $addFields: { s: stockExpr, t: { $ifNull: ["$lowStockThreshold", low] } } },
          {
            $group: {
              _id: null,
              out: { $sum: { $cond: [{ $and: [{ $ne: ["$s", null] }, { $lte: ["$s", 0] }] }, 1, 0] } },
              low: { $sum: { $cond: [{ $and: [{ $gt: ["$s", 0] }, { $lte: ["$s", "$t"] }] }, 1, 0] } },
            },
          },
        ]),
        Order.countDocuments({ orderStatus: { $in: ["PENDING", "CONFIRMED", "PROCESSING"] }, $or: [{ paymentMethod: "COD" }, { paymentStatus: "PAID" }] }),
        Order.countDocuments({ "returnRequest.status": "REQUESTED" }),
        Order.countDocuments({ "refund.status": "PENDING" }),
        Review.countDocuments({ status: "pending" }),
        SupportTicket.countDocuments({ status: "open" }),
      ]);

    res.json({
      users,
      customers,
      products,
      categories,
      orders,
      brands,
      todaySales: today.revenue,
      todayOrders: today.orders,
      revenue: { today: today.revenue, week: week.revenue, month: month.revenue, year: year.revenue, total: all.revenue },
      salesCount: all.orders,
      averageOrderValue: all.orders ? round2(all.revenue / all.orders) : 0,
      lowStock: stock[0]?.low || 0,
      outOfStock: stock[0]?.out || 0,
      pendingActions: { ordersToShip: pending, returnRequests: returns, refundsPending: refunds, reviewsPending: reviews, openTickets: tickets },
    });
  } catch (err) {
    res.status(500).json(err.message);
  }
};

/* =========================================
   2️⃣ ORDERS ANALYTICS (last 7 days chart) — now with revenue too
========================================= */
const getOrdersAnalytics = async (req, res) => {
  try {
    const days = Math.min(90, Math.max(7, parseInt(req.query.days, 10) || 7));
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const rows = await Order.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } },
          orders: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $not: { $in: ["$orderStatus", ["CANCELLED", "RETURNED"]] } },
                    { $or: [{ $eq: ["$paymentMethod", "COD"] }, { $in: ["$paymentStatus", ["PAID", "PARTIALLY_REFUNDED"]] }] },
                  ],
                },
                "$totalAmount",
                0,
              ],
            },
          },
        },
      },
    ]);
    const byDay = new Map(rows.map((r) => [r._id, r]));

    const result = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toLocaleDateString("en-CA", { timeZone: TZ });
      const r = byDay.get(key);
      result.push({
        date: d.toLocaleDateString("en-IN", days <= 7 ? { weekday: "short" } : { day: "numeric", month: "short" }),
        day: key,
        orders: r?.orders || 0,
        revenue: round2(r?.revenue || 0),
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

/* =========================================
   3️⃣ LATEST ORDERS
========================================= */
const getLatestOrders = async (req, res) => {
  try {
    const orders = await Order.find().populate("user", "name email").sort({ createdAt: -1 }).limit(5);

    res.json(orders);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

/* =========================================
   4️⃣ RECENT USERS
========================================= */
const getRecentUsers = async (req, res) => {
  try {
    const users = await User.find({ role: "User" }).sort({ createdAt: -1 }).limit(5).select("name email createdAt");

    res.json(users);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

/* =========================================
   5️⃣ REPORTS  ?from&to&groupBy=day|week|month|year[&format=csv&type=sales|products|categories]
========================================= */
const getReports = async (req, res) => {
  const groupBy = ["day", "week", "month", "year"].includes(req.query.groupBy) ? req.query.groupBy : "day";
  const range = dateRange(req.query) || { $gte: new Date(Date.now() - 29 * 86400000) };
  const sales = { ...REVENUE_MATCH, createdAt: range };

  const [summaryRaw, series, topProducts, topCategories, statusBreakdown, paymentBreakdown, refundRaw, newCustomers, coupons] = await Promise.all([
    Order.aggregate([
      { $match: sales },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$totalAmount" },
          orders: { $sum: 1 },
          items: { $sum: { $sum: "$items.quantity" } },
          discount: { $sum: { $add: [{ $ifNull: ["$offerDiscount", 0] }, { $ifNull: ["$coupon.discount", 0] }] } },
          shipping: { $sum: { $ifNull: ["$shippingFee", 0] } },
          tax: { $sum: { $ifNull: ["$tax.amount", 0] } },
          customers: { $addToSet: { $ifNull: ["$user", "$guest.email"] } },
        },
      },
    ]),
    Order.aggregate([
      { $match: sales },
      {
        $group: {
          _id: { $dateTrunc: { date: "$createdAt", unit: groupBy, timezone: TZ, ...(groupBy === "week" ? { startOfWeek: "monday" } : {}) } },
          revenue: { $sum: "$totalAmount" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: sales },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          title: { $first: "$items.title" },
          thumbnail: { $first: "$items.thumbnail" },
          units: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        },
      },
      { $sort: { units: -1, revenue: -1 } },
      { $limit: 10 },
    ]),
    Order.aggregate([
      { $match: sales },
      { $unwind: "$items" },
      { $lookup: { from: "products", localField: "items.product", foreignField: "_id", as: "p", pipeline: [{ $project: { category: 1 } }] } },
      { $addFields: { cat: { $toLower: { $ifNull: ["$items.category", { $first: "$p.category" }] } } } },
      { $group: { _id: { $ifNull: ["$cat", "uncategorised"] }, units: { $sum: "$items.quantity" }, revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } } } },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]),
    Order.aggregate([{ $match: { createdAt: range } }, { $group: { _id: "$orderStatus", n: { $sum: 1 }, value: { $sum: "$totalAmount" } } }]),
    Order.aggregate([{ $match: sales }, { $group: { _id: "$paymentMethod", n: { $sum: 1 }, value: { $sum: "$totalAmount" } } }]),
    Order.aggregate([
      { $match: { createdAt: range } },
      {
        $group: {
          _id: null,
          returnRequests: { $sum: { $cond: [{ $ifNull: ["$returnRequest.status", false] }, 1, 0] } },
          refundsProcessed: { $sum: { $cond: [{ $eq: ["$refund.status", "PROCESSED"] }, 1, 0] } },
          refundedAmount: { $sum: { $cond: [{ $eq: ["$refund.status", "PROCESSED"] }, { $ifNull: ["$refund.amount", 0] }, 0] } },
          refundsPending: { $sum: { $cond: [{ $eq: ["$refund.status", "PENDING"] }, 1, 0] } },
        },
      },
    ]),
    User.countDocuments({ role: "User", createdAt: range }),
    Order.aggregate([
      { $match: { ...sales, "coupon.code": { $exists: true } } },
      { $group: { _id: "$coupon.code", orders: { $sum: 1 }, discount: { $sum: "$coupon.discount" }, revenue: { $sum: "$totalAmount" } } },
      { $sort: { orders: -1 } },
      { $limit: 10 },
    ]),
  ]);

  const s = summaryRaw[0] || {};
  const statuses = Object.fromEntries(statusBreakdown.map((x) => [x._id, { count: x.n, value: round2(x.value) }]));
  const totalPlaced = statusBreakdown.reduce((n, x) => n + x.n, 0);
  const report = {
    range: { from: range.$gte, to: range.$lte || new Date() },
    groupBy,
    summary: {
      revenue: round2(s.revenue || 0),
      orders: s.orders || 0,
      averageOrderValue: s.orders ? round2(s.revenue / s.orders) : 0,
      itemsSold: s.items || 0,
      discounts: round2(s.discount || 0),
      shipping: round2(s.shipping || 0),
      tax: round2(s.tax || 0),
      customers: (s.customers || []).length,
      newCustomers,
      ordersPlaced: totalPlaced,
      cancelled: statuses.CANCELLED?.count || 0,
      returned: statuses.RETURNED?.count || 0,
      cancellationRate: totalPlaced ? round2(((statuses.CANCELLED?.count || 0) / totalPlaced) * 100) : 0,
      ...(refundRaw[0] ? { returnRequests: refundRaw[0].returnRequests, refundsProcessed: refundRaw[0].refundsProcessed, refundedAmount: round2(refundRaw[0].refundedAmount), refundsPending: refundRaw[0].refundsPending } : { returnRequests: 0, refundsProcessed: 0, refundedAmount: 0, refundsPending: 0 }),
    },
    series: series.map((x) => ({ period: x._id, revenue: round2(x.revenue), orders: x.orders })),
    topProducts: topProducts.map((x) => ({ ...x, revenue: round2(x.revenue) })),
    topCategories: topCategories.map((x) => ({ category: x._id, units: x.units, revenue: round2(x.revenue) })),
    statusBreakdown: statuses,
    paymentBreakdown: Object.fromEntries(paymentBreakdown.map((x) => [x._id, { count: x.n, value: round2(x.value) }])),
    coupons,
  };

  if (req.query.format === "csv") {
    const type = req.query.type;
    if (type === "products")
      return sendCSV(res, "top-products.csv", toCSV(report.topProducts, [{ key: "title", header: "product" }, { key: "units", header: "units sold" }, { key: "revenue", header: "revenue" }]));
    if (type === "categories")
      return sendCSV(res, "top-categories.csv", toCSV(report.topCategories, [{ key: "category", header: "category" }, { key: "units", header: "units sold" }, { key: "revenue", header: "revenue" }]));
    return sendCSV(
      res,
      `sales-${groupBy}.csv`,
      toCSV(report.series, [
        { key: "period", header: groupBy, get: (r) => new Date(r.period).toLocaleDateString("en-CA", { timeZone: TZ }) },
        { key: "orders", header: "orders" },
        { key: "revenue", header: "revenue" },
      ])
    );
  }

  res.json(report);
};

module.exports = { getStats, getOrdersAnalytics, getLatestOrders, getRecentUsers, getReports, REVENUE_MATCH };
