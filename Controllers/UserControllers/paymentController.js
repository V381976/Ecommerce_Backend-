const Cart = require("../../models/CartModel");
const Order = require("../../models/OrderDitealsModel");
const { priceCart } = require("../../utils/pricing");
const { getRazorpay, isValidSignature, isValidWebhook } = require("../../utils/razorpay");
const { markPaid, retryPayment } = require("../../utils/orderService");
const { canAccess, customerView } = require("./UserOrderControllers");
const { fail, isObjectId, str } = require("../../utils/http");

const loadOrder = async (req) => {
  const id = req.body.orderId || req.params.orderId;
  if (!isObjectId(id)) fail(400, "Order id missing");
  const order = await Order.findById(id);
  if (!order || !canAccess(req, order)) fail(404, "Order not found");
  return order;
};

// ✅ LEGACY: Razorpay order for the current cart (amount from server pricing)
const createOrder = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id }).lean();
    const items = (cart?.items || []).map((i) => ({ productId: i.product, variantId: i.variantId, quantity: i.quantity }));
    if (!items.length) return res.status(400).json({ message: "Cart empty" });

    const summary = await priceCart(items, { couponCode: cart.couponCode, userId: req.user.id });
    if (summary.issues.length) return res.status(409).json({ message: summary.issues[0].message });

    const order = await getRazorpay().orders.create({
      amount: Math.round(summary.total * 100), // ✅ rupees → paise
      currency: "INR",
    });

    res.json(order);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// ================= VERIFY PAYMENT =================
// new flow: { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature, accessToken? }
// old flow (no orderId): signature check only, as before
const verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!req.body.orderId) {
    if (!isValidSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature))
      return res.status(400).json({ message: "Payment verification failed" });
    return res.json({ success: true });
  }

  const order = await loadOrder(req);
  const updated = await markPaid(order, {
    razorpayOrderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });
  res.json({ success: true, order: customerView(updated) });
};

// new Razorpay order for an unpaid order (after failure / closing the popup)
const retry = async (req, res) => {
  const order = await loadOrder(req);
  res.json({ razorpay: await retryPayment(order) });
};

// customer closed the popup or the payment failed — keep the order payable until it expires
const paymentFailed = async (req, res) => {
  const order = await loadOrder(req);
  if (order.paymentStatus === "PENDING") {
    order.statusHistory.push({
      status: order.orderStatus,
      note: `Payment ${req.body.reason === "dismissed" ? "cancelled by customer" : "failed"}${req.body.description ? `: ${str(req.body.description, 200)}` : ""}`,
      by: "system",
    });
    await order.save();
  }
  res.json({ ok: true });
};

// Razorpay webhook (optional; set RAZORPAY_WEBHOOK_SECRET). Body arrives raw.
const webhook = async (req, res) => {
  const raw = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  if (!isValidWebhook(raw, req.headers["x-razorpay-signature"])) return res.status(400).json({ message: "Invalid signature" });

  const event = JSON.parse(raw.toString("utf8"));
  const payment = event.payload?.payment?.entity;
  if (payment?.order_id) {
    const order = await Order.findOne({ razorpayOrderId: payment.order_id });
    if (order && event.event === "payment.captured") {
      await markPaid(order, { razorpayOrderId: payment.order_id, paymentId: payment.id, trusted: true });
    } else if (order && event.event === "payment.failed" && order.paymentStatus === "PENDING") {
      order.statusHistory.push({ status: order.orderStatus, note: `Payment failed: ${payment.error_description || "unknown"}`, by: "razorpay" });
      await order.save();
    }
  }
  res.json({ received: true });
};

module.exports = {
  createOrder,
  verifyPayment,
  retry,
  paymentFailed,
  webhook,
  isValidSignature,
};
