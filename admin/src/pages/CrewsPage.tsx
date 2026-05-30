import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { getAdminMe } from "../api/auth.api";
import type { AdminUser } from "../api/auth.api";
import { getAccessibleCities } from "../api/cities.api";
import type { City } from "../api/cities.api";
import {
    createCrew,
    deleteCrew,
    getCrews,
    restoreCrew,
    updateCrew,
} from "../api/crews.api";
import type { Crew } from "../api/crews.api";
import { RowActionMenu } from "../components/RowActionMenu";

type FormState = {
    cityId: number;
    name: string;
    isActive: boolean;
};

const initialForm: FormState = {
    cityId: 0,
    name: "",
    isActive: true,
};

export function CrewsPage() {
    const [cities, setCities] = useState<City[]>([]);
    const [crews, setCrews] = useState<Crew[]>([]);
    const [selectedCityId, setSelectedCityId] = useState<number>(0);
    const [showArchive, setShowArchive] = useState(false);

    const [form, setForm] = useState<FormState>(initialForm);
    const [editingCrew, setEditingCrew] = useState<Crew | null>(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);

    const activeCities = useMemo(
        () => cities.filter((city) => city.isActive),
        [cities]
    );
    const roleCode = currentUser?.role?.code;
    const canEditCrews = roleCode === "super_admin" || roleCode === "admin";
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

            const crewsData = await getCrews(firstCityId || undefined, showArchive);
            setCrews(crewsData);
        } catch {
            setError("Не удалось загрузить данные");
        } finally {
            setLoading(false);
        }
    }

    async function loadCrews(cityId = selectedCityId, archive = showArchive) {
        setError("");

        try {
            const data = await getCrews(cityId || undefined, archive);
            setCrews(data);
        } catch {
            setError("Не удалось загрузить наряды");
        }
    }

    useEffect(() => {
        async function loadCurrentUser() {
            try {
                const response = await getAdminMe();
                setCurrentUser(response.user);
            } catch {
                setCurrentUser(null);
            }
        }

        loadCurrentUser();
        loadInitialData();
    }, []);

    async function handleCityFilterChange(cityId: number) {
        setSelectedCityId(cityId);

        setForm((prev) => ({
            ...prev,
            cityId: cityId || activeCities[0]?.id || 0,
        }));

        await loadCrews(cityId, showArchive);
    }
    async function handleArchiveFilterChange(value: string) {
        const archive = value === "archive";

        setShowArchive(archive);
        setEditingCrew(null);

        setForm({
            ...initialForm,
            cityId: selectedCityId || activeCities[0]?.id || 0,
        });

        setError("");
        setSuccess("");

        await loadCrews(selectedCityId, archive);
    }
    function startEdit(crew: Crew) {
        setEditingCrew(crew);

        setForm({
            cityId: crew.cityId,
            name: crew.name,
            isActive: crew.isActive,
        });

        setError("");
        setSuccess("");
    }

    function resetForm() {
        setEditingCrew(null);

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
            setError("Введите позывной наряда");
            return;
        }

        setSaving(true);
        setError("");
        setSuccess("");

        try {
            if (editingCrew) {
                await updateCrew(editingCrew.id, {
                    cityId: form.cityId,
                    name: form.name.trim(),
                    isActive: form.isActive,
                });

                setSuccess("Наряд обновлен");
            } else {
                await createCrew({
                    cityId: form.cityId,
                    name: form.name.trim(),
                    isActive: form.isActive,
                });

                setSuccess("Наряд добавлен");
            }

            resetForm();
            await loadCrews(selectedCityId);
        } catch (err: any) {
            if (err.response?.data?.message) {
                setError(err.response.data.message);
            } else if (err.response?.status === 409) {
                setError("Наряд с таким названием уже существует в этом городе");
            } else {
                setError("Не удалось сохранить наряд");
            }
        } finally {
            setSaving(false);
        }
    }

    async function handleToggleActive(crew: Crew) {
        setError("");
        setSuccess("");

        try {
            await updateCrew(crew.id, {
                isActive: !crew.isActive,
            });

            setSuccess(crew.isActive ? "Наряд отключен" : "Наряд включен");
            await loadCrews(selectedCityId);
        } catch {
            setError("Не удалось изменить статус наряда");
        }
    }
    async function handleRestore(crew: Crew) {
        setError("");
        setSuccess("");

        try {
            await restoreCrew(crew.id);
            setSuccess("Наряд восстановлен");
            await loadCrews(selectedCityId, showArchive);
        } catch {
            setError("Не удалось восстановить наряд");
        }
    }
    async function handleDelete(crew: Crew) {
        const confirmed = window.confirm(
            `Удалить наряд "${crew.name}"? Он будет скрыт из системы.`
        );

        if (!confirmed) return;

        setError("");
        setSuccess("");

        try {
            await deleteCrew(crew.id);
            setSuccess("Наряд удален");
            await loadCrews(selectedCityId);
        } catch {
            setError("Не удалось удалить наряд");
        }
    }

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Наряды</h1>
                    <p>Управление позывными нарядов по городам</p>
                </div>
            </div>

            <div className="content-grid">
                {canEditCrews && (
                    <form className="panel-card" onSubmit={handleSubmit}>
                        <h2>{editingCrew ? "Редактировать наряд" : "Добавить наряд"}</h2>

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
                            <span>Позывной наряда</span>
                            <input
                                value={form.name}
                                onChange={(event) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        name: event.target.value,
                                    }))
                                }
                                placeholder="Например: Байкал 1"
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
                            <span>Наряд активен</span>
                        </label>

                        {error && <div className="form-error">{error}</div>}
                        {success && <div className="form-success">{success}</div>}

                        <div className="form-actions">
                            <button className="primary-button" disabled={saving}>
                                {saving
                                    ? "Сохранение..."
                                    : editingCrew
                                        ? "Сохранить"
                                        : "Добавить"}
                            </button>

                            {editingCrew && (
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
                            <h2>Список нарядов</h2>
                            <p>Всего: {crews.length}</p>
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
                                onClick={() => loadCrews(selectedCityId)}
                            >
                                Обновить
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="empty-state">Загрузка...</div>
                    ) : crews.length === 0 ? (
                        <div className="empty-state">
                            {showArchive ? "В архиве нет нарядов" : "Наряды еще не добавлены"}
                        </div>
                    ) : (
                        <div className="table-wrap">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Позывной</th>
                                        <th>Город</th>
                                        <th>Статус</th>
                                        {canEditCrews && <th>Действия</th>}
                                    </tr>
                                </thead>

                                <tbody>
                                    {crews.map((crew) => (
                                        <tr key={crew.id}>
                                            <td>{crew.id}</td>
                                            <td>
                                                <strong>{crew.name}</strong>
                                            </td>
                                            <td>{crew.city?.name ?? crew.cityId}</td>
                                            <td>
                                                {showArchive ? (
                                                    <span className="status-badge status-inactive">В архиве</span>
                                                ) : (
                                                    <span
                                                        className={
                                                            crew.isActive
                                                                ? "status-badge status-active"
                                                                : "status-badge status-inactive"
                                                        }
                                                    >
                                                        {crew.isActive ? "Активен" : "Отключен"}
                                                    </span>
                                                )}
                                            </td>
                                            {canEditCrews && (
                                            <td className="actions-cell">
                                            {showArchive ? (
                                              <RowActionMenu
                                                items={[
                                                  {
                                                    label: "Восстановить",
                                                    onClick: () => handleRestore(crew),
                                                  },
                                                ]}
                                              />
                                            ) : (
                                              <RowActionMenu
                                                items={[
                                                  {
                                                    label: "Редактировать",
                                                    variant: "edit",
                                                    onClick: () => startEdit(crew),
                                                  },
                                                  {
                                                    label: crew.isActive ? "Отключить" : "Включить",
                                                    onClick: () => handleToggleActive(crew),
                                                  },
                                                  {
                                                    label: "Удалить",
                                                    variant: "danger",
                                                    onClick: () => handleDelete(crew),
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