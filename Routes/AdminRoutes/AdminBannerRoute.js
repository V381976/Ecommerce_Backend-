 const express = require("express");
const router = express.Router();
 const {  Bannerget , CreateBanner , BannerToggle ,DeleteBanner  } = require("../../Controllers/AdminControllers/AdminBannerControllers")
const {AdminAuthcheck} = require("../../Middleware/AdminAuthMiddleware") ;
const{ bannerUpload } = require("../../Middleware/uploadMiddleware");
 
 
router.get("/banner",  Bannerget);
router.post("/banner", bannerUpload.single("image"),  AdminAuthcheck , CreateBanner);
router.delete("/banner/:id", AdminAuthcheck,DeleteBanner);
router.put("/banner/:id", AdminAuthcheck,BannerToggle);

 module.exports = router;   


