import { Router } from "express";
import { requireAdminAuth } from "../../middlewares/admin-auth.middleware";
import { requireSuperAdmin } from "../../middlewares/role.middleware";
import {
  bulkImportStreets,
  createStreet,
  deleteStreet,
  getStreetById,
  getStreets,
  updateStreet,
} from "./streets.controller";

const router = Router();

router.get("/", requireAdminAuth, getStreets);
router.get("/:id", requireAdminAuth, getStreetById);

router.post("/bulk", requireAdminAuth, requireSuperAdmin, bulkImportStreets);
router.post("/", requireAdminAuth, requireSuperAdmin, createStreet);
router.put("/:id", requireAdminAuth, requireSuperAdmin, updateStreet);
router.delete("/:id", requireAdminAuth, requireSuperAdmin, deleteStreet);

export default router;