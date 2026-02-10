const router = require("express").Router();
const{  CreateOrder , OrderInfo} = require("../../Controllers/UserControllers/UserOrderControllers");
const {  UserAuthCheck  } = require("../../Middleware/Authmiddleware") 

router.post("/create", UserAuthCheck ,CreateOrder);
router.get("/user/:id", UserAuthCheck, OrderInfo);

module.exports = router;

