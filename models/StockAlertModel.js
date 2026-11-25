const mongoose = require("mongoose");

// "notify me when back in stock"
const StockAlertSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Products", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    email: { type: String, required: true, lowercase: true, trim: true },
  },
  { timestamps: true }
);

StockAlertSchema.index({ product: 1, email: 1 }, { unique: true });

module.exports = mongoose.model("StockAlert", StockAlertSchema);
