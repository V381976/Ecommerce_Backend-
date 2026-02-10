const express = require("express");
const router = express.Router();  

const {  ProductList , ProductAdd  , ProductDelete }= require( "../../Controllers/AdminControllers/ProductAdminControllers")
const{   productUpload} = require("../../Middleware/uploadMiddleware");
const {AdminAuthcheck} = require("../../Middleware/AdminAuthMiddleware")
//   product list
router.get("/list" ,ProductList) ;

// add product
router.post(
  "/add",
   productUpload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "images", maxCount: 10 },
  ]), AdminAuthcheck ,
  ProductAdd
);

// delete Product  
router.delete("/product/:id",AdminAuthcheck , ProductDelete);

module.exports = router;





