const express = require("express");
const router = express.Router();
const {
  addToCart,
  getCart,
  removeItem,
  updateQuantity,
  cartSummary,
  applyCoupon,
  removeCoupon,
  mergeCart,
} = require("../../Controllers/UserControllers/CartControllers");
const { UserAuthCheck } = require("../../Middleware/Authmiddleware");
const { rateLimit } = require("../../utils/security");

const couponLimit = rateLimit({ key: "coupon", windowMs: 15 * 60 * 1000, max: 30, message: "Too many coupon attempts. Please wait a few minutes." });

router.post("/add", UserAuthCheck, addToCart);
router.get("/", UserAuthCheck, getCart);
router.post("/remove", UserAuthCheck, removeItem);
router.post("/update", UserAuthCheck, updateQuantity);
router.get("/summary", UserAuthCheck, cartSummary);
router.post("/coupon", UserAuthCheck, couponLimit, applyCoupon);
router.delete("/coupon", UserAuthCheck, removeCoupon);
router.post("/merge", UserAuthCheck, mergeCart);

module.exports = router;
