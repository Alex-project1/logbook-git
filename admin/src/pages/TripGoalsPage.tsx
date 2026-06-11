import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import {
  createTripGoal,
  deleteTripGoal,
  getTripGoals,
  restoreTripGoal,
  updateTripGoal,
} from "../api/trip-goals.api";
import type { TripGoal } from "../api/trip-goals.api";
import { RowActionMenu } from "../components/RowActionMenu";
import { AccordionSection } from "../components/AccordionSection";

type FormState = {
  name: string;
  sortOrder: string;
  isActive: boolean;
};

type TripGoalsSectionId = "form" | "list";

const initialForm: FormState = {
  name: "",
  sortOrder: "100",
  isActive: true,
};

function getSystemGoalLabel(systemCode: string | null) {
  if (!systemCode) return "Звичайна ціль";

  const labels: Record<string, string> = {
    alarm_oh: "Спрацювання ОХ",
    alarm_partner: "Спрацювання партнерів",
    additional_alarm_list: "Список спрацювань",
    wash: "Мийка",
    shift_change: "Перезмінка",
    check: "Перевірка",
  };

  return labels[systemCode] ?? systemCode;
}

export function TripGoalsPage() {
  const [tripGoals, setTripGoals] = useState<TripGoal[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [editingGoal, setEditingGoal] = useState<TripGoal | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [openedSections, setOpenedSections] = useState<
    Record<TripGoalsSectionId, boolean>
  >({
    form: false,
    list: true,
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const totalPages = Math.max(Math.ceil(tripGoals.length / pageSize), 1);

  const paginatedTripGoals = tripGoals.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  function toggleSection(sectionId: TripGoalsSectionId) {
    setOpenedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }

  async function loadTripGoals(archive = showArchive) {
    setLoading(true);
    setError("");

    try {
      const data = await getTripGoals(archive);
      setTripGoals(data);
      setPage(1);
    } catch {
      setError("Не вдалося завантажити цілі поїздок");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTripGoals();
  }, []);

  function startEdit(goal: TripGoal) {
    setEditingGoal(goal);

    setForm({
      name: goal.name,
      sortOrder: String(goal.sortOrder),
      isActive: goal.isActive,
    });

    setError("");
    setSuccess("");
    setOpenedSections((prev) => ({
      ...prev,
      form: true,
    }));
  }

  function resetForm() {
    setEditingGoal(null);
    setForm(initialForm);
    setError("");
  }

  async function handleArchiveFilterChange(value: string) {
    const archive = value === "archive";

    setShowArchive(archive);
    setPage(1);
    setEditingGoal(null);
    setForm(initialForm);
    setError("");
    setSuccess("");

    await loadTripGoals(archive);
  }

  function getSortOrderValue() {
    const value = Number(form.sortOrder);

    if (!Number.isInteger(value)) {
      return NaN;
    }

    return value;
  }

  function openFormWithError(message: string) {
    setError(message);
    setSuccess("");

    setOpenedSections((prev) => ({
      ...prev,
      form: true,
    }));
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim()) {
      openFormWithError("Введіть назву цілі поїздки");
      return;
    }

    const sortOrder = getSortOrderValue();

    if (Number.isNaN(sortOrder)) {
      openFormWithError("Порядок має бути цілим числом");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (editingGoal) {
        await updateTripGoal(editingGoal.id, {
          name: form.name.trim(),
          sortOrder,
          isActive: form.isActive,
        });

        setSuccess("Ціль поїздки оновлено");
      } else {
        await createTripGoal({
          name: form.name.trim(),
          sortOrder,
          isActive: form.isActive,
        });

        setSuccess("Ціль поїздки додано");
      }

      resetForm();

      setOpenedSections((prev) => ({
        ...prev,
        form: false,
        list: true,
      }));

      await loadTripGoals(showArchive);
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError("Ціль із такою назвою вже існує");
      } else {
        setError("Не вдалося зберегти ціль поїздки");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(goal: TripGoal) {
    setError("");
    setSuccess("");

    try {
      await updateTripGoal(goal.id, {
        isActive: !goal.isActive,
      });

      setSuccess(goal.isActive ? "Ціль вимкнено" : "Ціль увімкнено");
      await loadTripGoals(showArchive);
    } catch {
      setError("Не вдалося змінити статус цілі");
    }
  }

  async function handleRestore(goal: TripGoal) {
    setError("");
    setSuccess("");

    try {
      await restoreTripGoal(goal.id);
      setSuccess("Ціль відновлено");
      await loadTripGoals(showArchive);
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError(
          "Не можна відновити: активна ціль із такою назвою вже існує",
        );
      } else {
        setError("Не вдалося відновити ціль");
      }
    }
  }

  async function handleDelete(goal: TripGoal) {
    if (goal.isSystem) {
      setError("Системну ціль не можна видалити. Її можна лише вимкнути.");
      return;
    }

    const confirmed = window.confirm(
      `Видалити ціль "${goal.name}"? Її буде приховано в системі.`,
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      await deleteTripGoal(goal.id);
      setSuccess("Ціль видалено");
      await loadTripGoals(showArchive);
    } catch {
      setError("Не вдалося видалити ціль");
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Цілі поїздок</h1>
          <p>Глобальний довідник цілей для всіх міст</p>
        </div>
      </div>

      <div className="content-grid">
        {!showArchive && (
          <form className="panel-card" onSubmit={handleSubmit}>
            <AccordionSection
              title={
                editingGoal ? "Редагувати ціль" : "Додати ціль поїздки"
              }
              subtitle="Назва, порядок відображення та статус цілі"
              open={openedSections.form}
              onToggle={() => toggleSection("form")}
            >
              {editingGoal?.isSystem && (
                <div className="info-box">
                  Це системна ціль. Можна змінити назву, порядок і статус,
                  але не можна змінити системний код або видалити ціль.
                </div>
              )}

              <label className="field">
                <span>Назва цілі</span>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Наприклад: Патруль"
                />
              </label>

              <label className="field">
                <span>Порядок відображення</span>
                <input
                  value={form.sortOrder}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      sortOrder: event.target.value,
                    }))
                  }
                  inputMode="numeric"
                  placeholder="Наприклад: 100"
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
                <span>Ціль активна</span>
              </label>

              {error && <div className="form-error">{error}</div>}
              {success && <div className="form-success">{success}</div>}

              <div className="form-actions">
                <button className="primary-button" disabled={saving}>
                  {saving
                    ? "Збереження..."
                    : editingGoal
                      ? "Зберегти"
                      : "Додати"}
                </button>

                {editingGoal && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={resetForm}
                  >
                    Скасувати
                  </button>
                )}
              </div>
            </AccordionSection>
          </form>
        )}

        {showArchive && (
          <div className="panel-card">
            <h2>Архів цілей</h2>
            <div className="info-box">
              Тут відображаються видалені звичайні цілі поїздок. Системні цілі
              до архіву не потрапляють — їх можна лише вмикати або вимикати.
            </div>

            {error && <div className="form-error">{error}</div>}
            {success && <div className="form-success">{success}</div>}
          </div>
        )}

        <AccordionSection
          title="Список цілей"
          subtitle={`Усього: ${tripGoals.length}`}
          open={openedSections.list}
          onToggle={() => toggleSection("list")}
        >
          <div className="panel-card table-card">
            <div className="table-header">
              <div className="table-header-actions">
                <select
                  className="compact-select"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10 рядків</option>
                  <option value={20}>20 рядків</option>
                  <option value={50}>50 рядків</option>
                  <option value={100}>100 рядків</option>
                </select>
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
                  onClick={() => loadTripGoals(showArchive)}
                >
                  Оновити
                </button>
              </div>
            </div>

            {loading ? (
              <div className="empty-state">Завантаження...</div>
            ) : tripGoals.length === 0 ? (
              <div className="empty-state">
                {showArchive
                  ? "В архіві немає цілей поїздок"
                  : "Цілі поїздок ще не додано"}
              </div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Назва</th>
                        <th>Тип</th>
                        <th>systemCode</th>
                        <th>Порядок</th>
                        <th>Статус</th>
                        <th></th>
                      </tr>
                    </thead>

                    <tbody>
                      {paginatedTripGoals.map((goal) => (
                        <tr key={goal.id}>
                          <td>{goal.id}</td>
                          <td>
                            <strong>{goal.name}</strong>
                          </td>
                          <td>
                            <span
                              className={
                                goal.isSystem
                                  ? "status-badge status-system"
                                  : "status-badge status-custom"
                              }
                            >
                              {goal.isSystem ? "Системна" : "Звичайна"}
                            </span>
                          </td>
                          <td>
                            <code className="inline-code">
                              {goal.systemCode || "—"}
                            </code>
                            <div className="muted-text">
                              {getSystemGoalLabel(goal.systemCode)}
                            </div>
                          </td>
                          <td>{goal.sortOrder}</td>
                          <td>
                            {showArchive ? (
                              <span className="status-badge status-inactive">
                                В архіві
                              </span>
                            ) : (
                              <span
                                className={
                                  goal.isActive
                                    ? "status-badge status-active"
                                    : "status-badge status-inactive"
                                }
                              >
                                {goal.isActive ? "Активна" : "Вимкнена"}
                              </span>
                            )}
                          </td>
                          <td className="actions-cell">
                            {showArchive ? (
                              <RowActionMenu
                                items={[
                                  {
                                    label: "Відновити",
                                    onClick: () => handleRestore(goal),
                                  },
                                ]}
                              />
                            ) : (
                              <RowActionMenu
                                items={[
                                  {
                                    label: "Редагувати",
                                    variant: "edit",
                                    onClick: () => startEdit(goal),
                                  },
                                  {
                                    label: goal.isActive
                                      ? "Вимкнути"
                                      : "Увімкнути",
                                    onClick: () => handleToggleActive(goal),
                                  },
                                  ...(!goal.isSystem
                                    ? [
                                        {
                                          label: "Видалити",
                                          variant: "danger" as const,
                                          onClick: () => handleDelete(goal),
                                        },
                                      ]
                                    : []),
                                ]}
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="pagination-bar">
                    <button
                      className="secondary-button"
                      disabled={page <= 1}
                      onClick={() =>
                        setPage((current) => Math.max(current - 1, 1))
                      }
                    >
                      Назад
                    </button>

                    <span>
                      Сторінка {page} з {totalPages}
                    </span>

                    <button
                      className="secondary-button"
                      disabled={page >= totalPages}
                      onClick={() =>
                        setPage((current) => Math.min(current + 1, totalPages))
                      }
                    >
                      Вперед
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </AccordionSection>
      </div>
    </div>
  );
}