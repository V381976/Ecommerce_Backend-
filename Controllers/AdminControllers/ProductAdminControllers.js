 const  Product = require("../../models/productmodel");



// GET all products
const ProductList = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 6;
    const keyword = req.query.keyword || "";

    const skip = (page - 1) * limit;

    // search filter
    const query = {
      $or: [
        { title: { $regex: keyword, $options: "i" } },
        { category: { $regex: keyword, $options: "i" } },
      ],
    };

    const total = await Product.countDocuments(query);

    const products = await Product.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.json({
      products,
      page,
      pages: Math.ceil(total / limit),
      total,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json(err);
  }
};


// ADD product
const ProductAdd =   async (req, res) => {
  try {
    console.log("BODY:", req.body);
    console.log("FILES:", req.files);

    const products = await Product.create({
      ...req.body,

      thumbnail: req.files.thumbnail[0].filename,

      images:
        req.files.images?.map((file) => file.filename) || [],
    });

    res.status(201).json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};


// DELETE product
const ProductDelete =  async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ msg: "Deleted" });
};



module.exports = {
    ProductList , ProductAdd  , ProductDelete , 
}
