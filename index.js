require("dotenv").config(); 
const express = require("express");
const {connectDB }= require("./Config/Db.js");
// const { saveProduct } = require("./Routes/update.js");
const Productroute = require("./Routes/UserRoutes/productlist.js")
const Authroute = require("./Routes/UserRoutes/authRoutes.js")
const cors = require("cors");
const cookieParser = require("cookie-parser");
const CartRoute = require("./Routes/UserRoutes/CartRoutes.js")
const app = express();
 const AdminProductRoute = require("./Routes/AdminRoutes/ProductRoute.js")
 const  UserRoutes = require("./Routes/AdminRoutes/AdminUserRoute.js")
 const CategoryBrandRoute = require("./Routes/AdminRoutes/CategoryBrandRoute.js")
 const OrderRoute = require("./Routes/UserRoutes/UserOrderRoute.js")
const AdminOrderRoute = require("./Routes/AdminRoutes/AdminOrderRoute.js")
  const StatusboardRoute = require("./Routes/AdminRoutes/Admindeshboard.js")
const AdminOfferRoute = require("./Routes/AdminRoutes/AdmiOfferRoute.js")
 const AdminBannerRoute = require("./Routes/AdminRoutes/AdminBannerRoute.js")
// admin route all 


connectDB();
  
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin:["http://localhost:5173",
         "http://localhost:5174"],
  credentials: true
}));


app.use("/uploads", express.static("uploads")); // images open karne ke liye


// app.get("/api/import-products", saveProduct);
app.use("/api", Productroute);
app.use("/auth" , Authroute) ;
app.use("/cart", CartRoute );
app.use("/orders" ,OrderRoute) ;


// admin api call
app.use("/api" , AdminProductRoute);
app.use("/api", UserRoutes ) ;
app.use("/api" , CategoryBrandRoute) ;
app.use("/api" ,AdminOrderRoute);
app.use("/api" , StatusboardRoute);
app.use("/api", AdminOfferRoute);
app.use("/api" , AdminBannerRoute) ;


app.listen(process.env.PORT, () => {
  console.log(`Server running on ${process.env.PORT} 🚀`);
});



