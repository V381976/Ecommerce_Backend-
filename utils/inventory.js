const Products = require("../models/productmodel");
const InventoryLog = require("../models/InventoryLogModel");
const StockAlert = require("../models/StockAlertModel");
const { notifyUser, notifyEmail } = require("./notify");
const { findVariant, variantLabel, stockOf } = require("./pricing");
const { HttpError } = require("./http");

/*
  Every stock change goes through here so it is atomic (conditional $inc,
  never read-modify-write) and leaves an InventoryLog entry.
*/

// take stock for order lines inside a transaction. Throws 409 if any line can't be fulfilled.
const reserveStock = async (lines, { session, refId, by }) => {
  const logs = [];
  for (const l of lines) {
    const product = await Products.findById(l.productId).session(session).lean();
    if (!product) throw new HttpError(409, `${l.title} is no longer available`);
    const variant = findVariant(product, l.variantId);
    const tracked = stockOf(product, variant) !== null;

    let updated;
    if (variant) {
      updated = await Products.findOneAndUpdate(
        tracked
          ? { _id: l.productId, variants: { $elemMatch: { _id: variant._id, stock: { $gte: l.quantity } } } }
          : { _id: l.productId, "variants._id": variant._id },
        { $inc: { "variants.$.stock": tracked ? -l.quantity : 0, soldCount: l.quantity } },
        { session, returnDocument: "after" }
      ).lean();
    } else {
      updated = await Products.findOneAndUpdate(
        tracked ? { _id: l.productId, stock: { $gte: l.quantity } } : { _id: l.productId },
        { $inc: { ...(tracked ? { stock: -l.quantity } : {}), soldCount: l.quantity } },
        { session, returnDocument: "after" }
      ).lean();
    }
    if (!updated) {
      throw new HttpError(409, `Sorry, ${l.title}${l.variantLabel ? ` (${l.variantLabel})` : ""} just went out of stock`, {
        productId: l.productId,
      });
    }
    if (tracked) {
      const after = stockOf(updated, findVariant(updated, l.variantId));
      logs.push({
        product: l.productId,
        productTitle: l.title,
        variantId: l.variantId || undefined,
        variantLabel: l.variantLabel || undefined,
        change: -l.quantity,
        before: after + l.quantity,
        after,
        reason: "order",
        refId,
        by,
      });
    }
  }
  if (logs.length) await InventoryLog.insertMany(logs, { session });
};

// put stock back for an order's items (cancel / payment expiry / return)
const releaseStock = async (order, { session, reason = "cancel", by } = {}) => {
  const logs = [];
  for (const item of order.items) {
    const product = await Products.findById(item.product).session(session).lean();
    if (!product) continue;
    const variant = findVariant(product, item.variantId);
    const tracked = stockOf(product, variant) !== null;
    const inc = { soldCount: -item.quantity };
    let filter = { _id: item.product };
    if (variant) {
      filter = { _id: item.product, "variants._id": variant._id };
      if (tracked) inc["variants.$.stock"] = item.quantity;
    } else if (tracked) inc.stock = item.quantity;

    const updated = await Products.findOneAndUpdate(filter, { $inc: inc }, { session, returnDocument: "after" }).lean();
    if (tracked && updated) {
      const after = stockOf(updated, findVariant(updated, item.variantId));
      logs.push({
        product: item.product,
        productTitle: item.title,
        variantId: item.variantId,
        variantLabel: item.variantLabel,
        change: item.quantity,
        before: after - item.quantity,
        after,
        reason,
        refId: order.orderNumber || String(order._id),
        by,
      });
      if (after - item.quantity <= 0 && after > 0) setImmediate(() => notifyBackInStock(updated));
    }
  }
  if (logs.length) await InventoryLog.insertMany(logs, { session });
};

// admin adjustment: mode "set" (absolute) or "add" (delta, may be negative)
const adjustStock = async ({ productId, variantId, mode = "add", quantity, reason = "adjustment", note, by }) => {
  const product = await Products.findById(productId).lean();
  if (!product) throw new HttpError(404, "Product not found");
  const variant = findVariant(product, variantId);
  if (variantId && !variant) throw new HttpError(404, "Variant not found");

  const before = stockOf(product, variant) ?? 0;
  const q = Math.floor(Number(quantity));
  if (!Number.isFinite(q)) throw new HttpError(400, "Quantity must be a number");
  const after = mode === "set" ? q : before + q;
  if (after < 0) throw new HttpError(400, `Stock can't go below 0 (current ${before})`);

  const filter = variant ? { _id: productId, "variants._id": variant._id } : { _id: productId };
  const update = variant ? { $set: { "variants.$.stock": after } } : { $set: { stock: after } };
  const updated = await Products.findOneAndUpdate(filter, update, { returnDocument: "after" }).lean();

  if (after !== before) {
    await InventoryLog.create({
      product: productId,
      productTitle: product.title,
      variantId: variant?._id,
      variantLabel: variantLabel(variant) || undefined,
      change: after - before,
      before,
      after,
      reason,
      note,
      by,
    });
  }
  if (before <= 0 && after > 0) setImmediate(() => notifyBackInStock(updated));
  return { product: updated, before, after };
};

// total sellable stock (sum of variants when the product has them)
const totalStock = (p) =>
  (p.variants || []).length ? p.variants.reduce((s, v) => s + (Number(v.stock) || 0), 0) : p.stock;

const notifyBackInStock = async (product) => {
  try {
    const alerts = await StockAlert.find({ product: product._id }).lean();
    if (!alerts.length) return;
    const link = `/products/${product.slug || product._id}`;
    for (const a of alerts) {
      const msg = { type: "back_in_stock", title: `${product.title} is back in stock`, message: `Good news — ${product.title} is available again. Grab it before it sells out.`, link, prefKey: "backInStock" };
      if (a.user) await notifyUser(a.user, msg);
      else await notifyEmail(a.email, msg);
    }
    await StockAlert.deleteMany({ _id: { $in: alerts.map((a) => a._id) } });
  } catch (err) {
    console.error("back-in-stock notify failed:", err.message);
  }
};

module.exports = { reserveStock, releaseStock, adjustStock, totalStock, notifyBackInStock };
