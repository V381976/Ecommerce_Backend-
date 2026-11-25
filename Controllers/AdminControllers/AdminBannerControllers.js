const fs = require("fs");
const Banner = require("../../models/BannerModel");
const { audit } = require("../../utils/audit");
const { fail, str, isObjectId } = require("../../utils/http");

const cleanLink = (link) => {
  const l = str(link, 300);
  if (l && !/^(\/|https?:\/\/)/i.test(l)) fail(400, "Link must be a store path like /products or a full https:// URL");
  return l;
};

// public + admin list, in slider order
const Bannerget = async (req, res) => {
  const banners = await Banner.find().sort({ position: 1, createdAt: 1 });
  res.json(banners);
};

const CreateBanner = async (req, res) => {
  if (!req.file) return res.status(400).json({ msg: "Image required" });

  let link;
  try {
    link = cleanLink(req.body.link);
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    throw err;
  }
  const last = await Banner.findOne().sort({ position: -1 }).select("position").lean();

  const banner = await Banner.create({
    title: str(req.body.title, 120),
    link,
    image: req.file.path.replace(/\\/g, "/"), // ⭐ path save (windows slash fix)
    position: (last?.position ?? -1) + 1,
  });

  audit(req, "banner.create", { entity: "banner", entityId: banner._id, summary: `Added banner ${banner.title || ""}`.trim() });
  res.json(banner);
};

// edit title / link (PATCH /banner/:id)
const UpdateBanner = async (req, res) => {
  if (!isObjectId(req.params.id)) fail(404, "Banner not found");
  const update = {};
  if (req.body.title !== undefined) update.title = str(req.body.title, 120);
  if (req.body.link !== undefined) update.link = cleanLink(req.body.link);
  const banner = await Banner.findByIdAndUpdate(req.params.id, update, { returnDocument: "after" });
  if (!banner) fail(404, "Banner not found");
  audit(req, "banner.update", { entity: "banner", entityId: banner._id, summary: "Updated banner details" });
  res.json(banner);
};

// PUT /banner-order { ids: [...] } — new slider order
const ReorderBanners = async (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter(isObjectId);
  if (!ids.length) fail(400, "Nothing to reorder");
  await Banner.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { position: i } } })));
  audit(req, "banner.reorder", { entity: "banner", summary: "Reordered banners" });
  res.json(await Banner.find().sort({ position: 1, createdAt: 1 }));
};

/* DELETE */
const DeleteBanner = async (req, res) => {
  const banner = await Banner.findByIdAndDelete(req.params.id);
  // local upload file bhi hata do (Cloudinary/URL images untouched)
  if (banner?.image?.startsWith("uploads/banners/")) fs.unlink(banner.image, () => {});
  if (banner) audit(req, "banner.delete", { entity: "banner", entityId: banner._id, summary: `Deleted banner ${banner.title || ""}`.trim() });
  res.json({ msg: "deleted" });
};

/* TOGGLE */
const BannerToggle = async (req, res) => {
  const b = await Banner.findById(req.params.id);
  if (!b) return res.status(404).json({ msg: "Banner not found" });
  b.active = !b.active;
  await b.save();
  audit(req, "banner.toggle", { entity: "banner", entityId: b._id, summary: `${b.active ? "Showed" : "Hid"} banner` });
  res.json(b);
};

module.exports = {
  Bannerget,
  CreateBanner,
  BannerToggle,
  DeleteBanner,
  UpdateBanner,
  ReorderBanners,
};
