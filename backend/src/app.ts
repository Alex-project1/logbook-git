import express from "express";
import cors from "cors";
import adminAuthRoutes from "./modules/auth/auth.routes";
import adminCitiesRoutes from "./modules/cities/cities.routes";
import adminEmployeesRoutes from "./modules/employees/employees.routes";
import adminCrewsRoutes from "./modules/crews/crews.routes";
import adminVehiclesRoutes from "./modules/vehicles/vehicles.routes";
import adminTripGoalsRoutes from "./modules/trip-goals/trip-goals.routes";
import adminAdditionalAlarmReasonsRoutes from "./modules/additional-alarm-reasons/additional-alarm-reasons.routes";
import adminStreetsRoutes from "./modules/streets/streets.routes";
import adminMobileUsersRoutes from "./modules/mobile-users/mobile-users.routes";
import mobileRoutes from "./modules/mobile/mobile.routes";
import mobileShiftRoutes from "./modules/shifts/shifts.mobile.routes";
import adminShiftsRoutes from "./modules/shifts/shifts.admin.routes";
import adminReportsRoutes from "./modules/reports/reports.routes";
import manualShiftsRoutes from "./modules/manual-shifts/manual-shifts.routes";
import adminActionLogsRoutes from "./modules/admin-action-logs/admin-action-logs.routes";
import adminUsersRoutes from "./modules/admin-users/admin-users.routes";
import dutyPostsRoutes from "./modules/duty-posts/duty-posts.routes";
import postDutiesRoutes from "./modules/post-duties/post-duties.routes";
import adminNotificationsRoutes from "./modules/notifications/notifications.routes";
import mobileNotificationsRoutes from "./modules/notifications/notifications.mobile.routes";
import mobilePostDutiesRoutes from "./modules/post-duties/post-duties.mobile.routes";
import mobileHistoryRoutes from "./modules/mobile-history/mobile-history.routes";
import mobileObjectsRoutes from "./modules/mobile-objects/objects.mobile.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Backend is working",
  });
});

app.use("/api/admin", adminAuthRoutes);
app.use("/api/admin/cities", adminCitiesRoutes);
app.use("/api/admin/employees", adminEmployeesRoutes);
app.use("/api/admin/crews", adminCrewsRoutes);
app.use("/api/admin/vehicles", adminVehiclesRoutes);
app.use("/api/admin/trip-goals", adminTripGoalsRoutes);
app.use(
  "/api/admin/additional-alarm-reasons",
  adminAdditionalAlarmReasonsRoutes
);
app.use("/api/admin/streets", adminStreetsRoutes);
app.use("/api/admin/mobile-users", adminMobileUsersRoutes);
app.use("/api/admin", adminShiftsRoutes);
app.use("/api/admin/reports", adminReportsRoutes);

app.use("/api/mobile", mobileRoutes);
app.use("/api/mobile/shifts", mobileShiftRoutes);
app.use("/api/mobile/post-duties", mobilePostDutiesRoutes);
app.use("/api/mobile/history", mobileHistoryRoutes);
app.use("/api/mobile/objects", mobileObjectsRoutes);
app.use("/api/mobile/notifications", mobileNotificationsRoutes);

app.use("/api/admin/manual-shifts", manualShiftsRoutes);

app.use("/api/admin/action-logs", adminActionLogsRoutes);
app.use("/api/admin/admin-users", adminUsersRoutes);

app.use("/api/admin/duty-posts", dutyPostsRoutes);
app.use("/api/admin/post-duties", postDutiesRoutes);

app.use("/api/admin/notifications", adminNotificationsRoutes);

export default app;