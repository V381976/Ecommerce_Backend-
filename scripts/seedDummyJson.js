// dummyjson.com se saare products, categories aur brands database me save karta hai
// images Cloudinary pe upload hoti hain, DB me sirf Cloudinary secure_url save hota hai
//
// npm run seed                       → sab import / update
// npm run seed -- --usd              → price USD me hi rakho (default: INR me convert)
// npm run seed -- --force-images     → images dobara Cloudinary pe upload karo
require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const Product = require("../models/productmodel");
const Category = require("../models/CategoryModel");
const Brand = require("../models/BrandModel");
const { uploadImage, isCloudinaryUrl, missingCloudinaryEnv } = require("../Config/cloudinary");

const API = "https://dummyjson.com";
const USD_TO_INR = 83;
const KEEP_USD = process.argv.includes("--usd");
const FORCE_IMAGES = process.argv.includes("--force-images");
const CONCURRENCY = 5;

// backend folder se relative (script kahin se bhi chale)
const ROOT = path.join(__dirname, "..");

const slugify = (text) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const toPrice = (usd) => (KEEP_USD ? usd : Math.round(usd * USD_TO_INR));

const getJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
};


// ================= IMAGE → CLOUDINARY =================
// public_id fixed hai (products/<category>/<slug>/<name>), isliye dobara chalane pe
// Cloudinary me duplicate nahi bante, wahi image overwrite hoti hai
const uploadToCloudinary = async (url, folder, name) => {
  // pehle wale seed ne images uploads/products/... me download ki thi — mile to wahi use karo
  const ext = path.extname(new URL(url).pathname) || ".jpg";
  const localPath = path.join(ROOT, "uploads", "products", folder, name + ext);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      let source = localPath;
      if (!fs.existsSync(localPath)) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`status ${res.status}`);
        source = Buffer.from(await res.arrayBuffer());
      }
      return await uploadImage(source, {
        folder: `products/${folder}`,
        public_id: name,
        overwrite: true,
      });
    } catch (err) {
      if (attempt === 3) throw new Error(`${url}: ${err.message || err.error?.message || err}`);
    }
  }
};

// ek image fail ho to product skip nahi hota, warning log hoti hai
const uploadImages = async (item, folder, warnings) => {
  const images = [];
  for (let i = 0; i < item.images.length; i++) {
    try {
      images.push(await uploadToCloudinary(item.images[i], folder, String(i + 1)));
    } catch (err) {
      warnings.push(`#${item.id} image ${i + 1} skipped — ${err.message}`);
    }
  }

  let thumbnail;
  try {
    thumbnail = await uploadToCloudinary(item.thumbnail, folder, "thumbnail");
  } catch (err) {
    // thumbnail required hai — gallery ki pehli image se kaam chala lo
    thumbnail = images[0];
    if (!thumbnail) throw new Error(`no image could be uploaded (${err.message})`);
    warnings.push(`#${item.id} thumbnail failed, using first image — ${err.message}`);
  }

  return { thumbnail, images };
};


// ================= ONE PRODUCT =================
const saveProduct = async (item, existing, warnings) => {
  const folder = path.posix.join(item.category, slugify(item.title));

  // already Cloudinary pe hai to dobara upload mat karo (re-run fast + free)
  const reuseImages =
    !FORCE_IMAGES &&
    existing &&
    isCloudinaryUrl(existing.thumbnail) &&
    (existing.images || []).every(isCloudinaryUrl);

  const { thumbnail, images } = reuseImages
    ? { thumbnail: existing.thumbnail, images: existing.images }
    : await uploadImages(item, folder, warnings);

  await Product.findOneAndUpdate(
    { sourceId: item.id },
    {
      sourceId: item.id,
      title: item.title,
      description: item.description,
      category: item.category,
      price: toPrice(item.price),
      discountPercent: item.discountPercentage,
      rating: item.rating,
      stock: item.stock,
      brand: item.brand,
      warrantyInformation: item.warrantyInformation,
      returnPolicy: item.returnPolicy,
      thumbnail,
      images,
      sku: item.sku,
      tags: item.tags,
      weight: item.weight,
      dimensions: item.dimensions,
      shippingInformation: item.shippingInformation,
      availabilityStatus: item.availabilityStatus,
      minimumOrderQuantity: item.minimumOrderQuantity,
      reviews: item.reviews,
    },
    { upsert: true, runValidators: true }
  );

  return reuseImages ? "reused" : "uploaded";
};


// ================= MAIN =================
(async () => {
  const missing = [...(process.env.MONGO_URI ? [] : ["MONGO_URI"]), ...missingCloudinaryEnv()];
  if (missing.length) throw new Error(`Missing in .env: ${missing.join(", ")}`);

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to "${mongoose.connection.name}" database`);

  // 1️⃣ categories (product.category me slug hota hai, isliye name = slug)
  const categories = await getJson(`${API}/products/categories`);
  for (const c of categories) {
    await Category.updateOne({ name: c.slug }, { name: c.slug }, { upsert: true });
  }
  console.log(`Categories: ${categories.length} ✅`);

  // 2️⃣ products
  const { products } = await getJson(`${API}/products?limit=0`);

  // 3️⃣ brands (kuch products me brand nahi hota)
  const brands = [...new Set(products.map((p) => p.brand).filter(Boolean))];
  for (const name of brands) {
    await Brand.updateOne({ name }, { name }, { upsert: true });
  }
  console.log(`Brands: ${brands.length} ✅`);

  // pehle se imported products (sourceId se match → duplicate nahi banta)
  const existingDocs = await Product.find(
    { sourceId: { $in: products.map((p) => p.id) } },
    { sourceId: 1, thumbnail: 1, images: 1 }
  ).lean();
  const existingById = new Map(existingDocs.map((d) => [d.sourceId, d]));

  console.log(
    `Saving ${products.length} products (${existingById.size} already in DB) + Cloudinary images ` +
    `(prices in ${KEEP_USD ? "USD" : `INR @ ${USD_TO_INR}`})...`
  );

  let done = 0;
  let uploaded = 0;
  const failed = [];
  const warnings = [];
  const queue = [...products];

  const worker = async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        if ((await saveProduct(item, existingById.get(item.id), warnings)) === "uploaded") uploaded++;
      } catch (err) {
        failed.push(`#${item.id} ${item.title}: ${err.message}`);
        console.error(`  ❌ #${item.id} ${item.title}: ${err.message}`);
      }
      done++;
      if (done % 20 === 0 || done === products.length)
        console.log(`  ${done}/${products.length}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const saved = products.length - failed.length;
  console.log(`Products saved: ${saved} ✅`);
  console.log(`Cloudinary: ${uploaded} uploaded, ${saved - uploaded} already had Cloudinary URLs`);

  if (warnings.length) {
    console.log(`Warnings (${warnings.length}):`);
    warnings.forEach((w) => console.log("  ⚠️  " + w));
  }
  if (failed.length) {
    console.log(`Failed (${failed.length}) — dobara "npm run seed" chalao:`);
    failed.forEach((f) => console.log("  " + f));
  }

  await mongoose.disconnect();
  process.exit(failed.length ? 1 : 0);
})().catch(async (err) => {
  console.error("Seed failed ❌", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
