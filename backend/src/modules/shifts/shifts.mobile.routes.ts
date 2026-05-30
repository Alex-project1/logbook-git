import { Router } from "express";
import { requireMobileAuth } from "../../middlewares/mobile-auth.middleware";
import { createMobileShift } from "./shifts.mobile.controller";

const router = Router();

router.post("/", requireMobileAuth, createMobileShift);

export default router;