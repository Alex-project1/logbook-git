import type { Department } from "../api/departments.api";

export function getDepartmentTypeLabel(type?: string) {
  const labels: Record<string, string> = {
    GBR: "ГШР",
    POST: "Постове",
    OTHER: "Інше",
  };

  return type ? labels[type] ?? type : "—";
}

function normalizeDepartmentName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function dedupeDepartments(departments: Department[]) {
  const map = new Map<string, Department>();

  for (const department of departments) {
    const key = [
      department.cityId,
      department.type,
      normalizeDepartmentName(department.name),
    ].join(":" );

    const existing = map.get(key);

    if (!existing) {
      map.set(key, department);
      continue;
    }

    // Prefer active, non-archived system departments, then the smallest id.
    const existingScore = Number(Boolean(existing.isActive)) * 4 +
      Number(!existing.deletedAt) * 2 +
      Number(Boolean(existing.isSystem));
    const currentScore = Number(Boolean(department.isActive)) * 4 +
      Number(!department.deletedAt) * 2 +
      Number(Boolean(department.isSystem));

    if (
      currentScore > existingScore ||
      (currentScore === existingScore && department.id < existing.id)
    ) {
      map.set(key, department);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const cityCompare = (a.city?.name ?? "").localeCompare(b.city?.name ?? "");
    if (cityCompare !== 0) return cityCompare;

    const typeCompare = getDepartmentTypeLabel(a.type).localeCompare(getDepartmentTypeLabel(b.type));
    if (typeCompare !== 0) return typeCompare;

    return a.name.localeCompare(b.name);
  });
}

export function formatDepartmentOption(
  department: Pick<Department, "id" | "name" | "type"> & {
    cityId?: number;
    city?: { id: number; name: string };
  },
  options?: { showCity?: boolean; showType?: boolean },
) {
  const showCity = Boolean(options?.showCity);
  const showType = options?.showType !== false;

  const parts: string[] = [];

  if (showCity) {
    const cityLabel = department.city?.name || (department.cityId ? `Місто #${department.cityId}` : "");

    if (cityLabel) {
      parts.push(cityLabel);
    }
  }

  parts.push(department.name);

  if (showType && department.type !== "GBR") {
    parts.push(getDepartmentTypeLabel(department.type));
  }

  return parts.join(" · ");
}