const mongoose = require("mongoose");
 
const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
 
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        title: String,
        price: Number,
        quantity: Number,
        thumbnail: String,
      },
    ],
 
    totalAmount: {
      type: Number,
      required: true,
    },
 
    paymentMethod: {
      type: String,
      enum: ["COD", "ONLINE"],
      default: "COD",
    },
 
    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID"],
      default: "PENDING",
    },
 
    orderStatus: {
      type: String,
      enum: ["PENDING", "SHIPPED", "DELIVERED", "CANCELLED"],
      default: "PENDING",
    },
 
    shippingAddress: {
      fullName: String,
      phone: String,
      address: String,
      city: String,
      pincode: String,
    },
  },
  { timestamps: true }
);

orderSchema.pre("save", function () {

  // totalAmount round
  this.totalAmount =
    Math.round(this.totalAmount * 100) / 100;

  // each item price round
  this.items.forEach(item => {
    item.price =
      Math.round(item.price * 100) / 100;
  });


});
 
module.exports = mongoose.model("Order", orderSchema);
 