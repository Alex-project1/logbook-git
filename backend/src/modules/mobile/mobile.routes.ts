import { Router } from "express";
import { requireMobileAuth } from "../../middlewares/mobile-auth.middleware";
import { mobileBootstrap, mobileLogin } from "./mobile.controller";
import {
  deleteMobileDeviceToken,
  registerMobileDeviceToken,
} from "./mobile-device-tokens.controller";
const router = Router();

router.post("/login", mobileLogin);

router.get("/bootstrap", requireMobileAuth, mobileBootstrap);
router.get("/refresh-data", requireMobileAuth, mobileBootstrap);
router.post("/device-token", requireMobileAuth, registerMobileDeviceToken);
router.delete("/device-token", requireMobileAuth, deleteMobileDeviceToken);

export default router;