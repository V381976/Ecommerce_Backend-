  const Banner = require("../../models/BannerModel")


 const Bannerget =  async(req, res) => {
  const banners = await Banner.find();
  res.json(banners);
};

const CreateBanner =  async (req, res) => {

  const banner = await Banner.create({
    title: req.body.title,
    link: req.body.link,
    image: req.file.path,   // ⭐ path save
  });

  res.json(banner);
};




 /* DELETE */
const DeleteBanner =  async (req, res) => {
  await Banner.findByIdAndDelete(req.params.id);
  res.json({ msg: "deleted" });
};


/* TOGGLE */
const BannerToggle =  async (req, res) => {
  const b = await Banner.findById(req.params.id);
  b.active = !b.active;
  await b.save();
  res.json(b);
};

module.exports = {
    Bannerget , CreateBanner, BannerToggle , DeleteBanner 
}
 