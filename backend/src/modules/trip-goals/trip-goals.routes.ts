import { Router } from "express";
import { requireAdminAuth } from "../../middlewares/admin-auth.middleware";
import { requireSuperAdmin } from "../../middlewares/role.middleware";
import {
  createTripGoal,
  deleteTripGoal,
  getTripGoalById,
  getTripGoals,
  restoreTripGoal,
  updateTripGoal,
} from "./trip-goals.controller";

const router = Router();

router.get("/", requireAdminAuth, getTripGoals);
router.get("/:id", requireAdminAuth, getTripGoalById);

router.post("/", requireAdminAuth, requireSuperAdmin, createTripGoal);
router.put("/:id", requireAdminAuth, requireSuperAdmin, updateTripGoal);
router.patch("/:id/restore", requireAdminAuth, requireSuperAdmin, restoreTripGoal);
router.delete("/:id", requireAdminAuth, requireSuperAdmin, deleteTripGoal);

export default router;