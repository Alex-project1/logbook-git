import { http } from "./http";

export type ReportFilters = {
  dateFrom?: string;
  dateTo?: string;
  cityId?: number;
};

export type GeneralTotals = {
  totalShifts: number;
  totalTrips: number;
  totalDistanceKm: number;

  totalAlarms: number;
  totalOh: number;
  totalPartner: number;

  falseTotal: number;
  falseOh: number;
  falsePartner: number;

  combatTotal: number;
  combatOh: number;
  combatPartner: number;

  additionalTotal: number;
  additionalOh: number;
  additionalPartner: number;

  detained: number;
  transferred: number;

  averageAlarmsPerShift: number;
  averageDistancePerShift: number;

  additionalByReason: Record<
    string,
    {
      total: number;
      oh: number;
      partner: number;
    }
  >;

  distanceByGoal: Record<string, number>;
};

export type GeneralByCityRow = GeneralTotals & {
  cityId: number;
  cityName: string;
};

export type GeneralReportResponse = {
  filters: {
    cityId: number | null;
    dateFrom: string | null;
    dateTo: string | null;
  };
  data: {
    totals: GeneralTotals;
    byCity: GeneralByCityRow[];
  };
};

function buildReportParams(filters: ReportFilters) {
  const params: Record<string, string | number> = {};

  if (filters.cityId) {
    params.cityId = filters.cityId;
  }

  if (filters.dateFrom) {
    params.dateFrom = `${filters.dateFrom}T00:00:00.000Z`;
  }

  if (filters.dateTo) {
    params.dateTo = `${filters.dateTo}T23:59:59.999Z`;
  }

  return params;
}

export async function getGeneralReport(
  filters: ReportFilters
): Promise<GeneralReportResponse> {
  const response = await http.get<GeneralReportResponse>(
    "/api/admin/reports/general",
    {
      params: buildReportParams(filters),
    }
  );

  return response.data;
}

export async function downloadReportsExcel(filters: ReportFilters) {
  const response = await http.get("/api/admin/reports/export/excel", {
    params: buildReportParams(filters),
    responseType: "blob",
  });

  const blob = new Blob([response.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  const from = filters.dateFrom || "all";
  const to = filters.dateTo || "all";

  link.href = url;
  link.download = `reports-${from}-${to}.xlsx`;
  document.body.appendChild(link);
  link.click();

  link.remove();
  window.URL.revokeObjectURL(url);
}
export type TripsTableFilters = ReportFilters & {
  page?: number;
  pageSize?: number;
  sortBy?: "shiftDate" | "departureTime" | "arrivalTime" | "arrivalMinutes" | "distanceKm";
  sortDir?: "asc" | "desc";

  crewId?: number;
  vehicleId?: number;
  employeeId?: number;
  goalId?: number;

  alarmSource?: "OH" | "PARTNER";
  isCombat?: boolean;

  hasDetained?: boolean;
  hasTransferred?: boolean;

  search?: string;
};

export type TripTableEvent = {
  id: number;
  eventCategory: "REGULAR_ALARM" | "ADDITIONAL_ALARM";
  title: string;
  alarmSource: "OH" | "PARTNER" | null;
  isCombat: boolean | null;
  countTotal: number;
  ohCount: number;
  partnerCount: number;
  reasonName: string | null;
  detainedCount: number;
  transferredCount: number;
  note: string | null;
};

export type TripTableRow = {
  id: number;
  shiftId: number;

  city: {
    id: number;
    name: string;
  };

  shiftDate: string;
  submittedAt: string | null;

  crew: {
    id: number;
    name: string;
  };

  vehicle: {
    id: number;
    title: string;
    licensePlate: string | null;
  };

  driverEmployee: {
    id: number;
    fullName: string;
  };

  seniorEmployee: {
    id: number;
    fullName: string;
  };

  odometerStart: number;

  fromLocation: string;
  departureTime: string;
  toLocation: string;
  arrivalTime: string;
  arrivalMinutes: number;
  distanceKm: number;

  goal: {
    id: number;
    name: string;
    systemCode: string | null;
  };

  note: string | null;
  eventSummary: string;

  eventTotals: {
    regularOh: number;
    regularPartner: number;
    additionalOh: number;
    additionalPartner: number;
    totalOh: number;
    totalPartner: number;
    totalAlarms: number;
    combatTotal: number;
    falseTotal: number;
    detained: number;
    transferred: number;
  };

  events: TripTableEvent[];
};

export type TripsTableResponse = {
  filters: TripsTableFilters;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    totalRowsOnPage: number;
    totalDistanceKm: number;
    totalAlarms: number;
    totalOh: number;
    totalPartner: number;
    combatTotal: number;
    falseTotal: number;
    additionalOh: number;
    additionalPartner: number;
    detained: number;
    transferred: number;
  };
  data: TripTableRow[];
};

function buildTripsTableParams(filters: TripsTableFilters) {
  const params: Record<string, string | number | boolean> = {};

  if (filters.page) params.page = filters.page;
  if (filters.pageSize) params.pageSize = filters.pageSize;
  if (filters.sortBy) params.sortBy = filters.sortBy;
  if (filters.sortDir) params.sortDir = filters.sortDir;

  if (filters.cityId) params.cityId = filters.cityId;
  if (filters.crewId) params.crewId = filters.crewId;
  if (filters.vehicleId) params.vehicleId = filters.vehicleId;
  if (filters.employeeId) params.employeeId = filters.employeeId;
  if (filters.goalId) params.goalId = filters.goalId;

  if (filters.alarmSource) params.alarmSource = filters.alarmSource;
  if (typeof filters.isCombat === "boolean") params.isCombat = filters.isCombat;
  if (typeof filters.hasDetained === "boolean") params.hasDetained = filters.hasDetained;
  if (typeof filters.hasTransferred === "boolean") params.hasTransferred = filters.hasTransferred;

  if (filters.search?.trim()) params.search = filters.search.trim();

  if (filters.dateFrom) {
    params.dateFrom = `${filters.dateFrom}T00:00:00.000Z`;
  }

  if (filters.dateTo) {
    params.dateTo = `${filters.dateTo}T23:59:59.999Z`;
  }

  return params;
}

export async function getTripsTableReport(
  filters: TripsTableFilters
): Promise<TripsTableResponse> {
  const response = await http.get<TripsTableResponse>(
    "/api/admin/reports/trips-table",
    {
      params: buildTripsTableParams(filters),
    }
  );

  return response.data;
}

export async function downloadTripsTableExcel(filters: TripsTableFilters) {
  const response = await http.get("/api/admin/reports/trips-table/export/excel", {
    params: buildTripsTableParams(filters),
    responseType: "blob",
  });

  const blob = new Blob([response.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  const from = filters.dateFrom || "all";
  const to = filters.dateTo || "all";

  link.href = url;
  link.download = `trips-report-${from}-${to}.xlsx`;

  document.body.appendChild(link);
  link.click();

  link.remove();
  window.URL.revokeObjectURL(url);
}
export type ShiftsTableFilters = ReportFilters & {
  page?: number;
  pageSize?: number;
  sortBy?:
  | "shiftDate"
  | "submittedAt"
  | "totalDistanceKm"
  | "odometerStart"
  | "odometerEndCalculated";
  sortDir?: "asc" | "desc";

  crewId?: number;
  vehicleId?: number;
  employeeId?: number;

  search?: string;
};

export type ShiftTableTrip = {
  id: number;
  fromLocation: string;
  departureTime: string;
  toLocation: string;
  arrivalTime: string;
  arrivalMinutes: number;
  distanceKm: number;
  goal: {
    id: number;
    name: string;
    systemCode: string | null;
  };
  note: string | null;
  eventSummary: string;
  eventTotals: TripTableRow["eventTotals"];
  events: TripTableEvent[];
};

export type ShiftTableRow = {
  id: number;

  city: {
    id: number;
    name: string;
  };

  shiftDate: string;
  submittedAt: string | null;

  crew: {
    id: number;
    name: string;
  };

  vehicle: {
    id: number;
    title: string;
    licensePlate: string | null;
  };

  driverEmployee: {
    id: number;
    fullName: string;
  };

  seniorEmployee: {
    id: number;
    fullName: string;
  };

  driverHasWeapon: boolean;
  seniorHasWeapon: boolean;

  odometerStart: number;
  odometerEndCalculated: number;
  totalDistanceKm: number;

  summary: GeneralTotals & {
    totalTrips: number;
    regularOh: number;
    regularPartner: number;
  };

  trips: ShiftTableTrip[];
};

export type ShiftsTableResponse = {
  filters: ShiftsTableFilters;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    totalRowsOnPage: number;
    totalTrips: number;
    totalDistanceKm: number;
    totalAlarms: number;
    totalOh: number;
    totalPartner: number;
    combatTotal: number;
    falseTotal: number;
    additionalTotal: number;
    detained: number;
    transferred: number;
  };
  data: ShiftTableRow[];
};

function buildShiftsTableParams(filters: ShiftsTableFilters) {
  const params: Record<string, string | number> = {};

  if (filters.page) params.page = filters.page;
  if (filters.pageSize) params.pageSize = filters.pageSize;
  if (filters.sortBy) params.sortBy = filters.sortBy;
  if (filters.sortDir) params.sortDir = filters.sortDir;

  if (filters.cityId) params.cityId = filters.cityId;
  if (filters.crewId) params.crewId = filters.crewId;
  if (filters.vehicleId) params.vehicleId = filters.vehicleId;
  if (filters.employeeId) params.employeeId = filters.employeeId;

  if (filters.search?.trim()) params.search = filters.search.trim();

  if (filters.dateFrom) {
    params.dateFrom = `${filters.dateFrom}T00:00:00.000Z`;
  }

  if (filters.dateTo) {
    params.dateTo = `${filters.dateTo}T23:59:59.999Z`;
  }

  return params;
}

export async function getShiftsTableReport(
  filters: ShiftsTableFilters
): Promise<ShiftsTableResponse> {
  const response = await http.get<ShiftsTableResponse>(
    "/api/admin/reports/shifts-table",
    {
      params: buildShiftsTableParams(filters),
    }
  );

  return response.data;
}

export async function downloadShiftsTableExcel(filters: ShiftsTableFilters) {
  const response = await http.get("/api/admin/reports/shifts-table/export/excel", {
    params: buildShiftsTableParams(filters),
    responseType: "blob",
  });

  const blob = new Blob([response.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  const from = filters.dateFrom || "all";
  const to = filters.dateTo || "all";

  link.href = url;
  link.download = `shifts-report-${from}-${to}.xlsx`;

  document.body.appendChild(link);
  link.click();

  link.remove();
  window.URL.revokeObjectURL(url);
}

export type EmployeesTableFilters = ReportFilters & {
  page?: number;
  pageSize?: number;
  sortBy?:
  | "fullName"
  | "totalShifts"
  | "driverShifts"
  | "seniorShifts"
  | "weaponShifts"
  | "totalAlarms"
  | "averageAlarmsPerShift"
  | "totalDistanceKm"
  | "detained"
  | "transferred";
  sortDir?: "asc" | "desc";

  crewId?: number;
  vehicleId?: number;
  employeeId?: number;

  search?: string;
};

export type EmployeeTableRow = {
  employeeId: number;
  fullName: string;
  cityId: number;
  cityName: string;

  totalShifts: number;
  driverShifts: number;
  seniorShifts: number;
  weaponShifts: number;

  postDutyShiftEquivalent: number;
  postDutyHours: number;
  postDutyCount: number;

  postDutyByPost: Record<
    string,
    {
      shiftEquivalent: number;
      hours: number;
      count: number;
    }
  >;

  totalTrips: number;
  totalDistanceKm: number;

  totalAlarms: number;
  totalOh: number;
  totalPartner: number;

  combatTotal: number;
  falseTotal: number;

  additionalTotal: number;
  additionalOh: number;
  additionalPartner: number;

  detained: number;
  transferred: number;

  averageAlarmsPerShift: number;

  additionalByReason: Record<
    string,
    {
      total: number;
      oh: number;
      partner: number;
    }
  >;
};

export type EmployeesTableResponse = {
  filters: EmployeesTableFilters;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    totalEmployees: number;
    totalShifts: number;
    driverShifts: number;
    seniorShifts: number;
    weaponShifts: number;
    postDutyShiftEquivalent: number;
    postDutyHours: number;
    postDutyCount: number;
    totalAlarms: number;
    totalOh: number;
    totalPartner: number;
    combatTotal: number;
    falseTotal: number;
    additionalTotal: number;
    detained: number;
    transferred: number;
    totalDistanceKm: number;
  };
  data: EmployeeTableRow[];
};

function buildEmployeesTableParams(filters: EmployeesTableFilters) {
  const params: Record<string, string | number> = {};

  if (filters.page) params.page = filters.page;
  if (filters.pageSize) params.pageSize = filters.pageSize;
  if (filters.sortBy) params.sortBy = filters.sortBy;
  if (filters.sortDir) params.sortDir = filters.sortDir;

  if (filters.cityId) params.cityId = filters.cityId;
  if (filters.crewId) params.crewId = filters.crewId;
  if (filters.vehicleId) params.vehicleId = filters.vehicleId;
  if (filters.employeeId) params.employeeId = filters.employeeId;

  if (filters.search?.trim()) params.search = filters.search.trim();

  if (filters.dateFrom) {
    params.dateFrom = `${filters.dateFrom}T00:00:00.000Z`;
  }

  if (filters.dateTo) {
    params.dateTo = `${filters.dateTo}T23:59:59.999Z`;
  }

  return params;
}

export async function getEmployeesTableReport(
  filters: EmployeesTableFilters
): Promise<EmployeesTableResponse> {
  const response = await http.get<EmployeesTableResponse>(
    "/api/admin/reports/employees-table",
    {
      params: buildEmployeesTableParams(filters),
    }
  );

  return response.data;
}

export async function downloadEmployeesTableExcel(
  filters: EmployeesTableFilters
) {
  const response = await http.get(
    "/api/admin/reports/employees-table/export/excel",
    {
      params: buildEmployeesTableParams(filters),
      responseType: "blob",
    }
  );

  const blob = new Blob([response.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  const from = filters.dateFrom || "all";
  const to = filters.dateTo || "all";

  link.href = url;
  link.download = `employees-report-${from}-${to}.xlsx`;

  document.body.appendChild(link);
  link.click();

  link.remove();
  window.URL.revokeObjectURL(url);
}

export type CrewsTableFilters = ReportFilters & {
  page?: number;
  pageSize?: number;
  sortBy?:
  | "crewName"
  | "totalShifts"
  | "totalTrips"
  | "totalAlarms"
  | "averageAlarmsPerShift"
  | "averageDistancePerShift"
  | "totalDistanceKm"
  | "detained"
  | "transferred";
  sortDir?: "asc" | "desc";

  crewId?: number;
  vehicleId?: number;
  employeeId?: number;

  search?: string;
};

export type CrewTableRow = {
  crewId: number;
  crewName: string;
  cityId: number;
  cityName: string;

  totalShifts: number;
  totalTrips: number;
  totalDistanceKm: number;

  totalAlarms: number;
  totalOh: number;
  totalPartner: number;

  combatTotal: number;
  falseTotal: number;

  additionalTotal: number;
  additionalOh: number;
  additionalPartner: number;

  detained: number;
  transferred: number;

  averageAlarmsPerShift: number;
  averageDistancePerShift: number;

  additionalByReason: Record<
    string,
    {
      total: number;
      oh: number;
      partner: number;
    }
  >;

  distanceByGoal: Record<string, number>;
};

export type CrewsTableResponse = {
  filters: CrewsTableFilters;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    totalCrews: number;
    totalShifts: number;
    totalTrips: number;
    totalAlarms: number;
    totalOh: number;
    totalPartner: number;
    combatTotal: number;
    falseTotal: number;
    additionalTotal: number;
    detained: number;
    transferred: number;
    totalDistanceKm: number;
  };
  data: CrewTableRow[];
};

function buildCrewsTableParams(filters: CrewsTableFilters) {
  const params: Record<string, string | number> = {};

  if (filters.page) params.page = filters.page;
  if (filters.pageSize) params.pageSize = filters.pageSize;
  if (filters.sortBy) params.sortBy = filters.sortBy;
  if (filters.sortDir) params.sortDir = filters.sortDir;

  if (filters.cityId) params.cityId = filters.cityId;
  if (filters.crewId) params.crewId = filters.crewId;
  if (filters.vehicleId) params.vehicleId = filters.vehicleId;
  if (filters.employeeId) params.employeeId = filters.employeeId;

  if (filters.search?.trim()) params.search = filters.search.trim();

  if (filters.dateFrom) {
    params.dateFrom = `${filters.dateFrom}T00:00:00.000Z`;
  }

  if (filters.dateTo) {
    params.dateTo = `${filters.dateTo}T23:59:59.999Z`;
  }

  return params;
}

export async function getCrewsTableReport(
  filters: CrewsTableFilters
): Promise<CrewsTableResponse> {
  const response = await http.get<CrewsTableResponse>(
    "/api/admin/reports/crews-table",
    {
      params: buildCrewsTableParams(filters),
    }
  );

  return response.data;
}

export async function downloadCrewsTableExcel(filters: CrewsTableFilters) {
  const response = await http.get("/api/admin/reports/crews-table/export/excel", {
    params: buildCrewsTableParams(filters),
    responseType: "blob",
  });

  const blob = new Blob([response.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  const from = filters.dateFrom || "all";
  const to = filters.dateTo || "all";

  link.href = url;
  link.download = `crews-report-${from}-${to}.xlsx`;

  document.body.appendChild(link);
  link.click();

  link.remove();
  window.URL.revokeObjectURL(url);
}

export type VehiclesTableFilters = ReportFilters & {
  page?: number;
  pageSize?: number;
  sortBy?:
  | "vehicleTitle"
  | "totalShifts"
  | "totalTrips"
  | "totalAlarms"
  | "averageDistancePerShift"
  | "totalDistanceKm"
  | "detained"
  | "transferred";
  sortDir?: "asc" | "desc";

  crewId?: number;
  vehicleId?: number;
  employeeId?: number;

  search?: string;
};

export type VehicleTableRow = {
  vehicleId: number;
  vehicleTitle: string;
  licensePlate: string | null;
  cityId: number;
  cityName: string;

  totalShifts: number;
  totalTrips: number;
  totalDistanceKm: number;
  averageDistancePerShift: number;

  odometerStartFirstShift: number | null;
  odometerEndLastShift: number | null;
  firstShiftDate: string | null;
  lastShiftDate: string | null;

  totalAlarms: number;
  totalOh: number;
  totalPartner: number;

  combatTotal: number;
  falseTotal: number;

  additionalTotal: number;
  additionalOh: number;
  additionalPartner: number;

  detained: number;
  transferred: number;

  additionalByReason: Record<
    string,
    {
      total: number;
      oh: number;
      partner: number;
    }
  >;

  distanceByGoal: Record<string, number>;
};

export type VehiclesTableResponse = {
  filters: VehiclesTableFilters;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    totalVehicles: number;
    totalShifts: number;
    totalTrips: number;
    totalAlarms: number;
    totalOh: number;
    totalPartner: number;
    combatTotal: number;
    falseTotal: number;
    additionalTotal: number;
    detained: number;
    transferred: number;
    totalDistanceKm: number;
  };
  data: VehicleTableRow[];
};

function buildVehiclesTableParams(filters: VehiclesTableFilters) {
  const params: Record<string, string | number> = {};

  if (filters.page) params.page = filters.page;
  if (filters.pageSize) params.pageSize = filters.pageSize;
  if (filters.sortBy) params.sortBy = filters.sortBy;
  if (filters.sortDir) params.sortDir = filters.sortDir;

  if (filters.cityId) params.cityId = filters.cityId;
  if (filters.crewId) params.crewId = filters.crewId;
  if (filters.vehicleId) params.vehicleId = filters.vehicleId;
  if (filters.employeeId) params.employeeId = filters.employeeId;

  if (filters.search?.trim()) params.search = filters.search.trim();

  if (filters.dateFrom) {
    params.dateFrom = `${filters.dateFrom}T00:00:00.000Z`;
  }

  if (filters.dateTo) {
    params.dateTo = `${filters.dateTo}T23:59:59.999Z`;
  }

  return params;
}

export async function getVehiclesTableReport(
  filters: VehiclesTableFilters
): Promise<VehiclesTableResponse> {
  const response = await http.get<VehiclesTableResponse>(
    "/api/admin/reports/vehicles-table",
    {
      params: buildVehiclesTableParams(filters),
    }
  );

  return response.data;
}

export async function downloadVehiclesTableExcel(
  filters: VehiclesTableFilters
) {
  const response = await http.get(
    "/api/admin/reports/vehicles-table/export/excel",
    {
      params: buildVehiclesTableParams(filters),
      responseType: "blob",
    }
  );

  const blob = new Blob([response.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  const from = filters.dateFrom || "all";
  const to = filters.dateTo || "all";

  link.href = url;
  link.download = `vehicles-report-${from}-${to}.xlsx`;

  document.body.appendChild(link);
  link.click();

  link.remove();
  window.URL.revokeObjectURL(url);
}

export type AlarmsReportFilters = ReportFilters & {
  crewId?: number;
  vehicleId?: number;
  employeeId?: number;
  search?: string;
};

export type AlarmReportTotals = {
  totalAlarms: number;
  totalOh: number;
  totalPartner: number;

  falseTotal: number;
  falseOh: number;
  falsePartner: number;

  combatTotal: number;
  combatOh: number;
  combatPartner: number;

  additionalTotal: number;
  additionalOh: number;
  additionalPartner: number;

  detained: number;
  transferred: number;

  totalShifts: number;
  totalTrips: number;
  totalDistanceKm: number;
};

export type AlarmReasonRow = {
  reasonName: string;
  total: number;
  oh: number;
  partner: number;
};

export type AlarmGroupRow = AlarmReportTotals & {
  key: string;
  name: string;
};

export type AlarmsReportResponse = {
  filters: AlarmsReportFilters;
  data: {
    totals: AlarmReportTotals;
    additionalByReason: AlarmReasonRow[];
    byCity: AlarmGroupRow[];
    byMonth: AlarmGroupRow[];
  };
};

function buildAlarmsReportParams(filters: AlarmsReportFilters) {
  const params: Record<string, string | number> = {};

  if (filters.cityId) params.cityId = filters.cityId;
  if (filters.crewId) params.crewId = filters.crewId;
  if (filters.vehicleId) params.vehicleId = filters.vehicleId;
  if (filters.employeeId) params.employeeId = filters.employeeId;

  if (filters.search?.trim()) params.search = filters.search.trim();

  if (filters.dateFrom) {
    params.dateFrom = `${filters.dateFrom}T00:00:00.000Z`;
  }

  if (filters.dateTo) {
    params.dateTo = `${filters.dateTo}T23:59:59.999Z`;
  }

  return params;
}

export async function getAlarmsReport(
  filters: AlarmsReportFilters
): Promise<AlarmsReportResponse> {
  const response = await http.get<AlarmsReportResponse>(
    "/api/admin/reports/alarms",
    {
      params: buildAlarmsReportParams(filters),
    }
  );

  return response.data;
}

export async function downloadAlarmsReportExcel(filters: AlarmsReportFilters) {
  const response = await http.get("/api/admin/reports/alarms/export/excel", {
    params: buildAlarmsReportParams(filters),
    responseType: "blob",
  });

  const blob = new Blob([response.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  const from = filters.dateFrom || "all";
  const to = filters.dateTo || "all";

  link.href = url;
  link.download = `alarms-report-${from}-${to}.xlsx`;

  document.body.appendChild(link);
  link.click();

  link.remove();
  window.URL.revokeObjectURL(url);
}