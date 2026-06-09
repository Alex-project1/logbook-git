import { Router } from "express";
import { requireAdminAuth } from "../../middlewares/admin-auth.middleware";
import {
  archiveDepartment,
  createDepartment,
  getDepartmentById,
  getDepartments,
  restoreDepartment,
  updateDepartment,
} from "./departments.controller";

const router = Router();

router.get("/", requireAdminAuth, getDepartments);
router.get("/:id", requireAdminAuth, getDepartmentById);
router.post("/", requireAdminAuth, createDepartment);
router.put("/:id", requireAdminAuth, updateDepartment);
router.delete("/:id", requireAdminAuth, archiveDepartment);
router.patch("/:id/restore", requireAdminAuth, restoreDepartment);

export default router;
