const Order = require("../../models/OrderDitealsModel");
const express = require("express");
const router = express.Router();

const { Orderlist,OrderUpdate ,OrderDelete} = require("../../Controllers/AdminControllers/AdminOrderlistControllers")
const {AdminAuthcheck} = require("../../Middleware/AdminAuthMiddleware")

router.get("/orders",Orderlist);
router.put("/orders/status/:id",AdminAuthcheck, OrderUpdate);
router.delete("/orders/:id",AdminAuthcheck , OrderDelete);











module.exports = router;



