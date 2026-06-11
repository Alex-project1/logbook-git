import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  createCity,
  deleteCity,
  getCities,
  restoreCity,
  updateCity,
} from "../api/cities.api";
import type { City } from "../api/cities.api";
import { RowActionMenu } from "../components/RowActionMenu";
import { AccordionSection } from "../components/AccordionSection";

type FormState = {
  name: string;
  isActive: boolean;
};

const initialForm: FormState = {
  name: "",
  isActive: true,
};

export function CitiesPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [editingCity, setEditingCity] = useState<City | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  type SectionId = "form" | "list";

  const [openedSections, setOpenedSections] = useState<
    Record<SectionId, boolean>
  >({
    form: false,
    list: true,
  });

  function toggleSection(section: SectionId) {
    setOpenedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }

  async function loadCities(archive = showArchive) {
    setLoading(true);
    setError("");

    try {
      const data = await getCities(archive);
      setCities(data);
    } catch {
      setError("Не вдалося завантажити міста");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCities();
  }, []);

  function startEdit(city: City) {
    setEditingCity(city);
    setForm({
      name: city.name,
      isActive: city.isActive,
    });

    setError("");
    setSuccess("");
  }

  function resetForm() {
    setEditingCity(null);
    setForm(initialForm);
    setError("");
  }

  async function handleArchiveFilterChange(value: string) {
    const archive = value === "archive";

    setShowArchive(archive);
    setEditingCity(null);
    setForm(initialForm);
    setError("");
    setSuccess("");

    await loadCities(archive);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Введіть назву міста");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (editingCity) {
        await updateCity(editingCity.id, {
          name: form.name.trim(),
          isActive: form.isActive,
        });

        setSuccess("Місто оновлено");
      } else {
        await createCity({
          name: form.name.trim(),
          isActive: form.isActive,
        });

        setSuccess("Місто додано");
      }

      resetForm();
      await loadCities(showArchive);
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError("Місто з такою назвою вже існує");
      } else {
        setError("Не вдалося зберегти місто");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(city: City) {
    setError("");
    setSuccess("");

    try {
      await updateCity(city.id, {
        isActive: !city.isActive,
      });

      setSuccess(city.isActive ? "Місто вимкнено" : "Місто увімкнено");
      await loadCities(showArchive);
    } catch {
      setError("Не вдалося змінити статус міста");
    }
  }

  async function handleRestore(city: City) {
    setError("");
    setSuccess("");

    try {
      await restoreCity(city.id);
      setSuccess("Місто відновлено");
      await loadCities(showArchive);
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError(
          "Не можна відновити: активне місто з такою назвою вже існує",
        );
      } else {
        setError("Не вдалося відновити місто");
      }
    }
  }

  async function handleDelete(city: City) {
    const confirmed = window.confirm(
      `Видалити місто "${city.name}"? Його буде переміщено до архіву.`,
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      await deleteCity(city.id);
      setSuccess("Місто переміщено до архіву");
      await loadCities(showArchive);
    } catch {
      setError("Не вдалося видалити місто");
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Міста</h1>
          <p>Керування містами системи</p>
        </div>
      </div>

      <div className="content-grid">
        {!showArchive && (
          <AccordionSection
            title={editingCity ? "Редагувати місто" : "Додати місто"}
            subtitle="Створення та редагування міст"
            open={openedSections.form}
            onToggle={() => toggleSection("form")}
          >
            <form onSubmit={handleSubmit}>
              <label className="field">
                <span>Назва міста</span>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Наприклад: Харків"
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
                <span>Місто активне</span>
              </label>

              {error && <div className="form-error">{error}</div>}
              {success && <div className="form-success">{success}</div>}

              <div className="form-actions">
                <button className="primary-button" disabled={saving}>
                  {saving
                    ? "Збереження..."
                    : editingCity
                      ? "Зберегти"
                      : "Додати"}
                </button>

                {editingCity && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={resetForm}
                  >
                    Скасувати
                  </button>
                )}
              </div>
            </form>
          </AccordionSection>
        )}

        {showArchive && (
          <div className="panel-card">
            <h2>Архів міст</h2>
            <div className="info-box">
              Тут відображаються видалені міста. Їх можна відновити, якщо
              потрібно повернути пов’язані довідники та доступи.
            </div>

            {error && <div className="form-error">{error}</div>}
            {success && <div className="form-success">{success}</div>}
          </div>
        )}

        <AccordionSection
          title={showArchive ? "Архів міст" : "Список міст"}
          subtitle={`Усього: ${cities.length}`}
          open={openedSections.list}
          onToggle={() => toggleSection("list")}
        >
          <div className="table-card">
            <div className="table-header">
              <div>
                <h2>{showArchive ? "Архів міст" : "Список міст"}</h2>
                <p>Усього: {cities.length}</p>
              </div>

              <div className="table-header-actions">
                <select
                  className="compact-select"
                  value={showArchive ? "archive" : "active"}
                  onChange={(event) =>
                    handleArchiveFilterChange(event.target.value)
                  }
                >
                  <option value="active">Активні</option>
                  <option value="archive">Архів</option>
                </select>

                <button
                  className="secondary-button"
                  onClick={() => loadCities(showArchive)}
                >
                  Оновити
                </button>
              </div>
            </div>

            {loading ? (
              <div className="empty-state">Завантаження...</div>
            ) : cities.length === 0 ? (
              <div className="empty-state">
                {showArchive
                  ? "В архіві немає міст"
                  : "Міста ще не додано"}
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Назва</th>
                      <th>Статус</th>
                      <th>{showArchive ? "Видалено" : "Створено"}</th>
                      <th></th>
                    </tr>
                  </thead>

                  <tbody>
                    {cities.map((city) => (
                      <tr key={city.id}>
                        <td>{city.id}</td>
                        <td>
                          <strong>{city.name}</strong>
                        </td>
                        <td>
                          {showArchive ? (
                            <span className="status-badge status-inactive">
                              В архіві
                            </span>
                          ) : (
                            <span
                              className={
                                city.isActive
                                  ? "status-badge status-active"
                                  : "status-badge status-inactive"
                              }
                            >
                              {city.isActive ? "Активне" : "Вимкнене"}
                            </span>
                          )}
                        </td>
                        <td>
                          {new Date(
                            showArchive && city.deletedAt
                              ? city.deletedAt
                              : city.createdAt,
                          ).toLocaleDateString("uk-UA")}
                        </td>
                        <td className="actions-cell">
                          {showArchive ? (
                            <RowActionMenu
                              items={[
                                {
                                  label: "Відновити",
                                  onClick: () => handleRestore(city),
                                },
                              ]}
                            />
                          ) : (
                            <RowActionMenu
                              items={[
                                {
                                  label: "Редагувати",
                                  variant: "edit",
                                  onClick: () => startEdit(city),
                                },
                                {
                                  label: city.isActive
                                    ? "Вимкнути"
                                    : "Увімкнути",
                                  onClick: () => handleToggleActive(city),
                                },
                                {
                                  label: "Видалити",
                                  variant: "danger",
                                  onClick: () => handleDelete(city),
                                },
                              ]}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </AccordionSection>
      </div>
    </div>
  );
}