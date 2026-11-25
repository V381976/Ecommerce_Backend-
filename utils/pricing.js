const Products = require("../models/productmodel");
const Offer = require("../models/OfferModel");
require("../models/CategoryModel"); // populated on offers
const Coupon = require("../models/CouponModel");
const Order = require("../models/OrderDitealsModel");
const { getSettings } = require("./settings");
const { round2 } = require("./http");

/*
  All money maths happens here, on the server. The storefront only ever
  displays what priceCart() returns; orders are created from the same result.
*/

const sameText = (a = "", b = "") => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

const isSellable = (p) => p && (!p.status || p.status === "active");

const findVariant = (product, variantId) =>
  variantId ? (product.variants || []).find((v) => String(v._id) === String(variantId)) : null;

const optionsOf = (variant) => {
  if (!variant?.options) return {};
  return variant.options instanceof Map ? Object.fromEntries(variant.options) : variant.options;
};

const variantLabel = (variant) =>
  variant
    ? Object.entries(optionsOf(variant))
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
    : "";

// list price before any product-level discount
const listPrice = (product, variant) => round2(variant?.price ?? product.price);

// price the customer pays per unit
const unitPrice = (product, variant, settings) => {
  const base = listPrice(product, variant);
  const sale = variant ? variant.salePrice ?? (variant.price == null ? product.salePrice : undefined) : product.salePrice;
  if (sale != null && sale > 0 && sale < base) return round2(sale);
  if (settings.pricing?.applyProductDiscounts !== false && product.discountPercent > 0) {
    return round2(base * (1 - Math.min(product.discountPercent, 95) / 100));
  }
  return base;
};

// null = stock not tracked for this item (older admin products without a stock value)
const stockOf = (product, variant) => {
  const s = variant ? variant.stock : product.stock;
  return s == null ? null : Math.max(0, Number(s) || 0);
};

/* ---------------- automatic offers (existing Offer model, per category) ---------------- */
const activeOffers = async () => {
  const now = new Date();
  return Offer.find({
    active: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
    ],
  })
    .populate("category", "name")
    .lean();
};

/* ---------------- shipping ---------------- */
const shippingQuote = (settings, pincode, amount) => {
  const s = settings.shipping || {};
  const pin = String(pincode || "").trim();
  let zone = null;
  if (pin) {
    let best = 0;
    for (const z of s.zones || []) {
      if (z.active === false) continue;
      for (const prefix of z.pincodePrefixes || []) {
        if (prefix && pin.startsWith(prefix) && prefix.length > best) {
          zone = z;
          best = prefix.length;
        }
      }
    }
  }
  const serviceable = !pin || !s.restrictToZones || !!zone;
  let fee = zone ? Number(zone.charge) || 0 : Number(s.flatRate) || 0;
  if (s.freeThreshold > 0 && amount >= s.freeThreshold) fee = 0;
  return {
    serviceable,
    fee: round2(fee),
    zone: zone?.name || null,
    etaMin: zone?.etaMin ?? s.defaultEtaMin ?? 3,
    etaMax: zone?.etaMax ?? s.defaultEtaMax ?? 7,
    freeThreshold: s.freeThreshold || 0,
  };
};

/* ---------------- coupons ---------------- */
const couponRedemptions = (code, { userId, email }) => {
  const who = [];
  if (userId) who.push({ user: userId });
  if (email) who.push({ "guest.email": String(email).toLowerCase() });
  if (!who.length) return 0;
  return Order.countDocuments({
    "coupon.code": code,
    $or: who,
    orderStatus: { $ne: "CANCELLED" },
    paymentStatus: { $ne: "FAILED" },
  });
};

// returns { coupon, discount, freeShipping } or { error }
const evaluateCoupon = async (code, lines, amountAfterOffers, who) => {
  const c = await Coupon.findOne({ code: String(code).trim().toUpperCase() }).lean();
  const now = new Date();
  if (!c || !c.active) return { error: "This coupon code is not valid" };
  if (c.startsAt && c.startsAt > now) return { error: "This coupon is not active yet" };
  if (c.expiresAt && c.expiresAt < now) return { error: "This coupon has expired" };
  if (c.usageLimit > 0 && c.usedCount >= c.usageLimit) return { error: "This coupon has reached its usage limit" };
  if (c.minCartValue > 0 && amountAfterOffers < c.minCartValue)
    return { error: `Add items worth ₹${round2(c.minCartValue - amountAfterOffers)} more to use this coupon` };

  if (c.perCustomerLimit > 0 && (who.userId || who.email)) {
    const used = await couponRedemptions(c.code, who);
    if (used >= c.perCustomerLimit) return { error: "You have already used this coupon" };
  }

  const restricted = (c.applicableCategories?.length || 0) + (c.applicableProducts?.length || 0) > 0;
  const eligible = lines.filter(
    (l) =>
      !restricted ||
      c.applicableProducts?.some((id) => String(id) === String(l.productId)) ||
      c.applicableCategories?.some((cat) => sameText(cat, l.category))
  );
  const eligibleTotal = eligible.reduce((s, l) => s + l.lineTotal - l.offerDiscount, 0);
  if (!eligibleTotal) return { error: "This coupon doesn't apply to the items in your cart" };

  let discount = c.type === "percent" ? (eligibleTotal * c.value) / 100 : c.value;
  if (c.type === "percent" && c.maxDiscount > 0) discount = Math.min(discount, c.maxDiscount);
  discount = round2(Math.min(discount, eligibleTotal));

  return { coupon: c, discount, freeShipping: !!c.freeShipping };
};

/*
  items: [{ productId, variantId, quantity }]
  → full breakdown + per-line issues (unavailable / not enough stock)
*/
const priceCart = async (items, { couponCode, pincode, userId, email } = {}) => {
  const settings = await getSettings();
  const ids = [...new Set(items.map((i) => String(i.productId)).filter((id) => /^[a-f\d]{24}$/i.test(id)))];
  const products = ids.length ? await Products.find({ _id: { $in: ids } }).lean() : [];
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const offers = await activeOffers();

  const lines = [];
  const issues = [];

  for (const item of items) {
    const product = byId.get(String(item.productId));
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    if (!product || !isSellable(product)) {
      issues.push({ productId: item.productId, variantId: item.variantId, type: "unavailable", message: "This product is no longer available" });
      continue;
    }
    const hasVariants = (product.variants || []).length > 0;
    const variant = findVariant(product, item.variantId);
    if (hasVariants && !variant) {
      issues.push({ productId: item.productId, variantId: item.variantId, type: "variant", message: `Please choose an option for ${product.title}` });
      continue;
    }

    const available = stockOf(product, variant);
    const price = unitPrice(product, variant, settings);
    const mrp = listPrice(product, variant);
    const line = {
      productId: String(product._id),
      variantId: variant ? String(variant._id) : null,
      title: product.title,
      slug: product.slug,
      thumbnail: variant?.image || product.thumbnail,
      category: product.category,
      brand: product.brand,
      sku: variant?.sku || product.sku,
      variantLabel: variantLabel(variant),
      quantity: qty,
      unitPrice: price,
      mrp,
      lineTotal: round2(price * qty),
      available,
      offerDiscount: 0,
      offerTitle: null,
    };

    if (available !== null && available < qty) {
      issues.push({
        productId: line.productId,
        variantId: line.variantId,
        type: available === 0 ? "out_of_stock" : "insufficient_stock",
        available,
        message: available === 0 ? `${product.title} is out of stock` : `Only ${available} left of ${product.title}`,
      });
      line.issue = available === 0 ? "out_of_stock" : "insufficient_stock";
    }

    // best active category offer for this line
    const offer = offers
      .filter((o) => o.category && sameText(o.category.name, product.category))
      .sort((a, b) => b.discountPercent - a.discountPercent)[0];
    if (offer) {
      line.offerDiscount = round2((line.lineTotal * offer.discountPercent) / 100);
      line.offerTitle = offer.title;
    }

    lines.push(line);
  }

  const valid = lines.filter((l) => !l.issue);
  const subtotal = round2(valid.reduce((s, l) => s + l.lineTotal, 0));
  const mrpTotal = round2(valid.reduce((s, l) => s + l.mrp * l.quantity, 0));
  const offerDiscount = round2(valid.reduce((s, l) => s + l.offerDiscount, 0));
  const afterOffers = round2(subtotal - offerDiscount);

  let coupon = null;
  if (couponCode && valid.length) {
    const result = await evaluateCoupon(couponCode, valid, afterOffers, { userId, email });
    coupon = result.error
      ? { code: String(couponCode).toUpperCase(), error: result.error, discount: 0 }
      : {
          code: result.coupon.code,
          discount: result.discount,
          freeShipping: result.freeShipping,
          description: result.coupon.description,
        };
  }

  const couponDiscount = coupon?.discount || 0;
  const taxable = Math.max(0, round2(afterOffers - couponDiscount));
  const shipping = shippingQuote(settings, pincode, taxable);
  if (coupon?.freeShipping && !coupon.error) shipping.fee = 0;
  if (!valid.length) shipping.fee = 0;

  const rate = Number(settings.tax?.rate) || 0;
  const inclusive = settings.tax?.inclusive !== false;
  const taxAmount = rate ? round2(inclusive ? taxable - taxable / (1 + rate / 100) : (taxable * rate) / 100) : 0;

  const total = round2(taxable + shipping.fee + (inclusive ? 0 : taxAmount));

  return {
    lines,
    issues,
    count: valid.reduce((n, l) => n + l.quantity, 0),
    mrpTotal,
    productSavings: round2(mrpTotal - subtotal),
    subtotal,
    offerDiscount,
    coupon,
    shipping,
    tax: { rate, inclusive, label: settings.tax?.label || "Tax", amount: taxAmount },
    total,
    currency: settings.store?.currency || "INR",
  };
};

module.exports = {
  priceCart,
  unitPrice,
  listPrice,
  stockOf,
  findVariant,
  variantLabel,
  optionsOf,
  isSellable,
  shippingQuote,
  sameText,
};
