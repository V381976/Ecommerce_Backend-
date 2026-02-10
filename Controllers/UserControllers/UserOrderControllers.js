
const Order = require("../../models/OrderDitealsModel");
const Cart = require("../../models/CartModel");


// ================= CREATE ORDER =================
const CreateOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { address, paymentMethod } = req.body;

    const cart = await Cart.findOne({ user: userId })
      .populate("items.product");

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ msg: "Cart empty" });
    }

    const total = cart.items.reduce((sum, i) => {
      return sum + i.product.price * i.quantity;
    }, 0);

    // console.log("TOTAL:", total);

    const order = await Order.create({
      user: userId,
      items: cart.items,
      totalAmount: total,
      paymentMethod,
      shippingAddress: address
    });

    cart.items = [];
    await cart.save();

    res.json(order);

  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: err.message });
  }
};



// ================= USER ORDERS =================
const  OrderInfo =  async (req, res) => {

  const orders = await Order.find({ user: req.user.id })
    .sort({ createdAt: -1 });

  res.json(orders);
};

module.exports = {
 CreateOrder , OrderInfo
}


