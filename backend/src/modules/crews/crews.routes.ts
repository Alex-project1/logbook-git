import { Router } from "express";
import { requireAdminAuth } from "../../middlewares/admin-auth.middleware";

import {
  createCrew,
  deleteCrew,
  getCrewById,
  getCrews,
  restoreCrew,
  updateCrew,
} from "./crews.controller";

const router = Router();

router.get("/", requireAdminAuth, getCrews);
router.get("/:id", requireAdminAuth, getCrewById);

router.post("/", requireAdminAuth,  createCrew);
router.put("/:id", requireAdminAuth,  updateCrew);
router.patch("/:id/restore", requireAdminAuth,  restoreCrew);
router.delete("/:id", requireAdminAuth,  deleteCrew);

export default router;