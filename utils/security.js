// lightweight hardening without extra dependencies

// strip Mongo operator keys ($gt, $ne …) and dotted keys from request bodies
// so `{ "email": { "$ne": null } }` style injection never reaches a query
const clean = (value, depth = 0) => {
  if (depth > 20 || value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
  for (const key of Object.keys(value)) {
    if (key.startsWith("$") || key.includes(".")) delete value[key];
    else value[key] = clean(value[key], depth + 1);
  }
  return value;
};

const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) clean(req.body);
  if (req.params) clean(req.params);
  next();
};

const securityHeaders = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"); // uploads are shown on the storefront origin
  res.removeHeader("X-Powered-By");
  next();
};

// in-memory fixed-window limiter (per IP + route key). Good enough for a single
// instance; put a shared store (Redis) in front if you scale horizontally.
const rateLimit = ({ windowMs = 15 * 60 * 1000, max = 20, key = "default", message } = {}) => {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const id = `${key}:${req.ip}`;
    const now = Date.now();
    const entry = hits.get(id) || { count: 0, reset: now + windowMs };
    if (entry.reset < now) {
      entry.count = 0;
      entry.reset = now + windowMs;
    }
    entry.count += 1;
    hits.set(id, entry);
    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({ message: message || "Too many attempts. Please try again later." });
    }
    next();
  };
};

module.exports = { sanitizeBody, securityHeaders, rateLimit };
