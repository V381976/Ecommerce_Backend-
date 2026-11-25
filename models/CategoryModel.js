const mongoose = require("mongoose");
const CategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    // subcategory → parent category (null = top level)
    parent: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
    featured: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);
module.exports = mongoose.model("Category", CategorySchema);
