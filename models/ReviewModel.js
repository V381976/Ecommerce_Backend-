const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Products", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    userName: String,
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 120 },
    comment: { type: String, trim: true, maxlength: 2000 },
    verified: { type: Boolean, default: false },
    status: { type: String, enum: ["pending", "approved", "rejected", "flagged"], default: "pending" },
    adminNote: String,
  },
  { timestamps: true }
);

// one review per customer per product
ReviewSchema.index({ product: 1, user: 1 }, { unique: true });
ReviewSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Review", ReviewSchema);
