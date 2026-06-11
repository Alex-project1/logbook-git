import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { getAdminMe } from "../api/auth.api";
import type { AdminUser } from "../api/auth.api";
import { getAccessibleCities } from "../api/cities.api";
import type { City } from "../api/cities.api";
import { getDepartments } from "../api/departments.api";
import type { Department } from "../api/departments.api";
import { dedupeDepartments, formatDepartmentOption } from "../utils/department-options";
import { createCrew, deleteCrew, getCrews, restoreCrew, updateCrew } from "../api/crews.api";
import type { Crew, CrewDutyType, CrewTransportType } from "../api/crews.api";
import { RowActionMenu } from "../components/RowActionMenu";

type FormState = {
  cityId: number;
  departmentId: number;
  name: string;
  login: string;
  password: string;
  confirmPassword: string;
  newPassword: string;
  confirmNewPassword: string;
  comment: string;
  dutyType: CrewDutyType;
  transportType: CrewTransportType;
  durationHours: string;
  isActive: boolean;
};

const initialForm: FormState = {
  cityId: 0,
  departmentId: 0,
  name: "",
  login: "",
  password: "",
  confirmPassword: "",
  newPassword: "",
  confirmNewPassword: "",
  comment: "",
  dutyType: "FULL_DAY",
  transportType: "AUTO",
  durationHours: "24",
  isActive: true,
};

const dutyTypeLabels: Record<CrewDutyType, string> = { FULL_DAY: "Добовий", DAY: "Денний", NIGHT: "Нічний" };
const transportTypeLabels: Record<CrewTransportType, string> = { AUTO: "Авто", MOTO: "Мото" };

function getErrorMessage(error: unknown, fallback: string) {
  const maybe = error as { response?: { data?: { message?: string } } };
  return maybe.response?.data?.message || fallback;
}

export function CrewsPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [selectedCityId, setSelectedCityId] = useState(0);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(0);
  const [showArchive, setShowArchive] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [editingCrew, setEditingCrew] = useState<Crew | null>(null);
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeCities = useMemo(() => cities.filter((city) => city.isActive), [cities]);
  const gbrDepartments = useMemo(
    () => dedupeDepartments(departments.filter((department) => department.isActive && !department.deletedAt && department.type === "GBR")),
    [departments],
  );
  const formDepartments = useMemo(
    () => gbrDepartments.filter((department) => department.cityId === form.cityId),
    [gbrDepartments, form.cityId],
  );
  const filterDepartments = useMemo(
    () => gbrDepartments.filter((department) => !selectedCityId || department.cityId === selectedCityId),
    [gbrDepartments, selectedCityId],
  );
  const roleCode = currentUser?.role?.code;
  const canEdit = roleCode === "super_admin" || roleCode === "admin";

  async function loadCrews(cityId = selectedCityId, departmentId = selectedDepartmentId, archive = showArchive) {
    const data = await getCrews({ cityId: cityId || undefined, departmentId: departmentId || undefined, archive, includeInactive: true });
    setCrews(data);
  }

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [me, citiesData, departmentsData] = await Promise.all([
          getAdminMe().catch(() => null),
          getAccessibleCities(),
          getDepartments({ includeInactive: true, type: "GBR" }),
        ]);
        setCurrentUser(me?.user ?? null);
        setCities(citiesData);
        setDepartments(departmentsData);
        const firstCityId = citiesData[0]?.id ?? 0;
        const firstDepartmentId = departmentsData.find((department) => department.cityId === firstCityId && department.type === "GBR")?.id ?? 0;
        setForm((prev) => ({ ...prev, cityId: prev.cityId || firstCityId, departmentId: prev.departmentId || firstDepartmentId }));
        const crewsData = await getCrews({ includeInactive: true });
        setCrews(crewsData);
      } catch (caught) {
        setError(getErrorMessage(caught, "Не вдалося завантажити наряди"));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function resetForm() {
    const cityId = selectedCityId || activeCities[0]?.id || 0;
    const departmentId = gbrDepartments.find((department) => department.cityId === cityId)?.id ?? 0;
    setEditingCrew(null);
    setForm({ ...initialForm, cityId, departmentId });
    setError("");
  }

  function handleFormCityChange(cityId: number) {
    const departmentId = gbrDepartments.find((department) => department.cityId === cityId)?.id ?? 0;
    setForm((prev) => ({ ...prev, cityId, departmentId }));
  }

  function handleDutyTypeChange(dutyType: CrewDutyType) {
    setForm((prev) => ({
      ...prev,
      dutyType,
      durationHours: dutyType === "FULL_DAY" ? "24" : prev.durationHours === "24" ? "12" : prev.durationHours,
    }));
  }

  function startEdit(crew: Crew) {
    setEditingCrew(crew);
    setForm({
      cityId: crew.cityId,
      departmentId: crew.departmentId,
      name: crew.name,
      login: crew.login || crew.mobileUser?.login || "",
      password: "",
      confirmPassword: "",
      newPassword: "",
      confirmNewPassword: "",
      comment: crew.comment || "",
      dutyType: crew.dutyType,
      transportType: crew.transportType,
      durationHours: String(crew.durationHours ?? 24),
      isActive: crew.isActive,
    });
    setError("");
    setSuccess("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.cityId) return setError("Оберіть місто");
    if (!form.departmentId) return setError("Оберіть підрозділ ГШР");
    if (!form.name.trim()) return setError("Введіть позивний наряду");
    if (!form.login.trim()) return setError("Введіть логін застосунку");

    const durationHours = form.dutyType === "FULL_DAY" ? 24 : Number(form.durationHours);
    if (!Number.isFinite(durationHours) || durationHours <= 0 || durationHours > 24) return setError("Вкажіть тривалість від 0 до 24 годин");

    if (!editingCrew) {
      if (!form.password) return setError("Введіть пароль");
      if (form.password.length < 6) return setError("Пароль має містити щонайменше 6 символів");
      if (form.password !== form.confirmPassword) return setError("Паролі не збігаються");
    }

    if (editingCrew && (form.newPassword || form.confirmNewPassword)) {
      if (form.newPassword.length < 6) return setError("Новий пароль має містити щонайменше 6 символів");
      if (form.newPassword !== form.confirmNewPassword) return setError("Нові паролі не збігаються");
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const basePayload = {
        cityId: form.cityId,
        departmentId: form.departmentId,
        name: form.name.trim(),
        login: form.login.trim(),
        comment: form.comment.trim() || null,
        dutyType: form.dutyType,
        transportType: form.transportType,
        durationHours,
        isActive: form.isActive,
      };

      if (editingCrew) {
        await updateCrew(editingCrew.id, {
          ...basePayload,
          ...(form.newPassword ? { newPassword: form.newPassword, confirmNewPassword: form.confirmNewPassword } : {}),
        });
        setSuccess("Наряд оновлено");
      } else {
        await createCrew({ ...basePayload, password: form.password, confirmPassword: form.confirmPassword });
        setSuccess("Наряд створено. Логін і пароль можна передати користувачу застосунку.");
      }

      resetForm();
      await loadCrews();
    } catch (caught) {
      setError(getErrorMessage(caught, "Не вдалося зберегти наряд"));
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(crew: Crew) {
    if (!window.confirm(`Перемістити наряд "${crew.name}" до архіву? Користувача застосунку також буде вимкнено.`)) return;
    try {
      await deleteCrew(crew.id);
      setSuccess("Наряд переміщено до архіву");
      await loadCrews();
    } catch (caught) {
      setError(getErrorMessage(caught, "Не вдалося перемістити наряд до архіву"));
    }
  }

  async function handleRestore(crew: Crew) {
    try {
      await restoreCrew(crew.id);
      setSuccess("Наряд відновлено");
      await loadCrews();
    } catch (caught) {
      setError(getErrorMessage(caught, "Не вдалося відновити наряд"));
    }
  }

  async function handleCityFilterChange(cityId: number) {
    setSelectedCityId(cityId);
    setSelectedDepartmentId(0);
    setForm((prev) => ({ ...prev, cityId: cityId || activeCities[0]?.id || 0, departmentId: gbrDepartments.find((department) => department.cityId === (cityId || activeCities[0]?.id || 0))?.id ?? 0 }));
    await loadCrews(cityId, 0, showArchive);
  }

  async function handleDepartmentFilterChange(departmentId: number) {
    setSelectedDepartmentId(departmentId);
    await loadCrews(selectedCityId, departmentId, showArchive);
  }

  async function handleArchiveFilterChange(value: string) {
    const archive = value === "archive";
    setShowArchive(archive);
    setEditingCrew(null);
    await loadCrews(selectedCityId, selectedDepartmentId, archive);
  }

  return (
    <div className="page-card">
      <div className="page-header"><div><h1>Наряди ГШР</h1><p>Наряд створюється разом із логіном застосунку та прив’язується до підрозділу ГШР.</p></div></div>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {canEdit && !showArchive && (
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>Місто<select value={form.cityId} onChange={(event) => handleFormCityChange(Number(event.target.value))}><option value={0}>Оберіть місто</option>{activeCities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>
          <label>Підрозділ ГШР<select value={form.departmentId} onChange={(event) => setForm((prev) => ({ ...prev, departmentId: Number(event.target.value) }))}><option value={0}>Оберіть ГШР</option>{formDepartments.map((department) => <option key={department.id} value={department.id}>{formatDepartmentOption(department, { showCity: false, showType: false })}</option>)}</select></label>
          <label>Позивний<input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} /></label>
          <label>Логін застосунку<input value={form.login} onChange={(event) => setForm((prev) => ({ ...prev, login: event.target.value }))} /></label>
          {!editingCrew && <><label>Пароль<input type="password" value={form.password} onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))} /></label><label>Підтвердити пароль<input type="password" value={form.confirmPassword} onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))} /></label></>}
          {editingCrew && <><div className="alert alert-info">Поточний пароль не зберігається у відкритому вигляді. Щоб змінити його, задайте новий пароль.</div><label>Новий пароль<input type="password" value={form.newPassword} onChange={(event) => setForm((prev) => ({ ...prev, newPassword: event.target.value }))} /></label><label>Підтвердити новий пароль<input type="password" value={form.confirmNewPassword} onChange={(event) => setForm((prev) => ({ ...prev, confirmNewPassword: event.target.value }))} /></label></>}
          <label>Тип наряду<select value={form.dutyType} onChange={(event) => handleDutyTypeChange(event.target.value as CrewDutyType)}><option value="FULL_DAY">Добовий</option><option value="DAY">Денний</option><option value="NIGHT">Нічний</option></select></label>
          <label>Транспорт<select value={form.transportType} onChange={(event) => setForm((prev) => ({ ...prev, transportType: event.target.value as CrewTransportType }))}><option value="AUTO">Авто</option><option value="MOTO">Мото</option></select></label>
          <label>Тривалість, годин<input disabled={form.dutyType === "FULL_DAY"} value={form.durationHours} onChange={(event) => setForm((prev) => ({ ...prev, durationHours: event.target.value.replace(/[^0-9.,]/g, "").replace(",", ".") }))} /></label>
          <label>Коментар<input value={form.comment} onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))} /></label>
          <label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))} />Активний</label>
          <div className="form-actions"><button type="submit" disabled={saving}>{saving ? "Збереження..." : editingCrew ? "Оновити" : "Додати"}</button>{editingCrew && <button type="button" className="secondary-button" onClick={resetForm}>Скасувати</button>}</div>
        </form>
      )}

      <div className="filters-row">
        <label>Місто<select value={selectedCityId} onChange={(event) => handleCityFilterChange(Number(event.target.value))}><option value={0}>Усі міста</option>{cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>
        <label>Підрозділ<select value={selectedDepartmentId} onChange={(event) => handleDepartmentFilterChange(Number(event.target.value))}><option value={0}>Усі ГШР</option>{filterDepartments.map((department) => <option key={department.id} value={department.id}>{formatDepartmentOption(department, { showCity: !selectedCityId, showType: false })}</option>)}</select></label>
        <label>Стан<select value={showArchive ? "archive" : "active"} onChange={(event) => handleArchiveFilterChange(event.target.value)}><option value="active">Активні</option><option value="archive">Архів</option></select></label>
      </div>

      {loading ? <p>Завантаження...</p> : <div className="table-wrapper"><table><thead><tr><th>Позивний</th><th>Логін</th><th>Місто</th><th>Підрозділ</th><th>Тип</th><th>Транспорт</th><th>Години</th><th>Статус</th><th></th></tr></thead><tbody>{crews.map((crew) => <tr key={crew.id}><td>{crew.name}</td><td>{crew.login || crew.mobileUser?.login || "—"}</td><td>{crew.city?.name || crew.cityId}</td><td>{crew.department ? formatDepartmentOption(crew.department, { showCity: !selectedCityId, showType: false }) : crew.departmentId}</td><td>{dutyTypeLabels[crew.dutyType]}</td><td>{transportTypeLabels[crew.transportType]}</td><td>{crew.durationHours}</td><td>{crew.deletedAt ? "Архів" : crew.isActive ? "Активний" : "Вимкнений"}</td><td>{canEdit && <RowActionMenu items={showArchive ? [{ label: "Відновити", onClick: () => handleRestore(crew), variant: "edit" }] : [{ label: "Редагувати", onClick: () => startEdit(crew), variant: "edit" }, { label: "До архіву", onClick: () => handleArchive(crew), variant: "danger" }]} />}</td></tr>)}{crews.length === 0 && <tr><td colSpan={9}>Немає нарядів</td></tr>}</tbody></table></div>}
    </div>
  );
}