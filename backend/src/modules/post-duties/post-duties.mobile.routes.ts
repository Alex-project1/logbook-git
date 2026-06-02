import { Router } from "express";
import { requireMobileAuth } from "../../middlewares/mobile-auth.middleware";
import { createMobilePostDuty } from "./post-duties.mobile.controller";

const router = Router();

router.post("/", requireMobileAuth, createMobilePostDuty);

export default router;