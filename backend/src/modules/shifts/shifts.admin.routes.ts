import { Router } from "express";
import { requireAdminAuth } from "../../middlewares/admin-auth.middleware";
import { requireSuperAdmin } from "../../middlewares/role.middleware";
import {
  createAdminShift,
  deleteAdminShift,
  getAdminShiftById,
  getAdminShifts,
  getAdminTrips,
  updateAdminShift,
} from "./shifts.admin.controller";
const router = Router();

router.get("/shifts", requireAdminAuth, getAdminShifts);
router.get("/shifts/:id", requireAdminAuth, getAdminShiftById);
router.post(
  "/shifts",
  requireAdminAuth,
  requireSuperAdmin,
  createAdminShift
);
router.put(
  "/shifts/:id",
  requireAdminAuth,
  requireSuperAdmin,
  updateAdminShift
);
router.delete(
  "/shifts/:id",
  requireAdminAuth,
  requireSuperAdmin,
  deleteAdminShift
);

router.get("/trips", requireAdminAuth, getAdminTrips);

export default router;