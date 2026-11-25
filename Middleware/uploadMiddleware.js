const fs = require("fs");
const multer = require("multer");

// folders must exist before multer writes to them
["uploads/products", "uploads/banners"].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

const safeName = (name) => name.replace(/[^\w.\-]+/g, "_").slice(-80);

const imageOnly = (req, file, cb) => {
  if (/^image\/(jpe?g|png|webp|gif|avif)$/i.test(file.mimetype)) cb(null, true);
  else cb(Object.assign(new Error("Only JPG, PNG, WebP, GIF or AVIF images are allowed"), { status: 400 }));
};

/* ================= PRODUCTS ================= */
const productStorage = multer.diskStorage({
  destination: "uploads/products",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + safeName(file.originalname));
  },
});

const productUpload = multer({ storage: productStorage, fileFilter: imageOnly, limits: { fileSize: 8 * 1024 * 1024, files: 40 } });

/* ================= BANNERS ================= */
const bannerStorage = multer.diskStorage({
  destination: "uploads/banners", // ⚠️ lowercase
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + safeName(file.originalname));
  },
});

const bannerUpload = multer({ storage: bannerStorage, fileFilter: imageOnly, limits: { fileSize: 8 * 1024 * 1024 } });

/* ================= CSV IMPORT (kept in memory) ================= */
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.csv$/i.test(file.originalname) || /csv|text\/plain|excel/i.test(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error("Please upload a .csv file (Excel: File → Save As → CSV)"), { status: 400 }));
  },
});

/* ================= EXPORT ================= */
module.exports = {
  productUpload,
  bannerUpload,
  csvUpload,
};
