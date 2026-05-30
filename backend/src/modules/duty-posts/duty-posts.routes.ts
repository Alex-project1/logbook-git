import { Router } from "express";
import { requireAdminAuth } from "../../middlewares/admin-auth.middleware";
import {
  createDutyPost,
  deleteDutyPost,
  getDutyPostById,
  getDutyPosts,
  restoreDutyPost,
  updateDutyPost,
} from "./duty-posts.controller";

const router = Router();

router.get("/", requireAdminAuth, getDutyPosts);
router.get("/:id", requireAdminAuth, getDutyPostById);

router.post("/", requireAdminAuth, createDutyPost);
router.put("/:id", requireAdminAuth, updateDutyPost);
router.patch("/:id/restore", requireAdminAuth, restoreDutyPost);
router.delete("/:id", requireAdminAuth, deleteDutyPost);

export default router;