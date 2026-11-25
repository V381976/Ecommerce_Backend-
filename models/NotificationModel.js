const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["order", "back_in_stock", "price_drop", "support", "review", "system"],
      default: "system",
    },
    title: String,
    message: String,
    link: String,
    read: { type: Boolean, default: false },
    emailed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

NotificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", NotificationSchema);
