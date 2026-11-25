require("dotenv").config();
const express = require("express");
const { connectDB } = require("./Config/Db.js");
// const { saveProduct } = require("./Routes/update.js");
const Productroute = require("./Routes/UserRoutes/productlist.js");
const Authroute = require("./Routes/UserRoutes/authRoutes.js");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const CartRoute = require("./Routes/UserRoutes/CartRoutes.js");
const app = express();
const AdminProductRoute = require("./Routes/AdminRoutes/ProductRoute.js");
const UserRoutes = require("./Routes/AdminRoutes/AdminUserRoute.js");
const CategoryBrandRoute = require("./Routes/AdminRoutes/CategoryBrandRoute.js");
const OrderRoute = require("./Routes/UserRoutes/UserOrderRoute.js");
const AdminOrderRoute = require("./Routes/AdminRoutes/AdminOrderRoute.js");
const StatusboardRoute = require("./Routes/AdminRoutes/Admindeshboard.js");
const AdminOfferRoute = require("./Routes/AdminRoutes/AdmiOfferRoute.js");
const AdminBannerRoute = require("./Routes/AdminRoutes/AdminBannerRoute.js");
const CreateOrderRoute = require("./Routes/UserRoutes/paymentroute.js");
const AccountRoute = require("./Routes/UserRoutes/AccountRoutes.js");
const AdminExtraRoute = require("./Routes/AdminRoutes/AdminExtraRoutes.js");
const { sanitizeBody, securityHeaders } = require("./utils/security");
const { startJobs } = require("./utils/jobs");
// admin route all

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET missing in .env ❌");
  process.exit(1);
}

connectDB();

app.disable("x-powered-by");
// behind a proxy (Render, Nginx …) so rate limits see the real client IP
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
app.use(securityHeaders);

// Razorpay webhook needs the raw body for signature verification
app.use("/payment/webhook", express.raw({ type: "application/json", limit: "1mb" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());
app.use(sanitizeBody);

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173,http://localhost:5174")
  .split(",")
  .map((url) => url.trim());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    exposedHeaders: ["Content-Disposition"], // lets the admin panel use export file names
  })
);

app.use("/uploads", express.static("uploads", { maxAge: "7d" })); // images open karne ke liye

app.get("/health", (req, res) => res.json({ ok: true }));

// app.get("/api/import-products", saveProduct);
app.use("/api", Productroute);
app.use("/auth", Authroute);
app.use("/cart", CartRoute);
app.use("/orders", OrderRoute);
app.use("/payment", CreateOrderRoute);
app.use("/account", AccountRoute);

// admin api call
app.use("/api", AdminProductRoute);
app.use("/api", UserRoutes);
app.use("/api", CategoryBrandRoute);
app.use("/api", AdminOrderRoute);
app.use("/api", StatusboardRoute);
app.use("/api", AdminOfferRoute);
app.use("/api", AdminBannerRoute);
app.use("/api", AdminExtraRoute);

// unknown API routes → JSON 404 (not an HTML page)
app.use((req, res) => res.status(404).json({ message: "Not found" }));

// error handler (async controller errors yahan aate hain)
app.use((err, req, res, next) => {
  // known, user-facing errors
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ message: err.message, msg: err.message, ...(err.extra || {}) });
  }
  if (err.name === "CastError") return res.status(400).json({ message: "Invalid id" });
  if (err.name === "ValidationError") {
    const errors = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
    return res.status(400).json({ message: "Please check the highlighted fields", errors });
  }
  if (err.code === 11000) return res.status(409).json({ message: "This already exists" });
  if (err.type === "entity.too.large") return res.status(413).json({ message: "Request is too large" });
  if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: "File is too large (max 8 MB)" });
  if (err.name === "MulterError") return res.status(400).json({ message: err.message });

  console.error(err);
  res.status(500).json({ message: process.env.NODE_ENV === "production" ? "Server error" : err.message || "Server error" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on ${PORT} 🚀`);
  startJobs();
});
