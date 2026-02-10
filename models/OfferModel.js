
const mongoose = require("mongoose");

const OfferSchema = new mongoose.Schema({

  title: String, // Summer Sale

  discountPercent: {
    type: Number,
    required: true
  },

  // optional (either category OR brand)
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category"
  },

  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Brand"
  },

  active: {
    type: Boolean,
    default: true
  },
  expiresAt: {
  type: Date
}

}, { timestamps: true });

module.exports = mongoose.model("Offer", OfferSchema);
