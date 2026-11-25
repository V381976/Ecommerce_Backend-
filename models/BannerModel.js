const mongoose = require("mongoose");

const BannerSchema = new mongoose.Schema(
  {
    title: String,
    image: String,
    link: String,
    active: {
      type: Boolean,
      default: true,
    },
    // display order on the home page slider (lower first)
    position: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Banner", BannerSchema);
