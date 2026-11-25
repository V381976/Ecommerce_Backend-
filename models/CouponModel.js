const mongoose = require("mongoose");

const CouponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 30 },
    description: { type: String, trim: true, maxlength: 200 },
    type: { type: String, enum: ["percent", "fixed"], required: true },
    value: { type: Number, required: true, min: 0 },
    minCartValue: { type: Number, default: 0, min: 0 },
    // cap for percentage coupons (0/empty = no cap)
    maxDiscount: { type: Number, min: 0 },
    startsAt: Date,
    expiresAt: Date,
    usageLimit: { type: Number, min: 0 }, // total redemptions (empty/0 = unlimited)
    perCustomerLimit: { type: Number, min: 0, default: 1 }, // 0 = unlimited
    usedCount: { type: Number, default: 0 },
    // restrict to category names / product ids (empty = whole cart)
    applicableCategories: [String],
    applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Products" }],
    freeShipping: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Coupon", CouponSchema);
