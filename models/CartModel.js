const mongoose = require("mongoose");

const CartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Products",
        },
        variantId: mongoose.Schema.Types.ObjectId,
        quantity: {
          type: Number,
          default: 1,
        },
      },
    ],

    couponCode: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Cart", CartSchema);
