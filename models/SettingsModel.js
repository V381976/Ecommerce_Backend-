const mongoose = require("mongoose");

// single document (key: "store") holding store-wide configuration.
// Defaults keep the old behaviour: free delivery, no extra tax, COD on.
const SettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "store", unique: true },
    store: {
      name: { type: String, default: "ShopEase" },
      email: { type: String, default: "support@shopease.com" },
      phone: { type: String, default: "+91 98765 43210" },
      address: { type: String, default: "Connaught Place, New Delhi, India" },
      currency: { type: String, default: "INR" },
    },
    tax: {
      rate: { type: Number, default: 0, min: 0, max: 50 },
      inclusive: { type: Boolean, default: true },
      label: { type: String, default: "GST" },
    },
    shipping: {
      flatRate: { type: Number, default: 0, min: 0 },
      freeThreshold: { type: Number, default: 0, min: 0 }, // 0 = no threshold
      restrictToZones: { type: Boolean, default: false },
      defaultEtaMin: { type: Number, default: 3 },
      defaultEtaMax: { type: Number, default: 7 },
      zones: [
        {
          name: String,
          pincodePrefixes: [String],
          charge: { type: Number, default: 0 },
          etaMin: Number,
          etaMax: Number,
          active: { type: Boolean, default: true },
        },
      ],
    },
    payments: {
      codEnabled: { type: Boolean, default: true },
      codMaxAmount: { type: Number, default: 0 }, // 0 = no limit
      onlineEnabled: { type: Boolean, default: true },
      guestCheckout: { type: Boolean, default: true },
    },
    pricing: {
      // charge the discounted price shown on product cards
      applyProductDiscounts: { type: Boolean, default: true },
    },
    inventory: {
      lowStockThreshold: { type: Number, default: 5 },
    },
    orders: {
      returnWindowDays: { type: Number, default: 7 },
      paymentTimeoutMinutes: { type: Number, default: 30 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Settings", SettingsSchema);
