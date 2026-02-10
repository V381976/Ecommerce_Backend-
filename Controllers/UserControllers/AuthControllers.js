const User = require("../../models/UserModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const createToken = (id) => {
  //  console.log("SIGN SECRET =>", process.env.JWT_SECRET); // 👈 add this

  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "7d"
  });
};

const SignUp = async(req ,res)=>{
   try{ 
    const {name , email ,password} =  req.body ;
     
    // User check 
    const userExists = await User.findOne({ email });
    if (userExists)
      return res.status(400).json({ msg: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashed
    });
      const token = createToken(user._id);
       
    // ⭐ Cookie set
    res.cookie("token", token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      msg: "Signup success",
      user: { id: user._id, name, email }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const Login  = async(req ,res)=>{  
 try {
    const { email, password } = req.body;
       
    // check user in database
    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ msg: "Invalid email" });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(400).json({ msg: "Invalid password" });

    const token = createToken(user._id);

    res.cookie("token", token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      msg: "Login success",
      user: { id: user._id, name: user.name, email }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const Logout = async(req, res) => {
  res.clearCookie("token");
  res.json({ msg: "Logged out" });
};

const ProfileCheck =async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    res.json(user);
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
}
const uploadAvatar = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    user.avatar = req.file.filename;

    await user.save();

    res.json({
      message: "Avatar uploaded",
      avatar: user.avatar,
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};




module.exports = {
     SignUp ,Login , Logout , ProfileCheck , uploadAvatar
}


