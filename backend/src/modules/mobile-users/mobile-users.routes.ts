import { Router } from "express";
import { requireAdminAuth } from "../../middlewares/admin-auth.middleware";

import {
  createMobileUser,
  deleteMobileUser,
  getMobileUserById,
  getMobileUsers,
  restoreMobileUser,
  updateMobileUser,
} from "./mobile-users.controller";
const router = Router();

router.get("/", requireAdminAuth, getMobileUsers);
router.get("/:id", requireAdminAuth, getMobileUserById);

router.post("/", requireAdminAuth,  createMobileUser);
router.put("/:id", requireAdminAuth,  updateMobileUser);
router.patch("/:id/restore", requireAdminAuth,  restoreMobileUser);
router.delete("/:id", requireAdminAuth,  deleteMobileUser);

export default router;