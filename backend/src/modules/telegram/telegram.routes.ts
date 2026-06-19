import { Router } from "express";
import { requireAdminAuth } from "../../middlewares/admin-auth.middleware";
import {
  createTelegramBot,
  createTelegramChannel,
  deleteTelegramBot,
  deleteTelegramChannel,
  getTelegramBots,
  getTelegramChannels,
  updateTelegramBot,
  updateTelegramChannel,
} from "./telegram.controller";

const router = Router();

router.get("/bots", requireAdminAuth, getTelegramBots);
router.post("/bots", requireAdminAuth, createTelegramBot);
router.put("/bots/:id", requireAdminAuth, updateTelegramBot);
router.delete("/bots/:id", requireAdminAuth, deleteTelegramBot);

router.get("/channels", requireAdminAuth, getTelegramChannels);
router.post("/channels", requireAdminAuth, createTelegramChannel);
router.put("/channels/:id", requireAdminAuth, updateTelegramChannel);
router.delete("/channels/:id", requireAdminAuth, deleteTelegramChannel);

export default router;
