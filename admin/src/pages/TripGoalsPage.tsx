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

type FormState = {
    name: string;
    sortOrder: string;
    isActive: boolean;
};

const initialForm: FormState = {
    name: "",
    sortOrder: "100",
    isActive: true,
};

function getSystemGoalLabel(systemCode: string | null) {
    if (!systemCode) return "Обычная цель";

    const labels: Record<string, string> = {
        alarm_oh: "Сработка ОХ",
        alarm_partner: "Сработка Партнеры",
        additional_alarm_list: "Список сработок",
        wash: "Мойка",
        shift_change: "Пересменка",
        check: "Проверка",
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

    async function loadTripGoals(archive = showArchive) {
        setLoading(true);
        setError("");

        try {
            const data = await getTripGoals(archive);
            setTripGoals(data);
        } catch {
            setError("Не удалось загрузить цели поездок");
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
    }

    function resetForm() {
        setEditingGoal(null);
        setForm(initialForm);
        setError("");
    }
    async function handleArchiveFilterChange(value: string) {
        const archive = value === "archive";

        setShowArchive(archive);
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

    async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!form.name.trim()) {
            setError("Введите название цели поездки");
            return;
        }

        const sortOrder = getSortOrderValue();

        if (Number.isNaN(sortOrder)) {
            setError("Порядок должен быть целым числом");
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

                setSuccess("Цель поездки обновлена");
            } else {
                await createTripGoal({
                    name: form.name.trim(),
                    sortOrder,
                    isActive: form.isActive,
                });

                setSuccess("Цель поездки добавлена");
            }

            resetForm();
            await loadTripGoals(showArchive);
        } catch (err: any) {
            if (err.response?.status === 409) {
                setError("Цель с таким названием уже существует");
            } else {
                setError("Не удалось сохранить цель поездки");
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
            setSuccess("Цель восстановлена");
            await loadTripGoals(showArchive);
        } catch (err: any) {
            if (err.response?.status === 409) {
                setError("Нельзя восстановить: активная цель с таким названием уже существует");
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
            `Удалить цель "${goal.name}"? Она будет скрыта из системы.`
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
                    <h1>Цели поездок</h1>
                    <p>Глобальный справочник целей для всех городов</p>
                </div>
            </div>

            <div className="content-grid">
                {!showArchive && (
                    <form className="panel-card" onSubmit={handleSubmit}>
                        <h2>
                            {editingGoal ? "Редактировать цель" : "Добавить цель поездки"}
                        </h2>

                        {editingGoal?.isSystem && (
                            <div className="info-box">
                                Это системная цель. Можно изменить название, порядок и статус, но
                                нельзя изменить системный код или удалить цель.
                            </div>
                        )}

                        <label className="field">
                            <span>Название цели</span>
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
                                    ? "Сохранение..."
                                    : editingGoal
                                        ? "Сохранить"
                                        : "Добавить"}
                            </button>

                            {editingGoal && (
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

                {showArchive && (
                    <div className="panel-card">
                        <h2>Архив целей</h2>
                        <div className="info-box">
                            Здесь отображаются удаленные обычные цели поездок. Системные цели в
                            архив не попадают — их можно только включать или отключать.
                        </div>

                        {error && <div className="form-error">{error}</div>}
                        {success && <div className="form-success">{success}</div>}
                    </div>
                )}
                <div className="panel-card table-card">
                    <div className="table-header">
                        <div>
                            <h2>Список целей</h2>
                            <p>Всего: {tripGoals.length}</p>
                        </div>

                        <div className="table-header-actions">
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
                                onClick={() => loadTripGoals(showArchive)}
                            >
                                Обновить
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="empty-state">Загрузка...</div>
                    ) : tripGoals.length === 0 ? (
                        <div className="empty-state">
                            {showArchive ? "В архиве нет целей поездок" : "Цели поездок еще не добавлены"}
                        </div>
                    ) : (
                        <div className="table-wrap">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Название</th>
                                        <th>Тип</th>
                                        <th>systemCode</th>
                                        <th>Порядок</th>
                                        <th>Статус</th>
                                        <th></th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {tripGoals.map((goal) => (
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
                                                    <span className="status-badge status-inactive">В архиве</span>
                                                ) : (
                                                    <span
                                                        className={
                                                            goal.isActive
                                                                ? "status-badge status-active"
                                                                : "status-badge status-inactive"
                                                        }
                                                    >
                                                        {goal.isActive ? "Активна" : "Отключена"}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="actions-cell">
  {showArchive ? (
    <RowActionMenu
      items={[
        {
          label: "Восстановить",
          onClick: () => handleRestore(goal),
        },
      ]}
    />
  ) : (
    <RowActionMenu
      items={[
        {
          label: "Редактировать",
          variant: "edit",
          onClick: () => startEdit(goal),
        },
        {
          label: goal.isActive ? "Отключить" : "Включить",
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
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}