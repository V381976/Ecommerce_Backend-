const mongoose = require("mongoose");
const Order = require("../models/OrderDitealsModel");
const Cart = require("../models/CartModel");
const Coupon = require("../models/CouponModel");
const Counter = require("../models/CounterModel");
const { priceCart } = require("./pricing");
const { reserveStock, releaseStock } = require("./inventory");
const { getSettings } = require("./settings");
const { getRazorpay, razorpayConfigured, isValidSignature } = require("./razorpay");
const { notifyUser, notifyEmail } = require("./notify");
const { HttpError, round2 } = require("./http");

/* ================= STATUS RULES ================= */
// which status may follow which (prevents e.g. DELIVERED → PENDING)
const TRANSITIONS = {
  PENDING: ["CONFIRMED", "PROCESSING", "SHIPPED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "SHIPPED", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "RETURNED"],
  DELIVERED: ["RETURNED"],
  CANCELLED: [],
  RETURNED: [],
};

const CUSTOMER_CANCELLABLE = ["PENDING", "CONFIRMED"];

const STATUS_COPY = {
  CONFIRMED: "has been confirmed",
  PROCESSING: "is being packed",
  SHIPPED: "has been shipped",
  DELIVERED: "has been delivered",
  CANCELLED: "has been cancelled",
  RETURNED: "return has been completed",
};

const label = (order) => order.orderNumber || `#${String(order._id).slice(-8).toUpperCase()}`;

const orderLink = (order) => (order.user ? `/my-order/${order._id}` : `/track-order?order=${order.orderNumber}`);

const notifyOrder = (order, title, message) => {
  const payload = { type: "order", title, message, link: orderLink(order), prefKey: "orderUpdates" };
  if (order.user) return notifyUser(order.user, payload);
  return notifyEmail(order.guest?.email, payload);
};

const nextOrderNumber = async (session) => `SE${String(100000 + (await Counter.next("order", session)))}`;

const clearCart = (userId) => userId && Cart.updateOne({ user: userId }, { $set: { items: [] }, $unset: { couponCode: 1 } });

/* ================= CREATE ================= */
/*
  items: [{ productId, variantId, quantity }]
  Prices, discounts, shipping, tax and stock are all (re)checked here.
*/
const createOrder = async ({
  user,
  guest,
  items,
  couponCode,
  shippingAddress,
  billingAddress,
  paymentMethod,
  checkoutId,
  by = "customer",
  // legacy flow: Razorpay order already created + paid via /payment/create-order
  existingRazorpayOrderId,
}) => {
  const settings = await getSettings();

  // idempotency: same checkout attempt → same order
  if (checkoutId) {
    const existing = await Order.findOne({ checkoutId });
    if (existing) {
      if (user && String(existing.user) !== String(user._id)) throw new HttpError(409, "Duplicate checkout id");
      return { order: existing, duplicate: true };
    }
  }

  const email = user?.email || guest?.email;
  const priced = await priceCart(items, {
    couponCode,
    pincode: shippingAddress?.pincode,
    userId: user?._id,
    email,
  });

  if (!priced.lines.length && !priced.issues.length) throw new HttpError(400, "Your cart is empty");
  if (priced.issues.length) throw new HttpError(409, "Some items in your cart need attention", { issues: priced.issues });
  if (priced.coupon?.error) throw new HttpError(400, priced.coupon.error, { field: "coupon" });
  if (!priced.shipping.serviceable) throw new HttpError(400, "Sorry, we don't deliver to this pincode yet", { field: "pincode" });

  if (paymentMethod === "COD") {
    if (!settings.payments?.codEnabled) throw new HttpError(400, "Cash on delivery is not available");
    if (settings.payments?.codMaxAmount > 0 && priced.total > settings.payments.codMaxAmount)
      throw new HttpError(400, `Cash on delivery is available for orders up to ₹${settings.payments.codMaxAmount}`);
  } else if (paymentMethod === "ONLINE") {
    if (!settings.payments?.onlineEnabled || !razorpayConfigured()) throw new HttpError(400, "Online payment is not available right now");
  } else throw new HttpError(400, "Choose a payment method");

  // Razorpay order first (external call can't be part of the DB transaction)
  let rzpOrder = null;
  if (paymentMethod === "ONLINE" && existingRazorpayOrderId) {
    rzpOrder = { id: existingRazorpayOrderId, amount: Math.round(priced.total * 100) };
  } else if (paymentMethod === "ONLINE") {
    rzpOrder = await getRazorpay().orders.create({
      amount: Math.round(priced.total * 100), // rupees → paise
      currency: "INR",
      receipt: checkoutId ? String(checkoutId).slice(0, 40) : undefined,
    });
  }

  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      const orderNumber = await nextOrderNumber(session);

      await reserveStock(priced.lines, { session, refId: orderNumber, by });

      if (priced.coupon?.code) {
        const ok = await Coupon.findOneAndUpdate(
          {
            code: priced.coupon.code,
            $or: [{ usageLimit: null }, { usageLimit: 0 }, { $expr: { $lt: ["$usedCount", "$usageLimit"] } }],
          },
          { $inc: { usedCount: 1 } },
          { session }
        );
        if (!ok) throw new HttpError(409, "This coupon has just reached its usage limit", { field: "coupon" });
      }

      const [created] = await Order.create(
        [
          {
            user: user?._id,
            guest: user ? undefined : guest,
            orderNumber,
            items: priced.lines.map((l) => ({
              product: l.productId,
              title: l.title,
              price: l.unitPrice,
              mrp: l.mrp,
              quantity: l.quantity,
              thumbnail: l.thumbnail,
              variantId: l.variantId || undefined,
              variantLabel: l.variantLabel || undefined,
              sku: l.sku,
              category: l.category,
            })),
            subtotal: priced.subtotal,
            offerDiscount: priced.offerDiscount,
            coupon: priced.coupon?.code
              ? { code: priced.coupon.code, discount: priced.coupon.discount, freeShipping: priced.coupon.freeShipping }
              : undefined,
            shippingFee: priced.shipping.fee,
            tax: { rate: priced.tax.rate, amount: priced.tax.amount, inclusive: priced.tax.inclusive },
            totalAmount: priced.total,
            paymentMethod,
            paymentStatus: "PENDING",
            orderStatus: "PENDING",
            razorpayOrderId: rzpOrder?.id,
            paymentExpiresAt:
              paymentMethod === "ONLINE"
                ? new Date(Date.now() + (settings.orders?.paymentTimeoutMinutes || 30) * 60000)
                : undefined,
            statusHistory: [
              {
                status: "PENDING",
                note: paymentMethod === "ONLINE" ? "Order created — awaiting payment" : "Order placed (cash on delivery)",
                by,
              },
            ],
            checkoutId: checkoutId || undefined,
            stockReserved: true,
            shippingAddress,
            billingAddress: billingAddress || shippingAddress,
          },
        ],
        { session }
      );
      order = created;
    });
  } catch (err) {
    // two identical submits racing: return the one that won
    if (err?.code === 11000 && checkoutId) {
      const existing = await Order.findOne({ checkoutId });
      if (existing) return { order: existing, duplicate: true };
    }
    throw err;
  } finally {
    await session.endSession();
  }

  if (paymentMethod === "COD") {
    await clearCart(user?._id);
    notifyOrder(order, `Order ${order.orderNumber} placed`, `Thanks for your order! We'll let you know when it ships. Total: ₹${order.totalAmount}.`);
  }

  return { order, razorpay: rzpOrder ? razorpayPayload(order, rzpOrder) : null };
};

const razorpayPayload = (order, rzpOrder) => ({
  keyId: process.env.RAZORPAY_KEY_ID,
  orderId: rzpOrder?.id || order.razorpayOrderId,
  amount: rzpOrder?.amount ?? Math.round(order.totalAmount * 100),
  currency: "INR",
});

/* ================= PAYMENT ================= */
// idempotent: verifying the same payment twice is a no-op
const markPaid = async (order, { razorpayOrderId, paymentId, signature, trusted = false }) => {
  if (!trusted && !isValidSignature(razorpayOrderId, paymentId, signature))
    throw new HttpError(400, "Payment verification failed");
  if (order.razorpayOrderId !== razorpayOrderId) throw new HttpError(400, "Payment does not belong to this order");

  if (order.paymentStatus === "PAID" && order.paymentId === paymentId) return order;

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $in: ["PENDING", "FAILED"] } },
    {
      $set: { paymentStatus: "PAID", paymentId },
      $unset: { paymentExpiresAt: 1 },
      $push: { statusHistory: { status: order.orderStatus, note: `Payment received (${paymentId})`, by: "system" } },
    },
    { returnDocument: "after" }
  );
  if (!updated) return Order.findById(order._id); // someone else already marked it

  if (updated.orderStatus === "CANCELLED") {
    // payment arrived after the order expired → flag for refund instead of losing it
    updated.refund = { status: "PENDING", amount: updated.totalAmount, note: "Payment received after the order was cancelled" };
    await updated.save();
    return updated;
  }

  await clearCart(updated.user);
  notifyOrder(updated, `Payment received for ${updated.orderNumber}`, `We've received your payment of ₹${updated.totalAmount}. Your order is being processed.`);
  return updated;
};

// fresh Razorpay order for a pending order whose first attempt failed/was closed
const retryPayment = async (order) => {
  if (order.paymentMethod !== "ONLINE") throw new HttpError(400, "This order is not an online payment");
  if (order.paymentStatus === "PAID") throw new HttpError(400, "This order is already paid");
  if (order.orderStatus === "CANCELLED") throw new HttpError(400, "This order was cancelled");
  if (order.paymentExpiresAt && order.paymentExpiresAt < new Date()) throw new HttpError(400, "The payment window for this order has expired");

  const rzpOrder = await getRazorpay().orders.create({ amount: Math.round(order.totalAmount * 100), currency: "INR" });
  order.razorpayOrderId = rzpOrder.id;
  order.paymentStatus = "PENDING";
  await order.save();
  return razorpayPayload(order, rzpOrder);
};

/* ================= STATUS CHANGES ================= */
const changeStatus = async (orderId, next, { by = "admin", note, tracking, actor = "admin" } = {}) => {
  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      order = await Order.findById(orderId).session(session);
      if (!order) throw new HttpError(404, "Order not found");
      const current = order.orderStatus;
      if (current === next) throw new HttpError(400, `Order is already ${next.toLowerCase()}`);
      if (!(TRANSITIONS[current] || []).includes(next))
        throw new HttpError(400, `Can't move an order from ${current} to ${next}`);
      if (
        order.paymentMethod === "ONLINE" &&
        order.paymentStatus !== "PAID" &&
        next !== "CANCELLED"
      )
        throw new HttpError(400, "This online order hasn't been paid yet");

      if (next === "CANCELLED" || next === "RETURNED") {
        if (order.stockReserved) {
          await releaseStock(order, { session, reason: next === "RETURNED" ? "return" : "cancel", by });
          order.stockReserved = false;
        }
        if (next === "CANCELLED" && order.coupon?.code) {
          await Coupon.updateOne({ code: order.coupon.code, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }, { session });
        }
        if (order.paymentStatus === "PAID" && !order.refund?.status) {
          order.refund = { status: "PENDING", amount: order.totalAmount };
        }
        if (next === "CANCELLED") order.cancelReason = note || order.cancelReason;
        if (next === "CANCELLED" && order.paymentStatus === "PENDING" && order.paymentMethod === "ONLINE") {
          order.paymentStatus = "FAILED";
        }
      }
      if (next === "DELIVERED") {
        order.deliveredAt = new Date();
        if (order.paymentMethod === "COD" && order.paymentStatus === "PENDING") order.paymentStatus = "PAID"; // cash collected
      }
      if (tracking) order.tracking = { ...(order.tracking?.toObject?.() || {}), ...tracking };

      order.orderStatus = next;
      order.statusHistory.push({ status: next, note, by });
      await order.save({ session });
    });
  } finally {
    await session.endSession();
  }

  const copy = STATUS_COPY[next];
  if (copy) {
    const extra = next === "SHIPPED" && order.tracking?.number ? ` Tracking: ${order.tracking.courier || ""} ${order.tracking.number}.` : "";
    notifyOrder(order, `Order ${label(order)} ${copy}`, `Your order ${label(order)} ${copy}.${extra}`);
  }
  if (actor === "customer" && next === "CANCELLED") {
    // nothing else to do — admins see it in the orders list
  }
  return order;
};

// background job: online orders not paid in time are cancelled and stock released
const expireUnpaidOrders = async () => {
  const stale = await Order.find({
    paymentMethod: "ONLINE",
    paymentStatus: "PENDING",
    orderStatus: "PENDING",
    paymentExpiresAt: { $lt: new Date() },
  })
    .select("_id")
    .limit(100)
    .lean();
  for (const o of stale) {
    try {
      await changeStatus(o._id, "CANCELLED", { by: "system", note: "Payment not completed in time" });
    } catch (err) {
      console.error("expire order failed:", err.message);
    }
  }
  return stale.length;
};

/* ================= RETURNS & REFUNDS ================= */
const requestReturn = async (order, { reason, comment }) => {
  const settings = await getSettings();
  if (order.orderStatus !== "DELIVERED") throw new HttpError(400, "Only delivered orders can be returned");
  if (order.returnRequest?.status) throw new HttpError(400, "A return has already been requested for this order");
  const windowDays = settings.orders?.returnWindowDays ?? 7;
  const deliveredAt = order.deliveredAt || order.updatedAt;
  if (windowDays > 0 && Date.now() - new Date(deliveredAt).getTime() > windowDays * 86400000)
    throw new HttpError(400, `Returns are accepted within ${windowDays} days of delivery`);
  if (!reason) throw new HttpError(400, "Please choose a reason for the return");

  order.returnRequest = { status: "REQUESTED", reason, comment, requestedAt: new Date() };
  order.statusHistory.push({ status: order.orderStatus, note: `Return requested: ${reason}`, by: "customer" });
  await order.save();
  return order;
};

// admin: approve | reject | receive (receive → order RETURNED, stock back, refund pending)
const resolveReturn = async (orderId, action, { note, by }) => {
  const order = await Order.findById(orderId);
  if (!order) throw new HttpError(404, "Order not found");
  const rr = order.returnRequest;
  if (!rr?.status) throw new HttpError(400, "No return request on this order");

  if (action === "approve") {
    if (rr.status !== "REQUESTED") throw new HttpError(400, "Return is not awaiting approval");
    rr.status = "APPROVED";
  } else if (action === "reject") {
    if (!["REQUESTED", "APPROVED"].includes(rr.status)) throw new HttpError(400, "Return can't be rejected now");
    rr.status = "REJECTED";
    rr.resolvedAt = new Date();
  } else if (action === "receive") {
    if (rr.status !== "APPROVED") throw new HttpError(400, "Approve the return before marking it received");
    rr.status = "RECEIVED";
    rr.resolvedAt = new Date();
  } else throw new HttpError(400, "Unknown action");

  rr.adminNote = note || rr.adminNote;
  order.statusHistory.push({ status: order.orderStatus, note: `Return ${rr.status.toLowerCase()}${note ? `: ${note}` : ""}`, by });
  await order.save();

  if (action === "receive") return changeStatus(order._id, "RETURNED", { by, note: "Returned item received" });

  notifyOrder(order, `Return ${rr.status.toLowerCase()} for ${label(order)}`, `Your return request for order ${label(order)} was ${rr.status.toLowerCase()}.${note ? ` ${note}` : ""}`);
  return order;
};

const processRefund = async (orderId, { amount, reference, note, by }) => {
  const order = await Order.findById(orderId);
  if (!order) throw new HttpError(404, "Order not found");
  if (order.paymentStatus !== "PAID" && order.paymentStatus !== "PARTIALLY_REFUNDED")
    throw new HttpError(400, "Only paid orders can be refunded");
  if (order.refund?.status === "PROCESSED") throw new HttpError(400, "This order has already been refunded");

  const amt = round2(amount ?? order.refund?.amount ?? order.totalAmount);
  if (!(amt > 0) || amt > order.totalAmount) throw new HttpError(400, `Refund must be between ₹1 and ₹${order.totalAmount}`);

  let ref = reference;
  if (!ref && order.paymentMethod === "ONLINE" && order.paymentId && razorpayConfigured()) {
    try {
      const r = await getRazorpay().payments.refund(order.paymentId, { amount: Math.round(amt * 100) });
      ref = r.id;
    } catch (err) {
      order.refund = { ...(order.refund?.toObject?.() || {}), status: "FAILED", amount: amt, note: err?.error?.description || err.message };
      await order.save();
      throw new HttpError(502, `Razorpay refund failed: ${err?.error?.description || err.message}`);
    }
  }
  if (!ref) throw new HttpError(400, "Enter the refund reference (e.g. bank / UPI transaction id)");

  order.refund = { status: "PROCESSED", amount: amt, reference: ref, note, processedAt: new Date() };
  order.paymentStatus = amt < order.totalAmount ? "PARTIALLY_REFUNDED" : "REFUNDED";
  order.statusHistory.push({ status: order.orderStatus, note: `Refund of ₹${amt} processed (${ref})`, by });
  await order.save();
  notifyOrder(order, `Refund processed for ${label(order)}`, `We've refunded ₹${amt} for order ${label(order)}. It may take 5–7 working days to reflect.`);
  return order;
};

module.exports = {
  TRANSITIONS,
  CUSTOMER_CANCELLABLE,
  createOrder,
  markPaid,
  retryPayment,
  changeStatus,
  expireUnpaidOrders,
  requestReturn,
  resolveReturn,
  processRefund,
  razorpayPayload,
};
