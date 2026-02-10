const express = require("express");
const router = express.Router();
const{ SignUp , Login , Logout, ProfileCheck ,uploadAvatar}  = require("../../Controllers/UserControllers/AuthControllers")
const {  UserAuthCheck , } = require("../../Middleware/Authmiddleware")
// const upload = require("../../Middleware/uploadMiddleware");

router.post("/signup", SignUp);
router.post("/login", Login);
router.post("/logout", Logout);
router.get("/me" , UserAuthCheck , ProfileCheck)
// router.post( "/avatar",UserAuthCheck , upload.single("avatar"), uploadAvatar);


module.exports = router;
