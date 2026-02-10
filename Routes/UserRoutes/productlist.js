const express = require("express");
const router = express.Router();

const { Productlist, ProductShow } = require("../../Controllers/UserControllers/ProductControllers");

router.get("/products", Productlist);
router.get("/products/:id", ProductShow);


module.exports = router;
