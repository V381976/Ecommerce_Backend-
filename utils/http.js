// small request helpers shared by controllers (no validation library needed)

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const fail = (status, message, extra) => {
  throw new HttpError(status, message, extra);
};

const escapeRegex = (s = "") => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const str = (v, max = 500) => (v == null ? "" : String(v).trim().slice(0, max));

const num = (v, fallback = undefined) => {
  if (v === "" || v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const bool = (v) => v === true || v === "true" || v === "1" || v === 1;

const isObjectId = (v) => /^[a-f\d]{24}$/i.test(String(v || ""));

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ""));

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ?page=&limit= → { page, limit, skip } with sane bounds
const paging = (query, defLimit = 20, maxLimit = 100) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defLimit));
  return { page, limit, skip: (page - 1) * limit };
};

const pageResult = (key, items, total, { page, limit }) => ({
  [key]: items,
  total,
  page,
  pages: Math.max(1, Math.ceil(total / limit)),
  limit,
});

// date range from ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive)
const dateRange = (query) => {
  const range = {};
  if (query.from) {
    const d = new Date(query.from);
    if (!isNaN(d)) range.$gte = new Date(d.setHours(0, 0, 0, 0));
  }
  if (query.to) {
    const d = new Date(query.to);
    if (!isNaN(d)) range.$lte = new Date(d.setHours(23, 59, 59, 999));
  }
  return Object.keys(range).length ? range : null;
};

module.exports = { HttpError, fail, escapeRegex, str, num, bool, isObjectId, isEmail, round2, paging, pageResult, dateRange };
