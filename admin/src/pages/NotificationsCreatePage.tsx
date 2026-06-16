import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { getAccessibleCities } from "../api/cities.api";
import type { City } from "../api/cities.api";
import { getDepartments } from "../api/departments.api";
import type { Department } from "../api/departments.api";
import { getMobileUsers } from "../api/mobile-users.api";
import type { MobileUser, MobileUserKind } from "../api/mobile-users.api";
import { createNotification } from "../api/notifications.api";
import { dedupeDepartments, formatDepartmentOption } from "../utils/department-options";

function getKindLabel(kind?: MobileUserKind | "") {
  if (kind === "CREW") return "Наряди ГШР";
  if (kind === "POST") return "Пости";
  return "Усі типи";
}

function getUserKindLabel(kind?: MobileUserKind | "") {
  if (kind === "CREW") return "Наряд ГШР";
  if (kind === "POST") return "Пост";
  return "Користувач";
}

function getUserTargetLabel(user: MobileUser) {
  if (user.userKind === "CREW") {
    return user.crew?.name ?? user.displayName ?? "Наряд";
  }

  return user.dutyPost?.name ?? user.displayName ?? "Пост";
}

function getRecipientsSummary(
  city: City | null,
  department: Department | null,
  kind: MobileUserKind | "",
) {
  const parts = [city?.name ?? "Місто не вибрано"];

  if (department) {
    parts.push(department.name);
  } else {
    parts.push("усі підрозділи");
  }

  if (kind) {
    parts.push(getKindLabel(kind));
  } else {
    parts.push("усі типи користувачів");
  }

  return parts.join(" · ");
}

export function NotificationsCreatePage() {
  const [cities, setCities] = useState<City[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [mobileUsers, setMobileUsers] = useState<MobileUser[]>([]);

  const [cityId, setCityId] = useState(0);
  const [departmentId, setDepartmentId] = useState(0);
  const [targetUserKind, setTargetUserKind] = useState<MobileUserKind | "">("");
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedCity = useMemo(
    () => cities.find((city) => city.id === cityId) ?? null,
    [cities, cityId],
  );

  const visibleDepartments = useMemo(() => {
    return dedupeDepartments(
      departments.filter((department) => {
        if (cityId && department.cityId !== cityId) return false;
        return department.isActive && !department.deletedAt;
      }),
    );
  }, [departments, cityId]);

  const selectedDepartment = useMemo(
    () => visibleDepartments.find((department) => department.id === departmentId) ?? null,
    [visibleDepartments, departmentId],
  );

  const selectedUsers = useMemo(() => {
    const selected = new Set(selectedUserIds);
    return mobileUsers.filter((user) => selected.has(user.id));
  }, [mobileUsers, selectedUserIds]);

  const recipientsSummary = useMemo(
    () => getRecipientsSummary(selectedCity, selectedDepartment, targetUserKind),
    [selectedCity, selectedDepartment, targetUserKind],
  );

  const isMassSend = selectedUsers.length > 5;

  useEffect(() => {
    async function loadReferences() {
      setLoading(true);
      setError("");

      try {
        const [citiesData, departmentsData] = await Promise.all([
          getAccessibleCities(false),
          getDepartments({ includeInactive: false }),
        ]);

        setCities(citiesData);
        setDepartments(departmentsData);

        if (citiesData.length > 0) {
          setCityId(citiesData[0].id);
        }
      } catch {
        setError("Не вдалося завантажити довідники");
      } finally {
        setLoading(false);
      }
    }

    loadReferences();
  }, []);

  useEffect(() => {
    async function loadUsers() {
      if (!cityId) {
        setMobileUsers([]);
        setSelectedUserIds([]);
        return;
      }

      setUsersLoading(true);
      setError("");

      try {
        const data = await getMobileUsers({
          cityId,
          departmentId: departmentId || undefined,
          userKind: targetUserKind || undefined,
          includeInactive: false,
          archive: false,
        });

        setMobileUsers(data.filter((user) => user.isActive && !user.deletedAt));
        setSelectedUserIds([]);
        setPreviewOpen(false);
      } catch {
        setError("Не вдалося завантажити користувачів застосунку");
      } finally {
        setUsersLoading(false);
      }
    }

    loadUsers();
  }, [cityId, departmentId, targetUserKind]);

  function handleCityChange(nextCityId: number) {
    setCityId(nextCityId);
    setDepartmentId(0);
    setSelectedUserIds([]);
    setPreviewOpen(false);
  }

  function handleDepartmentChange(nextDepartmentId: number) {
    setDepartmentId(nextDepartmentId);
    setSelectedUserIds([]);
    setPreviewOpen(false);
  }

  function handleKindChange(nextKind: MobileUserKind | "") {
    setTargetUserKind(nextKind);
    setSelectedUserIds([]);
    setPreviewOpen(false);
  }

  function toggleUser(userId: number) {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
    setPreviewOpen(false);
  }

  function selectAllUsers() {
    setSelectedUserIds(mobileUsers.map((user) => user.id));
    setPreviewOpen(false);
  }

  function clearUsers() {
    setSelectedUserIds([]);
    setPreviewOpen(false);
  }

  function validateNotification() {
    if (!cityId) return "Виберіть місто";
    if (selectedUserIds.length === 0) return "Виберіть хоча б одного отримувача";
    if (!title.trim()) return "Введіть заголовок сповіщення";
    if (!message.trim()) return "Введіть текст сповіщення";
    return "";
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const validationError = validateNotification();
    if (validationError) {
      setError(validationError);
      setSuccess("");
      return;
    }

    setError("");
    setSuccess("");
    setPreviewOpen(true);
  }

  async function confirmSend() {
    const validationError = validateNotification();
    if (validationError) {
      setError(validationError);
      setPreviewOpen(false);
      return;
    }

    setSending(true);
    setError("");
    setSuccess("");

    try {
      await createNotification({
        cityId,
        departmentId: departmentId || null,
        targetUserKind: targetUserKind || null,
        mobileUserIds: selectedUserIds,
        title: title.trim(),
        message: message.trim(),
      });

      setSuccess("Сповіщення створено та додано в історію");
      setTitle("");
      setMessage("");
      setSelectedUserIds([]);
      setPreviewOpen(false);
    } catch (err: any) {
      setError(err.response?.data?.message || "Не вдалося створити сповіщення");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className="page">Завантаження...</div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Нове сповіщення</h1>
          <p>Перед відправленням перевірте місто, підрозділ, тип отримувачів і точний список користувачів.</p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}
      {success && <div className="form-success">{success}</div>}

      <form className="panel-card notification-create-card" onSubmit={handleSubmit}>
        <div className="notification-form-grid">
          <label className="field">
            <span>Місто</span>
            <select value={cityId} onChange={(event) => handleCityChange(Number(event.target.value))}>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>{city.name}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Підрозділ</span>
            <select value={departmentId} onChange={(event) => handleDepartmentChange(Number(event.target.value))}>
              <option value={0}>Усі підрозділи міста</option>
              {visibleDepartments.map((department) => (
                <option key={department.id} value={department.id}>
                  {formatDepartmentOption(department, { showCity: false })}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Тип отримувачів</span>
            <select value={targetUserKind} onChange={(event) => handleKindChange(event.target.value as MobileUserKind | "")}>
              <option value="">Усі типи</option>
              <option value="CREW">Тільки наряди ГШР</option>
              <option value="POST">Тільки пости</option>
            </select>
          </label>

          <div className="notification-selected-card">
            <span>Вибрано отримувачів</span>
            <strong>{selectedUserIds.length}</strong>
            <small>{recipientsSummary}</small>
          </div>
        </div>

        {isMassSend && (
          <div className="alert alert-warning">
            Масова відправка: вибрано {selectedUsers.length} отримувачів. Перед відправленням уважно перевірте список у попередньому перегляді.
          </div>
        )}

        <label className="field">
          <span>Заголовок сповіщення</span>
          <input
            value={title}
            maxLength={255}
            placeholder="Наприклад: Термінове повідомлення"
            onChange={(event) => {
              setTitle(event.target.value);
              setPreviewOpen(false);
            }}
          />
        </label>

        <label className="field">
          <span>Текст сповіщення</span>
          <textarea
            rows={6}
            value={message}
            maxLength={5000}
            placeholder="Введіть текст сповіщення..."
            onChange={(event) => {
              setMessage(event.target.value);
              setPreviewOpen(false);
            }}
          />
        </label>

        <div className="notification-users-panel">
          <div className="table-header">
            <div>
              <h2>Отримувачі</h2>
              <p>{usersLoading ? "Завантажуємо користувачів..." : `Доступно: ${mobileUsers.length}`}</p>
            </div>

            <div className="table-header-actions">
              <button type="button" className="secondary-button" onClick={selectAllUsers} disabled={mobileUsers.length === 0}>
                Вибрати всіх
              </button>
              <button type="button" className="secondary-button" onClick={clearUsers} disabled={selectedUserIds.length === 0}>
                Зняти вибір
              </button>
            </div>
          </div>

          {mobileUsers.length === 0 ? (
            <div className="empty-state">За вибраними фільтрами немає активних користувачів застосунку</div>
          ) : (
            <div className="notification-user-grid">
              {mobileUsers.map((user) => (
                <label className="notification-user-card" key={user.id}>
                  <input type="checkbox" checked={selectedUserIds.includes(user.id)} onChange={() => toggleUser(user.id)} />

                  <span>
                    <strong>{user.login}</strong>
                    <small>{getUserKindLabel(user.userKind)} · {getUserTargetLabel(user)}</small>
                    <small>
                      {user.department
                        ? formatDepartmentOption(user.department, { showCity: false })
                        : user.city?.name ?? selectedCity?.name ?? "—"}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="form-actions notification-submit-bar">
          <button className="primary-button" disabled={sending || usersLoading}>
            {sending ? "Відправляємо..." : "Перевірити та відправити"}
          </button>
        </div>
      </form>

      {previewOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card notification-preview-modal" role="dialog" aria-modal="true" aria-labelledby="notification-preview-title">
            <div className="modal-heading-row">
              <div>
                <h2 id="notification-preview-title">Підтвердження відправлення</h2>
                <p className="modal-text">Перевірте отримувачів і текст. Після підтвердження сповіщення буде створено та відправлено.</p>
              </div>
            </div>

            <div className="notification-preview-summary">
              <div>
                <span>Напрямок</span>
                <strong>{recipientsSummary}</strong>
              </div>
              <div>
                <span>Отримувачів</span>
                <strong>{selectedUsers.length}</strong>
              </div>
              <div>
                <span>Тип</span>
                <strong>{getKindLabel(targetUserKind)}</strong>
              </div>
            </div>

            {isMassSend && (
              <div className="alert alert-warning">
                Увага: це масова відправка на {selectedUsers.length} отримувачів.
              </div>
            )}

            <div className="notification-preview-message">
              <span>Заголовок</span>
              <strong>{title.trim()}</strong>
              <span>Текст</span>
              <p>{message.trim()}</p>
            </div>

            <div className="notification-preview-users">
              <div className="table-header compact-table-header">
                <div>
                  <h3>Список отримувачів</h3>
                  <p>Показано перші {Math.min(selectedUsers.length, 20)} з {selectedUsers.length}</p>
                </div>
              </div>

              <div className="notification-preview-user-list">
                {selectedUsers.slice(0, 20).map((user) => (
                  <div className="notification-preview-user" key={user.id}>
                    <strong>{getUserTargetLabel(user)}</strong>
                    <span>{user.login} · {getUserKindLabel(user.userKind)}</span>
                  </div>
                ))}
              </div>

              {selectedUsers.length > 20 && (
                <p className="modal-text">І ще {selectedUsers.length - 20} отримувачів.</p>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setPreviewOpen(false)} disabled={sending}>
                Повернутися до редагування
              </button>
              <button type="button" className="primary-button" onClick={confirmSend} disabled={sending}>
                {sending ? "Відправляємо..." : "Підтвердити відправлення"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
