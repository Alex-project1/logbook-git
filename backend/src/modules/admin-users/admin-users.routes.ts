import { Router } from "express";
import { requireAdminAuth } from "../../middlewares/admin-auth.middleware";
import { requireSuperAdmin } from "../../middlewares/role.middleware";
import {
  createAdminUser,
  deleteAdminUser,
  getAdminUsers,
  updateAdminUser,
} from "./admin-users.controller";

const router = Router();

router.get("/", requireAdminAuth, requireSuperAdmin, getAdminUsers);
router.post("/", requireAdminAuth, requireSuperAdmin, createAdminUser);
router.put("/:id", requireAdminAuth, requireSuperAdmin, updateAdminUser);
router.delete("/:id", requireAdminAuth, requireSuperAdmin, deleteAdminUser);

export default router;