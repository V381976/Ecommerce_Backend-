const User = require("../../models/UserModel");
const Order = require("../../models/OrderDitealsModel");
const Review = require("../../models/ReviewModel");
const SupportTicket = require("../../models/SupportTicketModel");
const bcrypt = require("bcryptjs");
const { STAFF_ROLES, ROLE_PERMISSIONS } = require("../../Config/permissions");
const { audit } = require("../../utils/audit");
const { toCSV, sendCSV } = require("../../utils/csv");
const { fail, str, isEmail, isObjectId, escapeRegex, paging } = require("../../utils/http");

// same definition as the dashboard: no cancelled/returned orders, no unpaid online orders
const { REVENUE_MATCH } = require("./AdminStatsController");

// GET all users (customers). Original contract: plain array. ?page → paginated with stats
const UserList = async (req, res) => {
  if (!req.query.page) {
    const users = await User.find({ role: "User" }).select("-password -resetTokenHash");
    return res.json(users);
  }

  const p = paging(req.query, 20, 100);
  const match = { role: "User" };
  const q = str(req.query.q, 100);
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    match.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  if (req.query.status === "blocked") match.blocked = true;
  if (req.query.status === "active") match.blocked = { $ne: true };

  const sorts = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, spent: { lifetimeValue: -1 }, orders: { orderCount: -1 }, name: { name: 1 } };

  const [result] = await User.aggregate([
    { $match: match },
    {
      $lookup: {
        from: "orders",
        localField: "_id",
        foreignField: "user",
        as: "o",
        pipeline: [{ $match: REVENUE_MATCH }, { $project: { totalAmount: 1, createdAt: 1 } }],
      },
    },
    {
      $addFields: {
        orderCount: { $size: "$o" },
        lifetimeValue: { $round: [{ $sum: "$o.totalAmount" }, 2] },
        lastOrderAt: { $max: "$o.createdAt" },
      },
    },
    {
      $facet: {
        items: [
          { $sort: sorts[req.query.sort] || sorts.newest },
          { $skip: p.skip },
          { $limit: p.limit },
          { $project: { name: 1, email: 1, phone: 1, blocked: 1, createdAt: 1, lastLoginAt: 1, orderCount: 1, lifetimeValue: 1, lastOrderAt: 1 } },
        ],
        total: [{ $count: "n" }],
      },
    },
  ]);
  const total = result.total[0]?.n || 0;
  res.json({ users: result.items, total, page: p.page, pages: Math.max(1, Math.ceil(total / p.limit)) });
};

const CustomerGet = async (req, res) => {
  if (!isObjectId(req.params.id)) fail(404, "Customer not found");
  const user = await User.findById(req.params.id).select("-password -resetTokenHash -resetTokenExpires -tokenVersion").lean();
  if (!user) fail(404, "Customer not found");

  const [orders, stats, reviews, tickets] = await Promise.all([
    Order.find({ user: user._id }).sort({ createdAt: -1 }).limit(50).select("orderNumber totalAmount orderStatus paymentStatus paymentMethod createdAt items").lean(),
    Order.aggregate([
      { $match: { user: user._id, ...REVENUE_MATCH } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$totalAmount" }, first: { $min: "$createdAt" }, last: { $max: "$createdAt" } } },
    ]),
    Review.countDocuments({ user: user._id }),
    SupportTicket.find({ user: user._id }).sort({ createdAt: -1 }).limit(10).select("ticketNumber subject status createdAt type").lean(),
  ]);
  const s = stats[0] || { count: 0, total: 0 };
  res.json({
    user: { ...user, wishlistCount: (user.wishlist || []).length, wishlist: undefined },
    orders,
    stats: { orders: s.count, lifetimeValue: Math.round(s.total * 100) / 100, averageOrder: s.count ? Math.round((s.total / s.count) * 100) / 100 : 0, firstOrder: s.first, lastOrder: s.last },
    reviews,
    tickets,
  });
};

const CustomerNote = async (req, res) => {
  const note = str(req.body.note, 1000);
  if (!note) fail(400, "Write a note");
  const user = await User.findByIdAndUpdate(req.params.id, { $push: { supportNotes: { note, by: req.admin?.name } } }, { returnDocument: "after" }).select("supportNotes");
  if (!user) fail(404, "Customer not found");
  audit(req, "customer.note", { entity: "user", entityId: req.params.id, summary: "Added support note" });
  res.json(user.supportNotes);
};

const CustomerExport = async (req, res) => {
  const match = { role: "User" };
  const q = str(req.query.q, 100);
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    match.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  if (req.query.status === "blocked") match.blocked = true;
  if (req.query.status === "active") match.blocked = { $ne: true };
  const users = await User.aggregate([
    { $match: match },
    { $lookup: { from: "orders", localField: "_id", foreignField: "user", as: "o", pipeline: [{ $match: REVENUE_MATCH }, { $project: { totalAmount: 1 } }] } },
    { $project: { name: 1, email: 1, phone: 1, blocked: 1, createdAt: 1, orders: { $size: "$o" }, spent: { $sum: "$o.totalAmount" } } },
    { $sort: { createdAt: -1 } },
  ]);
  audit(req, "customer.export", { entity: "user", summary: `Exported ${users.length} customers` });
  sendCSV(
    res,
    `customers-${new Date().toISOString().slice(0, 10)}.csv`,
    toCSV(users, [
      { key: "name", header: "name" },
      { key: "email", header: "email" },
      { key: "phone", header: "phone" },
      { key: "orders", header: "orders" },
      { key: "spent", header: "lifetime value" },
      { key: "blocked", header: "blocked" },
      { key: "createdAt", header: "joined" },
    ])
  );
};

// DELETE user (customers; staff via staff screen — never yourself)
const UserDelete = async (req, res) => {
  if (String(req.params.id) === String(req.admin?._id)) fail(400, "You can't delete your own account");
  const target = await User.findById(req.params.id).select("role name email").lean();
  if (target && STAFF_ROLES.includes(target.role) && req.admin?.role !== "Super_Admin") fail(403, "Only a Super Admin can remove staff");
  if (target?.role === "Super_Admin" && (await User.countDocuments({ role: "Super_Admin", blocked: { $ne: true } })) <= 1)
    fail(400, "You can't remove the last Super Admin");
  await User.findByIdAndDelete(req.params.id);
  if (target) audit(req, "user.delete", { entity: "user", entityId: req.params.id, summary: `Deleted ${target.email}` });
  res.json({ msg: "User deleted" });
};

// CREATE STAFF USER (admin only)
const AddUser = async (req, res) => {
  try {
    const name = str(req.body.name, 100);
    const email = str(req.body.email, 200).toLowerCase();
    const { password, role } = req.body;

    // allow only admin roles
    if (!STAFF_ROLES.includes(role)) return res.status(400).json({ msg: "Invalid role", errors: { role: "Choose a role" } });
    if (role === "Super_Admin" && req.admin?.role !== "Super_Admin") return res.status(403).json({ msg: "Only a Super Admin can create Super Admins" });
    if (!name) return res.status(400).json({ msg: "Name is required", errors: { name: "Name is required" } });
    if (!isEmail(email)) return res.status(400).json({ msg: "Enter a valid email", errors: { email: "Enter a valid email" } });
    if (typeof password !== "string" || password.length < 8)
      return res.status(400).json({ msg: "Staff passwords need at least 8 characters", errors: { password: "At least 8 characters" } });
    if (await User.exists({ email: new RegExp(`^${escapeRegex(email)}$`, "i") }))
      return res.status(400).json({ msg: "An account with this email already exists", errors: { email: "An account with this email already exists" } });

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hash,
      role,
    });

    audit(req, "staff.create", { entity: "user", entityId: user._id, summary: `Created ${role} ${email}` });
    res.json({ _id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// toggle block
const UserACtive = async (req, res) => {
  if (String(req.params.id) === String(req.admin?._id)) fail(400, "You can't block yourself");
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ msg: "User not found" });
  if (STAFF_ROLES.includes(user.role) && req.admin?.role !== "Super_Admin") fail(403, "Only a Super Admin can block staff");

  user.blocked = !user.blocked;

  await user.save();

  audit(req, user.blocked ? "user.block" : "user.unblock", { entity: "user", entityId: user._id, summary: `${user.blocked ? "Blocked" : "Unblocked"} ${user.email}` });
  res.json({ _id: user._id, name: user.name, email: user.email, blocked: user.blocked });
};

/* ================= STAFF ================= */
const StaffList = async (req, res) => {
  const staff = await User.find({ role: { $in: STAFF_ROLES } }).select("name email role blocked createdAt lastLoginAt").sort({ createdAt: 1 }).lean();
  res.json({ staff, roles: ROLE_PERMISSIONS });
};

// PUT /staff/:id { role?, name?, password? }
const StaffUpdate = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || !STAFF_ROLES.includes(user.role)) fail(404, "Staff member not found");
  const changes = [];
  if (req.body.role !== undefined && req.body.role !== user.role) {
    if (!STAFF_ROLES.includes(req.body.role)) fail(400, "Invalid role");
    if (String(user._id) === String(req.admin?._id)) fail(400, "You can't change your own role");
    if (user.role === "Super_Admin" && (await User.countDocuments({ role: "Super_Admin" })) <= 1) fail(400, "Keep at least one Super Admin");
    changes.push(`role ${user.role} → ${req.body.role}`);
    user.role = req.body.role;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // re-login with new permissions
  }
  if (req.body.name) user.name = str(req.body.name, 100);
  if (req.body.password) {
    if (String(req.body.password).length < 8) fail(400, "Staff passwords need at least 8 characters");
    user.password = await bcrypt.hash(String(req.body.password), 10);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    changes.push("password reset");
  }
  await user.save();
  audit(req, "staff.update", { entity: "user", entityId: user._id, summary: `Updated ${user.email}${changes.length ? `: ${changes.join(", ")}` : ""}` });
  res.json({ _id: user._id, name: user.name, email: user.email, role: user.role, blocked: user.blocked });
};

module.exports = {
  UserList,
  UserDelete,
  AddUser,
  UserACtive,
  CustomerGet,
  CustomerNote,
  CustomerExport,
  StaffList,
  StaffUpdate,
};
