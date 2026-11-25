const nodemailer = require("nodemailer");

/*
  Email is optional. Set SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / MAIL_FROM
  in .env to enable it. Without them nothing is sent (dev logs a one-line note).
*/
let transporter = null;

const mailEnabled = () => !!process.env.SMTP_HOST;

const getTransport = () => {
  if (!mailEnabled()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
};

const escapeHtml = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// simple branded wrapper so every email looks consistent
const layout = (title, bodyHtml) => `
<div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f7f7f9;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #eeeef2">
    <div style="background:#171826;color:#fff;padding:18px 24px;font-weight:800;font-size:18px">Shop<span style="color:#b7aeff">Ease</span></div>
    <div style="padding:24px;color:#26283a;font-size:14px;line-height:1.6">
      <h2 style="margin:0 0 12px;font-size:18px;color:#171826">${escapeHtml(title)}</h2>
      ${bodyHtml}
    </div>
  </div>
</div>`;

const sendMail = async ({ to, subject, html, text }) => {
  const t = getTransport();
  if (!t) {
    if (process.env.NODE_ENV !== "production") console.log(`[mail skipped — SMTP not configured] ${subject} → ${to}`);
    return false;
  }
  try {
    await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, html, text });
    return true;
  } catch (err) {
    console.error("Mail error:", err.message);
    return false;
  }
};

module.exports = { sendMail, mailEnabled, layout, escapeHtml };
