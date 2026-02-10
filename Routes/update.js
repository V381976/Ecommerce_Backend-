const fs = require("fs");
const path = require("path");
const axios = require("axios");
const stream = require("stream");
const multer = require("multer");
const Products = require("../models/productmodel");


// ===============================
// download image helper
// ===============================
const downloadImage = async (url, folder) => {
  const ext = path.extname(new URL(url).pathname) || ".jpg";

  const filename =
    Date.now() +
    "-" +
    Math.random().toString(36).substring(2, 8) +
    ext;

  const dir = path.join("uploads", "products", folder);

  // folder create if not exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePath = path.join(dir, filename);

  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  return filePath.replace(/\\/g, "/");
};


// ===============================
// save products controller
// ===============================
const saveProduct = async (req, res) => {
  try {
    const { data } = await axios.get(
      "https://dummyjson.com/products?limit=194"
    );

    for (const item of data.products) {
      const folderName = item.title.replace(/\s+/g, "_");

      const images = [];

      // multiple images
      for (const img of item.images) {
        const localPath = await downloadImage(img, folderName);
        images.push(localPath);
      }

      // thumbnail
      const thumbnailPath = await downloadImage(
        item.thumbnail,
        folderName
      );

      await Products.create({
        id: item.id,
        title: item.title,
        description: item.description,
        price: item.price,
        category: item.category, // string save
        brand: item.brand,
        images,
        thumbnail: thumbnailPath,
        discountPercent: item.discountPercentage,
        rating: item.rating,
        stock: item.stock,
        warrantyInformation: item.warrantyInformation,
        returnPolicy: item.returnPolicy,
      });
    }

    res.status(201).json({
      message: "Products seeded successfully ✅",
      count: data.products.length,
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};



module.exports = { saveProduct };
