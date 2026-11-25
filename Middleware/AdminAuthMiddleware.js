const jwt = require("jsonwebtoken");
const User = require("../models/UserModel");
const { STAFF_ROLES, can } = require("../Config/permissions");

const AdminAuthcheck = async (req, res, next) => {
  const token = req.cookies.adminToken;

  if (!token) return res.status(401).json("Not authorized");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // normal user ka token admin routes pe allow nahi
    if (!STAFF_ROLES.includes(decoded.role)) return res.status(403).json("Admin access only");

    // role / block status can change after login → always read the current account
    const admin = await User.findById(decoded.id).select("name email role blocked tokenVersion").lean();
    if (!admin || admin.blocked || !STAFF_ROLES.includes(admin.role)) return res.status(401).json("Not authorized");
    if ((decoded.v || 0) !== (admin.tokenVersion || 0)) return res.status(401).json("Session expired");

    req.user = { ...decoded, role: admin.role };
    req.admin = admin;
    next();
  } catch {
    res.status(401).json("Invalid token");
  }
};

// usage: router.get("/x", AdminAuthcheck, requirePermission("orders"), handler)
const requirePermission =
  (...permissions) =>
  (req, res, next) => {
    const role = req.admin?.role || req.user?.role;
    if (permissions.some((p) => can(role, p))) return next();
    res.status(403).json({ message: "You don't have permission to do this" });
  };

module.exports = {
  AdminAuthcheck,
  requirePermission,
};
