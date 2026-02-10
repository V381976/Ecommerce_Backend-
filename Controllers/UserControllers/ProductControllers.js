 const  Product = require("../../models/productmodel")


 const Productlist = async (req, res) => {
  try {
    const products = await Product.find();
    // console.log("all product list " ,products )
    res.json(products);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

const ProductShow = async (req, res) => {
  const products = await Product.findById(req.params.id);
  res.json(products);
}

module.exports ={ Productlist , ProductShow};

