const { unitPrice, listPrice, optionsOf } = require("./pricing");

// products without a status (older records) count as active
const VISIBLE = { status: { $nin: ["draft", "inactive"] } };

// aggregation stage computing the price customers pay + total stock, so the
// catalogue can filter/sort by what is actually shown
const effectiveFields = (settings) => {
  const applyDiscounts = settings.pricing?.applyProductDiscounts !== false;
  return {
    $addFields: {
      finalPrice: {
        $cond: [
          { $and: [{ $gt: ["$salePrice", 0] }, { $lt: ["$salePrice", "$price"] }] },
          "$salePrice",
          applyDiscounts
            ? {
                $cond: [
                  { $gt: [{ $ifNull: ["$discountPercent", 0] }, 0] },
                  { $round: [{ $multiply: ["$price", { $subtract: [1, { $divide: [{ $min: ["$discountPercent", 95] }, 100] }] }] }, 2] },
                  "$price",
                ],
              }
            : "$price",
        ],
      },
      stockTotal: {
        $cond: [{ $gt: [{ $size: { $ifNull: ["$variants", []] } }, 0] }, { $sum: "$variants.stock" }, "$stock"],
      },
      ratingValue: { $ifNull: ["$ratingAvg", "$rating"] },
      reviewTotal: { $ifNull: ["$reviewCount", { $size: { $ifNull: ["$reviews", []] } }] },
      hasVariants: { $gt: [{ $size: { $ifNull: ["$variants", []] } }, 0] },
    },
  };
};

// fields a product card needs (keeps listing payloads small)
const CARD_PROJECTION = {
  title: 1,
  slug: 1,
  thumbnail: 1,
  price: 1,
  salePrice: 1,
  discountPercent: 1,
  finalPrice: 1,
  brand: 1,
  category: 1,
  subcategory: 1,
  labels: 1,
  stock: "$stockTotal",
  rating: "$ratingValue",
  reviewCount: "$reviewTotal",
  hasVariants: 1,
  soldCount: 1,
  createdAt: 1,
};

// same numbers for a single product document (details page, legacy list)
const decorate = (p, settings) => {
  if (!p) return p;
  const variants = (p.variants || []).map((v) => ({
    ...v,
    options: optionsOf(v),
    listPrice: listPrice(p, v),
    finalPrice: unitPrice(p, v, settings),
  }));
  const stockTotal = variants.length ? variants.reduce((s, v) => s + (Number(v.stock) || 0), 0) : p.stock;
  return {
    ...p,
    variants,
    finalPrice: unitPrice(p, null, settings),
    stockTotal,
    hasVariants: variants.length > 0,
    rating: p.ratingAvg ?? p.rating,
    reviewCount: p.reviewCount ?? (p.reviews || []).length,
  };
};

module.exports = { VISIBLE, effectiveFields, CARD_PROJECTION, decorate };
