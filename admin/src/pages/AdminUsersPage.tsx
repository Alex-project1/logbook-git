import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import {
  createAdminUser,
  deleteAdminUser,
  getAdminUsers,
  updateAdminUser,
} from "../api/admin-users.api";
import type {
  AdminUserFilters,
  AdminUserRoleCode,
  AdminUserRow,
  AdminUsersResponse,
} from "../api/admin-users.api";
import { getCities } from "../api/cities.api";
import type { City } from "../api/cities.api";

type AdminUserForm = {
  name: string;
  login: string;
  email: string;
  password: string;
  roleCode: AdminUserRoleCode;
  isActive: boolean;
};

const defaultFilters: AdminUserFilters = {
  page: 1,
  pageSize: 20,
  includeArchived: false,
};

const initialForm: AdminUserForm = {
  name: "",
  login: "",
  email: "",
  password: "",
  roleCode: "admin",
  isActive: true,
};

const roleLabels: Record<string, string> = {
  admin: "Адміністратор",
  viewer: "Спостерігач",
  super_admin: "Супер адміністратор",
};

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRoleLabel(roleCode: string) {
  return roleLabels[roleCode] ?? roleCode;
}

export function AdminUsersPage() {
  const [filters, setFilters] = useState<AdminUserFilters>(defaultFilters);
  const [report, setReport] = useState<AdminUsersResponse | null>(null);

  const [cities, setCities] = useState<City[]>([]);
  const [form, setForm] = useState<AdminUserForm>(initialForm);
  const [selectedCityIds, setSelectedCityIds] = useState<number[]>([]);

  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [referencesLoading, setReferencesLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const rows = report?.data ?? [];
  const pagination = report?.pagination;

  const activeCities = useMemo(
    () => cities.filter((city) => city.isActive),
    [cities]
  );

  async function loadReferences() {
    setReferencesLoading(true);

    try {
      const citiesData = await getCities(false);
      setCities(citiesData);
    } catch {
      setError("Не вдалося завантажити міста");
    } finally {
      setReferencesLoading(false);
    }
  }

  async function loadUsers(nextFilters = filters) {
    setLoading(true);
    setError("");

    try {
      const data = await getAdminUsers(nextFilters);
      setReport(data);
    } catch {
      setError("Не вдалося завантажити користувачів");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReferences();
    loadUsers(defaultFilters);
  }, []);

  function updateFilter<Key extends keyof AdminUserFilters>(
    key: Key,
    value: AdminUserFilters[Key]
  ) {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: key === "page" ? (value as number) : 1,
    }));
  }

  function updateForm<Key extends keyof AdminUserForm>(
    key: Key,
    value: AdminUserForm[Key]
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function toggleCity(cityId: number) {
    setSelectedCityIds((prev) =>
      prev.includes(cityId)
        ? prev.filter((id) => id !== cityId)
        : [...prev, cityId]
    );
  }

  function resetForm() {
    setForm(initialForm);
    setSelectedCityIds([]);
    setEditingUserId(null);
    setError("");
    setSuccess("");
  }

  function startEdit(user: AdminUserRow) {
    if (user.role.code === "super_admin") {
      setError("Супер адміністратора не можна редагувати через цей розділ");
      return;
    }

    if (user.deletedAt) {
      setError("Видаленого користувача не можна редагувати");
      return;
    }

    setEditingUserId(user.id);
    setForm({
      name: user.name,
      login: user.login,
      email: user.email ?? "",
      password: "",
      roleCode: user.role.code === "viewer" ? "viewer" : "admin",
      isActive: user.isActive,
    });
    setSelectedCityIds(user.cityAccesses.map((access) => access.cityId));
    setError("");
    setSuccess("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function validateForm() {
    if (!form.name.trim()) return "Вкажіть ім’я користувача";
    if (!form.login.trim()) return "Вкажіть логін";

    if (!editingUserId && form.password.length < 6) {
      return "Пароль має містити щонайменше 6 символів";
    }

    if (editingUserId && form.password && form.password.length < 6) {
      return "Новий пароль має містити щонайменше 6 символів";
    }

    if (selectedCityIds.length === 0) {
      return "Оберіть хоча б одне місто доступу";
    }

    return "";
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      setSuccess("");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (editingUserId) {
        await updateAdminUser(editingUserId, {
          name: form.name.trim(),
          login: form.login.trim(),
          email: form.email.trim() || null,
          password: form.password.trim() || undefined,
          roleCode: form.roleCode,
          cityIds: selectedCityIds,
          isActive: form.isActive,
        });

        setSuccess("Користувача оновлено");
      } else {
        await createAdminUser({
          name: form.name.trim(),
          login: form.login.trim(),
          email: form.email.trim() || null,
          password: form.password,
          roleCode: form.roleCode,
          cityIds: selectedCityIds,
        });

        setSuccess("Користувача створено");
      }

      resetForm();
      await loadUsers(filters);
    } catch (err: any) {
      setError(err.response?.data?.message || "Не вдалося зберегти користувача");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(user: AdminUserRow) {
    const confirmed = window.confirm(
      `Видалити користувача ${user.name} (${user.login})?`
    );

    if (!confirmed) {
      return;
    }

    setDeletingUserId(user.id);
    setError("");
    setSuccess("");

    try {
      await deleteAdminUser(user.id);
      setSuccess("Користувача видалено");
      await loadUsers(filters);
    } catch (err: any) {
      setError(err.response?.data?.message || "Не вдалося видалити користувача");
    } finally {
      setDeletingUserId(null);
    }
  }

  async function handleApply() {
    const nextFilters: AdminUserFilters = {
      ...filters,
      page: 1,
    };

    setFilters(nextFilters);
    await loadUsers(nextFilters);
  }

  async function handleResetFilters() {
    setFilters(defaultFilters);
    await loadUsers(defaultFilters);
  }

  async function handlePageChange(page: number) {
    const nextFilters: AdminUserFilters = {
      ...filters,
      page,
    };

    setFilters(nextFilters);
    await loadUsers(nextFilters);
  }

  async function handlePageSizeChange(pageSize: number) {
    const nextFilters: AdminUserFilters = {
      ...filters,
      page: 1,
      pageSize,
    };

    setFilters(nextFilters);
    await loadUsers(nextFilters);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Адміністратори</h1>
          <p>
            Керування адміністраторами та спостерігачами, призначення міст
            доступу
          </p>
        </div>
      </div>

      <div className="content-grid admin-users-grid">
        <form className="panel-card" onSubmit={handleSubmit}>
          <div className="form-title-row">
            <h2>
              {editingUserId ? "Редагувати користувача" : "Новий користувач"}
            </h2>

            {editingUserId && (
              <button
                type="button"
                className="small-button"
                onClick={resetForm}
              >
                Скасувати
              </button>
            )}
          </div>

          <label className="field">
            <span>Ім’я</span>
            <input
              value={form.name}
              onChange={(event) => updateForm("name", event.target.value)}
              placeholder="Наприклад: Адміністратор Запоріжжя"
            />
          </label>

          <label className="field">
            <span>Логін</span>
            <input
              value={form.login}
              onChange={(event) => updateForm("login", event.target.value)}
              placeholder="cityadmin_zp"
            />
          </label>

          <label className="field">
            <span>Email</span>
            <input
              value={form.email}
              onChange={(event) => updateForm("email", event.target.value)}
              placeholder="Необов’язково"
            />
          </label>

          <label className="field">
            <span>
              Пароль {editingUserId ? "(залиште порожнім, якщо не змінювати)" : ""}
            </span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => updateForm("password", event.target.value)}
              placeholder={editingUserId ? "Новий пароль" : "Мінімум 6 символів"}
            />
          </label>

          <label className="field">
            <span>Роль</span>
            <select
              value={form.roleCode}
              onChange={(event) =>
                updateForm("roleCode", event.target.value as AdminUserRoleCode)
              }
            >
              <option value="admin">Адміністратор</option>
              <option value="viewer">Спостерігач</option>
            </select>
          </label>

          {editingUserId && (
            <label className="checkbox-field admin-active-checkbox">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  updateForm("isActive", event.target.checked)
                }
              />
              <span>Користувач активний</span>
            </label>
          )}

          <div className="field">
            <span>Міста доступу</span>

            {referencesLoading ? (
              <div className="empty-state">Завантаження міст...</div>
            ) : activeCities.length === 0 ? (
              <div className="empty-state">Немає активних міст</div>
            ) : (
              <div className="city-checkbox-list">
                {activeCities.map((city) => (
                  <label className="city-checkbox" key={city.id}>
                    <input
                      type="checkbox"
                      checked={selectedCityIds.includes(city.id)}
                      onChange={() => toggleCity(city.id)}
                    />
                    <span>{city.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {form.roleCode === "admin" ? (
            <div className="role-help-card">
              <strong>Адміністратор</strong>
              <span>
                Може керувати співробітниками, машинами, нарядами та змінами в
                обраних містах.
              </span>
            </div>
          ) : (
            <div className="role-help-card">
              <strong>Спостерігач</strong>
              <span>
                Може лише переглядати звіти та довідники за обраними
                містами.
              </span>
            </div>
          )}

          {error && <div className="form-error">{error}</div>}
          {success && <div className="form-success">{success}</div>}

          <button className="primary-button" disabled={saving}>
            {saving
              ? "Зберігаємо..."
              : editingUserId
                ? "Зберегти зміни"
                : "Створити користувача"}
          </button>
        </form>

        <div className="panel-card table-card">
          <div className="table-header">
            <div>
              <h2>Список користувачів</h2>
              <p>
                Усього рядків: {(pagination?.total ?? 0).toLocaleString("uk-UA")} ·
                Сторінка {pagination?.page ?? 1} з{" "}
                {pagination?.totalPages ?? 1}
              </p>
            </div>

            <div className="table-header-actions">
              <select
                className="compact-select"
                value={filters.pageSize ?? 20}
                onChange={(event) =>
                  handlePageSizeChange(Number(event.target.value))
                }
              >
                <option value={20}>20 рядків</option>
                <option value={50}>50 рядків</option>
                <option value={100}>100 рядків</option>
              </select>
            </div>
          </div>

          <div className="admin-users-filters">
            <label className="field">
              <span>Роль</span>
              <select
                value={filters.roleCode ?? ""}
                onChange={(event) =>
                  updateFilter("roleCode", event.target.value || undefined)
                }
              >
                <option value="">Усі ролі</option>
                <option value="admin">Адміністратор</option>
                <option value="viewer">Спостерігач</option>
              </select>
            </label>

            <label className="field">
              <span>Місто</span>
              <select
                value={filters.cityId ?? 0}
                onChange={(event) =>
                  updateFilter("cityId", Number(event.target.value) || undefined)
                }
              >
                <option value={0}>Усі міста</option>

                {activeCities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Пошук</span>
              <input
                value={filters.search ?? ""}
                onChange={(event) => updateFilter("search", event.target.value)}
                placeholder="Ім’я, логін, email..."
              />
            </label>

            <label className="checkbox-field admin-users-archive-filter">
              <input
                type="checkbox"
                checked={Boolean(filters.includeArchived)}
                onChange={(event) =>
                  updateFilter("includeArchived", event.target.checked)
                }
              />
              <span>Показувати видалених</span>
            </label>
          </div>

          <div className="report-filter-actions">
            <button
              className="primary-button"
              onClick={handleApply}
              disabled={loading}
            >
              {loading ? "Завантаження..." : "Сформувати"}
            </button>

            <button className="secondary-button" onClick={handleResetFilters}>
              Скинути
            </button>
          </div>

          {loading ? (
            <div className="empty-state">Завантаження користувачів...</div>
          ) : rows.length === 0 ? (
            <div className="empty-state">Користувачів не знайдено</div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="data-table admin-users-table">
                  <thead>
                    <tr>
                      <th>Користувач</th>
                      <th>Роль</th>
                      <th>Міста</th>
                      <th>Статус</th>
                      <th>Створено</th>
                      <th>Дії</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((user) => {
                      const isSuperAdmin = user.role.code === "super_admin";
                      const isDeleted = Boolean(user.deletedAt);

                      return (
                        <tr key={user.id}>
                          <td>
                            <strong>{user.name}</strong>
                            <div className="muted-text">{user.login}</div>
                            {user.email && (
                              <div className="muted-text">{user.email}</div>
                            )}
                          </td>

                          <td>
                            <span className={`role-badge role-${user.role.code}`}>
                              {getRoleLabel(user.role.code)}
                            </span>
                          </td>

                          <td>
                            {isSuperAdmin ? (
                              <span className="muted-text">Усі міста</span>
                            ) : user.cityAccesses.length === 0 ? (
                              <span className="muted-text">Немає доступу</span>
                            ) : (
                              <div className="city-pill-list">
                                {user.cityAccesses.map((access) => (
                                  <span className="city-pill" key={access.id}>
                                    {access.city.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>

                          <td>
                            {isDeleted ? (
                              <span className="status-badge status-inactive">
                                Видалений
                              </span>
                            ) : user.isActive ? (
                              <span className="status-badge status-active">
                                Активний
                              </span>
                            ) : (
                              <span className="status-badge status-inactive">
                                Вимкнений
                              </span>
                            )}
                          </td>

                          <td>{formatDateTime(user.createdAt)}</td>

                          <td>
                            {isSuperAdmin ? (
                              <span className="muted-text">Недоступно</span>
                            ) : isDeleted ? (
                              <span className="muted-text">Видалений</span>
                            ) : (
                              <div className="table-actions">
                                <button
                                  className="small-button"
                                  onClick={() => startEdit(user)}
                                >
                                  Редагувати
                                </button>

                                <button
                                  className="small-button danger-button"
                                  onClick={() => handleDelete(user)}
                                  disabled={deletingUserId === user.id}
                                >
                                  {deletingUserId === user.id
                                    ? "Видаляємо..."
                                    : "Видалити"}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="pagination-bar">
                <button
                  className="secondary-button"
                  disabled={(pagination?.page ?? 1) <= 1}
                  onClick={() => handlePageChange((pagination?.page ?? 1) - 1)}
                >
                  Назад
                </button>

                <span>
                  Сторінка {pagination?.page ?? 1} з{" "}
                  {pagination?.totalPages ?? 1}
                </span>

                <button
                  className="secondary-button"
                  disabled={
                    (pagination?.page ?? 1) >= (pagination?.totalPages ?? 1)
                  }
                  onClick={() => handlePageChange((pagination?.page ?? 1) + 1)}
                >
                  Вперед
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}