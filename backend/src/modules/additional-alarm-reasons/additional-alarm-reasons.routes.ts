import { Router } from "express";
import { requireAdminAuth } from "../../middlewares/admin-auth.middleware";
import { requireSuperAdmin } from "../../middlewares/role.middleware";
import {
  createAdditionalAlarmReason,
  deleteAdditionalAlarmReason,
  getAdditionalAlarmReasonById,
  getAdditionalAlarmReasons,
  restoreAdditionalAlarmReason,
  updateAdditionalAlarmReason,
} from "./additional-alarm-reasons.controller";

const router = Router();

router.get("/", requireAdminAuth, getAdditionalAlarmReasons);
router.get("/:id", requireAdminAuth, getAdditionalAlarmReasonById);

router.post("/", requireAdminAuth, requireSuperAdmin, createAdditionalAlarmReason);
router.put("/:id", requireAdminAuth, requireSuperAdmin, updateAdditionalAlarmReason);
router.patch(
  "/:id/restore",
  requireAdminAuth,
  requireSuperAdmin,
  restoreAdditionalAlarmReason
);
router.delete("/:id", requireAdminAuth, requireSuperAdmin, deleteAdditionalAlarmReason);

export default router;