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
  if (kind === "CREW") return "Наряди ГБР";
  if (kind === "POST") return "Пости";
  return "Усі типи";
}

function getUserTargetLabel(user: MobileUser) {
  if (user.userKind === "CREW") {
    return user.crew?.name ?? user.displayName ?? "Наряд";
  }

  return user.dutyPost?.name ?? user.displayName ?? "Пост";
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
        setError("Не удалось загрузить справочники");
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
      } catch {
        setError("Не удалось загрузить пользователей приложения");
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
  }

  function toggleUser(userId: number) {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  }

  function selectAllUsers() {
    setSelectedUserIds(mobileUsers.map((user) => user.id));
  }

  function clearUsers() {
    setSelectedUserIds([]);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!cityId) return setError("Выберите город");
    if (selectedUserIds.length === 0) return setError("Выберите хотя бы одного пользователя");
    if (!title.trim()) return setError("Введите заголовок уведомления");
    if (!message.trim()) return setError("Введите текст уведомления");

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

      setSuccess("Уведомление создано и добавлено в историю");
      setTitle("");
      setMessage("");
      setSelectedUserIds([]);
    } catch (err: any) {
      setError(err.response?.data?.message || "Не удалось создать уведомление");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className="page">Загрузка...</div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Новое уведомление</h1>
          <p>Отправка сообщения по городу, подразделению, типу пользователя или конкретным получателям</p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}
      {success && <div className="form-success">{success}</div>}

      <form className="panel-card notification-create-card" onSubmit={handleSubmit}>
        <div className="notification-form-grid">
          <label className="field">
            <span>Город</span>
            <select value={cityId} onChange={(event) => handleCityChange(Number(event.target.value))}>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>{city.name}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Подразделение</span>
            <select value={departmentId} onChange={(event) => setDepartmentId(Number(event.target.value))}>
              <option value={0}>Все подразделения города</option>
              {visibleDepartments.map((department) => (
                <option key={department.id} value={department.id}>
                  {formatDepartmentOption(department, { showCity: false })}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Тип получателей</span>
            <select value={targetUserKind} onChange={(event) => setTargetUserKind(event.target.value as MobileUserKind | "")}>
              <option value="">Все типы</option>
              <option value="CREW">Только наряды ГБР</option>
              <option value="POST">Только посты</option>
            </select>
          </label>

          <div className="notification-selected-card">
            <span>Выбрано пользователей</span>
            <strong>{selectedUserIds.length}</strong>
            <small>
              {selectedCity?.name ?? "Город не выбран"}
              {selectedDepartment ? ` · ${selectedDepartment.name}` : ""}
              {targetUserKind ? ` · ${getKindLabel(targetUserKind)}` : ""}
            </small>
          </div>
        </div>

        <label className="field">
          <span>Заголовок уведомления</span>
          <input
            value={title}
            maxLength={255}
            placeholder="Например: Срочное сообщение"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Текст уведомления</span>
          <textarea
            rows={6}
            value={message}
            maxLength={5000}
            placeholder="Введите текст уведомления..."
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>

        <div className="notification-users-panel">
          <div className="table-header">
            <div>
              <h2>Получатели</h2>
              <p>{usersLoading ? "Загружаем пользователей..." : `Доступно: ${mobileUsers.length}`}</p>
            </div>

            <div className="table-header-actions">
              <button type="button" className="secondary-button" onClick={selectAllUsers} disabled={mobileUsers.length === 0}>
                Выбрать всех
              </button>
              <button type="button" className="secondary-button" onClick={clearUsers} disabled={selectedUserIds.length === 0}>
                Снять выбор
              </button>
            </div>
          </div>

          {mobileUsers.length === 0 ? (
            <div className="empty-state">По выбранным фильтрам нет активных пользователей приложения</div>
          ) : (
            <div className="notification-user-grid">
              {mobileUsers.map((user) => (
                <label className="notification-user-card" key={user.id}>
                  <input type="checkbox" checked={selectedUserIds.includes(user.id)} onChange={() => toggleUser(user.id)} />

                  <span>
                    <strong>{user.login}</strong>
                    <small>{getUserTargetLabel(user)}</small>
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
          <button className="primary-button" disabled={sending}>
            {sending ? "Создаем..." : "Создать уведомление"}
          </button>
        </div>
      </form>
    </div>
  );
}
