import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { getAdminMe } from "../api/auth.api";
import type { AdminUser } from "../api/auth.api";
import { getAccessibleCities } from "../api/cities.api";
import type { City } from "../api/cities.api";
import { getDepartments } from "../api/departments.api";
import type { Department } from "../api/departments.api";
import { dedupeDepartments, formatDepartmentOption } from "../utils/department-options";
import { createDutyPost, deleteDutyPost, getDutyPosts, restoreDutyPost, updateDutyPost } from "../api/duty-posts.api";
import type { DutyPost } from "../api/duty-posts.api";
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
  isActive: true,
};

function getErrorMessage(error: unknown, fallback: string) {
  const maybe = error as { response?: { data?: { message?: string } } };
  return maybe.response?.data?.message || fallback;
}

export function DutyPostsPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [posts, setPosts] = useState<DutyPost[]>([]);
  const [selectedCityId, setSelectedCityId] = useState(0);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(0);
  const [showArchive, setShowArchive] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [editingPost, setEditingPost] = useState<DutyPost | null>(null);
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeCities = useMemo(() => cities.filter((city) => city.isActive), [cities]);
  const activeDepartments = useMemo(
    () => dedupeDepartments(departments.filter((department) => department.isActive && !department.deletedAt)),
    [departments],
  );
  const formDepartments = useMemo(
    () => activeDepartments.filter((department) => department.cityId === form.cityId),
    [activeDepartments, form.cityId],
  );
  const filterDepartments = useMemo(
    () => activeDepartments.filter((department) => !selectedCityId || department.cityId === selectedCityId),
    [activeDepartments, selectedCityId],
  );
  const roleCode = currentUser?.role?.code;
  const canEdit = roleCode === "super_admin" || roleCode === "admin";

  async function loadPosts(cityId = selectedCityId, departmentId = selectedDepartmentId, archive = showArchive) {
    const data = await getDutyPosts({ cityId: cityId || undefined, departmentId: departmentId || undefined, archive, includeInactive: true });
    setPosts(data);
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
        const postsData = await getDutyPosts({ includeInactive: true });
        setPosts(postsData);
      } catch (caught) {
        setError(getErrorMessage(caught, "Не удалось загрузить посты"));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function resetForm() {
    const cityId = selectedCityId || activeCities[0]?.id || 0;
    const departmentId = departments.find((department) => department.cityId === cityId && department.isActive)?.id ?? 0;
    setEditingPost(null);
    setForm({ ...initialForm, cityId, departmentId });
    setError("");
  }

  function handleFormCityChange(cityId: number) {
    const departmentId = departments.find((department) => department.cityId === cityId && department.isActive)?.id ?? 0;
    setForm((prev) => ({ ...prev, cityId, departmentId }));
  }

  function startEdit(post: DutyPost) {
    setEditingPost(post);
    setForm({
      cityId: post.cityId,
      departmentId: post.departmentId,
      name: post.name,
      login: post.login || post.mobileUser?.login || "",
      password: "",
      confirmPassword: "",
      newPassword: "",
      confirmNewPassword: "",
      comment: post.comment || "",
      isActive: post.isActive,
    });
    setError("");
    setSuccess("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.cityId) return setError("Выберите город");
    if (!form.departmentId) return setError("Выберите подразделение");
    if (!form.name.trim()) return setError("Введите название поста");
    if (!form.login.trim()) return setError("Введите логин приложения");

    if (!editingPost) {
      if (!form.password) return setError("Введите пароль");
      if (form.password.length < 6) return setError("Пароль должен быть минимум 6 символов");
      if (form.password !== form.confirmPassword) return setError("Пароли не совпадают");
    }

    if (editingPost && (form.newPassword || form.confirmNewPassword)) {
      if (form.newPassword.length < 6) return setError("Новий пароль должен быть минимум 6 символов");
      if (form.newPassword !== form.confirmNewPassword) return setError("Новые пароли не совпадают");
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
        isActive: form.isActive,
      };

      if (editingPost) {
        await updateDutyPost(editingPost.id, {
          ...basePayload,
          ...(form.newPassword ? { newPassword: form.newPassword, confirmNewPassword: form.confirmNewPassword } : {}),
        });
        setSuccess("Пост оновлено");
      } else {
        await createDutyPost({ ...basePayload, password: form.password, confirmPassword: form.confirmPassword });
        setSuccess("Пост создан. Логін и пароль можно передать пользователю приложения.");
      }
      resetForm();
      await loadPosts();
    } catch (caught) {
      setError(getErrorMessage(caught, "Не удалось зберегти пост"));
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(post: DutyPost) {
    if (!window.confirm(`Отправить пост "${post.name}" в архив? Користувач приложения тоже будет отключен.`)) return;
    try {
      await deleteDutyPost(post.id);
      setSuccess("Пост відправлено в архив");
      await loadPosts();
    } catch (caught) {
      setError(getErrorMessage(caught, "Не удалось отправить пост в архив"));
    }
  }

  async function handleRestore(post: DutyPost) {
    try {
      await restoreDutyPost(post.id);
      setSuccess("Пост відновлено");
      await loadPosts();
    } catch (caught) {
      setError(getErrorMessage(caught, "Не удалось восстановить пост"));
    }
  }

  async function handleCityFilterChange(cityId: number) {
    setSelectedCityId(cityId);
    setSelectedDepartmentId(0);
    setForm((prev) => ({ ...prev, cityId: cityId || activeCities[0]?.id || 0, departmentId: departments.find((department) => department.cityId === (cityId || activeCities[0]?.id || 0) && department.isActive)?.id ?? 0 }));
    await loadPosts(cityId, 0, showArchive);
  }

  async function handleDepartmentFilterChange(departmentId: number) {
    setSelectedDepartmentId(departmentId);
    await loadPosts(selectedCityId, departmentId, showArchive);
  }

  async function handleArchiveFilterChange(value: string) {
    const archive = value === "archive";
    setShowArchive(archive);
    setEditingPost(null);
    await loadPosts(selectedCityId, selectedDepartmentId, archive);
  }

  return (
    <div className="page-card">
      <div className="page-header"><div><h1>Дод. пости</h1><p>Пост создается вместе с логином приложения и привязывается к підрозділу.</p></div></div>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {canEdit && !showArchive && (
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>Місто<select value={form.cityId} onChange={(event) => handleFormCityChange(Number(event.target.value))}><option value={0}>Выберите город</option>{activeCities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>
          <label>Підрозділ<select value={form.departmentId} onChange={(event) => setForm((prev) => ({ ...prev, departmentId: Number(event.target.value) }))}><option value={0}>Выберите подразделение</option>{formDepartments.map((department) => <option key={department.id} value={department.id}>{formatDepartmentOption(department, { showCity: false })}</option>)}</select></label>
          <label>Назва поста<input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} /></label>
          <label>Логін приложения<input value={form.login} onChange={(event) => setForm((prev) => ({ ...prev, login: event.target.value }))} /></label>
          {!editingPost && <><label>Пароль<input type="password" value={form.password} onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))} /></label><label>Подтвердить пароль<input type="password" value={form.confirmPassword} onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))} /></label></>}
          {editingPost && <><div className="alert alert-info">Текущий пароль не хранится в открытом виде. Для изменения задайте новый пароль.</div><label>Новий пароль<input type="password" value={form.newPassword} onChange={(event) => setForm((prev) => ({ ...prev, newPassword: event.target.value }))} /></label><label>Подтвердить новый пароль<input type="password" value={form.confirmNewPassword} onChange={(event) => setForm((prev) => ({ ...prev, confirmNewPassword: event.target.value }))} /></label></>}
          <label>Коментар<input value={form.comment} onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))} /></label>
          <label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))} />Активный</label>
          <div className="form-actions"><button type="submit" disabled={saving}>{saving ? "Збереження..." : editingPost ? "Оновити" : "Додати"}</button>{editingPost && <button type="button" className="secondary-button" onClick={resetForm}>Скасувати</button>}</div>
        </form>
      )}

      <div className="filters-row">
        <label>Місто<select value={selectedCityId} onChange={(event) => handleCityFilterChange(Number(event.target.value))}><option value={0}>Усі міста</option>{cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>
        <label>Підрозділ<select value={selectedDepartmentId} onChange={(event) => handleDepartmentFilterChange(Number(event.target.value))}><option value={0}>Усі підрозділи</option>{filterDepartments.map((department) => <option key={department.id} value={department.id}>{formatDepartmentOption(department, { showCity: !selectedCityId })}</option>)}</select></label>
        <label>Стан<select value={showArchive ? "archive" : "active"} onChange={(event) => handleArchiveFilterChange(event.target.value)}><option value="active">Активні</option><option value="archive">Архів</option></select></label>
      </div>

      {loading ? <p>Завантаження...</p> : <div className="table-wrapper"><table><thead><tr><th>Пост</th><th>Логін</th><th>Місто</th><th>Підрозділ</th><th>Коментар</th><th>Статус</th><th></th></tr></thead><tbody>{posts.map((post) => <tr key={post.id}><td>{post.name}</td><td>{post.login || post.mobileUser?.login || "—"}</td><td>{post.city?.name || post.cityId}</td><td>{post.department ? formatDepartmentOption(post.department, { showCity: !selectedCityId }) : post.departmentId}</td><td>{post.comment || "—"}</td><td>{post.deletedAt ? "Архів" : post.isActive ? "Активний" : "Вимкнений"}</td><td>{canEdit && <RowActionMenu items={showArchive ? [{ label: "Відновити", onClick: () => handleRestore(post), variant: "edit" }] : [{ label: "Редагувати", onClick: () => startEdit(post), variant: "edit" }, { label: "В архів", onClick: () => handleArchive(post), variant: "danger" }]} />}</td></tr>)}{posts.length === 0 && <tr><td colSpan={7}>Немає постов</td></tr>}</tbody></table></div>}
    </div>
  );
}
