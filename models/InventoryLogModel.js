const mongoose = require("mongoose");

const InventoryLogSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Products", required: true },
    productTitle: String,
    variantId: mongoose.Schema.Types.ObjectId,
    variantLabel: String,
    change: { type: Number, required: true },
    before: Number,
    after: Number,
    reason: {
      type: String,
      enum: ["order", "cancel", "expired", "return", "adjustment", "restock", "import", "bulk", "edit", "create"],
      required: true,
    },
    refId: String, // e.g. order number
    note: String,
    by: String,
  },
  { timestamps: true }
);

InventoryLogSchema.index({ product: 1, createdAt: -1 });
InventoryLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("InventoryLog", InventoryLogSchema);
