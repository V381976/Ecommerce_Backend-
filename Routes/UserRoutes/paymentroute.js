const express = require("express");
const router = express.Router();

const { createOrder, verifyPayment, retry, paymentFailed, webhook } = require("../../Controllers/UserControllers/paymentController");
const { UserAuthCheck, optionalUser } = require("../../Middleware/Authmiddleware");

// legacy: Razorpay order for the cart
router.post("/create-order", UserAuthCheck, createOrder);

router.post("/verify", optionalUser, verifyPayment);
router.post("/retry/:orderId", optionalUser, retry);
router.post("/failed", optionalUser, paymentFailed);

// raw body is attached in index.js (signature is computed over the exact bytes)
router.post("/webhook", webhook);

module.exports = router;
