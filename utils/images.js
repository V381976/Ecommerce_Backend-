const fs = require("fs");
const { uploadImage, missingCloudinaryEnv } = require("../Config/cloudinary");

// multer ki local file Cloudinary pe bhejo, phir local copy hata do.
// Cloudinary configured na ho to local path (uploads/...) hi save hota hai.
const storeImage = async (file, folder = "products/admin") => {
  if (missingCloudinaryEnv().length) return file.path.replace(/\\/g, "/");
  try {
    return await uploadImage(file.path, { folder });
  } finally {
    fs.unlink(file.path, () => {});
  }
};

const storeImages = (files = [], folder) => Promise.all(files.map((f) => storeImage(f, folder)));

module.exports = { storeImage, storeImages };
