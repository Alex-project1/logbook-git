import { Router } from "express";
import { requireAdminAuth } from "../../middlewares/admin-auth.middleware";
import { requireSuperAdmin } from "../../middlewares/role.middleware";
import {
  createCity,
  deleteCity,
  getCities,
  getCityById,
  restoreCity,
  updateCity,
} from "./cities.controller";

const router = Router();

router.get("/", requireAdminAuth, getCities);
router.get("/:id", requireAdminAuth, getCityById);

router.post("/", requireAdminAuth, requireSuperAdmin, createCity);
router.put("/:id", requireAdminAuth, requireSuperAdmin, updateCity);
router.patch("/:id/restore", requireAdminAuth, requireSuperAdmin, restoreCity);
router.delete("/:id", requireAdminAuth, requireSuperAdmin, deleteCity);

export default router;