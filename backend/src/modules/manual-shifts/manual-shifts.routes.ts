import { Router } from "express";
import { requireAdminAuth } from "../../middlewares/admin-auth.middleware";
import {
  createManualShift,
  deleteManualShift,
  getDeletedManualShifts,
  getManualShiftById,
  restoreManualShift,
  updateManualShift,
} from "./manual-shifts.controller";

const router = Router();

router.post("/", requireAdminAuth, createManualShift);

router.get("/archive", requireAdminAuth, getDeletedManualShifts);

router.get("/:id", requireAdminAuth, getManualShiftById);
router.put("/:id", requireAdminAuth, updateManualShift);

router.patch("/:id/restore", requireAdminAuth, restoreManualShift);
router.delete("/:id", requireAdminAuth, deleteManualShift);

export default router;