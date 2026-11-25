const router = require("express").Router();
const {
  CreateOrder,
  OrderInfo,
  Checkout,
  Quote,
  OrderDetail,
  CancelOrder,
  ReturnOrder,
  TrackOrder,
} = require("../../Controllers/UserControllers/UserOrderControllers");
const { UserAuthCheck, optionalUser } = require("../../Middleware/Authmiddleware");
const { rateLimit } = require("../../utils/security");

const checkoutLimit = rateLimit({ key: "checkout", windowMs: 10 * 60 * 1000, max: 30 });
const trackLimit = rateLimit({ key: "track", windowMs: 15 * 60 * 1000, max: 20 });

// legacy endpoints (kept working)
router.post("/create", UserAuthCheck, CreateOrder);
router.get("/user/:id", UserAuthCheck, OrderInfo);

// checkout (signed-in or guest)
router.post("/quote", optionalUser, Quote);
router.post("/checkout", checkoutLimit, optionalUser, Checkout);
router.post("/track", trackLimit, TrackOrder);

// single order (owner, or guest with access token)
router.get("/:id", optionalUser, OrderDetail);
router.post("/:id/cancel", optionalUser, CancelOrder);
router.post("/:id/return", UserAuthCheck, ReturnOrder);

module.exports = router;
