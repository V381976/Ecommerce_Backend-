const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  }
  ,
   role: {
    type: String,
    enum: [
      "Super_Admin",
       "User","Product_admin"
    ],
    default: "User"},
    blocked: {
        type: Boolean,
        default: false,
    },
    avatar: String
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);

 