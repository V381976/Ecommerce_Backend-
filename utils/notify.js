const Notification = require("../models/NotificationModel");
const User = require("../models/UserModel");
const { sendMail, layout, escapeHtml } = require("./mailer");

const storeUrl = () => (process.env.STORE_URL || (process.env.CLIENT_URL || "http://localhost:5173").split(",")[0]).trim();

/*
  In-app notification (always) + email (when SMTP is configured and the
  user hasn't switched that category off via notificationPrefs[prefKey]).
*/
const notifyUser = async (userId, { type = "system", title, message, link, prefKey }) => {
  if (!userId) return;
  try {
    const user = await User.findById(userId).select("email name notificationPrefs").lean();
    if (!user) return;
    if (prefKey && user.notificationPrefs?.[prefKey] === false && prefKey !== "orderUpdates") return;

    const n = await Notification.create({ user: userId, type, title, message, link });

    const wantsEmail = !prefKey || user.notificationPrefs?.[prefKey] !== false;
    if (wantsEmail && user.email) {
      const href = link ? `${storeUrl()}${link}` : storeUrl();
      const sent = await sendMail({
        to: user.email,
        subject: title,
        html: layout(
          title,
          `<p>Hi ${escapeHtml(user.name || "there")},</p><p>${escapeHtml(message)}</p>
           <p><a href="${href}" style="display:inline-block;background:#5f40ec;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">View details</a></p>`
        ),
        text: `${message}\n${href}`,
      });
      if (sent) await Notification.updateOne({ _id: n._id }, { emailed: true });
    }
  } catch (err) {
    console.error("notifyUser failed:", err.message);
  }
};

// guest orders / plain email recipients
const notifyEmail = async (to, { title, message, link }) => {
  if (!to) return;
  const href = link ? `${storeUrl()}${link}` : storeUrl();
  await sendMail({
    to,
    subject: title,
    html: layout(title, `<p>${escapeHtml(message)}</p><p><a href="${href}">${href}</a></p>`),
    text: `${message}\n${href}`,
  });
};

module.exports = { notifyUser, notifyEmail, storeUrl };
