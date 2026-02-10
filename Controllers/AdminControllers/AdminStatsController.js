const User = require("../../models/UserModel");
const Product = require("../../models/productmodel");
const Category = require("../../models/CategoryModel");
const Order = require("../../models/OrderDitealsModel");
const Brand  = require("../../models/BrandModel")






/* =========================================
   1️⃣ STATS (counts + today sales)
========================================= */
const getStats = async (req, res) => {
  try {
    const users = await User.countDocuments();
    const products = await Product.countDocuments();
    const categories = await Category.countDocuments();
    const orders = await Order.countDocuments();
     const  brands = await  Brand.countDocuments();
    // today sales
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayOrders = await Order.find({
      createdAt: { $gte: today }
    });

    const todaySales = todayOrders.reduce(
      (sum, o) => sum + (o.total || 0),
      0
    );

    res.json({
      users,
      products,
      categories,
      orders,
      brands,
      todaySales
    });

  } catch (err) {
    res.status(500).json(err.message);
  }
};



/* =========================================
   2️⃣ ORDERS ANALYTICS (last 7 days chart)
========================================= */
const getOrdersAnalytics = async (req, res) => {
  try {
    const days = 7;
    const result = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);

      const start = new Date(date.setHours(0, 0, 0, 0));
      const end = new Date(date.setHours(23, 59, 59, 999));

      const count = await Order.countDocuments({
        createdAt: { $gte: start, $lte: end }
      });

      result.push({
        date: start.toLocaleDateString("en-IN", { weekday: "short" }),
        orders: count
      });
    }

    res.json(result);

  } catch (err) {
    res.status(500).json(err.message);
  }
};



/* =========================================
   3️⃣ LATEST ORDERS
========================================= */
const getLatestOrders = async (req, res) => {
  try {
    const orders = await Order
      .find()
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .limit(5);

    res.json(orders);

  } catch (err) {
    res.status(500).json(err.message);
  }
};



/* =========================================
   4️⃣ RECENT USERS
========================================= */
const getRecentUsers = async (req, res) => {
  try {
    const users = await User
      .find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("-password");

    res.json(users);

  } catch (err) {
    res.status(500).json(err.message);
  }
};


module.exports = {  getStats ,getOrdersAnalytics ,getLatestOrders, getRecentUsers};