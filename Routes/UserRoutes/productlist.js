const express = require("express");
const router = express.Router();

const {
  Productlist,
  ProductShow,
  Catalog,
  Suggest,
  ByIds,
  Related,
  Recommendations,
  ReviewList,
  ReviewUpsert,
  QuestionList,
  QuestionAsk,
  NotifyMe,
} = require("../../Controllers/UserControllers/ProductControllers");
const { Config, Content, ShippingCheck, Subscribe, Unsubscribe, ContactSupport } = require("../../Controllers/UserControllers/PublicControllers");
const { UserAuthCheck, optionalUser } = require("../../Middleware/Authmiddleware");
const { rateLimit } = require("../../utils/security");

const formLimit = rateLimit({ key: "forms", windowMs: 60 * 60 * 1000, max: 20, message: "Too many submissions. Please try again later." });

// catalogue
router.get("/products", Productlist);
router.get("/products/by-ids", ByIds); // before /products/:id
router.get("/catalog", Catalog);
router.get("/search/suggest", Suggest);
router.get("/recommendations", Recommendations);
router.get("/products/:id", ProductShow);
router.get("/products/:id/related", Related);

// reviews & questions
router.get("/products/:id/reviews", optionalUser, ReviewList);
router.post("/products/:id/reviews", UserAuthCheck, ReviewUpsert);
router.get("/products/:id/questions", QuestionList);
router.post("/products/:id/questions", UserAuthCheck, QuestionAsk);
router.post("/products/:id/notify", formLimit, optionalUser, NotifyMe);

// store-wide
router.get("/config", Config);
router.get("/content", Content);
router.get("/shipping/check", ShippingCheck);
router.post("/newsletter/subscribe", formLimit, Subscribe);
router.post("/newsletter/unsubscribe", Unsubscribe);
router.post("/support", formLimit, optionalUser, ContactSupport);

module.exports = router;
