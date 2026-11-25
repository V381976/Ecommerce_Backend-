const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // MONGO_DB_NAME optional hai — na ho to URI wala default database use hota hai
    await mongoose.connect(process.env.MONGO_URI, {
      ...(process.env.MONGO_DB_NAME ? { dbName: process.env.MONGO_DB_NAME } : {}),
    });

    console.log(`MongoDB Atlas Connected ✅ (${mongoose.connection.name})`);
  } catch (error) {
    console.error("MongoDB connection failed ❌");
    console.error(error.message);
    process.exit(1); // stop server if DB fails
  }
};

module.exports = { connectDB };
