import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { getAdminMe } from "../api/auth.api";
import type { AdminUser } from "../api/auth.api";
import { getAccessibleCities } from "../api/cities.api";
import type { City } from "../api/cities.api";
import {
    createEmployee,
    deleteEmployee,
    getEmployees,
    restoreEmployee,
    updateEmployee,
} from "../api/employees.api";
import type { Employee } from "../api/employees.api";
import { RowActionMenu } from "../components/RowActionMenu";
import { AccordionSection } from "../components/AccordionSection";

type FormState = {
    cityId: number;
    fullName: string;
    isActive: boolean;
};

const initialForm: FormState = {
    cityId: 0,
    fullName: "",
    isActive: true,
};
export function EmployeesPage() {
    const [cities, setCities] = useState<City[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [selectedCityId, setSelectedCityId] = useState<number>(0);
    const [showArchive, setShowArchive] = useState(false);

    const [form, setForm] = useState<FormState>(initialForm);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
    type EmployeesSectionId = "form" | "list";

    const [openedSections, setOpenedSections] = useState<
        Record<EmployeesSectionId, boolean>
    >({
        form: false,
        list: true,
    });

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    function toggleSection(sectionId: EmployeesSectionId) {
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
    const canEditEmployees = roleCode === "super_admin" || roleCode === "admin";

    const totalPages = Math.max(Math.ceil(employees.length / pageSize), 1);

    const paginatedEmployees = useMemo(() => {
        const start = (page - 1) * pageSize;
        return employees.slice(start, start + pageSize);
    }, [employees, page, pageSize]);

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

            const employeesData = await getEmployees(undefined, showArchive);
            setEmployees(employeesData);
            setPage(1);
        } catch {
            setError("Не удалось загрузить данные");
        } finally {
            setLoading(false);
        }
    }

    async function loadEmployees(
        cityId = selectedCityId,
        archive = showArchive
    ) {
        setError("");

        try {
            const data = await getEmployees(cityId || undefined, archive);
            setEmployees(data);
        } catch {
            setError("Не удалось загрузить сотрудников");
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
        setPage(1);
        setForm((prev) => ({
            ...prev,
            cityId: cityId || activeCities[0]?.id || 0,
        }));

        await loadEmployees(cityId, showArchive);
    }
    async function handleArchiveFilterChange(value: string) {
        const archive = value === "archive";

        setShowArchive(archive);
        setPage(1);
        setEditingEmployee(null);

        setForm({
            ...initialForm,
            cityId: selectedCityId || activeCities[0]?.id || 0,
        });

        setError("");
        setSuccess("");

        await loadEmployees(selectedCityId, archive);
    }
    function startEdit(employee: Employee) {
        setEditingEmployee(employee);
        setForm({
            cityId: employee.cityId,
            fullName: employee.fullName,
            isActive: employee.isActive,
        });

        setError("");
        setSuccess("");
        setOpenedSections((prev) => ({
            ...prev,
            form: true,
        }));
    }

    function resetForm() {
        setEditingEmployee(null);
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
    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!form.cityId) {
            openFormWithError("Выберите город");
            return;
        }

        if (!form.fullName.trim()) {
            openFormWithError("Введите ФИО сотрудника");
            return;
        }

        setSaving(true);
        setError("");
        setSuccess("");

        try {
            if (editingEmployee) {
                await updateEmployee(editingEmployee.id, {
                    cityId: form.cityId,
                    fullName: form.fullName.trim(),
                    isActive: form.isActive,
                });

                setSuccess("Сотрудник обновлен");
            } else {
                await createEmployee({
                    cityId: form.cityId,
                    fullName: form.fullName.trim(),
                    isActive: form.isActive,
                });

                setSuccess("Сотрудник добавлен");
            }

            resetForm();

            setOpenedSections((prev) => ({
                ...prev,
                form: false,
                list: true,
            }));

            setPage(1);
            await loadEmployees(selectedCityId, showArchive);
        } catch {
            setError("Не удалось сохранить сотрудника");
        } finally {
            setSaving(false);
        }
    }

    async function handleToggleActive(employee: Employee) {
        setError("");
        setSuccess("");

        try {
            await updateEmployee(employee.id, {
                isActive: !employee.isActive,
            });

            setSuccess(employee.isActive ? "Сотрудник отключен" : "Сотрудник включен");
            await loadEmployees(selectedCityId);
        } catch {
            setError("Не удалось изменить статус сотрудника");
        }
    }
    async function handleRestore(employee: Employee) {
        setError("");
        setSuccess("");

        try {
            await restoreEmployee(employee.id);
            setSuccess("Сотрудник восстановлен");
            await loadEmployees(selectedCityId, showArchive);
        } catch {
            setError("Не удалось восстановить сотрудника");
        }
    }
    async function handleDelete(employee: Employee) {
        const confirmed = window.confirm(
            `Удалить сотрудника "${employee.fullName}"? Он будет скрыт из системы.`
        );

        if (!confirmed) return;

        setError("");
        setSuccess("");

        try {
            await deleteEmployee(employee.id);
            setSuccess("Сотрудник удален");
            await loadEmployees(selectedCityId);
        } catch {
            setError("Не удалось удалить сотрудника");
        }
    }

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Сотрудники</h1>
                    <p>Управление сотрудниками по городам</p>
                </div>
            </div>

            <div className="content-grid">
                {canEditEmployees && (
                    <form className="panel-card" onSubmit={handleSubmit}>
                        <AccordionSection
                            title={
                                editingEmployee
                                    ? "Редактировать сотрудника"
                                    : "Добавить сотрудника"
                            }
                            subtitle="Город, ФИО и статус сотрудника"
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
                                <span>ФИО</span>
                                <input
                                    value={form.fullName}
                                    onChange={(event) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            fullName: event.target.value,
                                        }))
                                    }
                                    placeholder="Например: Иванов Иван Иванович"
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
                                <span>Сотрудник активен</span>
                            </label>

                            {error && <div className="form-error">{error}</div>}
                            {success && <div className="form-success">{success}</div>}

                            <div className="form-actions">
                                <button className="primary-button" disabled={saving}>
                                    {saving
                                        ? "Сохранение..."
                                        : editingEmployee
                                            ? "Сохранить"
                                            : "Добавить"}
                                </button>

                                {editingEmployee && (
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
                        title="Список сотрудников"
                        subtitle={`Всего: ${employees.length} · Страница ${page} из ${totalPages}`}
                        open={openedSections.list}
                        onToggle={() => toggleSection("list")}
                    >
                        <div className="table-header">
                            <div>
                                <h2>Список сотрудников</h2>
                                <p>
                                    Всего: {employees.length} · Страница {page} из {totalPages}
                                </p>
                            </div>

                            <div className="table-header-actions">
                                <select
                                    className="compact-select"
                                    value={pageSize}
                                    onChange={(event) => {
                                        setPageSize(Number(event.target.value));
                                        setPage(1);
                                    }}
                                >
                                    <option value={20}>20 строк</option>
                                    <option value={50}>50 строк</option>
                                    <option value={100}>100 строк</option>
                                </select>
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
                                    onClick={() => loadEmployees(selectedCityId, showArchive)}
                                >
                                    Обновить
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="empty-state">Загрузка...</div>
                        ) : employees.length === 0 ? (
                            <div className="empty-state">
                                {showArchive ? "В архиве нет сотрудников" : "Сотрудники еще не добавлены"}
                            </div>
                        ) : (
                            <>
                                <div className="table-wrap">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>ID</th>
                                                <th>ФИО</th>
                                                <th>Город</th>
                                                <th>Статус</th>
                                                {canEditEmployees && <th>Действия</th>}
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {paginatedEmployees.map((employee) => (
                                                <tr key={employee.id}>
                                                    <td>{employee.id}</td>
                                                    <td>
                                                        <strong>{employee.fullName}</strong>
                                                    </td>
                                                    <td>{employee.city?.name ?? employee.cityId}</td>
                                                    <td>
                                                        {showArchive ? (
                                                            <span className="status-badge status-inactive">В архиве</span>
                                                        ) : (
                                                            <span
                                                                className={
                                                                    employee.isActive
                                                                        ? "status-badge status-active"
                                                                        : "status-badge status-inactive"
                                                                }
                                                            >
                                                                {employee.isActive ? "Активен" : "Отключен"}
                                                            </span>
                                                        )}
                                                    </td>
                                                    {canEditEmployees && (
                                                        <td className="actions-cell">
                                                            {showArchive ? (
                                                                <RowActionMenu
                                                                    items={[
                                                                        {
                                                                            label: "Восстановить",
                                                                            onClick: () => handleRestore(employee),
                                                                        },
                                                                    ]}
                                                                />
                                                            ) : (
                                                                <RowActionMenu
                                                                    items={[
                                                                        {
                                                                            label: "Редактировать",
                                                                            variant: "edit",
                                                                            onClick: () => startEdit(employee),
                                                                        },
                                                                        {
                                                                            label: employee.isActive ? "Отключить" : "Включить",
                                                                            onClick: () => handleToggleActive(employee),
                                                                        },
                                                                        {
                                                                            label: "Удалить",
                                                                            variant: "danger",
                                                                            onClick: () => handleDelete(employee),
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
                                <div className="pagination-bar">
                                    <button
                                        className="secondary-button"
                                        disabled={page <= 1}
                                        onClick={() => setPage((current) => Math.max(current - 1, 1))}
                                    >
                                        Назад
                                    </button>

                                    <span>
                                        Страница {page} из {totalPages}
                                    </span>

                                    <button
                                        className="secondary-button"
                                        disabled={page >= totalPages}
                                        onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
                                    >
                                        Вперед
                                    </button>
                                </div>
                            </>
                        )}
                    </AccordionSection>
                </div>
            </div>
        </div>
    );
}