const Settings = require("../models/SettingsModel");

// settings are read on most cart/checkout requests → short in-memory cache
let cached = null;
let cachedAt = 0;
const TTL = 15 * 1000;

const getSettings = async () => {
  if (cached && Date.now() - cachedAt < TTL) return cached;
  let doc = await Settings.findOne({ key: "store" }).lean();
  if (!doc) {
    // first run: create with schema defaults
    doc = (await Settings.findOneAndUpdate(
      { key: "store" },
      { $setOnInsert: { key: "store" } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    )).toObject();
  }
  cached = doc;
  cachedAt = Date.now();
  return doc;
};

const clearSettingsCache = () => {
  cached = null;
};

module.exports = { getSettings, clearSettingsCache };
