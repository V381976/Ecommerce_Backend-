const Category = require("../../models/CategoryModel");
const Brand = require("../../models/BrandModel");
const Product = require("../../models/productmodel");
const { audit } = require("../../utils/audit");
const { fail, str, bool, isObjectId, escapeRegex } = require("../../utils/http");

const ci = (name) => new RegExp(`^${escapeRegex(name)}$`, "i");

// ========= CATEGORY =========

// list (public). ?counts=1 adds product counts (admin screen)
const Categorylist = async (req, res) => {
  try {
    const data = await Category.find().sort({ order: 1, name: 1 }).lean();
    // storefront tiles: one representative product photo per category
    if (req.query.images === "1") {
      const pics = await Product.aggregate([
        { $match: { status: { $nin: ["draft", "inactive"] } } },
        { $sort: { soldCount: -1, rating: -1 } },
        { $group: { _id: { $toLower: "$category" }, image: { $first: "$thumbnail" }, n: { $sum: 1 } } },
      ]);
      const map = new Map(pics.map((p) => [p._id, p]));
      return res.json(data.map((c) => ({ ...c, image: map.get(c.name.toLowerCase())?.image, productCount: map.get(c.name.toLowerCase())?.n || 0 })));
    }
    if (req.query.counts === "1") {
      const counts = await Product.aggregate([
        { $group: { _id: { $toLower: "$category" }, n: { $sum: 1 } } },
      ]);
      const subCounts = await Product.aggregate([
        { $match: { subcategory: { $nin: [null, ""] } } },
        { $group: { _id: { $toLower: "$subcategory" }, n: { $sum: 1 } } },
      ]);
      const map = new Map([...counts, ...subCounts].map((c) => [c._id, c.n]));
      return res.json(data.map((c) => ({ ...c, productCount: map.get(c.name.toLowerCase()) || 0 })));
    }
    res.json(data);
  } catch (err) {
    console.error("CATEGORY ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

// add { name, parent? }
const CategoryAdd = async (req, res) => {
  const name = str(req.body.name, 80);
  if (!name) fail(400, "Name is required");
  if (await Category.exists({ name: ci(name) })) fail(400, "This category already exists");
  const parent = isObjectId(req.body.parent) ? req.body.parent : null;
  if (parent && !(await Category.exists({ _id: parent, parent: null }))) fail(400, "Parent must be a top-level category");
  const cat = await Category.create({ name, parent, featured: bool(req.body.featured) });
  audit(req, "category.create", { entity: "category", entityId: cat._id, summary: `Created category ${name}` });
  res.json(cat);
};

// update { name?, parent?, featured?, order? } — renaming updates products too
const CategoryUpdate = async (req, res) => {
  const cat = await Category.findById(req.params.id);
  if (!cat) fail(404, "Category not found");
  const oldName = cat.name;
  const name = req.body.name !== undefined ? str(req.body.name, 80) : cat.name;
  if (!name) fail(400, "Name is required");
  if (name.toLowerCase() !== oldName.toLowerCase() && (await Category.exists({ name: ci(name), _id: { $ne: cat._id } })))
    fail(400, "Another category has this name");

  if (req.body.parent !== undefined) {
    const parent = isObjectId(req.body.parent) ? req.body.parent : null;
    if (parent && String(parent) === String(cat._id)) fail(400, "A category can't be its own parent");
    if (parent && (await Category.exists({ parent: cat._id }))) fail(400, "This category has subcategories, so it can't become one");
    cat.parent = parent;
  }
  if (req.body.featured !== undefined) cat.featured = bool(req.body.featured);
  if (req.body.order !== undefined) cat.order = Number(req.body.order) || 0;
  cat.name = name;
  await cat.save();

  let moved = 0;
  if (name !== oldName) {
    // products store the category name as text
    const field = cat.parent ? "subcategory" : "category";
    moved = (await Product.updateMany({ [field]: ci(oldName) }, { [field]: name })).modifiedCount;
  }
  audit(req, "category.update", { entity: "category", entityId: cat._id, summary: `Updated category ${oldName}${name !== oldName ? ` → ${name} (${moved} products)` : ""}` });
  res.json(cat);
};

// delete
const CategoryDelete = async (req, res) => {
  const cat = await Category.findByIdAndDelete(req.params.id);
  if (cat) {
    // orphaned subcategories become top-level
    await Category.updateMany({ parent: cat._id }, { parent: null });
    audit(req, "category.delete", { entity: "category", entityId: cat._id, summary: `Deleted category ${cat.name}` });
  }
  res.json({ msg: "Deleted" });
};

// ========= BRAND =========

// list (?counts=1 adds product counts)
const BrandList = async (req, res) => {
  const brands = await Brand.find().sort({ name: 1 }).lean();
  if (req.query.counts === "1") {
    const counts = await Product.aggregate([{ $group: { _id: { $toLower: "$brand" }, n: { $sum: 1 } } }]);
    const map = new Map(counts.map((c) => [c._id, c.n]));
    return res.json(brands.map((b) => ({ ...b, productCount: map.get(b.name.toLowerCase()) || 0 })));
  }
  res.json(brands);
};

// add
const AddBrand = async (req, res) => {
  const name = str(req.body.name, 80);
  if (!name) fail(400, "Name is required");
  if (await Brand.exists({ name: ci(name) })) fail(400, "This brand already exists");
  const brand = await Brand.create({ name });
  audit(req, "brand.create", { entity: "brand", entityId: brand._id, summary: `Created brand ${name}` });
  res.json(brand);
};

const BrandUpdate = async (req, res) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) fail(404, "Brand not found");
  const name = str(req.body.name, 80);
  if (!name) fail(400, "Name is required");
  if (await Brand.exists({ name: ci(name), _id: { $ne: brand._id } })) fail(400, "Another brand has this name");
  const old = brand.name;
  brand.name = name;
  await brand.save();
  const moved = old !== name ? (await Product.updateMany({ brand: ci(old) }, { brand: name })).modifiedCount : 0;
  audit(req, "brand.update", { entity: "brand", entityId: brand._id, summary: `Renamed brand ${old} → ${name} (${moved} products)` });
  res.json(brand);
};

// delete
const BrandDelete = async (req, res) => {
  const brand = await Brand.findByIdAndDelete(req.params.id);
  if (brand) audit(req, "brand.delete", { entity: "brand", entityId: brand._id, summary: `Deleted brand ${brand.name}` });
  res.json({ msg: "Deleted" });
};

module.exports = {
  Categorylist,
  CategoryAdd,
  CategoryUpdate,
  CategoryDelete,
  BrandList,
  AddBrand,
  BrandUpdate,
  BrandDelete,
};
