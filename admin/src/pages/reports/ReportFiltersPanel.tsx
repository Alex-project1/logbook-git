import { useEffect, useState } from "react";
import { getCities } from "../../api/cities.api";
import type { City } from "../../api/cities.api";
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

  useEffect(() => {
    async function loadCities() {
      const data = await getCities(false);
      setCities(data);
    }

    loadCities();
  }, []);

  return (
    <div className="report-filters panel-card">
      <div className="report-filters-grid">
        <label className="field">
          <span>Дата от</span>
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
          <span>Город</span>
          <select
            value={value.cityId ?? 0}
            onChange={(event) =>
              onChange({
                ...value,
                cityId: Number(event.target.value) || undefined,
              })
            }
          >
            <option value={0}>Все города</option>

            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
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