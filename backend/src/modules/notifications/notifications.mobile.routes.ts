import { Router } from "express";
import { requireMobileAuth } from "../../middlewares/mobile-auth.middleware";
import {
  getMobileNotificationById,
  getMobileNotifications,
  markMobileNotificationAsRead,
  replyMobileNotification,
  getMobileUnreadNotificationsCount,
} from "./notifications.mobile.controller";

const router = Router();

router.get("/", requireMobileAuth, getMobileNotifications);
router.get("/unread-count", requireMobileAuth, getMobileUnreadNotificationsCount);
router.get("/:id", requireMobileAuth, getMobileNotificationById);
router.post("/:id/read", requireMobileAuth, markMobileNotificationAsRead);
router.post("/:id/reply", requireMobileAuth, replyMobileNotification);

export default router;