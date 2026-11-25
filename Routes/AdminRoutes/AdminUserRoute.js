const express = require("express");
const router = express.Router();
const {
  UserList,
  UserDelete,
  AddUser,
  UserACtive,
  CustomerGet,
  CustomerNote,
  CustomerExport,
  StaffList,
  StaffUpdate,
} = require("../../Controllers/AdminControllers/AdminUserlistControllers");
const { LoginAdmin, AdminMe, LogoutAdmin } = require("../../Controllers/AdminControllers/AdminAuthControllers");
const { AdminAuthcheck, requirePermission } = require("../../Middleware/AdminAuthMiddleware");
const { rateLimit } = require("../../utils/security");

const adminLoginLimit = rateLimit({ key: "admin-login", windowMs: 15 * 60 * 1000, max: 10, message: "Too many login attempts. Please wait 15 minutes." });

// customers
router.get("/users", AdminAuthcheck, requirePermission("customers"), UserList);
router.delete("/users/:id", AdminAuthcheck, requirePermission("customers", "staff"), UserDelete);
// toggle block
router.put("/users/toggle/:id", AdminAuthcheck, requirePermission("customers", "staff"), UserACtive);
router.get("/admin/customers-export", AdminAuthcheck, requirePermission("customers"), CustomerExport);
router.get("/admin/customers/:id", AdminAuthcheck, requirePermission("customers"), CustomerGet);
router.post("/admin/customers/:id/notes", AdminAuthcheck, requirePermission("customers"), CustomerNote);

// staff (create stays on POST /users for the old admin screen)
router.post("/users", AdminAuthcheck, requirePermission("staff"), AddUser);
router.get("/admin/staff", AdminAuthcheck, requirePermission("staff"), StaffList);
router.put("/admin/staff/:id", AdminAuthcheck, requirePermission("staff"), StaffUpdate);

// auth
router.post("/admin-login", adminLoginLimit, LoginAdmin);
router.post("/admin-logout", LogoutAdmin);
router.get("/admin/me", AdminAuthcheck, AdminMe);

module.exports = router;
