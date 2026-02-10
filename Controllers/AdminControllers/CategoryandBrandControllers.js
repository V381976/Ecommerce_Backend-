

const Category = require("../../models/CategoryModel")
const Brand = require("../../models/BrandModel")


// ========= CATEGORY =========

// list
 const Categorylist = async (req, res) => {
  // res.json(await Category.find());const Categorylist = async (req, res) => {
  try {
    const data = await Category.find();
    res.json(data);
  } catch (err) {
    console.error("CATEGORY ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};



// add
const CategoryAdd =  async (req, res) => {
  res.json(await Category.create({ name: req.body.name }));
};

// delete
 const CategoryDelete =  async (req, res) => {
  await Category.findByIdAndDelete(req.params.id);
  res.json({ msg: "Deleted" });
};


// ========= BRAND =========

// list
const BrandList = async (req, res) => {
  res.json(await Brand.find());
};

// add
 const AddBrand = async (req, res) => {
  res.json(await Brand.create({ name: req.body.name }));
};

// delete
const  BrandDelete = async (req, res) => {
  await Brand.findByIdAndDelete(req.params.id);
  res.json({ msg: "Deleted" });
};

module.exports = {
    Categorylist ,CategoryAdd ,CategoryDelete ,BrandList,AddBrand , BrandDelete
}
