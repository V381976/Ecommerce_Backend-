const express = require("express");
const router = express.Router();
const  { UserList , UserDelete ,AddUser , UserACtive} = require("../../Controllers/AdminControllers/AdminUserlistControllers")
const {LoginAdmin} = require("../../Controllers/AdminControllers/AdminAuthControllers");

const {AdminAuthcheck} = require("../../Middleware/AdminAuthMiddleware")
router.get("/users", UserList  );
router.delete("/users/:id" ,AdminAuthcheck, UserDelete);
router.post("/users",AdminAuthcheck, AddUser) ;
// toggle block
router.put("/users/toggle/:id",AdminAuthcheck, UserACtive );
router.post("/admin-login" , LoginAdmin) ;







module.exports = router;

