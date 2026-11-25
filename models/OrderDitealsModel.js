const mongoose = require("mongoose");

const ORDER_STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"];
const PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"];

const addressSchema = {
  fullName: String,
  phone: String,
  address: String,
  city: String,
  state: String,
  pincode: String,
};

const orderSchema = new mongoose.Schema(
  {
    // optional for guest checkout (then `guest` is filled)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    guest: {
      name: String,
      email: { type: String, lowercase: true, trim: true },
      phone: String,
    },
    orderNumber: { type: String },

    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Products",
          required: true,
        },
        title: String,
        price: Number, // unit price actually charged
        mrp: Number, // list price before product discount
        quantity: Number,
        thumbnail: String,
        variantId: mongoose.Schema.Types.ObjectId,
        variantLabel: String,
        sku: String,
        category: String,
        reviewed: { type: Boolean, default: false },
      },
    ],

    subtotal: Number,
    offerDiscount: { type: Number, default: 0 },
    coupon: {
      code: String,
      discount: Number,
      freeShipping: Boolean,
    },
    shippingFee: { type: Number, default: 0 },
    tax: {
      rate: Number,
      amount: Number,
      inclusive: Boolean,
    },
    totalAmount: {
      type: Number,
      required: true,
    },

    paymentMethod: {
      type: String,
      enum: ["COD", "ONLINE"],
      default: "COD",
    },

    paymentId: String,
    razorpayOrderId: String,
    paymentExpiresAt: Date,

    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "PENDING",
    },

    orderStatus: {
      type: String,
      enum: ORDER_STATUSES,
      default: "PENDING",
    },

    statusHistory: [
      {
        status: String,
        note: String,
        by: String,
        at: { type: Date, default: Date.now },
      },
    ],
    notes: [
      {
        text: { type: String, maxlength: 2000 },
        by: String,
        at: { type: Date, default: Date.now },
      },
    ],
    tracking: {
      courier: String,
      number: String,
      url: String,
      estimatedDelivery: Date,
    },
    cancelReason: String,
    returnRequest: {
      status: { type: String, enum: ["REQUESTED", "APPROVED", "REJECTED", "RECEIVED"] },
      reason: String,
      comment: String,
      adminNote: String,
      requestedAt: Date,
      resolvedAt: Date,
    },
    refund: {
      status: { type: String, enum: ["PENDING", "PROCESSED", "FAILED"] },
      amount: Number,
      reference: String,
      note: String,
      processedAt: Date,
    },

    // idempotency: one order per checkout attempt
    checkoutId: String,
    // stock was taken for this order (released on cancel/expiry, restocked on return)
    stockReserved: { type: Boolean, default: false },
    deliveredAt: Date,

    shippingAddress: addressSchema,
    billingAddress: addressSchema,
  },
  { timestamps: true }
);

orderSchema.index({ orderNumber: 1 }, { unique: true, partialFilterExpression: { orderNumber: { $type: "string" } } });
orderSchema.index({ checkoutId: 1 }, { unique: true, partialFilterExpression: { checkoutId: { $type: "string" } } });
orderSchema.index({ razorpayOrderId: 1 }, { unique: true, partialFilterExpression: { razorpayOrderId: { $type: "string" } } });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, paymentExpiresAt: 1 });
orderSchema.index({ "guest.email": 1 });
orderSchema.index({ "items.product": 1 });

module.exports = mongoose.model("Order", orderSchema);
module.exports.ORDER_STATUSES = ORDER_STATUSES;
module.exports.PAYMENT_STATUSES = PAYMENT_STATUSES;
