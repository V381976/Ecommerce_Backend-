const crypto = require("crypto");
const Order = require("../../models/OrderDitealsModel");
const Cart = require("../../models/CartModel");
const User = require("../../models/UserModel");
const { priceCart } = require("../../utils/pricing");
const { getSettings } = require("../../utils/settings");
const {
  createOrder,
  markPaid,
  changeStatus,
  requestReturn,
  CUSTOMER_CANCELLABLE,
} = require("../../utils/orderService");
const { isValidSignature } = require("../../utils/razorpay");
const { fail, str, isEmail, isObjectId, bool, paging } = require("../../utils/http");

/* ================= helpers ================= */
const cleanAddress = (a = {}) => ({
  fullName: str(a.fullName, 100),
  phone: str(a.phone, 20),
  address: str(a.address, 300),
  city: str(a.city, 80),
  state: str(a.state, 80),
  pincode: str(a.pincode, 10),
});

const addressErrors = (a) => {
  const e = {};
  if (!a.fullName) e.fullName = "Full name is required";
  const phone = a.phone.replace(/[\s-]/g, "").replace(/^(\+91|0)/, "");
  if (!/^[6-9]\d{9}$/.test(phone)) e.phone = "Enter a valid 10-digit mobile number";
  if (!a.address) e.address = "Address is required";
  if (!a.city) e.city = "City is required";
  if (!/^\d{6}$/.test(a.pincode)) e.pincode = "Pincode must be 6 digits";
  return e;
};

const requireAddress = (a, field = "address") => {
  const errors = addressErrors(a);
  if (Object.keys(errors).length) fail(400, "Please check the address details", { field, errors });
};

// guests get a signed token to access their own order (payment retry / tracking page)
const guestToken = (orderId) => crypto.createHmac("sha256", process.env.JWT_SECRET).update(`guest:${orderId}`).digest("hex");

const canAccess = (req, order) => {
  if (order.user && req.user && String(order.user) === String(req.user.id)) return true;
  const t = String(req.body?.accessToken || req.query?.accessToken || "");
  return !order.user && t.length === 64 && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(guestToken(order._id)));
};

// what customers may see (no internal admin notes)
const customerView = (o) => {
  const obj = o.toObject ? o.toObject() : o;
  delete obj.notes;
  delete obj.checkoutId;
  return obj;
};

const cartItemsFor = async (userId) => {
  const cart = await Cart.findOne({ user: userId }).lean();
  return {
    items: (cart?.items || []).map((i) => ({ productId: i.product, variantId: i.variantId, quantity: i.quantity })),
    couponCode: cart?.couponCode,
  };
};

const guestItems = (raw) =>
  (Array.isArray(raw) ? raw : [])
    .slice(0, 50)
    .filter((i) => isObjectId(i.productId))
    .map((i) => ({ productId: i.productId, variantId: isObjectId(i.variantId) ? i.variantId : undefined, quantity: Math.min(99, Math.max(1, Math.floor(Number(i.quantity) || 1))) }));

/* ================= QUOTE (guest or user) ================= */
// POST /orders/quote { items?, couponCode?, pincode?, email? }
const Quote = async (req, res) => {
  let items;
  let couponCode = str(req.body.couponCode, 30) || undefined;
  if (req.user && !req.body.items) {
    const c = await cartItemsFor(req.user.id);
    items = c.items;
    couponCode = couponCode || c.couponCode;
  } else items = guestItems(req.body.items);

  const summary = await priceCart(items, {
    couponCode,
    pincode: str(req.body.pincode, 10),
    userId: req.user?.id,
    email: req.account?.email || (isEmail(req.body.email) ? req.body.email : undefined),
  });
  res.json(summary);
};

/* ================= CHECKOUT ================= */
/*
  POST /orders/checkout
  { checkoutId, paymentMethod, couponCode?, addressId? | address, saveAddress?,
    billingSameAsShipping?, billingAddress?, guest?: {name,email,phone}, items? (guest) }
*/
const Checkout = async (req, res) => {
  const settings = await getSettings();
  const body = req.body;
  const checkoutId = str(body.checkoutId, 64);
  if (!/^[\w-]{8,64}$/.test(checkoutId)) fail(400, "Missing checkout id — please refresh the page");
  const paymentMethod = body.paymentMethod === "ONLINE" ? "ONLINE" : body.paymentMethod === "COD" ? "COD" : null;
  if (!paymentMethod) fail(400, "Choose a payment method");

  let user = null;
  let items;
  let couponCode = str(body.couponCode, 30) || undefined;
  let guest;

  if (req.user) {
    user = await User.findById(req.user.id);
    const c = await cartItemsFor(user._id);
    items = c.items;
    couponCode = couponCode || c.couponCode;
  } else {
    if (!settings.payments?.guestCheckout) fail(401, "Please sign in to check out");
    guest = { name: str(body.guest?.name, 100), email: str(body.guest?.email, 200).toLowerCase(), phone: str(body.guest?.phone, 20) };
    if (!guest.name) fail(400, "Please enter your name", { field: "guest.name" });
    if (!isEmail(guest.email)) fail(400, "Please enter a valid email", { field: "guest.email" });
    items = guestItems(body.items);
  }
  if (!items.length) fail(400, "Your cart is empty");

  // shipping address: saved one or a new one
  let shippingAddress;
  if (user && isObjectId(body.addressId)) {
    const saved = user.addresses.id(body.addressId);
    if (!saved) fail(400, "Selected address not found");
    shippingAddress = cleanAddress(saved);
  } else {
    shippingAddress = cleanAddress(body.address);
  }
  requireAddress(shippingAddress);

  let billingAddress = shippingAddress;
  if (body.billingSameAsShipping === false || body.billingSameAsShipping === "false") {
    billingAddress = cleanAddress(body.billingAddress);
    requireAddress(billingAddress, "billingAddress");
  }

  const { order, razorpay, duplicate } = await createOrder({
    user,
    guest,
    items,
    couponCode,
    shippingAddress,
    billingAddress,
    paymentMethod,
    checkoutId,
  });

  // save new address to the address book (after a successful order only)
  if (user && !duplicate && !isObjectId(body.addressId) && bool(body.saveAddress)) {
    const exists = user.addresses.some((a) => a.address === shippingAddress.address && a.pincode === shippingAddress.pincode);
    if (!exists) {
      user.addresses.push({ ...shippingAddress, label: str(body.addressLabel, 40) || "Home", isDefault: user.addresses.length === 0 });
      await user.save();
    }
  }

  res.status(duplicate ? 200 : 201).json({
    order: customerView(order),
    razorpay,
    duplicate: !!duplicate,
    accessToken: order.user ? undefined : guestToken(order._id),
  });
};

/* ================= LEGACY: POST /orders/create ================= */
// old storefront contract { address, paymentMethod, razorpay_* } — now uses the same safe flow
const CreateOrder = async (req, res) => {
  const user = await User.findById(req.user.id);
  const { items, couponCode } = await cartItemsFor(user._id);
  if (!items.length) return res.status(400).json({ msg: "Cart empty" });
  const shippingAddress = cleanAddress(req.body.address);
  requireAddress(shippingAddress);
  const paymentMethod = req.body.paymentMethod === "ONLINE" ? "ONLINE" : "COD";

  let existingRazorpayOrderId;
  if (paymentMethod === "ONLINE") {
    // verify the payment before creating anything
    if (!isValidSignature(req.body.razorpay_order_id, req.body.razorpay_payment_id, req.body.razorpay_signature))
      return res.status(400).json({ msg: "Payment verification failed" });
    existingRazorpayOrderId = req.body.razorpay_order_id;
  }
  const checkoutId = existingRazorpayOrderId ? `legacy-${existingRazorpayOrderId}` : undefined;
  const { order } = await createOrder({ user, items, couponCode, shippingAddress, paymentMethod, checkoutId, existingRazorpayOrderId });
  if (paymentMethod === "ONLINE") {
    await markPaid(order, { razorpayOrderId: existingRazorpayOrderId, paymentId: req.body.razorpay_payment_id, trusted: true });
  }
  res.json(customerView(await Order.findById(order._id)));
};

/* ================= USER ORDERS ================= */
const OrderInfo = async (req, res) => {
  const filter = { user: req.user.id };
  // original contract: plain array of all orders; ?page= switches to paginated
  if (!req.query.page) {
    const orders = await Order.find(filter).sort({ createdAt: -1 }).lean();
    return res.json(orders.map(customerView));
  }
  const p = paging(req.query, 10, 50);
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
    Order.countDocuments(filter),
  ]);
  res.json({ orders: orders.map(customerView), total, page: p.page, pages: Math.max(1, Math.ceil(total / p.limit)) });
};

const loadOwnOrder = async (req) => {
  if (!isObjectId(req.params.id)) fail(404, "Order not found");
  const order = await Order.findById(req.params.id);
  if (!order || !canAccess(req, order)) fail(404, "Order not found");
  return order;
};

const OrderDetail = async (req, res) => {
  const order = await loadOwnOrder(req);
  const settings = await getSettings();
  const windowDays = settings.orders?.returnWindowDays ?? 7;
  const deliveredAt = order.deliveredAt || (order.orderStatus === "DELIVERED" ? order.updatedAt : null);
  res.json({
    order: customerView(order),
    canCancel: CUSTOMER_CANCELLABLE.includes(order.orderStatus),
    canReturn:
      order.orderStatus === "DELIVERED" &&
      !order.returnRequest?.status &&
      (!windowDays || (deliveredAt && Date.now() - new Date(deliveredAt).getTime() <= windowDays * 86400000)),
    canPay:
      order.paymentMethod === "ONLINE" &&
      order.paymentStatus !== "PAID" &&
      order.orderStatus === "PENDING" &&
      (!order.paymentExpiresAt || order.paymentExpiresAt > new Date()),
    returnWindowDays: windowDays,
  });
};

const CancelOrder = async (req, res) => {
  const order = await loadOwnOrder(req);
  if (!CUSTOMER_CANCELLABLE.includes(order.orderStatus))
    fail(400, "This order can no longer be cancelled. Please request a return after delivery.");
  const reason = str(req.body.reason, 300) || "Cancelled by customer";
  const updated = await changeStatus(order._id, "CANCELLED", { by: "customer", note: reason, actor: "customer" });
  res.json({ order: customerView(updated), message: "Your order has been cancelled" });
};

const ReturnOrder = async (req, res) => {
  const order = await loadOwnOrder(req);
  const updated = await requestReturn(order, { reason: str(req.body.reason, 200), comment: str(req.body.comment, 1000) });
  res.json({ order: customerView(updated), message: "Return requested. We'll review it shortly." });
};

// guest tracking: order number + email
const TrackOrder = async (req, res) => {
  const orderNumber = str(req.body.orderNumber, 30).toUpperCase().replace(/^#/, "");
  const email = str(req.body.email, 200).toLowerCase();
  if (!orderNumber || !isEmail(email)) fail(400, "Enter your order number and email");
  const order = await Order.findOne({ orderNumber }).populate("user", "email");
  const owner = order && (order.guest?.email || order.user?.email || "").toLowerCase();
  if (!order || owner !== email) fail(404, "We couldn't find an order with those details");
  res.json({
    order: customerView(order),
    accessToken: order.user ? undefined : guestToken(order._id),
  });
};

module.exports = {
  CreateOrder,
  OrderInfo,
  Checkout,
  Quote,
  OrderDetail,
  CancelOrder,
  ReturnOrder,
  TrackOrder,
  canAccess,
  loadOwnOrder,
  customerView,
};
