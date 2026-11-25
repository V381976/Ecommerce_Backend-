const jwt = require("jsonwebtoken");
const User = require("../models/UserModel");

// verifies the cookie AND that the account still exists, isn't blocked and the
// token wasn't invalidated by a password change (tokenVersion)
const loadUser = async (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id).select("name email role blocked tokenVersion").lean();
  if (!user || user.blocked) return null;
  if ((decoded.v || 0) !== (user.tokenVersion || 0)) return null;
  return { decoded, user };
};

const UserAuthCheck = async (req, res, next) => {
  const token = req.cookies.token;

  if (!token) return res.status(401).json({ msg: "Login required" });

  try {
    const result = await loadUser(token);
    if (!result) return res.status(401).json({ msg: "Session expired, please login again" });
    req.user = { ...result.decoded, id: String(result.user._id) };
    req.account = result.user;
    next();
  } catch {
    res.status(401).json({ msg: "Invalid or expired token" });
  }
};

// attaches req.user when a valid customer cookie is present, otherwise continues as guest
const optionalUser = async (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return next();
  try {
    const result = await loadUser(token);
    if (result) {
      req.user = { ...result.decoded, id: String(result.user._id) };
      req.account = result.user;
    }
  } catch {
    // invalid cookie → guest
  }
  next();
};

module.exports = {
  UserAuthCheck,
  optionalUser,
};
