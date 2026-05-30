import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { getAccessibleCities } from "../api/cities.api";
import type { City } from "../api/cities.api";
import { getAdminMe } from "../api/auth.api";
import type { AdminUser } from "../api/auth.api";
import {
    createMobileUser,
    deleteMobileUser,
    getMobileUsers,
    restoreMobileUser,
    updateMobileUser,
} from "../api/mobile-users.api";
import type { MobileUser } from "../api/mobile-users.api";
import { RowActionMenu } from "../components/RowActionMenu";
import { AccordionSection } from "../components/AccordionSection";

type FormState = {
    cityId: number;
    login: string;
    password: string;
    isActive: boolean;
};

const initialForm: FormState = {
    cityId: 0,
    login: "",
    password: "",
    isActive: true,
};

export function MobileUsersPage() {
    const [cities, setCities] = useState<City[]>([]);
    const [mobileUsers, setMobileUsers] = useState<MobileUser[]>([]);
    const [selectedCityId, setSelectedCityId] = useState<number>(0);
    const [showArchive, setShowArchive] = useState(false);

    const [form, setForm] = useState<FormState>(initialForm);
    const [editingUser, setEditingUser] = useState<MobileUser | null>(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
    type MobileUsersSectionId = "form" | "list";

    const [openedSections, setOpenedSections] = useState<
        Record<MobileUsersSectionId, boolean>
    >({
        form: false,
        list: false,
    });

    function toggleSection(sectionId: MobileUsersSectionId) {
        setOpenedSections((prev) => ({
            ...prev,
            [sectionId]: !prev[sectionId],
        }));
    }
    const activeCities = useMemo(
        () => cities.filter((city) => city.isActive),
        [cities]
    );
    const roleCode = currentUser?.role?.code;
    const canEditMobileUsers = roleCode === "super_admin" || roleCode === "admin";

    async function loadInitialData() {
        setLoading(true);
        setError("");

        try {
            const citiesData = await getAccessibleCities();
            setCities(citiesData);

            const firstCityId = citiesData[0]?.id ?? 0;

            setSelectedCityId(0);

            setForm((prev) => ({
                ...prev,
                cityId: prev.cityId || firstCityId,
            }));

            const usersData = await getMobileUsers(undefined, showArchive);
            setMobileUsers(usersData);
        } catch {
            setError("Не удалось загрузить данные");
        } finally {
            setLoading(false);
        }
    }

    async function loadMobileUsers(
        cityId = selectedCityId,
        archive = showArchive
    ) {
        setError("");

        try {
            const data = await getMobileUsers(cityId || undefined, archive);
            setMobileUsers(data);
        } catch {
            setError("Не удалось загрузить пользователей приложения");
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

        await loadMobileUsers(cityId, showArchive);
    }
    async function handleArchiveFilterChange(value: string) {
        const archive = value === "archive";

        setShowArchive(archive);
        setEditingUser(null);

        setForm({
            ...initialForm,
            cityId: selectedCityId || activeCities[0]?.id || 0,
        });

        setError("");
        setSuccess("");

        await loadMobileUsers(selectedCityId, archive);
    }
    function startEdit(user: MobileUser) {
        setEditingUser(user);

        setForm({
            cityId: user.cityId,
            login: user.login,
            password: "",
            isActive: user.isActive,
        });

        setError("");
        setSuccess("");
        setOpenedSections((prev) => ({
            ...prev,
            form: true,
        }));
    }

    function resetForm() {
        setEditingUser(null);

        setForm({
            ...initialForm,
            cityId: selectedCityId || activeCities[0]?.id || 0,
        });

        setError("");
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

        if (!form.cityId) {
            openFormWithError("Выберите город");
            return;
        }

        if (!form.login.trim()) {
            openFormWithError("Введите логин");
            return;
        }

        if (!editingUser && form.password.trim().length < 6) {
            openFormWithError("Пароль должен быть минимум 6 символов");
            return;
        }

        if (editingUser && form.password.trim() && form.password.trim().length < 6) {
            openFormWithError("Новый пароль должен быть минимум 6 символов");
            return;
        }

        setSaving(true);
        setError("");
        setSuccess("");

        try {
            if (editingUser) {
                await updateMobileUser(editingUser.id, {
                    cityId: form.cityId,
                    login: form.login.trim(),
                    password: form.password.trim() || undefined,
                    isActive: form.isActive,
                });

                setSuccess("Пользователь обновлен");
            } else {
                await createMobileUser({
                    cityId: form.cityId,
                    login: form.login.trim(),
                    password: form.password.trim(),
                    isActive: form.isActive,
                });

                setSuccess("Пользователь добавлен");
            }

            resetForm();

            setOpenedSections((prev) => ({
                ...prev,
                form: false,
                list: true,
            }));

            await loadMobileUsers(selectedCityId);
        } catch (err: any) {
            if (err.response?.status === 409) {
                setError("Пользователь с таким логином уже существует");
            } else {
                setError("Не удалось сохранить пользователя");
            }
        } finally {
            setSaving(false);
        }
    }

    async function handleToggleActive(user: MobileUser) {
        setError("");
        setSuccess("");

        try {
            await updateMobileUser(user.id, {
                isActive: !user.isActive,
            });

            setSuccess(user.isActive ? "Пользователь отключен" : "Пользователь включен");
            await loadMobileUsers(selectedCityId);
        } catch {
            setError("Не удалось изменить статус пользователя");
        }
    }
    async function handleRestore(user: MobileUser) {
        setError("");
        setSuccess("");

        try {
            await restoreMobileUser(user.id);
            setSuccess("Пользователь восстановлен");
            await loadMobileUsers(selectedCityId, showArchive);
        } catch {
            setError("Не удалось восстановить пользователя");
        }
    }
    async function handleDelete(user: MobileUser) {
        const confirmed = window.confirm(
            `Удалить пользователя "${user.login}"? Он будет скрыт из системы.`
        );

        if (!confirmed) return;

        setError("");
        setSuccess("");

        try {
            await deleteMobileUser(user.id);
            setSuccess("Пользователь удален");
            await loadMobileUsers(selectedCityId);
        } catch {
            setError("Не удалось удалить пользователя");
        }
    }

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Пользователи приложения</h1>
                    <p>Логины для входа нарядов в Android-приложение</p>
                </div>
            </div>

            <div className="content-grid">
                {canEditMobileUsers && (
                    <form className="panel-card" onSubmit={handleSubmit}>
                        <AccordionSection
                            title={
                                editingUser
                                    ? "Редактировать пользователя"
                                    : "Добавить пользователя"
                            }
                            subtitle="Город, логин, пароль и статус пользователя приложения"
                            open={openedSections.form}
                            onToggle={() => toggleSection("form")}
                        >

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
                                <span>Логин</span>
                                <input
                                    value={form.login}
                                    onChange={(event) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            login: event.target.value,
                                        }))
                                    }
                                    placeholder="Например: crew1"
                                    autoComplete="username"
                                />
                            </label>

                            <label className="field">
                                <span>
                                    {editingUser
                                        ? "Новый пароль, необязательно"
                                        : "Пароль"}
                                </span>
                                <input
                                    value={form.password}
                                    onChange={(event) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            password: event.target.value,
                                        }))
                                    }
                                    placeholder={
                                        editingUser
                                            ? "Оставьте пустым, чтобы не менять"
                                            : "Минимум 6 символов"
                                    }
                                    type="password"
                                    autoComplete="new-password"
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
                                <span>Пользователь активен</span>
                            </label>

                            {error && <div className="form-error">{error}</div>}
                            {success && <div className="form-success">{success}</div>}

                            <div className="form-actions">
                                <button className="primary-button" disabled={saving}>
                                    {saving
                                        ? "Сохранение..."
                                        : editingUser
                                            ? "Сохранить"
                                            : "Добавить"}
                                </button>

                                {editingUser && (
                                    <button
                                        type="button"
                                        className="secondary-button"
                                        onClick={resetForm}
                                    >
                                        Отмена
                                    </button>
                                )}
                            </div>
                        </AccordionSection>
                    </form>
                )}
                <div className="panel-card table-card">
                    <AccordionSection
                        title="Список пользователей"
                        subtitle={`Всего: ${mobileUsers.length} · ${selectedCityId ? "Выбран город" : "Все доступные города"
                            }`}
                        open={openedSections.list}
                        onToggle={() => toggleSection("list")}
                    >
                        <div className="table-header">
                            <div>
                                <h2>Список пользователей</h2>
                                <p>Всего: {mobileUsers.length}</p>
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
                                    onClick={() => loadMobileUsers(selectedCityId, showArchive)}
                                >
                                    Обновить
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="empty-state">Загрузка...</div>
                        ) : mobileUsers.length === 0 ? (
                            <div className="empty-state">
                                {showArchive
                                    ? "В архиве нет пользователей"
                                    : "Пользователи еще не добавлены"}
                            </div>
                        ) : (
                            <div className="table-wrap">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Логин</th>
                                            <th>Город</th>
                                            <th>Статус</th>
                                            {canEditMobileUsers && <th>Действия</th>}
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {mobileUsers.map((user) => (
                                            <tr key={user.id}>
                                                <td>{user.id}</td>
                                                <td>
                                                    <strong>{user.login}</strong>
                                                </td>
                                                <td>{user.city?.name ?? user.cityId}</td>
                                                <td>
                                                    <span
                                                        className={
                                                            user.isActive
                                                                ? "status-badge status-active"
                                                                : "status-badge status-inactive"
                                                        }
                                                    >
                                                        {showArchive ? (
                                                            <span className="status-badge status-inactive">В архиве</span>
                                                        ) : (
                                                            <span
                                                                className={
                                                                    user.isActive
                                                                        ? "status-badge status-active"
                                                                        : "status-badge status-inactive"
                                                                }
                                                            >
                                                                {user.isActive ? "Активен" : "Отключен"}
                                                            </span>
                                                        )}
                                                    </span>
                                                </td>
                                                {canEditMobileUsers && (
                                                    <td className="actions-cell">
                                                        {showArchive ? (
                                                            <RowActionMenu
                                                                items={[
                                                                    {
                                                                        label: "Восстановить",
                                                                        onClick: () => handleRestore(user),
                                                                    },
                                                                ]}
                                                            />
                                                        ) : (
                                                            <RowActionMenu
                                                                items={[
                                                                    {
                                                                        label: "Редактировать",
                                                                        variant: "edit",
                                                                        onClick: () => startEdit(user),
                                                                    },
                                                                    {
                                                                        label: user.isActive ? "Отключить" : "Включить",
                                                                        onClick: () => handleToggleActive(user),
                                                                    },
                                                                    {
                                                                        label: "Удалить",
                                                                        variant: "danger",
                                                                        onClick: () => handleDelete(user),
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
                    </AccordionSection>
                </div>
            </div>
        </div>
    );
}