const jwt = require("jsonwebtoken");

const AdminAuthcheck = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) return res.status(401).json("Not authorized");

  try {
    const decoded = jwt.verify(token, "SECRET_KEY");
    req.user = decoded;
    next();
  } catch {
    res.status(401).json("Invalid token");
  }
};

module.exports ={
     AdminAuthcheck
    };
