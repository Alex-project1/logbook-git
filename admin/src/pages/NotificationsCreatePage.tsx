import { useEffect, useMemo, useState } from "react";
import { getAccessibleCities } from "../api/cities.api";
import type { City } from "../api/cities.api";
import { getMobileUsers } from "../api/mobile-users.api";
import type { MobileUser } from "../api/mobile-users.api";
import { createNotification } from "../api/notifications.api";

export function NotificationsCreatePage() {
  const [cities, setCities] = useState<City[]>([]);
  const [mobileUsers, setMobileUsers] = useState<MobileUser[]>([]);

  const [cityId, setCityId] = useState(0);
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
    [cities, cityId]
  );

  useEffect(() => {
    async function loadCities() {
      setLoading(true);
      setError("");

      try {
        const data = await getAccessibleCities(false);
        setCities(data);

        if (data.length > 0) {
          setCityId(data[0].id);
        }
      } catch {
        setError("Не удалось загрузить города");
      } finally {
        setLoading(false);
      }
    }

    loadCities();
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
        const data = await getMobileUsers(cityId, false);
        setMobileUsers(data.filter((user) => user.isActive));
        setSelectedUserIds([]);
      } catch {
        setError("Не удалось загрузить пользователей приложения");
      } finally {
        setUsersLoading(false);
      }
    }

    loadUsers();
  }, [cityId]);

  function toggleUser(userId: number) {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  }

  function selectAllUsers() {
    setSelectedUserIds(mobileUsers.map((user) => user.id));
  }

  function clearUsers() {
    setSelectedUserIds([]);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!cityId) {
      setError("Выберите город");
      return;
    }

    if (selectedUserIds.length === 0) {
      setError("Выберите хотя бы одного пользователя");
      return;
    }
    if (!title.trim()) {
      setError("Введите заголовок уведомления");
      return;
    }
    if (!message.trim()) {
      setError("Введите текст уведомления");
      return;
    }

    setSending(true);
    setError("");
    setSuccess("");

    try {
      await createNotification({
        cityId,
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
          <p>Отправка сообщения одному или нескольким пользователям приложения</p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}
      {success && <div className="form-success">{success}</div>}

      <form className="panel-card notification-create-card" onSubmit={handleSubmit}>
        <div className="notification-form-grid">
          <label className="field">
            <span>Город</span>
            <select
              value={cityId}
              onChange={(event) => setCityId(Number(event.target.value))}
            >
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          </label>

          <div className="notification-selected-card">
            <span>Выбрано пользователей</span>
            <strong>{selectedUserIds.length}</strong>
            <small>{selectedCity?.name ?? "Город не выбран"}</small>
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
            placeholder="Введите текст уведомления для наряда..."
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>

        <div className="notification-users-panel">
          <div className="table-header">
            <div>
              <h2>Получатели</h2>
              <p>
                {usersLoading
                  ? "Загружаем пользователей..."
                  : `Доступно: ${mobileUsers.length}`}
              </p>
            </div>

            <div className="table-header-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={selectAllUsers}
                disabled={mobileUsers.length === 0}
              >
                Выбрать всех
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={clearUsers}
                disabled={selectedUserIds.length === 0}
              >
                Снять выбор
              </button>
            </div>
          </div>

          {mobileUsers.length === 0 ? (
            <div className="empty-state">
              В выбранном городе нет активных пользователей приложения
            </div>
          ) : (
            <div className="notification-user-grid">
              {mobileUsers.map((user) => (
                <label className="notification-user-card" key={user.id}>
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(user.id)}
                    onChange={() => toggleUser(user.id)}
                  />

                  <span>
                    <strong>{user.login}</strong>
                    <small>{user.city?.name ?? selectedCity?.name ?? "—"}</small>
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