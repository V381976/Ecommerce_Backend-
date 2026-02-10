
const Order = require("../../models/OrderDitealsModel")


// ================= GET ALL ORDERS =================
const Orderlist  = async (req, res) => {

  const orders = await Order.find()
    .populate("user", "name email")
    .sort({ createdAt: -1 });

  res.json(orders);
};



// ================= UPDATE STATUS =================
const OrderUpdate = async (req, res) => {

  const { status } = req.body;

  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { orderStatus: status },
    { new: true }
  );

  res.json(order);
};



// ================= DELETE =================
const OrderDelete =  async (req, res) => {
  await Order.findByIdAndDelete(req.params.id);
  res.json({ msg: "Deleted" });
};


module.exports ={
  Orderlist,OrderUpdate ,OrderDelete
}
