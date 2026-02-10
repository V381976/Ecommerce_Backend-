const Cart = require("../../models/CartModel");


// ✅ Add to cart
const addToCart = async (req, res) => {
  const { productId } = req.body;
  const userId = req.user.id;

  let cart = await Cart.findOne({ user: userId });

  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
  }

  const itemIndex = cart.items.findIndex(
    (item) => item.product.toString() === productId
  );

  if (itemIndex > -1) {
    cart.items[itemIndex].quantity += 1;
  } else {
    cart.items.push({ product: productId, quantity: 1 });
  }

  await cart.save();

  res.json(cart);
};


// ✅ Get cart
const getCart = async (req, res) => {
  const cart = await Cart.findOne({ user: req.user.id }).populate("items.product");

  res.json(cart ||{ items: [] });
};


// ✅ Remove item
 const removeItem = async (req, res) => {
  const { productId } = req.body;

  const cart = await Cart.findOne({ user: req.user.id });

  cart.items = cart.items.filter(
    (item) => item.product.toString() !== productId
  );

  await cart.save();

  res.json(cart);
};

const updateQuantity = async (req, res) => {
  const { productId, quantity } = req.body;

  const cart = await Cart.findOne({ user: req.user.id });

  const item = cart.items.find(
    (i) => i.product.toString() === productId
  );

  if (item) item.quantity = quantity;

  await cart.save();

  res.json(cart);
};


module.exports= {
    addToCart ,getCart ,removeItem , updateQuantity 
}