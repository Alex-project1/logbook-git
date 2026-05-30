import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./layouts/AdminLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { RequireRole } from "./routes/RequireRole";
import { CitiesPage } from "./pages/CitiesPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { CrewsPage } from "./pages/CrewsPage";
import { VehiclesPage } from "./pages/VehiclesPage";
import { TripGoalsPage } from "./pages/TripGoalsPage";
import { AdditionalAlarmReasonsPage } from "./pages/AdditionalAlarmReasonsPage";
import { MobileUsersPage } from "./pages/MobileUsersPage";
import { ReportsGeneralPage } from "./pages/reports/ReportsGeneralPage";
import { ReportPlaceholderPage } from "./pages/reports/ReportPlaceholderPage";
import { ReportsTripsPage } from "./pages/reports/ReportsTripsPage";
import { ReportsShiftsPage } from "./pages/reports/ReportsShiftsPage";
import { ReportsEmployeesPage } from "./pages/reports/ReportsEmployeesPage";
import { ReportsCrewsPage } from "./pages/reports/ReportsCrewsPage";
import { ReportsVehiclesPage } from "./pages/reports/ReportsVehiclesPage";
import { ReportsAlarmsPage } from "./pages/reports/ReportsAlarmsPage";
import { ManualShiftCreatePage } from "./pages/ManualShiftCreatePage";
import { ManualShiftsArchivePage } from "./pages/ManualShiftsArchivePage";
import { ManualShiftEditPage } from "./pages/ManualShiftEditPage";
import { ActionLogsPage } from "./pages/ActionLogsPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { DutyPostsPage } from "./pages/DutyPostsPage";
import { PostDutiesPage } from "./pages/PostDutiesPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route
            path="manual-shifts/create"
            element={
              <RequireRole allowedRoles={["super_admin", "admin"]}>
                <ManualShiftCreatePage />
              </RequireRole>
            }
          />
          <Route
            path="manual-shifts/:id/edit"
            element={
              <RequireRole allowedRoles={["super_admin", "admin"]}>
                <ManualShiftEditPage />
              </RequireRole>
            }
          />
          <Route
            path="cities"
            element={
              <RequireRole allowedRoles={["super_admin"]}>
                <CitiesPage />
              </RequireRole>
            }
          />
          <Route path="mobile-users" element={<MobileUsersPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="crews" element={<CrewsPage />} />
          <Route path="vehicles" element={<VehiclesPage />} />
          <Route path="duty-posts" element={<DutyPostsPage />} />
          <Route path="post-duties" element={<PostDutiesPage />} />
          <Route
            path="trip-goals"
            element={
              <RequireRole allowedRoles={["super_admin"]}>
                <TripGoalsPage />
              </RequireRole>
            }
          />
          <Route
            path="additional-alarm-reasons"
            element={
              <RequireRole allowedRoles={["super_admin"]}>
                <AdditionalAlarmReasonsPage />
              </RequireRole>
            }
          />
          <Route path="reports/general" element={<ReportsGeneralPage />} />
          <Route path="reports/trips" element={<ReportsTripsPage />} />
          <Route path="reports/shifts" element={<ReportsShiftsPage />} />
          <Route path="reports/employees" element={<ReportsEmployeesPage />} />
          <Route path="reports/crews" element={<ReportsCrewsPage />} />
          <Route path="reports/vehicles" element={<ReportsVehiclesPage />} />
          <Route path="reports/alarms" element={<ReportsAlarmsPage />} />
          <Route
            path="manual-shifts/archive"
            element={
              <RequireRole allowedRoles={["super_admin", "admin"]}>
                <ManualShiftsArchivePage />
              </RequireRole>
            }
          />
          <Route
            path="action-logs"
            element={
              <RequireRole allowedRoles={["super_admin"]}>
                <ActionLogsPage />
              </RequireRole>
            }
          />
          <Route
            path="admin-users"
            element={
              <RequireRole allowedRoles={["super_admin"]}>
                <AdminUsersPage />
              </RequireRole>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}