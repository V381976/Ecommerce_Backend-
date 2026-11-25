const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    actor: {
      id: mongoose.Schema.Types.ObjectId,
      name: String,
      role: String,
    },
    action: { type: String, required: true }, // e.g. product.update
    entity: String,
    entityId: String,
    summary: String,
    meta: mongoose.Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ entity: 1, entityId: 1 });

module.exports = mongoose.model("AuditLog", AuditLogSchema);
