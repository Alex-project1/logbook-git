import { Router } from "express";
import { requireAdminAuth } from "../../middlewares/admin-auth.middleware";
import {
  createPostDuty,
  deletePostDuty,
  getPostDuties,
  getPostDutyById,
  restorePostDuty,
  updatePostDuty,
} from "./post-duties.controller";

const router = Router();

router.get("/", requireAdminAuth, getPostDuties);
router.get("/:id", requireAdminAuth, getPostDutyById);

router.post("/", requireAdminAuth, createPostDuty);
router.put("/:id", requireAdminAuth, updatePostDuty);
router.patch("/:id/restore", requireAdminAuth, restorePostDuty);
router.delete("/:id", requireAdminAuth, deletePostDuty);

export default router;