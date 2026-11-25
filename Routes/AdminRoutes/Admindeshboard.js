const express = require("express");
const router = express.Router();

const { AdminAuthcheck, requirePermission } = require("../../Middleware/AdminAuthMiddleware");
const { getStats, getOrdersAnalytics, getLatestOrders, getRecentUsers, getReports } = require("../../Controllers/AdminControllers/AdminStatsController");

const canDashboard = [AdminAuthcheck, requirePermission("dashboard")];

router.get("/admin/stats", ...canDashboard, getStats);
router.get("/admin/orders-analytics", ...canDashboard, getOrdersAnalytics);
router.get("/admin/latest-orders", ...canDashboard, getLatestOrders);
router.get("/admin/recent-users", ...canDashboard, getRecentUsers);
router.get("/admin/reports", AdminAuthcheck, requirePermission("reports"), getReports);

module.exports = router;
