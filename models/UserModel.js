const mongoose = require("mongoose");

const ROLES = ["Super_Admin", "Admin", "Inventory_Manager", "Order_Manager", "Product_admin", "User"];

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, maxlength: 40, default: "Home" },
    fullName: { type: String, trim: true, required: true, maxlength: 100 },
    phone: { type: String, trim: true, required: true, maxlength: 20 },
    address: { type: String, trim: true, required: true, maxlength: 300 },
    city: { type: String, trim: true, required: true, maxlength: 80 },
    state: { type: String, trim: true, maxlength: 80 },
    pincode: { type: String, trim: true, required: true, maxlength: 10 },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ROLES,
      default: "User",
    },
    blocked: {
      type: Boolean,
      default: false,
    },
    avatar: String,

    phone: { type: String, trim: true },
    addresses: [addressSchema],
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "Products" }],

    notificationPrefs: {
      orderUpdates: { type: Boolean, default: true },
      backInStock: { type: Boolean, default: true },
      priceDrop: { type: Boolean, default: true },
      promotions: { type: Boolean, default: false },
      // abandoned-cart emails only go to users who opted in
      abandonedCart: { type: Boolean, default: false },
    },

    // admin-only notes about the customer
    supportNotes: [
      {
        note: { type: String, maxlength: 1000 },
        by: String,
        at: { type: Date, default: Date.now },
      },
    ],

    // password reset (only a sha256 hash of the token is stored)
    resetTokenHash: String,
    resetTokenExpires: Date,
    // bumped on password change/reset → older JWTs stop working
    tokenVersion: { type: Number, default: 0 },

    lastLoginAt: Date,
    abandonedCartRemindedAt: Date,
  },
  { timestamps: true }
);

userSchema.index({ role: 1, createdAt: -1 });

module.exports = mongoose.model("User", userSchema);
module.exports.ROLES = ROLES;
