import { Router } from "express";
import { requireAdminAuth } from "../../middlewares/admin-auth.middleware";
import {
  createNotification,
  getNotificationById,
  getNotifications,
} from "./notifications.controller";

const router = Router();

router.get("/", requireAdminAuth, getNotifications);
router.get("/:id", requireAdminAuth, getNotificationById);
router.post("/", requireAdminAuth, createNotification);

export default router;