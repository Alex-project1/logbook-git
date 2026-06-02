import { Router } from "express";
import { requireMobileAuth } from "../../middlewares/mobile-auth.middleware";
import { getMobileHistory } from "./mobile-history.controller";

const router = Router();

router.get("/", requireMobileAuth, getMobileHistory);

export default router;
