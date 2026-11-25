const express = require("express");
const router = express.Router();
const {
  Categorylist,
  CategoryAdd,
  CategoryUpdate,
  CategoryDelete,
  BrandList,
  AddBrand,
  BrandUpdate,
  BrandDelete,
} = require("../../Controllers/AdminControllers/CategoryandBrandControllers");

const { AdminAuthcheck, requirePermission } = require("../../Middleware/AdminAuthMiddleware");
const canCategories = [AdminAuthcheck, requirePermission("categories", "products")];

router.get("/categories", Categorylist);
router.post("/categories", ...canCategories, CategoryAdd);
router.put("/categories/:id", ...canCategories, CategoryUpdate);
router.delete("/categories/:id", ...canCategories, CategoryDelete);

router.get("/brands", BrandList);
router.post("/brands", ...canCategories, AddBrand);
router.put("/brands/:id", ...canCategories, BrandUpdate);
router.delete("/brands/:id", ...canCategories, BrandDelete);

module.exports = router;
