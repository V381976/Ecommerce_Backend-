const express = require("express");
const router = express.Router();

const {
  ProductList,
  ProductGet,
  ProductAdd,
  ProductUpdate,
  ProductDuplicate,
  ProductDelete,
  ProductBulk,
  ProductExport,
  ProductImport,
  ProductImportTemplate,
} = require("../../Controllers/AdminControllers/ProductAdminControllers");
const { productUpload, csvUpload } = require("../../Middleware/uploadMiddleware");
const { AdminAuthcheck, requirePermission } = require("../../Middleware/AdminAuthMiddleware");

const canProducts = [AdminAuthcheck, requirePermission("products")];
const images = productUpload.fields([
  { name: "thumbnail", maxCount: 1 },
  { name: "images", maxCount: 10 },
]);

//   product list (inventory managers can read it too)
router.get("/list", AdminAuthcheck, requirePermission("products", "inventory"), ProductList);

// add product
router.post("/add", ...canProducts, images, ProductAdd);

// single product
router.get("/admin/products/:id", AdminAuthcheck, requirePermission("products", "inventory"), ProductGet);
router.put("/product/:id", ...canProducts, images, ProductUpdate);
router.post("/admin/products/:id/duplicate", ...canProducts, ProductDuplicate);

// delete Product
router.delete("/product/:id", ...canProducts, ProductDelete);

// bulk + CSV
router.post("/admin/products-bulk", ...canProducts, ProductBulk);
router.get("/admin/products-export", ...canProducts, ProductExport);
router.get("/admin/products-import/template", ...canProducts, ProductImportTemplate);
router.post("/admin/products-import", ...canProducts, csvUpload.single("file"), ProductImport);

module.exports = router;
