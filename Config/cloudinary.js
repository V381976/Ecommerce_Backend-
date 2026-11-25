const cloudinary = require("cloudinary").v2;

const REQUIRED_ENV = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

const missingCloudinaryEnv = () => REQUIRED_ENV.filter((key) => !process.env[key]);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// file path, remote URL ya Buffer — teeno Cloudinary pe upload ho jate hain
// return: secure_url (https://res.cloudinary.com/...)
const uploadImage = async (source, options = {}) => {
  const missing = missingCloudinaryEnv();
  if (missing.length) throw new Error(`Cloudinary env missing: ${missing.join(", ")}`);

  const uploadOptions = { folder: "products", resource_type: "image", ...options };

  if (!Buffer.isBuffer(source)) {
    const result = await cloudinary.uploader.upload(source, uploadOptions);
    return result.secure_url;
  }

  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(uploadOptions, (err, res) => (err ? reject(err) : resolve(res)))
      .end(source);
  });
  return result.secure_url;
};

const isCloudinaryUrl = (url) =>
  typeof url === "string" && url.startsWith("https://res.cloudinary.com/");

module.exports = { cloudinary, uploadImage, isCloudinaryUrl, missingCloudinaryEnv };
