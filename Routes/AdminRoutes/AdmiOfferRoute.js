const express = require("express");
const router = express.Router();
const { AdminAuthcheck, requirePermission } = require("../../Middleware/AdminAuthMiddleware");
const { getOffers, addOffer, deleteOffer, toggleOffer, updateOffer } = require("../../Controllers/AdminControllers/adminofferControllers");

const canPromotions = [AdminAuthcheck, requirePermission("coupons")];

router.get("/offers", getOffers);

router.post("/offers", ...canPromotions, addOffer);
router.put("/offers/toggle/:id", ...canPromotions, toggleOffer);
router.put("/offers/:id", ...canPromotions, updateOffer);
router.delete("/offers/:id", ...canPromotions, deleteOffer);

module.exports = router;
