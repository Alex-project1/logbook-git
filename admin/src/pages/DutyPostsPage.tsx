import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { getAccessibleCities } from "../api/cities.api";
import type { City } from "../api/cities.api";
import { getAdminMe } from "../api/auth.api";
import type { AdminUser } from "../api/auth.api";
import {
  createDutyPost,
  deleteDutyPost,
  getDutyPosts,
  restoreDutyPost,
  updateDutyPost,
} from "../api/duty-posts.api";
import type { DutyPost } from "../api/duty-posts.api";
import { RowActionMenu } from "../components/RowActionMenu";

type FormState = {
  cityId: number;
  name: string;
  comment: string;
  isActive: boolean;
};

const initialForm: FormState = {
  cityId: 0,
  name: "",
  comment: "",
  isActive: true,
};

export function DutyPostsPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [posts, setPosts] = useState<DutyPost[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<number>(0);
  const [showArchive, setShowArchive] = useState(false);

  const [form, setForm] = useState<FormState>(initialForm);
  const [editingPost, setEditingPost] = useState<DutyPost | null>(null);

  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeCities = useMemo(
    () => cities.filter((city) => city.isActive),
    [cities]
  );

  const roleCode = currentUser?.role?.code;
  const canEditDutyPosts = roleCode === "super_admin" || roleCode === "admin";

  async function loadCurrentUser() {
    try {
      const response = await getAdminMe();
      setCurrentUser(response.user);
    } catch {
      setCurrentUser(null);
    }
  }

  async function loadInitialData() {
    setLoading(true);
    setError("");

    try {
      const citiesData = await getAccessibleCities();
      setCities(citiesData);

      const firstCityId = citiesData[0]?.id ?? 0;

      setSelectedCityId((current) => current || firstCityId);
      setForm((prev) => ({
        ...prev,
        cityId: prev.cityId || firstCityId,
      }));

      const postsData = await getDutyPosts(firstCityId || undefined, showArchive);
      setPosts(postsData);
    } catch {
      setError("Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }

  async function loadPosts(cityId = selectedCityId, archive = showArchive) {
    setError("");

    try {
      const data = await getDutyPosts(cityId || undefined, archive);
      setPosts(data);
    } catch {
      setError("Не удалось загрузить посты");
    }
  }

  useEffect(() => {
    loadCurrentUser();
    loadInitialData();
  }, []);

  async function handleCityFilterChange(cityId: number) {
    setSelectedCityId(cityId);

    setForm((prev) => ({
      ...prev,
      cityId: cityId || activeCities[0]?.id || 0,
    }));

    await loadPosts(cityId, showArchive);
  }

  async function handleArchiveFilterChange(value: string) {
    const archive = value === "archive";

    setShowArchive(archive);
    setEditingPost(null);

    setForm({
      ...initialForm,
      cityId: selectedCityId || activeCities[0]?.id || 0,
    });

    setError("");
    setSuccess("");

    await loadPosts(selectedCityId, archive);
  }

  function startEdit(post: DutyPost) {
    setEditingPost(post);

    setForm({
      cityId: post.cityId,
      name: post.name,
      comment: post.comment ?? "",
      isActive: post.isActive,
    });

    setError("");
    setSuccess("");
  }

  function resetForm() {
    setEditingPost(null);

    setForm({
      ...initialForm,
      cityId: selectedCityId || activeCities[0]?.id || 0,
    });

    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.cityId) {
      setError("Выберите город");
      return;
    }

    if (!form.name.trim()) {
      setError("Введите название поста");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (editingPost) {
        await updateDutyPost(editingPost.id, {
          cityId: form.cityId,
          name: form.name.trim(),
          comment: form.comment.trim() || null,
          isActive: form.isActive,
        });

        setSuccess("Пост обновлен");
      } else {
        await createDutyPost({
          cityId: form.cityId,
          name: form.name.trim(),
          comment: form.comment.trim() || null,
          isActive: form.isActive,
        });

        setSuccess("Пост добавлен");
      }

      resetForm();
      await loadPosts(selectedCityId, showArchive);
    } catch (err: any) {
      setError(err.response?.data?.message || "Не удалось сохранить пост");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(post: DutyPost) {
    setError("");
    setSuccess("");

    try {
      await updateDutyPost(post.id, {
        isActive: !post.isActive,
      });

      setSuccess(post.isActive ? "Пост отключен" : "Пост включен");
      await loadPosts(selectedCityId, showArchive);
    } catch (err: any) {
      setError(err.response?.data?.message || "Не удалось изменить статус поста");
    }
  }

  async function handleDelete(post: DutyPost) {
    const confirmed = window.confirm(
      `Удалить пост "${post.name}"? Он будет скрыт из системы.`
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      await deleteDutyPost(post.id);
      setSuccess("Пост удален");
      await loadPosts(selectedCityId, showArchive);
    } catch (err: any) {
      setError(err.response?.data?.message || "Не удалось удалить пост");
    }
  }

  async function handleRestore(post: DutyPost) {
    setError("");
    setSuccess("");

    try {
      await restoreDutyPost(post.id);
      setSuccess("Пост восстановлен");
      await loadPosts(selectedCityId, showArchive);
    } catch (err: any) {
      setError(err.response?.data?.message || "Не удалось восстановить пост");
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Посты</h1>
          <p>Справочник дополнительных и стационарных постов по городам</p>
        </div>
      </div>

      <div className="content-grid">
        {canEditDutyPosts && (
          <form className="panel-card" onSubmit={handleSubmit}>
            <h2>{editingPost ? "Редактировать пост" : "Добавить пост"}</h2>

            <label className="field">
              <span>Город</span>
              <select
                value={form.cityId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    cityId: Number(event.target.value),
                  }))
                }
              >
                <option value={0}>Выберите город</option>

                {activeCities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Название поста</span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                placeholder="Например: КПП-1"
              />
            </label>

            <label className="field">
              <span>Комментарий</span>
              <textarea
                value={form.comment}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    comment: event.target.value,
                  }))
                }
                placeholder="Необязательно"
                rows={3}
              />
            </label>

            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    isActive: event.target.checked,
                  }))
                }
              />
              <span>Пост активен</span>
            </label>

            {error && <div className="form-error">{error}</div>}
            {success && <div className="form-success">{success}</div>}

            <div className="form-actions">
              <button className="primary-button" disabled={saving}>
                {saving
                  ? "Сохранение..."
                  : editingPost
                    ? "Сохранить"
                    : "Добавить"}
              </button>

              {editingPost && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={resetForm}
                >
                  Отмена
                </button>
              )}
            </div>
          </form>
        )}

        <div className="panel-card table-card">
          <div className="table-header">
            <div>
              <h2>Список постов</h2>
              <p>Всего: {posts.length}</p>
            </div>

            <div className="table-header-actions">
              <select
                className="compact-select"
                value={selectedCityId}
                onChange={(event) =>
                  handleCityFilterChange(Number(event.target.value))
                }
              >
                <option value={0}>Все города</option>

                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>

              <select
                className="compact-select"
                value={showArchive ? "archive" : "active"}
                onChange={(event) => handleArchiveFilterChange(event.target.value)}
              >
                <option value="active">Рабочие</option>
                <option value="archive">Архив</option>
              </select>

              <button
                className="secondary-button"
                onClick={() => loadPosts(selectedCityId, showArchive)}
              >
                Обновить
              </button>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">Загрузка...</div>
          ) : posts.length === 0 ? (
            <div className="empty-state">
              {showArchive ? "В архиве нет постов" : "Посты еще не добавлены"}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Пост</th>
                    <th>Город</th>
                    <th>Комментарий</th>
                    <th>Статус</th>
                    {canEditDutyPosts && <th>Действия</th>}
                  </tr>
                </thead>

                <tbody>
                  {posts.map((post) => (
                    <tr key={post.id}>
                      <td>{post.id}</td>

                      <td>
                        <strong>{post.name}</strong>
                      </td>

                      <td>{post.city?.name ?? post.cityId}</td>

                      <td>{post.comment || "—"}</td>

                      <td>
                        {showArchive ? (
                          <span className="status-badge status-inactive">
                            В архиве
                          </span>
                        ) : (
                          <span
                            className={
                              post.isActive
                                ? "status-badge status-active"
                                : "status-badge status-inactive"
                            }
                          >
                            {post.isActive ? "Активен" : "Отключен"}
                          </span>
                        )}
                      </td>

                      {canEditDutyPosts && (
                    <td className="actions-cell">
                    {showArchive ? (
                      <RowActionMenu
                        items={[
                          {
                            label: "Восстановить",
                            onClick: () => handleRestore(post),
                          },
                        ]}
                      />
                    ) : (
                      <RowActionMenu
                        items={[
                          {
                            label: "Редактировать",
                            variant: "edit",
                            onClick: () => startEdit(post),
                          },
                          {
                            label: post.isActive ? "Отключить" : "Включить",
                            onClick: () => handleToggleActive(post),
                          },
                          {
                            label: "Удалить",
                            variant: "danger",
                            onClick: () => handleDelete(post),
                          },
                        ]}
                      />
                    )}
                  </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}