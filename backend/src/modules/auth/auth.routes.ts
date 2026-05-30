import { Router } from "express";
import { adminLogin, adminMe } from "./auth.controller";
import { requireAdminAuth } from "../../middlewares/admin-auth.middleware";

const router = Router();

router.post("/login", adminLogin);
router.get("/me", requireAdminAuth, adminMe);

export default router;