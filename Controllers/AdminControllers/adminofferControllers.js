const Offer = require("../../models/OfferModel");


/* GET all active offers */
const getOffers = async (req, res) => {
  try {
    const offers = await Offer
      .find()
      .populate("category brand");

    res.json(offers);

  } catch (err) {
    res.status(500).json(err.message);
  }
};



/* ADD offer */
const addOffer = async (req, res) => {
  try {
    const offer = await Offer.create(req.body);
    res.json(offer);

  } catch (err) {
    res.status(500).json(err.message);
  }
};

 const deleteOffer = async (req,res)=>{
  await Offer.findByIdAndDelete(req.params.id);
  res.json({msg:"deleted"});
};

 const toggleOffer = async (req,res)=>{
  const offer = await Offer.findById(req.params.id);
  offer.active = !offer.active;
  await offer.save();
  res.json(offer);
};



module.exports = {
    addOffer , getOffers ,deleteOffer , toggleOffer
}