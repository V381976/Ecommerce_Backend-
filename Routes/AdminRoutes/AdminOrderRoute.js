const express = require("express");
const router = express.Router();

const {
  Orderlist,
  OrderGet,
  OrderUpdate,
  OrderTracking,
  OrderNote,
  OrderReturn,
  OrderRefund,
  OrderDelete,
  OrderExport,
} = require("../../Controllers/AdminControllers/AdminOrderlistControllers");
const { AdminAuthcheck, requirePermission } = require("../../Middleware/AdminAuthMiddleware");

const canOrders = [AdminAuthcheck, requirePermission("orders")];
// deleting order history is limited to Super Admins
const superAdminOnly = (req, res, next) =>
  req.admin?.role === "Super_Admin" ? next() : res.status(403).json({ message: "Only a Super Admin can delete orders" });

router.get("/orders", ...canOrders, Orderlist);
router.put("/orders/status/:id", ...canOrders, OrderUpdate);
router.delete("/orders/:id", AdminAuthcheck, superAdminOnly, OrderDelete);

router.get("/admin/orders-export", ...canOrders, OrderExport);
router.get("/admin/orders/:id", AdminAuthcheck, requirePermission("orders", "customers"), OrderGet);
router.put("/admin/orders/:id/tracking", ...canOrders, OrderTracking);
router.post("/admin/orders/:id/notes", ...canOrders, OrderNote);
router.post("/admin/orders/:id/return", ...canOrders, OrderReturn);
router.post("/admin/orders/:id/refund", ...canOrders, OrderRefund);

module.exports = router;
