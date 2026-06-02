import { Router } from "express";
import { requireAdminAuth } from "../../middlewares/admin-auth.middleware";
import {
  getCrewsReport,
  getCrewsTableReport,
  getEmployeesReport,
  getEmployeesTableReport,
  getGeneralReport,
  getShiftsTableReport,
  getTripsTableReport,
  getVehiclesReport,
  getVehiclesTableReport,
  getAlarmsReport,
} from "./reports.controller";
import { getCustomReport } from "./reports.custom.controller";
import {
  exportEmployeesTableExcel,
  exportReportsExcel,
  exportShiftsTableExcel,
  exportTripsTableExcel,
  exportCrewsTableExcel,
  exportVehiclesTableExcel,
  exportAlarmsReportExcel
} from "./reports.export.controller";
import { exportCustomReportExcel } from "./reports.custom.export.controller";

const router = Router();

router.get("/general", requireAdminAuth, getGeneralReport);
router.get("/custom", requireAdminAuth, getCustomReport);
router.get("/trips-table", requireAdminAuth, getTripsTableReport);
router.get("/shifts-table", requireAdminAuth, getShiftsTableReport);
router.get("/employees-table", requireAdminAuth, getEmployeesTableReport);
router.get("/crews-table", requireAdminAuth, getCrewsTableReport);
router.get("/vehicles-table", requireAdminAuth, getVehiclesTableReport);
router.get("/alarms", requireAdminAuth, getAlarmsReport);

router.get("/employees", requireAdminAuth, getEmployeesReport);
router.get("/crews", requireAdminAuth, getCrewsReport);
router.get("/vehicles", requireAdminAuth, getVehiclesReport);

router.get("/export/excel", requireAdminAuth, exportReportsExcel);
router.get("/custom/export/excel", requireAdminAuth, exportCustomReportExcel);
router.get("/trips-table/export/excel", requireAdminAuth, exportTripsTableExcel);
router.get("/shifts-table/export/excel", requireAdminAuth, exportShiftsTableExcel);
router.get(
  "/employees-table/export/excel",
  requireAdminAuth,
  exportEmployeesTableExcel
);
router.get(
  "/crews-table/export/excel",
  requireAdminAuth,
  exportCrewsTableExcel
);
router.get(
  "/vehicles-table/export/excel",
  requireAdminAuth,
  exportVehiclesTableExcel
);
router.get(
  "/alarms/export/excel",
  requireAdminAuth,
  exportAlarmsReportExcel
);


export default router;