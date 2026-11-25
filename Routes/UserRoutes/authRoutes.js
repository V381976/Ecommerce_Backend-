const express = require("express");
const router = express.Router();
const {
  SignUp,
  Login,
  Logout,
  ProfileCheck,
  UpdateProfile,
  ChangePassword,
  ForgotPassword,
  ResetPassword,
} = require("../../Controllers/UserControllers/AuthControllers");
const { UserAuthCheck } = require("../../Middleware/Authmiddleware");
const { rateLimit } = require("../../utils/security");

// brute-force / abuse protection on auth endpoints
const loginLimit = rateLimit({ key: "login", windowMs: 15 * 60 * 1000, max: 10, message: "Too many login attempts. Please wait 15 minutes and try again." });
const signupLimit = rateLimit({ key: "signup", windowMs: 60 * 60 * 1000, max: 10 });
const resetLimit = rateLimit({ key: "reset", windowMs: 60 * 60 * 1000, max: 5, message: "Too many reset requests. Please try again later." });

router.post("/signup", signupLimit, SignUp);
router.post("/login", loginLimit, Login);
router.post("/logout", Logout);
router.get("/me", UserAuthCheck, ProfileCheck);
router.put("/profile", UserAuthCheck, UpdateProfile);
router.put("/password", UserAuthCheck, loginLimit, ChangePassword);
router.post("/forgot-password", resetLimit, ForgotPassword);
router.post("/reset-password", resetLimit, ResetPassword);

module.exports = router;
