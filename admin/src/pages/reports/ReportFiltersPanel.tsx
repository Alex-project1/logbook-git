import { useEffect, useMemo, useState } from "react";
import { getCities } from "../../api/cities.api";
import type { City } from "../../api/cities.api";
import { getDepartments } from "../../api/departments.api";
import type { Department } from "../../api/departments.api";
import { dedupeDepartments, formatDepartmentOption } from "../../utils/department-options";
import type { ReportFilters } from "../../api/reports.api";

type Props = {
  value: ReportFilters;
  onChange: (filters: ReportFilters) => void;
  onApply: () => void;
  onReset: () => void;
  onExcel?: () => void;
  loading?: boolean;
  excelLoading?: boolean;
};

export function ReportFiltersPanel({
  value,
  onChange,
  onApply,
  onReset,
  onExcel,
  loading,
  excelLoading,
}: Props) {
  const [cities, setCities] = useState<City[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  useEffect(() => {
    async function loadReferences() {
      const [citiesData, departmentsData] = await Promise.all([
        getCities(false),
        getDepartments({ includeInactive: true }),
      ]);

      setCities(citiesData);
      setDepartments(departmentsData);
    }

    loadReferences();
  }, []);

  const visibleDepartments = useMemo(() => {
    return dedupeDepartments(
      departments.filter((department) => {
        if (department.deletedAt || !department.isActive) return false;
        if (value.cityId && department.cityId !== value.cityId) return false;
        return true;
      }),
    );
  }, [departments, value.cityId]);

  return (
    <div className="report-filters panel-card">
      <div className="report-filters-grid">
        <label className="field">
          <span>Дата від</span>
          <input
            type="date"
            value={value.dateFrom ?? ""}
            onChange={(event) =>
              onChange({
                ...value,
                dateFrom: event.target.value || undefined,
              })
            }
          />
        </label>

        <label className="field">
          <span>Дата до</span>
          <input
            type="date"
            value={value.dateTo ?? ""}
            onChange={(event) =>
              onChange({
                ...value,
                dateTo: event.target.value || undefined,
              })
            }
          />
        </label>

        <label className="field">
          <span>Місто</span>
          <select
            value={value.cityId ?? 0}
            onChange={(event) =>
              onChange({
                ...value,
                cityId: Number(event.target.value) || undefined,
                departmentId: undefined,
              })
            }
          >
            <option value={0}>Усі міста</option>

            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Підрозділ</span>
          <select
            value={value.departmentId ?? 0}
            onChange={(event) =>
              onChange({
                ...value,
                departmentId: Number(event.target.value) || undefined,
              })
            }
          >
            <option value={0}>Усі підрозділи</option>

            {visibleDepartments.map((department) => (
              <option key={department.id} value={department.id}>
                {formatDepartmentOption(department, { showCity: !value.cityId, showType: false })}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="report-filter-actions">
        <button className="primary-button" onClick={onApply} disabled={loading}>
          {loading ? "Формируем..." : "Сформировать"}
        </button>

        <button className="secondary-button" onClick={onReset}>
          Сбросить
        </button>

        {onExcel && (
          <button
            className="secondary-button"
            onClick={onExcel}
            disabled={excelLoading}
          >
            {excelLoading ? "Скачивание..." : "Скачать Excel"}
          </button>
        )}
      </div>
    </div>
  );
}
