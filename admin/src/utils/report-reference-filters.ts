export type ReportScopeFilters = {
  cityId?: number;
  departmentId?: number;
};

export type ScopedReference = {
  cityId?: number | null;
  departmentId?: number | null;
  isActive?: boolean;
  deletedAt?: string | null;
};

export function matchesReportScope<T extends ScopedReference>(
  item: T,
  filters: ReportScopeFilters,
) {
  if (item.deletedAt) return false;
  if (item.isActive === false) return false;
  if (filters.cityId && item.cityId !== filters.cityId) return false;
  if (filters.departmentId && item.departmentId !== filters.departmentId) return false;
  return true;
}

export function filterByReportScope<T extends ScopedReference>(
  items: T[],
  filters: ReportScopeFilters,
) {
  return items.filter((item) => matchesReportScope(item, filters));
}

export function resetDependentReportFilters<T extends Record<string, unknown>>(
  filters: T,
  key: string,
) {
  if (key === "cityId") {
    return {
      ...filters,
      departmentId: undefined,
      crewId: undefined,
      vehicleId: undefined,
      employeeId: undefined,
      postId: undefined,
    };
  }

  if (key === "departmentId") {
    return {
      ...filters,
      crewId: undefined,
      vehicleId: undefined,
      employeeId: undefined,
      postId: undefined,
    };
  }

  return filters;
}
