
const User = require("../../models/UserModel");
const bcrypt = require("bcryptjs");


// GET all users
const UserList  = async (req, res) => {
  const users = await User.find({role:"User"}).select("-password");
  res.json(users);
};


// DELETE user
 const UserDelete =   async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ msg: "User deleted" });
};




// CREATE USER (admin only)
const AddUser =  async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // allow only admin roles
    if (!["Super_Admin", "Product_admin"].includes(role)) {
      return res.status(400).json({ msg: "Invalid role" });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hash,
      role
    });

    res.json(user);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

 const UserACtive  =async (req, res) => {
  const user = await User.findById(req.params.id);

  user.blocked = !user.blocked;

  await user.save();

  res.json(user);
};


module.exports = {
    UserList , UserDelete , AddUser ,UserACtive 
}

