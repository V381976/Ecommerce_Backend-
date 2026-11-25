// pehla Super Admin banane ke liye:
// npm run create-admin -- <email> <password> [name]
require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/UserModel");

const [email, password, name = "Super Admin"] = process.argv.slice(2);

if (!email || !password) {
  console.log("Usage: npm run create-admin -- <email> <password> [name]");
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const hash = await bcrypt.hash(password, 10);
  const existing = await User.findOne({ email });

  if (existing) {
    // pehle se user hai to use Super Admin bana do
    existing.role = "Super_Admin";
    existing.password = hash;
    existing.blocked = false;
    await existing.save();
    console.log(`Updated ${email} to Super_Admin ✅`);
  } else {
    await User.create({ name, email, password: hash, role: "Super_Admin" });
    console.log(`Created Super_Admin ${email} ✅`);
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
