const mongoose = require("mongoose");

const OfferSchema = new mongoose.Schema(
{
  /* Offer title */
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },

  /* optional description */
  description: {
    type: String,
    trim: true,
    maxlength: 300
  },

  /* discount percentage */
  discountPercent: {
    type: Number,
    required: true,
    min: 1,
    max: 90
  },

  /* flat discount (optional) */
  discountAmount: {
    type: Number,
    min: 0
  },

  /* Apply on category OR brand */
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: true,
    default: null,
    index: true
  },

  /* active or disabled */
  active: {
    type: Boolean,
    default: true,
    index: true
  },

  /* time control */
  startsAt: {
    type: Date,
    default: Date.now
  },

  expiresAt: {
    type: Date
  },

  /* priority for sorting */
  priority: {
    type: Number,
    default: 0
  }

},
{
  timestamps: true
});



module.exports = mongoose.model("Offer", OfferSchema);
