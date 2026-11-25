const Cart = require("../../models/CartModel");
const Product = require("../../models/productmodel");
const { priceCart, findVariant, stockOf, isSellable } = require("../../utils/pricing");
const { isObjectId, str, fail } = require("../../utils/http");

const MAX_QTY = 99;

const sameLine = (item, productId, variantId) =>
  String(item.product) === String(productId) && String(item.variantId || "") === String(variantId || "");

const getOrCreateCart = async (userId) =>
  (await Cart.findOne({ user: userId })) || Cart.create({ user: userId, items: [] });

// validates product/variant and returns the max quantity allowed
const checkLine = async (productId, variantId) => {
  if (!isObjectId(productId)) fail(400, "Invalid product");
  const product = await Product.findById(productId).lean();
  if (!product || !isSellable(product)) fail(404, "This product is no longer available");
  const hasVariants = (product.variants || []).length > 0;
  const variant = findVariant(product, variantId);
  if (hasVariants && !variant) fail(400, "Please choose an option first");
  const stock = stockOf(product, variant);
  if (stock === 0) fail(409, `${product.title} is out of stock`);
  return { product, variant, max: Math.min(MAX_QTY, stock ?? MAX_QTY) };
};

const cartResponse = async (userId) => {
  const cart = await Cart.findOne({ user: userId }).populate("items.product");
  if (!cart) return { items: [] };
  // deleted products cart se hata do
  cart.items = cart.items.filter((item) => item.product);
  return cart;
};

// ✅ Add to cart  { productId, variantId?, quantity? }
const addToCart = async (req, res) => {
  const { productId, variantId } = req.body;
  const qty = Math.max(1, Math.floor(Number(req.body.quantity) || 1));
  const { max, product } = await checkLine(productId, variantId);

  const cart = await getOrCreateCart(req.user.id);
  const line = cart.items.find((i) => sameLine(i, productId, variantId));
  const current = line?.quantity || 0;
  if (current >= max) fail(409, `You already have the maximum available quantity of ${product.title} in your cart`);
  const next = Math.min(max, current + qty);

  if (line) line.quantity = next;
  else cart.items.push({ product: productId, variantId: variantId || undefined, quantity: next });
  await cart.save();

  res.json({ ...cart.toObject(), added: next - current, capped: next < current + qty });
};

// ✅ Get cart (populated, same shape as before)
const getCart = async (req, res) => {
  res.json(await cartResponse(req.user.id));
};

// ✅ Remove item  { productId, variantId? }
const removeItem = async (req, res) => {
  const { productId, variantId } = req.body;

  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart) return res.status(404).json({ msg: "Cart not found" });

  cart.items = cart.items.filter((item) => !sameLine(item, productId, variantId));

  await cart.save();

  res.json(cart);
};

// ✅ Update quantity  { productId, variantId?, quantity }
const updateQuantity = async (req, res) => {
  const { productId, variantId } = req.body;
  const quantity = Math.floor(Number(req.body.quantity));
  if (!(quantity >= 1)) fail(400, "Quantity must be at least 1");

  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart) return res.status(404).json({ msg: "Cart not found" });

  const item = cart.items.find((i) => sameLine(i, productId, variantId));
  if (!item) fail(404, "Item not in cart");

  const { max, product } = await checkLine(productId, variantId);
  if (quantity > max) fail(409, `Only ${max} of ${product.title} available`, { max });
  item.quantity = quantity;

  await cart.save();

  res.json(cart);
};

// ✅ Server-priced summary (subtotal, offers, coupon, shipping, tax, total, issues)
const cartSummary = async (req, res) => {
  const cart = await Cart.findOne({ user: req.user.id }).lean();
  const items = (cart?.items || []).map((i) => ({ productId: i.product, variantId: i.variantId, quantity: i.quantity }));
  const summary = await priceCart(items, {
    couponCode: cart?.couponCode,
    pincode: str(req.query.pincode, 10),
    userId: req.user.id,
    email: req.account?.email,
  });
  res.json(summary);
};

// ✅ Coupon  { code }
const applyCoupon = async (req, res) => {
  const code = str(req.body.code, 30).toUpperCase();
  if (!code) fail(400, "Enter a coupon code");
  const cart = await getOrCreateCart(req.user.id);
  const items = cart.items.map((i) => ({ productId: i.product, variantId: i.variantId, quantity: i.quantity }));
  const summary = await priceCart(items, { couponCode: code, userId: req.user.id, email: req.account?.email });
  if (summary.coupon?.error) fail(400, summary.coupon.error);
  cart.couponCode = code;
  await cart.save();
  res.json({ message: `Coupon ${code} applied`, summary });
};

const removeCoupon = async (req, res) => {
  await Cart.updateOne({ user: req.user.id }, { $unset: { couponCode: 1 } });
  res.json({ message: "Coupon removed" });
};

// ✅ Merge guest cart after login  { items: [{ productId, variantId, quantity }] }
const mergeCart = async (req, res) => {
  const incoming = Array.isArray(req.body.items) ? req.body.items.slice(0, 50) : [];
  const cart = await getOrCreateCart(req.user.id);
  const skipped = [];

  for (const raw of incoming) {
    try {
      const qty = Math.max(1, Math.floor(Number(raw.quantity) || 1));
      const { max } = await checkLine(raw.productId, raw.variantId);
      const line = cart.items.find((i) => sameLine(i, raw.productId, raw.variantId));
      // keep the larger quantity instead of adding (avoids doubling on repeat merges)
      const next = Math.min(max, Math.max(line?.quantity || 0, qty));
      if (line) line.quantity = next;
      else cart.items.push({ product: raw.productId, variantId: raw.variantId || undefined, quantity: next });
    } catch (err) {
      skipped.push({ productId: raw.productId, reason: err.message });
    }
  }
  await cart.save();
  res.json({ cart: await cartResponse(req.user.id), skipped });
};

module.exports = {
  addToCart,
  getCart,
  removeItem,
  updateQuantity,
  cartSummary,
  applyCoupon,
  removeCoupon,
  mergeCart,
};
