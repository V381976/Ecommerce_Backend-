const crypto = require("crypto");
const User = require("../../models/UserModel");
const Subscriber = require("../../models/SubscriberModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sendMail, layout, escapeHtml } = require("../../utils/mailer");
const { storeUrl } = require("../../utils/notify");
const { str, isEmail, bool, escapeRegex } = require("../../utils/http");

// older accounts kept the email exactly as typed → match case-insensitively
const emailRegex = (email) => new RegExp(`^${escapeRegex(email)}$`, "i");

const isProd = process.env.NODE_ENV === "production";

// `v` = tokenVersion → password change/reset logs out other sessions
const createToken = (user) =>
  jwt.sign({ id: user._id, v: user.tokenVersion || 0 }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

const setCookie = (res, token) =>
  res.cookie("token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

const passwordProblem = (pw) => {
  if (typeof pw !== "string" || pw.length < 6) return "Password must be at least 6 characters";
  if (pw.length > 128) return "Password is too long";
  return null;
};

const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email });

const SignUp = async (req, res) => {
  try {
    const name = str(req.body.name, 100);
    const email = str(req.body.email, 200).toLowerCase();
    const password = req.body.password;

    if (!name) return res.status(400).json({ msg: "Name is required" });
    if (!isEmail(email)) return res.status(400).json({ msg: "Please enter a valid email" });
    const pwErr = passwordProblem(password);
    if (pwErr) return res.status(400).json({ msg: pwErr });

    // User check
    const userExists = await User.exists({ email: emailRegex(email) });
    if (userExists) return res.status(400).json({ msg: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashed,
      notificationPrefs: { promotions: bool(req.body.newsletter) },
    });

    if (bool(req.body.newsletter)) {
      await Subscriber.updateOne(
        { email },
        { $set: { status: "subscribed", user: user._id }, $setOnInsert: { email, token: crypto.randomBytes(16).toString("hex"), source: "signup" } },
        { upsert: true }
      );
    }

    // ⭐ Cookie set
    setCookie(res, createToken(user));

    res.json({
      msg: "Signup success",
      user: publicUser(user),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const Login = async (req, res) => {
  try {
    const email = str(req.body.email, 200).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password : "";

    // check user in database (emails were stored as typed before → case-insensitive fallback)
    const user = (await User.findOne({ email })) || (await User.findOne({ email: emailRegex(email) }));
    if (!user) return res.status(400).json({ msg: "Invalid email or password" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ msg: "Invalid email or password" });

    if (user.blocked) return res.status(403).json({ msg: "Your account has been suspended. Please contact support." });

    user.lastLoginAt = new Date();
    await user.save();

    setCookie(res, createToken(user));

    res.json({
      msg: "Login success",
      user: publicUser(user),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const Logout = async (req, res) => {
  res.clearCookie("token", { httpOnly: true, secure: isProd, sameSite: "lax" });
  res.json({ msg: "Logged out" });
};

const ProfileCheck = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "name email phone role avatar notificationPrefs createdAt addresses wishlist"
    );

    res.json(user);
  } catch {
    res.status(500).json({ msg: "Server error" });
  }
};

// ================= PROFILE =================
const UpdateProfile = async (req, res) => {
  const name = str(req.body.name, 100);
  const phone = str(req.body.phone, 20);
  if (!name) return res.status(400).json({ msg: "Name is required" });
  if (phone && !/^[+\d][\d\s-]{6,18}$/.test(phone)) return res.status(400).json({ msg: "Enter a valid phone number" });
  const user = await User.findByIdAndUpdate(req.user.id, { name, phone }, { returnDocument: "after" }).select(
    "name email phone notificationPrefs createdAt"
  );
  res.json({ msg: "Profile updated", user });
};

const ChangePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user.id);
  if (!user || !(await bcrypt.compare(String(currentPassword || ""), user.password)))
    return res.status(400).json({ msg: "Current password is incorrect" });
  const pwErr = passwordProblem(newPassword);
  if (pwErr) return res.status(400).json({ msg: pwErr });
  if (await bcrypt.compare(newPassword, user.password))
    return res.status(400).json({ msg: "New password must be different from the current one" });

  user.password = await bcrypt.hash(newPassword, 10);
  user.tokenVersion = (user.tokenVersion || 0) + 1; // signs out other devices
  await user.save();
  setCookie(res, createToken(user)); // keep this device signed in
  res.json({ msg: "Password changed" });
};

// ================= PASSWORD RESET =================
const ForgotPassword = async (req, res) => {
  const email = str(req.body.email, 200).toLowerCase();
  // same answer whether or not the account exists (no account enumeration)
  const reply = { msg: "If an account exists for this email, we've sent a reset link." };
  if (!isEmail(email)) return res.json(reply);

  const user = await User.findOne({ email: emailRegex(email) });
  if (!user || user.blocked) return res.json(reply);

  const token = crypto.randomBytes(32).toString("hex");
  user.resetTokenHash = crypto.createHash("sha256").update(token).digest("hex");
  user.resetTokenExpires = new Date(Date.now() + 30 * 60 * 1000);
  await user.save();

  const link = `${storeUrl()}/reset-password?token=${token}`;
  const sent = await sendMail({
    to: user.email,
    subject: "Reset your ShopEase password",
    html: layout(
      "Reset your password",
      `<p>Hi ${escapeHtml(user.name)},</p><p>Click below to choose a new password. This link expires in 30 minutes.</p>
       <p><a href="${link}" style="display:inline-block;background:#5f40ec;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">Reset password</a></p>
       <p style="color:#6f7186;font-size:12px">If you didn't ask for this, you can ignore this email.</p>`
    ),
    text: `Reset your password: ${link}`,
  });
  // development without SMTP: print the link so the flow can still be tested
  if (!sent && !isProd) console.log(`[password reset link for ${user.email}] ${link}`);

  res.json(reply);
};

const ResetPassword = async (req, res) => {
  const token = str(req.body.token, 200);
  const pwErr = passwordProblem(req.body.password);
  if (!token) return res.status(400).json({ msg: "Reset link is invalid" });
  if (pwErr) return res.status(400).json({ msg: pwErr });

  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({ resetTokenHash: hash, resetTokenExpires: { $gt: new Date() } });
  if (!user) return res.status(400).json({ msg: "This reset link is invalid or has expired" });

  user.password = await bcrypt.hash(req.body.password, 10);
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  res.json({ msg: "Password updated. You can now sign in." });
};

const uploadAvatar = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    user.avatar = req.file.filename;

    await user.save();

    res.json({
      message: "Avatar uploaded",
      avatar: user.avatar,
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

module.exports = {
  SignUp,
  Login,
  Logout,
  ProfileCheck,
  uploadAvatar,
  UpdateProfile,
  ChangePassword,
  ForgotPassword,
  ResetPassword,
};
