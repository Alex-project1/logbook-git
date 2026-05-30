import { Router } from "express";
import { requireAdminAuth } from "../../middlewares/admin-auth.middleware";
import {
  createEmployee,
  deleteEmployee,
  getEmployeeById,
  getEmployees,
  restoreEmployee,
  updateEmployee,
} from "./employees.controller";

const router = Router();

router.get("/", requireAdminAuth, getEmployees);
router.get("/:id", requireAdminAuth, getEmployeeById);

router.post("/", requireAdminAuth,  createEmployee);
router.put("/:id", requireAdminAuth,  updateEmployee);
router.patch("/:id/restore", requireAdminAuth,  restoreEmployee);
router.delete("/:id", requireAdminAuth,  deleteEmployee);

export default router;