const express = require("express");
const router = express.Router();

const { getStats, getOrdersAnalytics, getLatestOrders, getRecentUsers} = require("../../Controllers/AdminControllers/AdminStatsController");

// router.get("admin/stats", getDashboardStats);
router.get("/admin/stats", getStats);

router.get("/admin/orders-analytics", getOrdersAnalytics);
router.get("/admin/latest-orders", getLatestOrders);
router.get("/admin/recent-users", getRecentUsers);


module.exports = router;