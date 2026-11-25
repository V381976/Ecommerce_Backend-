const Offer = require("../../models/OfferModel");
const { audit } = require("../../utils/audit");


/* GET ACTIVE OFFERS */
const getOffers = async (req, res) => {
  try {

    const offers = await Offer.find({})
      .populate("category") // ✅ brand removed
      .sort({ priority: -1, createdAt: -1 });

    res.json(offers);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};




/* ADD OFFER */
const addOffer = async (req, res,next ) => {
  try {

    // ⭐ whitelist only allowed fields
    const {
      title,
      description,
      discountPercent,
      discountAmount,
      category,
  
      startsAt,
      expiresAt,
      priority
    } = req.body;

    const offer = await Offer.create({
      title,
      description,
      discountPercent,
      discountAmount,
      category,

      startsAt,
      expiresAt,
      priority
    });

    audit(req, "offer.create", { entity: "offer", entityId: offer._id, summary: `Created offer ${offer.title}` });
    res.status(201).json(offer);

  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};



/* UPDATE OFFER */
const updateOffer = async (req, res) => {
  try {
    const { title, description, discountPercent, category, startsAt, expiresAt, priority } = req.body;
    const offer = await Offer.findByIdAndUpdate(
      req.params.id,
      { title, description, discountPercent, category, startsAt: startsAt || null, expiresAt: expiresAt || null, priority },
      { returnDocument: "after", runValidators: true }
    );
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    audit(req, "offer.update", { entity: "offer", entityId: offer._id, summary: `Updated offer ${offer.title}` });
    res.json(offer);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/* DELETE OFFER */
const deleteOffer = async (req, res ,next ) => {
  try {

    const offer = await Offer.findByIdAndDelete(req.params.id);

    if (!offer)
      return res.status(404).json({ message: "Offer not found" });

    audit(req, "offer.delete", { entity: "offer", entityId: offer._id, summary: `Deleted offer ${offer.title}` });
    res.json({ message: "Offer deleted successfully" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};



/* TOGGLE ACTIVE */
const toggleOffer = async (req, res ,next ) => {
  try {

    const offer = await Offer.findById(req.params.id);

    if (!offer)
      return res.status(404).json({ message: "Offer not found" });

    offer.active = !offer.active;

    await offer.save();

    audit(req, "offer.toggle", { entity: "offer", entityId: offer._id, summary: `${offer.active ? "Activated" : "Paused"} offer ${offer.title}` });
    res.json(offer);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};



module.exports = {
  getOffers,
  addOffer,
  deleteOffer,
  toggleOffer,
  updateOffer
};
