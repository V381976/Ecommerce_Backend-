const mongoose = require("mongoose");

const LABELS = ["featured", "trending", "new", "bestseller"];
const STATUSES = ["draft", "active", "inactive"];

const variantSchema = new mongoose.Schema({
  sku: { type: String, trim: true },
  // e.g. { Color: "Red", Size: "M" }
  options: { type: Map, of: String, default: {} },
  price: { type: Number, min: 0 },
  salePrice: { type: Number, min: 0 },
  stock: { type: Number, default: 0, min: 0 },
  image: String,
});

const productSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    category: {
      type: String,
      ref: "Category",
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    discountPercent: Number,
    rating: Number,
    stock: Number,
    brand: {
      type: String,
    },
    warrantyInformation: String,
    returnPolicy: String,
    thumbnail: {
      type: String,
      required: true,
    },
    images: {
      type: [String],
    },

    // dummyjson.com se aaye extra fields
    sourceId: { type: Number, index: true, sparse: true },
    sku: String,
    tags: [String],
    weight: Number,
    dimensions: {
      width: Number,
      height: Number,
      depth: Number,
    },
    shippingInformation: String,
    availabilityStatus: String,
    minimumOrderQuantity: Number,
    reviews: [
      {
        rating: Number,
        comment: String,
        date: Date,
        reviewerName: String,
        reviewerEmail: String,
      },
    ],

    // ---------- catalogue management (all optional, old records stay valid) ----------
    slug: { type: String, trim: true, lowercase: true },
    barcode: String,
    // explicit sale price wins over discountPercent when set
    salePrice: { type: Number, min: 0 },
    subcategory: String,
    labels: [{ type: String, enum: LABELS }],
    specifications: [{ key: { type: String, trim: true }, value: { type: String, trim: true } }],
    // e.g. [{ name: "Size", values: ["S","M","L"] }]
    variantOptions: [{ name: { type: String, trim: true }, values: [String] }],
    variants: [variantSchema],
    // missing status (older records) is treated as active
    status: { type: String, enum: STATUSES, default: "active" },
    seo: {
      title: String,
      description: String,
    },
    lowStockThreshold: Number,
    soldCount: { type: Number, default: 0 },
    // aggregated from approved customer reviews + imported reviews
    ratingAvg: Number,
    reviewCount: Number,
  },
  { timestamps: true }
);

productSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { slug: { $type: "string" } } });
productSchema.index({ status: 1, category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ labels: 1 });
productSchema.index({ soldCount: -1 });
productSchema.index(
  { title: "text", brand: "text", category: "text", tags: "text", description: "text" },
  { weights: { title: 10, brand: 5, category: 4, tags: 3, description: 1 }, name: "product_text" }
);

const Products = mongoose.model("Products", productSchema);
module.exports = Products;
module.exports.LABELS = LABELS;
module.exports.STATUSES = STATUSES;
