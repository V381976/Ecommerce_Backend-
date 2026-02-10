const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../../models/UserModel");

const LoginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // user check
    const user = await User.findOne({ email });

    if (!user)
      return res.status(400).json("User not found");

    // password check
    const match = await bcrypt.compare(password, user.password);

    if (!match)
      return res.status(400).json("Wrong password");

    // 🔥 ONLY SUPER ADMIN ALLOWED
    if (user.role !== "Super_Admin")
      return res.status(403).json("Access denied. Only Super Admin allowed");

    // blocked check
    if (user.blocked)
      return res.status(403).json("User is blocked");

    // 🔥 create token
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
      },
      "SECRET_KEY",
      { expiresIn: "7d" }
    );

    // 🔥 send cookie
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
    });

    res.json({
      message: "Login success",
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

  } catch (err) {
    res.status(500).json(err.message);
  }
};


module.exports = {
    LoginAdmin
}