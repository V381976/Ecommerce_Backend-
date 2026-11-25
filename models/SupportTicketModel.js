const mongoose = require("mongoose");

const SupportTicketSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, unique: true },
    type: { type: String, enum: ["contact", "order", "product_question"], default: "contact" },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: { type: String, trim: true, maxlength: 100 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    subject: { type: String, trim: true, maxlength: 200 },
    message: { type: String, trim: true, maxlength: 4000 },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Products" },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    status: { type: String, enum: ["open", "pending", "resolved", "closed"], default: "open" },
    replies: [
      {
        from: { type: String, enum: ["admin", "customer"] },
        by: String,
        message: { type: String, maxlength: 4000 },
        at: { type: Date, default: Date.now },
      },
    ],
    // product questions: answer shown publicly on the product page
    answer: String,
    isPublic: { type: Boolean, default: false },
  },
  { timestamps: true }
);

SupportTicketSchema.index({ status: 1, createdAt: -1 });
SupportTicketSchema.index({ product: 1, isPublic: 1 });
SupportTicketSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("SupportTicket", SupportTicketSchema);
