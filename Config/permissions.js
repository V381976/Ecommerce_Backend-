// Admin roles → what each one may manage. Checked by requirePermission().
const PERMISSIONS = [
  "dashboard",
  "reports",
  "products",
  "categories",
  "inventory",
  "orders",
  "customers",
  "coupons",
  "content",
  "reviews",
  "support",
  "settings",
  "staff",
  "audit",
];

const STAFF_ROLES = ["Super_Admin", "Admin", "Inventory_Manager", "Order_Manager", "Product_admin"];

const ROLE_PERMISSIONS = {
  Super_Admin: PERMISSIONS,
  Admin: PERMISSIONS.filter((p) => !["staff", "audit"].includes(p)),
  Inventory_Manager: ["dashboard", "inventory"],
  Order_Manager: ["dashboard", "orders", "customers", "support"],
  // legacy role kept for existing accounts
  Product_admin: ["dashboard", "products", "categories", "inventory", "reviews"],
};

const can = (role, permission) => (ROLE_PERMISSIONS[role] || []).includes(permission);

module.exports = { PERMISSIONS, STAFF_ROLES, ROLE_PERMISSIONS, can };
