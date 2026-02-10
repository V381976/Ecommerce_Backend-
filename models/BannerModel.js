const mongoose = require("mongoose");

const BannerSchema = new mongoose.Schema({
  title: String,
  image: String,
  link: String,
  active: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model("Banner", BannerSchema);

