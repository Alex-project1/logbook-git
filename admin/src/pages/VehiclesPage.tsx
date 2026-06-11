import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { getAdminMe } from "../api/auth.api";
import type { AdminUser } from "../api/auth.api";
import { getAccessibleCities } from "../api/cities.api";
import type { City } from "../api/cities.api";
import { getDepartments } from "../api/departments.api";
import type { Department } from "../api/departments.api";
import { createVehicle, deleteVehicle, getVehicles, restoreVehicle, updateVehicle } from "../api/vehicles.api";
import type { Vehicle } from "../api/vehicles.api";
import { RowActionMenu } from "../components/RowActionMenu";

type FormState = {
  cityId: number;
  departmentId: number;
  title: string;
  licensePlate: string;
  startOdometer: string;
  comment: string;
  isActive: boolean;
};

const initialForm: FormState = {
  cityId: 0,
  departmentId: 0,
  title: "",
  licensePlate: "",
  startOdometer: "",
  comment: "",
  isActive: true,
};

const departmentTypeLabels: Record<string, string> = { GBR: "ГШР", POST: "Пост", OTHER: "Інше" };

function getErrorMessage(error: unknown, fallback: string) {
  const maybe = error as { response?: { data?: { message?: string } } };
  return maybe.response?.data?.message || fallback;
}

export function VehiclesPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedCityId, setSelectedCityId] = useState(0);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(0);
  const [showArchive, setShowArchive] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeCities = useMemo(() => cities.filter((city) => city.isActive), [cities]);
  const formDepartments = useMemo(() => departments.filter((department) => department.isActive && department.cityId === form.cityId), [departments, form.cityId]);
  const filterDepartments = useMemo(() => departments.filter((department) => !selectedCityId || department.cityId === selectedCityId), [departments, selectedCityId]);
  const roleCode = currentUser?.role?.code;
  const canEdit = roleCode === "super_admin" || roleCode === "admin";

  async function loadVehicles(cityId = selectedCityId, departmentId = selectedDepartmentId, archive = showArchive) {
    const data = await getVehicles({ cityId: cityId || undefined, departmentId: departmentId || undefined, archive, includeInactive: true });
    setVehicles(data);
  }

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
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
        setForm((prev) => ({ ...prev, cityId: prev.cityId || firstCityId, departmentId: prev.departmentId || firstDepartmentId }));
        const vehiclesData = await getVehicles({ includeInactive: true });
        setVehicles(vehiclesData);
      } catch (caught) {
        setError(getErrorMessage(caught, "Не вдалося завантажити автомобілі"));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function resetForm() {
    const cityId = selectedCityId || activeCities[0]?.id || 0;
    const departmentId = departments.find((department) => department.cityId === cityId && department.isActive)?.id ?? 0;
    setEditingVehicle(null);
    setForm({ ...initialForm, cityId, departmentId });
    setError("");
  }

  function handleFormCityChange(cityId: number) {
    const departmentId = departments.find((department) => department.cityId === cityId && department.isActive)?.id ?? 0;
    setForm((prev) => ({ ...prev, cityId, departmentId }));
  }

  function startEdit(vehicle: Vehicle) {
    setEditingVehicle(vehicle);
    setForm({
      cityId: vehicle.cityId,
      departmentId: vehicle.departmentId,
      title: vehicle.title,
      licensePlate: vehicle.licensePlate || "",
      startOdometer: vehicle.startOdometer == null ? "" : String(vehicle.startOdometer),
      comment: vehicle.comment || "",
      isActive: vehicle.isActive,
    });
    setError("");
    setSuccess("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.cityId) return setError("Оберіть місто");
    if (!form.departmentId) return setError("Оберіть підрозділ");
    if (!form.title.trim()) return setError("Введіть назву автомобіля");
    const startOdometer = form.startOdometer.trim() ? Number(form.startOdometer) : null;
    if (startOdometer !== null && (!Number.isInteger(startOdometer) || startOdometer < 0)) return setError("Початковий пробіг має бути цілим числом від 0");

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        cityId: form.cityId,
        departmentId: form.departmentId,
        title: form.title.trim(),
        licensePlate: form.licensePlate.trim() || null,
        startOdometer,
        comment: form.comment.trim() || null,
        isActive: form.isActive,
      };
      if (editingVehicle) {
        await updateVehicle(editingVehicle.id, payload);
        setSuccess("Автомобіль оновлено");
      } else {
        await createVehicle(payload);
        setSuccess("Автомобіль додано");
      }
      resetForm();
      await loadVehicles();
    } catch (caught) {
      setError(getErrorMessage(caught, "Не вдалося зберегти автомобіль"));
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(vehicle: Vehicle) {
    if (!window.confirm(`Перемістити автомобіль "${vehicle.title}" до архіву?`)) return;
    try {
      await deleteVehicle(vehicle.id);
      setSuccess("Автомобіль переміщено до архіву");
      await loadVehicles();
    } catch (caught) {
      setError(getErrorMessage(caught, "Не вдалося перемістити автомобіль до архіву"));
    }
  }

  async function handleRestore(vehicle: Vehicle) {
    try {
      await restoreVehicle(vehicle.id);
      setSuccess("Автомобіль відновлено");
      await loadVehicles();
    } catch (caught) {
      setError(getErrorMessage(caught, "Не вдалося відновити автомобіль"));
    }
  }

  async function handleCityFilterChange(cityId: number) {
    setSelectedCityId(cityId);
    setSelectedDepartmentId(0);
    setForm((prev) => ({ ...prev, cityId: cityId || activeCities[0]?.id || 0, departmentId: departments.find((department) => department.cityId === (cityId || activeCities[0]?.id || 0) && department.isActive)?.id ?? 0 }));
    await loadVehicles(cityId, 0, showArchive);
  }

  async function handleDepartmentFilterChange(departmentId: number) {
    setSelectedDepartmentId(departmentId);
    await loadVehicles(selectedCityId, departmentId, showArchive);
  }

  async function handleArchiveFilterChange(value: string) {
    const archive = value === "archive";
    setShowArchive(archive);
    setEditingVehicle(null);
    await loadVehicles(selectedCityId, selectedDepartmentId, archive);
  }

  return (
    <div className="page-card">
      <div className="page-header"><div><h1>Автомобілі</h1><p>Авто прив’язані до міста та підрозділу. Перенесення авто не змінює історію звітів.</p></div></div>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {canEdit && !showArchive && (
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>Місто<select value={form.cityId} onChange={(event) => handleFormCityChange(Number(event.target.value))}><option value={0}>Оберіть місто</option>{activeCities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>
          <label>Підрозділ<select value={form.departmentId} onChange={(event) => setForm((prev) => ({ ...prev, departmentId: Number(event.target.value) }))}><option value={0}>Оберіть підрозділ</option>{formDepartments.map((department) => <option key={department.id} value={department.id}>{department.name} · {departmentTypeLabels[department.type]}</option>)}</select></label>
          <label>Назва<input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} /></label>
          <label>Державний номер<input value={form.licensePlate} onChange={(event) => setForm((prev) => ({ ...prev, licensePlate: event.target.value }))} /></label>
          <label>Початковий пробіг<input value={form.startOdometer} onChange={(event) => setForm((prev) => ({ ...prev, startOdometer: event.target.value.replace(/\D/g, "") }))} /></label>
          <label>Коментар<input value={form.comment} onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))} /></label>
          <label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))} />Активний</label>
          <div className="form-actions"><button type="submit" disabled={saving}>{saving ? "Збереження..." : editingVehicle ? "Оновити" : "Додати"}</button>{editingVehicle && <button type="button" className="secondary-button" onClick={resetForm}>Скасувати</button>}</div>
        </form>
      )}

      <div className="filters-row">
        <label>Місто<select value={selectedCityId} onChange={(event) => handleCityFilterChange(Number(event.target.value))}><option value={0}>Усі міста</option>{cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>
        <label>Підрозділ<select value={selectedDepartmentId} onChange={(event) => handleDepartmentFilterChange(Number(event.target.value))}><option value={0}>Усі підрозділи</option>{filterDepartments.map((department) => <option key={department.id} value={department.id}>{department.name} · {departmentTypeLabels[department.type]}</option>)}</select></label>
        <label>Стан<select value={showArchive ? "archive" : "active"} onChange={(event) => handleArchiveFilterChange(event.target.value)}><option value="active">Активні</option><option value="archive">Архів</option></select></label>
      </div>

      {loading ? <p>Завантаження...</p> : <div className="table-wrapper"><table><thead><tr><th>Авто</th><th>Номер</th><th>Місто</th><th>Підрозділ</th><th>Пробіг</th><th>Коментар</th><th>Статус</th><th></th></tr></thead><tbody>{vehicles.map((vehicle) => <tr key={vehicle.id}><td>{vehicle.title}</td><td>{vehicle.licensePlate || "—"}</td><td>{vehicle.city?.name || vehicle.cityId}</td><td>{vehicle.department?.name || vehicle.departmentId}</td><td>{vehicle.startOdometer ?? "—"}</td><td>{vehicle.comment || "—"}</td><td>{vehicle.deletedAt ? "Архів" : vehicle.isActive ? "Активний" : "Вимкнений"}</td><td>{canEdit && <RowActionMenu items={showArchive ? [{ label: "Відновити", onClick: () => handleRestore(vehicle), variant: "edit" }] : [{ label: "Редагувати", onClick: () => startEdit(vehicle), variant: "edit" }, { label: "До архіву", onClick: () => handleArchive(vehicle), variant: "danger" }]} />}</td></tr>)}{vehicles.length === 0 && <tr><td colSpan={8}>Немає автомобілів</td></tr>}</tbody></table></div>}
    </div>
  );
}