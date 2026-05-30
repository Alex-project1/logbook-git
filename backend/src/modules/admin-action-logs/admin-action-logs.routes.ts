import { Router } from "express";
import { requireAdminAuth } from "../../middlewares/admin-auth.middleware";
import { requireSuperAdmin } from "../../middlewares/role.middleware";
import { getAdminActionLogs } from "./admin-action-logs.controller";

const router = Router();

router.get("/", requireAdminAuth, requireSuperAdmin, getAdminActionLogs);

export default router;