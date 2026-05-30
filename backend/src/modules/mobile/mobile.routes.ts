import { Router } from "express";
import { requireMobileAuth } from "../../middlewares/mobile-auth.middleware";
import { mobileBootstrap, mobileLogin } from "./mobile.controller";

const router = Router();

router.post("/login", mobileLogin);

router.get("/bootstrap", requireMobileAuth, mobileBootstrap);
router.get("/refresh-data", requireMobileAuth, mobileBootstrap);

export default router;