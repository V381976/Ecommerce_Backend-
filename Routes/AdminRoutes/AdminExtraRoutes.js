// newer admin modules: inventory, coupons, reviews, support, content, settings, audit, newsletter
const express = require("express");
const router = express.Router();
const { AdminAuthcheck, requirePermission } = require("../../Middleware/AdminAuthMiddleware");
const inv = require("../../Controllers/AdminControllers/InventoryControllers");
const cp = require("../../Controllers/AdminControllers/CouponControllers");
const rs = require("../../Controllers/AdminControllers/ReviewSupportControllers");
const cs = require("../../Controllers/AdminControllers/ContentSettingsControllers");

const can = (...p) => [AdminAuthcheck, requirePermission(...p)];

// inventory
router.get("/admin/inventory", ...can("inventory"), inv.InventoryList);
router.post("/admin/inventory/adjust", ...can("inventory"), inv.InventoryAdjust);
router.get("/admin/inventory/logs", ...can("inventory", "products"), inv.InventoryLogs);
router.put("/admin/inventory/threshold/:id", ...can("inventory"), inv.InventoryThreshold);

// coupons
router.get("/admin/coupons", ...can("coupons"), cp.CouponList);
router.post("/admin/coupons", ...can("coupons"), cp.CouponCreate);
router.put("/admin/coupons/:id", ...can("coupons"), cp.CouponUpdate);
router.put("/admin/coupons/:id/toggle", ...can("coupons"), cp.CouponToggle);
router.delete("/admin/coupons/:id", ...can("coupons"), cp.CouponDelete);

// reviews
router.get("/admin/reviews", ...can("reviews"), rs.ReviewList);
router.put("/admin/reviews/:id/status", ...can("reviews"), rs.ReviewModerate);
router.delete("/admin/reviews/:id", ...can("reviews"), rs.ReviewDelete);

// support + product questions
router.get("/admin/support", ...can("support"), rs.TicketList);
router.get("/admin/support/:id", ...can("support"), rs.TicketGet);
router.post("/admin/support/:id/reply", ...can("support"), rs.TicketReply);
router.put("/admin/support/:id/status", ...can("support"), rs.TicketStatus);

// website content (draft → preview → publish)
router.get("/admin/content", ...can("content"), cs.ContentGet);
router.put("/admin/content", ...can("content"), cs.ContentSave);
router.post("/admin/content/publish", ...can("content"), cs.ContentPublish);
router.post("/admin/content/discard", ...can("content"), cs.ContentDiscard);

// settings
router.get("/admin/settings", ...can("settings"), cs.SettingsGet);
router.put("/admin/settings", ...can("settings"), cs.SettingsUpdate);

// audit log + newsletter
router.get("/admin/audit-logs", ...can("audit"), cs.AuditList);
router.get("/admin/subscribers", ...can("content", "customers"), cs.SubscriberList);

module.exports = router;
