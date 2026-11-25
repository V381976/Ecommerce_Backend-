const express = require("express");
const router = express.Router();
const { Bannerget, CreateBanner, BannerToggle, DeleteBanner, UpdateBanner, ReorderBanners } = require("../../Controllers/AdminControllers/AdminBannerControllers");
const { AdminAuthcheck, requirePermission } = require("../../Middleware/AdminAuthMiddleware");
const { bannerUpload } = require("../../Middleware/uploadMiddleware");

const canContent = [AdminAuthcheck, requirePermission("content")];

router.get("/banner", Bannerget);
router.post("/banner", ...canContent, bannerUpload.single("image"), CreateBanner);
router.delete("/banner/:id", ...canContent, DeleteBanner);
router.put("/banner/:id", ...canContent, BannerToggle);
router.patch("/banner/:id", ...canContent, UpdateBanner);
router.put("/admin/banner-order", ...canContent, ReorderBanners);

module.exports = router;
