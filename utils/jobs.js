const mongoose = require("mongoose");
const Cart = require("../models/CartModel");
const User = require("../models/UserModel");
const { expireUnpaidOrders } = require("./orderService");
const { mailEnabled, sendMail, layout, escapeHtml } = require("./mailer");
const { storeUrl } = require("./notify");

// light in-process scheduler (single server). Disable with DISABLE_JOBS=1.
const every = (ms, fn) => {
  const run = async () => {
    if (mongoose.connection.readyState !== 1) return;
    try {
      await fn();
    } catch (err) {
      console.error("job failed:", err.message);
    }
  };
  setTimeout(run, 10000).unref();
  setInterval(run, ms).unref();
};

// carts idle for 24h → one reminder email, only to customers who opted in
const abandonedCartReminders = async () => {
  if (!mailEnabled()) return;
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
  const carts = await Cart.find({ "items.0": { $exists: true }, updatedAt: { $lt: dayAgo, $gt: new Date(Date.now() - 7 * 24 * 3600 * 1000) } })
    .select("user updatedAt items")
    .limit(200)
    .lean();
  for (const cart of carts) {
    const user = await User.findOne({
      _id: cart.user,
      blocked: { $ne: true },
      "notificationPrefs.abandonedCart": true,
      $or: [{ abandonedCartRemindedAt: null }, { abandonedCartRemindedAt: { $lt: cart.updatedAt } }],
    })
      .select("email name")
      .lean();
    if (!user) continue;
    await sendMail({
      to: user.email,
      subject: "You left something in your cart",
      html: layout(
        "Still thinking it over?",
        `<p>Hi ${escapeHtml(user.name)}, you have ${cart.items.length} item(s) waiting in your cart.</p>
         <p><a href="${storeUrl()}/cart" style="display:inline-block;background:#5f40ec;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">Return to cart</a></p>
         <p style="color:#6f7186;font-size:12px">You're receiving this because you enabled cart reminders. Turn them off any time in Account → Notifications.</p>`
      ),
    });
    await User.updateOne({ _id: user._id }, { abandonedCartRemindedAt: new Date() });
  }
};

const startJobs = () => {
  if (process.env.DISABLE_JOBS === "1") return;
  every(5 * 60 * 1000, expireUnpaidOrders);
  every(60 * 60 * 1000, abandonedCartReminders);
};

module.exports = { startJobs };
