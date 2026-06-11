import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { getAccessibleCities } from "../api/cities.api";
import type { City } from "../api/cities.api";
import {
  archiveDepartment,
  createDepartment,
  getDepartments,
  restoreDepartment,
  updateDepartment,
} from "../api/departments.api";
import type { Department, DepartmentType } from "../api/departments.api";
import { RowActionMenu } from "../components/RowActionMenu";

type FormState = {
  cityId: number;
  name: string;
  type: DepartmentType;
  comment: string;
  isActive: boolean;
};

const initialForm: FormState = {
  cityId: 0,
  name: "",
  type: "OTHER",
  comment: "",
  isActive: true,
};

const typeLabels: Record<DepartmentType, string> = {
  GBR: "ГШР",
  POST: "Пости",
  OTHER: "Інше",
};

export function DepartmentsPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedCityId, setSelectedCityId] = useState(0);
  const [showArchive, setShowArchive] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeCities = useMemo(() => cities.filter((city) => city.isActive), [cities]);

  async function loadAll(cityId = selectedCityId, archive = showArchive) {
    setError("");
    const data = await getDepartments({ cityId: cityId || undefined, archive, includeInactive: true });
    setDepartments(data);
  }

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const citiesData = await getAccessibleCities();
        setCities(citiesData);
        setForm((prev) => ({ ...prev, cityId: citiesData[0]?.id ?? 0 }));
        const data = await getDepartments({ includeInactive: true });
        setDepartments(data);
      } catch {
        setError("Не вдалося завантажити підрозділи");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  function resetForm() {
    setEditingDepartment(null);
    setForm({ ...initialForm, cityId: selectedCityId || activeCities[0]?.id || 0 });
    setError("");
    setSuccess("");
  }

  function startEdit(department: Department) {
    setEditingDepartment(department);
    setForm({
      cityId: department.cityId,
      name: department.name,
      type: department.type,
      comment: department.comment || "",
      isActive: department.isActive,
    });
    setError("");
    setSuccess("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.cityId) {
      setError("Оберіть місто");
      return;
    }

    if (!form.name.trim()) {
      setError("Вкажіть назву підрозділу");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        cityId: form.cityId,
        name: form.name.trim(),
        type: form.type,
        comment: form.comment.trim() || null,
        isActive: form.isActive,
      };

      if (editingDepartment) {
        await updateDepartment(editingDepartment.id, payload);
        setSuccess("Підрозділ оновлено");
      } else {
        await createDepartment(payload);
        setSuccess("Підрозділ створено");
      }

      resetForm();
      await loadAll();
    } catch (caught: any) {
      setError(caught?.response?.data?.message || "Не вдалося зберегти підрозділ");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(department: Department) {
    if (department.isSystem) {
      setError("Системний підрозділ не можна архівувати");
      return;
    }

    if (!confirm(`Перемістити підрозділ "${department.name}" до архіву?`)) return;

    try {
      await archiveDepartment(department.id);
      setSuccess("Підрозділ переміщено до архіву");
      await loadAll();
    } catch (caught: any) {
      setError(caught?.response?.data?.message || "Не вдалося архівувати підрозділ");
    }
  }

  async function handleRestore(department: Department) {
    try {
      await restoreDepartment(department.id);
      setSuccess("Підрозділ відновлено");
      await loadAll();
    } catch (caught: any) {
      setError(caught?.response?.data?.message || "Не вдалося відновити підрозділ");
    }
  }

  async function handleCityFilterChange(cityId: number) {
    setSelectedCityId(cityId);
    setForm((prev) => ({ ...prev, cityId: cityId || activeCities[0]?.id || 0 }));
    await loadAll(cityId, showArchive);
  }

  async function handleArchiveFilterChange(value: string) {
    const archive = value === "archive";
    setShowArchive(archive);
    setEditingDepartment(null);
    await loadAll(selectedCityId, archive);
  }

  return (
    <div className="page-card">
      <div className="page-header">
        <div>
          <h1>Підрозділи</h1>
          <p>Керуйте підрозділами за містами. Системний ГШР створюється автоматично.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Місто
          <select value={form.cityId} onChange={(event) => setForm((prev) => ({ ...prev, cityId: Number(event.target.value) }))} disabled={Boolean(editingDepartment?.isSystem)}>
            <option value={0}>Оберіть місто</option>
            {activeCities.map((city) => (
              <option key={city.id} value={city.id}>{city.name}</option>
            ))}
          </select>
        </label>

        <label>
          Тип
          <select value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as DepartmentType }))} disabled={Boolean(editingDepartment?.isSystem)}>
            <option value="GBR">ГШР</option>
            <option value="POST">Пости</option>
            <option value="OTHER">Інше</option>
          </select>
        </label>

        <label>
          Назва
          <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
        </label>

        <label>
          Коментар
          <input value={form.comment} onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))} />
        </label>

        <label className="checkbox-row">
          <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))} />
          Активний
        </label>

        <div className="form-actions">
          <button type="submit" disabled={saving}>{saving ? "Збереження..." : editingDepartment ? "Оновити" : "Додати"}</button>
          {editingDepartment && <button type="button" className="secondary-button" onClick={resetForm}>Скасувати</button>}
        </div>
      </form>

      <div className="filters-row">
        <label>
          Фільтр міста
          <select value={selectedCityId} onChange={(event) => handleCityFilterChange(Number(event.target.value))}>
            <option value={0}>Усі міста</option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>{city.name}</option>
            ))}
          </select>
        </label>

        <label>
          Стан
          <select value={showArchive ? "archive" : "active"} onChange={(event) => handleArchiveFilterChange(event.target.value)}>
            <option value="active">Активні</option>
            <option value="archive">Архів</option>
          </select>
        </label>
      </div>

      {loading ? (
        <p>Завантаження...</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Місто</th>
                <th>Підрозділ</th>
                <th>Тип</th>
                <th>Системний</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {departments.map((department) => (
                <tr key={department.id}>
                  <td>{department.city?.name || department.cityId}</td>
                  <td>{department.name}</td>
                  <td>{typeLabels[department.type]}</td>
                  <td>{department.isSystem ? "Так" : "Ні"}</td>
                  <td>{department.deletedAt ? "Архів" : department.isActive ? "Активний" : "Неактивний"}</td>
                  <td className="table-actions-cell">
                    <RowActionMenu
                      items={
                        department.deletedAt
                          ? [{ label: "Відновити", onClick: () => handleRestore(department), variant: "edit" }]
                          : [
                              { label: "Редагувати", onClick: () => startEdit(department), variant: "edit" },
                              ...(!department.isSystem ? [{ label: "До архіву", variant: "danger" as const, onClick: () => handleArchive(department) }] : []),
                            ]
                      }
                    />
                  </td>
                </tr>
              ))}

              {departments.length === 0 && (
                <tr>
                  <td colSpan={6}>Підрозділів немає</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}