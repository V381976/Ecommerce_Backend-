const jwt = require("jsonwebtoken");

 const UserAuthCheck =  (req, res, next) => {
  const token = req.cookies.token;
  // console.log("VERIFY SECRET =>", process.env.JWT_SECRET); // 👈 add
  //   console.log("TOKEN =>", token); // 👈 add

  if (!token)
    return res.status(401).json({ msg: "Login required" });

  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  req.user = decoded;

  next();
};
module.exports = { 
    UserAuthCheck
}
