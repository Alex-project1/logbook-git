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
  if (!systemCode) return "Обычная цель";

  const labels: Record<string, string> = {
    alarm_oh: "Спрацювання ОХ",
    alarm_partner: "Спрацювання Партнери",
    additional_alarm_list: "Список спрацювань",
    wash: "Мойка",
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
      setError("Не удалось загрузить цели поїздок");
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
      openFormWithError("Введите название цели поїздки");
      return;
    }
    const sortOrder = getSortOrderValue();

    if (Number.isNaN(sortOrder)) {
      openFormWithError("Порядок должен быть целым числом");
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

        setSuccess("Ціль поїздки оновленоа");
      } else {
        await createTripGoal({
          name: form.name.trim(),
          sortOrder,
          isActive: form.isActive,
        });

        setSuccess("Ціль поїздки доданоа");
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
        setError("Цель с таким названием уже существует");
      } else {
        setError("Не удалось зберегти цель поїздки");
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

      setSuccess(goal.isActive ? "Цель отключена" : "Цель включена");
      await loadTripGoals(showArchive);
    } catch {
      setError("Не удалось изменить статус цели");
    }
  }
  async function handleRestore(goal: TripGoal) {
    setError("");
    setSuccess("");

    try {
      await restoreTripGoal(goal.id);
      setSuccess("Цель відновленоа");
      await loadTripGoals(showArchive);
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError(
          "Нельзя восстановить: активная цель с таким названием уже существует",
        );
      } else {
        setError("Не удалось восстановить цель");
      }
    }
  }
  async function handleDelete(goal: TripGoal) {
    if (goal.isSystem) {
      setError("Системную цель нельзя удалить. Ее можно только отключить.");
      return;
    }

    const confirmed = window.confirm(
      `Удалить цель "${goal.name}"? Она будет скрыта из системы.`,
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      await deleteTripGoal(goal.id);
      setSuccess("Цель удалена");
      await loadTripGoals(showArchive);
    } catch {
      setError("Не удалось удалить цель");
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Цілі поїздок</h1>
          <p>Глобальный справочник целей для всех городов</p>
        </div>
      </div>

      <div className="content-grid">
        {!showArchive && (
          <form className="panel-card" onSubmit={handleSubmit}>
            <AccordionSection
              title={
                editingGoal ? "Редагувати цель" : "Додати цель поїздки"
              }
              subtitle="Назва, порядок отображения и статус цели"
              open={openedSections.form}
              onToggle={() => toggleSection("form")}
            >
              {editingGoal?.isSystem && (
                <div className="info-box">
                  Это системная цель. Можно изменить название, порядок и статус,
                  но нельзя изменить системный код или удалить цель.
                </div>
              )}

              <label className="field">
                <span>Назва цели</span>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Например: Патруль"
                />
              </label>

              <label className="field">
                <span>Порядок отображения</span>
                <input
                  value={form.sortOrder}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      sortOrder: event.target.value,
                    }))
                  }
                  inputMode="numeric"
                  placeholder="Например: 100"
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
                <span>Цель активна</span>
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
            <h2>Архів целей</h2>
            <div className="info-box">
              Здесь отображаются удаленные обычные цели поїздок. Системные цели
              в архив не попадают — их можно только включать или отключать.
            </div>

            {error && <div className="form-error">{error}</div>}
            {success && <div className="form-success">{success}</div>}
          </div>
        )}
        <AccordionSection
          title="Список целей"
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
                  <option value={10}>10 строк</option>
                  <option value={20}>20 строк</option>
                  <option value={50}>50 строк</option>
                  <option value={100}>100 строк</option>
                </select>
                <select
                  className="compact-select"
                  value={showArchive ? "archive" : "active"}
                  onChange={(event) =>
                    handleArchiveFilterChange(event.target.value)
                  }
                >
                  <option value="active">Рабочие</option>
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
                  ? "В архіве нет целей поїздок"
                  : "Цілі поїздок еще не доданоы"}
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
                              {goal.isSystem ? "Системная" : "Обычная"}
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
                                В архіве
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
                                      ? "Отключить"
                                      : "Включить",
                                    onClick: () => handleToggleActive(goal),
                                  },
                                  ...(!goal.isSystem
                                    ? [
                                        {
                                          label: "Удалить",
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
                      Страница {page} из {totalPages}
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
