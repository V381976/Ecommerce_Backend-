// What the storefront shows before an admin publishes anything (matches the
// previous hard-coded layout, so nothing changes until content is edited).
const DEFAULT_CONTENT = {
  announcement: { text: "", link: "", active: false },
  homeSections: [
    { key: "categories", title: "Shop by category", enabled: true },
    { key: "recently_viewed", title: "Recently viewed", enabled: true },
    { key: "featured", title: "Featured products", enabled: true },
    { key: "deals", title: "Today's best deals", enabled: true },
    { key: "new", title: "New arrivals", enabled: true },
    { key: "bestsellers", title: "Best sellers", enabled: true },
    { key: "recommended", title: "Recommended for you", enabled: true },
    { key: "top_rated", title: "Top rated", enabled: true },
    { key: "trending", title: "Trending now", enabled: false },
    { key: "newsletter", title: "Stay in the loop", enabled: true },
  ],
  navLinks: [
    { label: "Home", to: "/" },
    { label: "Shop", to: "/products" },
    { label: "About", to: "/about" },
    { label: "Contact", to: "/contact" },
  ],
  footerColumns: [
    {
      title: "Shop",
      links: [
        { label: "All products", to: "/products" },
        { label: "Cart", to: "/cart" },
        { label: "Wishlist", to: "/wishlist" },
        { label: "Track order", to: "/track-order" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About us", to: "/about" },
        { label: "Contact", to: "/contact" },
        { label: "FAQs", to: "/faq" },
      ],
    },
    {
      title: "Policies",
      links: [
        { label: "Shipping", to: "/policies/shipping" },
        { label: "Returns", to: "/policies/returns" },
        { label: "Privacy", to: "/policies/privacy" },
        { label: "Terms", to: "/policies/terms" },
      ],
    },
  ],
  faqs: [
    { question: "How long does delivery take?", answer: "Most orders arrive within 3–7 working days. You can check the estimate for your pincode on any product page." },
    { question: "Can I pay cash on delivery?", answer: "Yes, cash on delivery is available on most orders. You can also pay securely online." },
    { question: "How do I return a product?", answer: "Open the order from My orders and choose “Request return” within the return window after delivery." },
    { question: "How can I track my order?", answer: "Signed-in customers can follow every update in My orders. Guests can use Track order with their order number and email." },
  ],
  policies: {
    shipping:
      "We ship across India. Orders are usually dispatched within 1–2 working days and delivered within 3–7 working days depending on your location. Delivery charges, if any, are shown at checkout before you pay.",
    returns:
      "If you're not happy with your purchase you can request a return from My orders within the return window shown on your order. Items must be unused and in their original packaging. Refunds are issued to the original payment method once the item is received.",
    privacy:
      "We only collect the information needed to process your orders and improve your shopping experience. We never sell your personal data. Payments are processed securely by our payment partner; we don't store card details.",
    terms:
      "By using this website you agree to our terms of sale. Prices and availability may change without notice. Orders are confirmed once payment (or cash-on-delivery) is accepted.",
  },
  contact: {
    email: "support@shopease.com",
    phone: "+91 98765 43210",
    address: "Connaught Place, New Delhi, India",
    hours: "Mon – Sun : 9:00 AM – 9:00 PM",
  },
};

module.exports = { DEFAULT_CONTENT };
