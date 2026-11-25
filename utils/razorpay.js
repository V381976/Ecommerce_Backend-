const Razorpay = require("razorpay");
const crypto = require("crypto");

// keys .env me na ho to server crash na ho, isliye lazy create
let client = null;

const razorpayConfigured = () => !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

// local testing only: RAZORPAY_MOCK=1 (+ any KEY_ID/SECRET) fakes order/refund creation.
// Signatures are still real HMACs with the test secret. Ignored in production.
const mockClient = () => {
  const id = (p) => `${p}_mock${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return {
    orders: { create: async (o) => ({ id: id("order"), amount: o.amount, currency: o.currency || "INR", status: "created" }) },
    payments: { refund: async (paymentId, o) => ({ id: id("rfnd"), payment_id: paymentId, amount: o?.amount }) },
  };
};

const getRazorpay = () => {
  if (process.env.RAZORPAY_MOCK === "1" && process.env.NODE_ENV !== "production" && razorpayConfigured()) {
    return (client = client || mockClient());
  }
  if (!razorpayConfigured()) {
    const err = new Error("Online payments are not configured");
    err.status = 503;
    throw err;
  }
  if (!client) {
    client = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return client;
};

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// checkout handler signature: HMAC(order_id|payment_id, key_secret)
const isValidSignature = (orderId, paymentId, signature) => {
  if (!orderId || !paymentId || !signature || !process.env.RAZORPAY_KEY_SECRET) return false;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(orderId + "|" + paymentId)
    .digest("hex");
  return safeEqual(expected, signature);
};

// webhook signature: HMAC(raw body, webhook secret)
const isValidWebhook = (rawBody, signature) => {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
};

module.exports = { getRazorpay, razorpayConfigured, isValidSignature, isValidWebhook };
