import { Router } from "express";
import { requireMobileAuth } from "../../middlewares/mobile-auth.middleware";
import {
  getMobileObjectClusters,
  getMobileObjects,
  getMobileObjectsMapAsset,
  getMobileObjectsMapTile,
  getMobileObjectsOverview,
  searchMobileObject,
} from "./objects.mobile.controller";

const router = Router();

router.get("/map-assets/:asset", getMobileObjectsMapAsset);
router.get("/tile/:z/:x/:y.png", getMobileObjectsMapTile);

router.get("/overview", requireMobileAuth, getMobileObjectsOverview);
router.get("/clusters", requireMobileAuth, getMobileObjectClusters);
router.get("/search", requireMobileAuth, searchMobileObject);
router.get("/", requireMobileAuth, getMobileObjects);

export default router;
