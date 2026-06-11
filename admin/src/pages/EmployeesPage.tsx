import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { getAdminMe } from "../api/auth.api";
import type { AdminUser } from "../api/auth.api";
import { getAccessibleCities } from "../api/cities.api";
import type { City } from "../api/cities.api";
import { getDepartments } from "../api/departments.api";
import type { Department } from "../api/departments.api";
import {
  createEmployee,
  deleteEmployee,
  getEmployees,
  restoreEmployee,
  updateEmployee,
} from "../api/employees.api";
import type { Employee } from "../api/employees.api";
import { RowActionMenu } from "../components/RowActionMenu";

type FormState = {
  cityId: number;
  departmentId: number;
  fullName: string;
  position: string;
  comment: string;
  isActive: boolean;
};

const initialForm: FormState = {
  cityId: 0,
  departmentId: 0,
  fullName: "",
  position: "",
  comment: "",
  isActive: true,
};

const departmentTypeLabels: Record<string, string> = {
  GBR: "ГШР",
  POST: "Пост",
  OTHER: "Інше",
};

function getErrorMessage(error: unknown, fallback: string) {
  const maybe = error as { response?: { data?: { message?: string } } };
  return maybe.response?.data?.message || fallback;
}

export function EmployeesPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [selectedCityId, setSelectedCityId] = useState(0);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(0);
  const [showArchive, setShowArchive] = useState(false);

  const [form, setForm] = useState<FormState>(initialForm);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);

  const activeCities = useMemo(() => cities.filter((city) => city.isActive), [cities]);

  const formDepartments = useMemo(
    () => departments.filter((department) => department.isActive && department.cityId === form.cityId),
    [departments, form.cityId],
  );

  const filterDepartments = useMemo(
    () => departments.filter((department) => !selectedCityId || department.cityId === selectedCityId),
    [departments, selectedCityId],
  );

  const roleCode = currentUser?.role?.code;
  const canEdit = roleCode === "super_admin" || roleCode === "admin";

  async function loadEmployees(cityId = selectedCityId, departmentId = selectedDepartmentId, archive = showArchive) {
    const data = await getEmployees({
      cityId: cityId || undefined,
      departmentId: departmentId || undefined,
      archive,
      includeInactive: true,
    });
    setEmployees(data);
  }

  async function loadInitialData() {
    setLoading(true);
    setError("");

    try {
      const [me, citiesData, departmentsData] = await Promise.all([
        getAdminMe().catch(() => null),
        getAccessibleCities(),
        getDepartments({ includeInactive: true }),
      ]);

      setCurrentUser(me?.user ?? null);
      setCities(citiesData);
      setDepartments(departmentsData);

      const firstCityId = citiesData[0]?.id ?? 0;
      const firstDepartmentId = departmentsData.find((department) => department.cityId === firstCityId)?.id ?? 0;

      setForm((prev) => ({
        ...prev,
        cityId: prev.cityId || firstCityId,
        departmentId: prev.departmentId || firstDepartmentId,
      }));

      const employeesData = await getEmployees({ includeInactive: true });
      setEmployees(employeesData);
    } catch (caught) {
      setError(getErrorMessage(caught, "Не вдалося завантажити співробітників"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInitialData();
  }, []);

  function resetForm() {
    const cityId = selectedCityId || activeCities[0]?.id || 0;
    const departmentId = departments.find((department) => department.cityId === cityId && department.isActive)?.id ?? 0;
    setEditingEmployee(null);
    setForm({ ...initialForm, cityId, departmentId });
    setError("");
  }

  function handleFormCityChange(cityId: number) {
    const departmentId = departments.find((department) => department.cityId === cityId && department.isActive)?.id ?? 0;
    setForm((prev) => ({ ...prev, cityId, departmentId }));
  }

  function startEdit(employee: Employee) {
    setEditingEmployee(employee);
    setForm({
      cityId: employee.cityId,
      departmentId: employee.departmentId,
      fullName: employee.fullName,
      position: employee.position || "",
      comment: employee.comment || "",
      isActive: employee.isActive,
    });
    setError("");
    setSuccess("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.cityId) return setError("Оберіть місто");
    if (!form.departmentId) return setError("Оберіть підрозділ");
    if (!form.fullName.trim()) return setError("Введіть ПІБ співробітника");

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        cityId: form.cityId,
        departmentId: form.departmentId,
        fullName: form.fullName.trim(),
        position: form.position.trim() || null,
        comment: form.comment.trim() || null,
        isActive: form.isActive,
      };

      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, payload);
        setSuccess("Співробітника оновлено");
      } else {
        await createEmployee(payload);
        setSuccess("Співробітника додано");
      }

      resetForm();
      await loadEmployees();
    } catch (caught) {
      setError(getErrorMessage(caught, "Не вдалося зберегти співробітника"));
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(employee: Employee) {
    if (!window.confirm(`Перемістити співробітника "${employee.fullName}" до архіву?`)) return;
    try {
      await deleteEmployee(employee.id);
      setSuccess("Співробітника переміщено до архіву");
      await loadEmployees();
    } catch (caught) {
      setError(getErrorMessage(caught, "Не вдалося перемістити співробітника до архіву"));
    }
  }

  async function handleRestore(employee: Employee) {
    try {
      await restoreEmployee(employee.id);
      setSuccess("Співробітника відновлено");
      await loadEmployees();
    } catch (caught) {
      setError(getErrorMessage(caught, "Не вдалося відновити співробітника"));
    }
  }

  async function handleCityFilterChange(cityId: number) {
    setSelectedCityId(cityId);
    setSelectedDepartmentId(0);
    setForm((prev) => ({
      ...prev,
      cityId: cityId || activeCities[0]?.id || 0,
      departmentId: departments.find((department) => department.cityId === (cityId || activeCities[0]?.id || 0) && department.isActive)?.id ?? 0,
    }));
    await loadEmployees(cityId, 0, showArchive);
  }

  async function handleDepartmentFilterChange(departmentId: number) {
    setSelectedDepartmentId(departmentId);
    await loadEmployees(selectedCityId, departmentId, showArchive);
  }

  async function handleArchiveFilterChange(value: string) {
    const archive = value === "archive";
    setShowArchive(archive);
    setEditingEmployee(null);
    await loadEmployees(selectedCityId, selectedDepartmentId, archive);
  }

  return (
    <div className="page-card">
      <div className="page-header">
        <div>
          <h1>Співробітники</h1>
          <p>Співробітники за містом і підрозділами.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {canEdit && !showArchive && (
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Місто
            <select value={form.cityId} onChange={(event) => handleFormCityChange(Number(event.target.value))}>
              <option value={0}>Оберіть місто</option>
              {activeCities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
            </select>
          </label>

          <label>
            Підрозділ
            <select value={form.departmentId} onChange={(event) => setForm((prev) => ({ ...prev, departmentId: Number(event.target.value) }))}>
              <option value={0}>Оберіть підрозділ</option>
              {formDepartments.map((department) => (
                <option key={department.id} value={department.id}>{department.name} · {departmentTypeLabels[department.type]}</option>
              ))}
            </select>
          </label>

          <label>
            ПІБ
            <input value={form.fullName} onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))} />
          </label>

          <label>
            Посада
            <input value={form.position} onChange={(event) => setForm((prev) => ({ ...prev, position: event.target.value }))} />
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
            <button type="submit" disabled={saving}>{saving ? "Збереження..." : editingEmployee ? "Оновити" : "Додати"}</button>
            {editingEmployee && <button type="button" className="secondary-button" onClick={resetForm}>Скасувати</button>}
          </div>
        </form>
      )}

      <div className="filters-row">
        <label>
          Місто
          <select value={selectedCityId} onChange={(event) => handleCityFilterChange(Number(event.target.value))}>
            <option value={0}>Усі міста</option>
            {cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
          </select>
        </label>

        <label>
          Підрозділ
          <select value={selectedDepartmentId} onChange={(event) => handleDepartmentFilterChange(Number(event.target.value))}>
            <option value={0}>Усі підрозділи</option>
            {filterDepartments.map((department) => <option key={department.id} value={department.id}>{department.name} · {departmentTypeLabels[department.type]}</option>)}
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

      {loading ? <p>Завантаження...</p> : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ПІБ</th><th>Місто</th><th>Підрозділ</th><th>Посада</th><th>Коментар</th><th>Статус</th><th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td>{employee.fullName}</td>
                  <td>{employee.city?.name || employee.cityId}</td>
                  <td>{employee.department?.name || employee.departmentId}</td>
                  <td>{employee.position || "—"}</td>
                  <td>{employee.comment || "—"}</td>
                  <td>{employee.deletedAt ? "Архів" : employee.isActive ? "Активний" : "Вимкнений"}</td>
                  <td>
                    {canEdit && <RowActionMenu items={showArchive ? [{ label: "Відновити", onClick: () => handleRestore(employee), variant: "edit" }] : [
                      { label: "Редагувати", onClick: () => startEdit(employee), variant: "edit" },
                      { label: "До архіву", onClick: () => handleArchive(employee), variant: "danger" },
                    ]} />}
                  </td>
                </tr>
              ))}
              {employees.length === 0 && <tr><td colSpan={7}>Немає співробітників</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}