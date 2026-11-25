const mongoose = require("mongoose");

// storefront content. `draft` is edited + previewed in the admin panel,
// `published` is what customers see.
const contentShape = {
  announcement: {
    text: String,
    link: String,
    active: { type: Boolean, default: false },
  },
  homeSections: [
    {
      // categories | featured | deals | top_rated | new | trending | bestsellers | recently_viewed | recommended | newsletter
      key: String,
      title: String,
      enabled: { type: Boolean, default: true },
    },
  ],
  featuredCategories: [String],
  navLinks: [{ label: String, to: String }],
  footerColumns: [{ title: String, links: [{ label: String, to: String }] }],
  faqs: [{ question: String, answer: String }],
  policies: {
    shipping: String,
    returns: String,
    privacy: String,
    terms: String,
  },
  contact: {
    email: String,
    phone: String,
    address: String,
    hours: String,
  },
};

const SiteContentSchema = new mongoose.Schema(
  {
    key: { type: String, default: "site", unique: true },
    draft: contentShape,
    published: contentShape,
    publishedAt: Date,
    publishedBy: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("SiteContent", SiteContentSchema);
