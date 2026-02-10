const express = require("express");
const router = express.Router();
const{addToCart ,getCart ,removeItem, updateQuantity } = require("../../Controllers/UserControllers/CartControllers");
const {  UserAuthCheck  } = require("../../Middleware/Authmiddleware") 


 router.post("/add" , UserAuthCheck , addToCart) ;
 router.get("/" , UserAuthCheck  ,getCart) ;
 router.post("/remove" , UserAuthCheck, removeItem);
router.post("/update", UserAuthCheck, updateQuantity);


 module.exports = router;