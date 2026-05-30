import { Router } from "express";
import { requireAdminAuth } from "../../middlewares/admin-auth.middleware";

import {
  createVehicle,
  deleteVehicle,
  getVehicleById,
  getVehicles,
  restoreVehicle,
  updateVehicle,
} from "./vehicles.controller";

const router = Router();

router.get("/", requireAdminAuth, getVehicles);
router.get("/:id", requireAdminAuth, getVehicleById);

router.post("/", requireAdminAuth,  createVehicle);
router.put("/:id", requireAdminAuth,  updateVehicle);
router.patch("/:id/restore", requireAdminAuth,  restoreVehicle);
router.delete("/:id", requireAdminAuth,  deleteVehicle);

export default router;