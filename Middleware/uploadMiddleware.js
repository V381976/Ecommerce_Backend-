const multer = require("multer");


/* ================= PRODUCTS ================= */
const productStorage = multer.diskStorage({
  destination: "uploads/products",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const productUpload = multer({ storage: productStorage });



/* ================= BANNERS ================= */
const bannerStorage = multer.diskStorage({
  destination: "uploads/banners",   // ⚠️ lowercase
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const bannerUpload = multer({ storage: bannerStorage });



/* ================= EXPORT BOTH ================= */
module.exports = {
  productUpload,
  bannerUpload
};
