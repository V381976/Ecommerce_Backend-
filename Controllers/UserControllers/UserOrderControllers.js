const Order = require("../../models/OrderDitealsModel");
const Cart = require("../../models/CartModel");


// ================= CREATE ORDER =================
const CreateOrder = async (req, res) => {
  try {

    const userId = req.user.id;
    const { address, paymentMethod, paymentId } = req.body;

    // 🛒 get cart
    const cart = await Cart.findOne({ user: userId })
      .populate("items.product");

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ msg: "Cart empty" });
    }

    // 💰 calculate total
    const total = cart.items.reduce((sum, i) => {
      return sum + i.product.price * i.quantity;
    }, 0);

    // 📦 create order
    const order = await Order.create({
      user: userId,
      items: cart.items,

      shippingAddress: address, // ✅ FIXED NAME

      totalAmount: total,
      paymentMethod,
      paymentId: paymentId || null,

      paymentStatus: paymentMethod === "COD" ? "PENDING" : "PAID",
      orderStatus: "PENDING"
    });

    // 🧹 clear cart
    cart.items = [];
    await cart.save();

    res.json(order);

  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: err.message });
  }
};



// ================= USER ORDERS =================
const OrderInfo = async (req, res) => {

  const orders = await Order.find({ user: req.user.id })
    .sort({ createdAt: -1 });

  res.json(orders);
};

module.exports = {
  CreateOrder,
  OrderInfo
};
