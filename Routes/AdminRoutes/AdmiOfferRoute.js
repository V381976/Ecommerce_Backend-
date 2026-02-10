const express = require("express");
const router = express.Router();
const {AdminAuthcheck} = require("../../Middleware/AdminAuthMiddleware")
const  { getOffers, addOffer,deleteOffer, toggleOffer} = require("../../Controllers/AdminControllers/adminofferControllers");
 
router.get("/offers",getOffers);
router.post("/offers", AdminAuthcheck ,addOffer);
router.put("/offers/toggle/:id",AdminAuthcheck , toggleOffer);
router.delete("/offers/:id",AdminAuthcheck ,deleteOffer);


module.exports = router;
