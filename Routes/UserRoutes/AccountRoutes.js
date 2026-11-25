const express = require("express");
const router = express.Router();
const c = require("../../Controllers/UserControllers/AccountControllers");
const { UserAuthCheck } = require("../../Middleware/Authmiddleware");

// everything here belongs to the signed-in customer only
router.use(UserAuthCheck);

router.get("/addresses", c.listAddresses);
router.post("/addresses", c.addAddress);
router.put("/addresses/:id", c.updateAddress);
router.delete("/addresses/:id", c.deleteAddress);

router.get("/wishlist", c.getWishlist);
router.post("/wishlist/merge", c.mergeWishlist);
router.post("/wishlist/:productId", c.addWishlist);
router.delete("/wishlist/:productId", c.removeWishlist);

router.get("/notifications", c.listNotifications);
router.get("/notifications/unread", c.unreadCount);
router.put("/notifications/:id/read", c.markRead);

router.get("/preferences", c.getPreferences);
router.put("/preferences", c.updatePreferences);

router.get("/reviews", c.myReviews);
router.get("/tickets", c.myTickets);
router.post("/tickets/:id/reply", c.replyTicket);

module.exports = router;
