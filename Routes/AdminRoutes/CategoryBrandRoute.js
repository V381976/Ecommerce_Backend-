const express = require("express");
const router = express.Router();
const {Categorylist ,CategoryAdd ,CategoryDelete ,BrandList,AddBrand , BrandDelete} = require("../../Controllers/AdminControllers/CategoryandBrandControllers")

const {AdminAuthcheck} = require("../../Middleware/AdminAuthMiddleware")

router.get("/categories", Categorylist )
router.post("/categories",AdminAuthcheck,CategoryAdd )
router.delete("/categories/:id",AdminAuthcheck , CategoryDelete)




router.get("/brands", BrandList )
router.post("/brands",AdminAuthcheck, AddBrand)
router.delete("/brands/:id", AdminAuthcheck, BrandDelete)


module.exports = router;