const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../../models/UserModel");
const { STAFF_ROLES, ROLE_PERMISSIONS } = require("../../Config/permissions");
const { audit } = require("../../utils/audit");
const { str, escapeRegex } = require("../../utils/http");

const isProd = process.env.NODE_ENV === "production";

const LoginAdmin = async (req, res) => {
  try {
    const email = str(req.body.email, 200);
    const password = typeof req.body.password === "string" ? req.body.password : "";

    // user check
    const user = await User.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, "i") });

    // one message for wrong email or password (no account enumeration)
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json("Invalid email or password");

    // 🔥 staff roles only (Super Admin, Admin, Inventory/Order Manager, Product admin)
    if (!STAFF_ROLES.includes(user.role)) return res.status(403).json("Access denied. This account is not an admin.");

    // blocked check
    if (user.blocked) return res.status(403).json("User is blocked");

    // 🔥 create token
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        v: user.tokenVersion || 0,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    user.lastLoginAt = new Date();
    await user.save();

    // 🔥 send cookie
    res.cookie("adminToken", token, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    req.admin = user;
    audit(req, "auth.login", { entity: "user", entityId: user._id, summary: `${user.email} signed in` });

    res.json({
      message: "Login success",
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// logged-in admin ki info + permissions (admin panel route guard ke liye)
const AdminMe = async (req, res) => {
  const user = await User.findById(req.user.id).select("name email role blocked").lean();

  if (!user || user.blocked) return res.status(401).json("Not authorized");

  res.json({ ...user, permissions: ROLE_PERMISSIONS[user.role] || [] });
};

const LogoutAdmin = (req, res) => {
  res.clearCookie("adminToken", { httpOnly: true, secure: isProd, sameSite: "lax" });
  res.json({ message: "Logged out" });
};

module.exports = {
  LoginAdmin,
  AdminMe,
  LogoutAdmin,
};
