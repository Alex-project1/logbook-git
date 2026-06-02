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
import type { Crew, CrewDutyType, CrewTransportType } from "../api/crews.api";
import { RowActionMenu } from "../components/RowActionMenu";
import { AccordionSection } from "../components/AccordionSection";
type FormState = {
  cityId: number;
  name: string;
  dutyType: CrewDutyType;
  transportType: CrewTransportType;
  durationHours: string;
  isActive: boolean;
};

const initialForm: FormState = {
  cityId: 0,
  name: "",
  dutyType: "FULL_DAY",
  transportType: "AUTO",
  durationHours: "24",
  isActive: true,
};
function getDutyTypeLabel(dutyType: CrewDutyType) {
  const labels: Record<CrewDutyType, string> = {
    FULL_DAY: "Суточный",
    DAY: "Дневной",
    NIGHT: "Ночной",
  };

  return labels[dutyType];
}

function getTransportTypeLabel(transportType: CrewTransportType) {
  const labels: Record<CrewTransportType, string> = {
    AUTO: "Авто",
    MOTO: "Мото",
  };

  return labels[transportType];
}

function getShiftEquivalent(durationHours: string | number) {
  const value = Number(durationHours);

  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.round((value / 24) * 100) / 100;
}

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
    [cities],
  );
  const roleCode = currentUser?.role?.code;
  const canEditCrews = roleCode === "super_admin" || roleCode === "admin";

  type SectionId = "form" | "list";

  const [openedSections, setOpenedSections] = useState<
    Record<SectionId, boolean>
  >({
    form: false,
    list: true,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const totalPages = Math.max(Math.ceil(crews.length / pageSize), 1);

  const paginatedCrews = useMemo(() => {
    const start = (page - 1) * pageSize;
    return crews.slice(start, start + pageSize);
  }, [crews, page, pageSize]);
  function toggleSection(section: SectionId) {
    setOpenedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }
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

      const crewsData = await getCrews(undefined, showArchive);
      setCrews(crewsData);
      setPage(1);
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
    setPage(1);

    setForm((prev) => ({
      ...prev,
      cityId: cityId || activeCities[0]?.id || 0,
    }));

    await loadCrews(cityId, showArchive);
  }
  async function handleArchiveFilterChange(value: string) {
    const archive = value === "archive";

    setShowArchive(archive);
    setPage(1);
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
      dutyType: crew.dutyType,
      transportType: crew.transportType,
      durationHours: String(crew.durationHours ?? 24),
      isActive: crew.isActive,
    });

    setError("");
    setSuccess("");
    setOpenedSections((prev) => ({
      ...prev,
      form: true,
    }));
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
    const durationHours =
      form.dutyType === "FULL_DAY" ? 24 : Number(form.durationHours);

    if (
      !Number.isFinite(durationHours) ||
      durationHours <= 0 ||
      durationHours > 24
    ) {
      setError("Укажите длительность наряда от 0 до 24 часов");
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
          dutyType: form.dutyType,
          transportType: form.transportType,
          durationHours,
          isActive: form.isActive,
        });

        setSuccess("Наряд обновлен");
      } else {
        await createCrew({
          cityId: form.cityId,
          name: form.name.trim(),
          dutyType: form.dutyType,
          transportType: form.transportType,
          durationHours,
          isActive: form.isActive,
        });

        setSuccess("Наряд добавлен");
      }

      resetForm();

      setOpenedSections((prev) => ({
        ...prev,
        form: false,
        list: true,
      }));

      setPage(1);
      await loadCrews(selectedCityId, showArchive);
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
      `Удалить наряд "${crew.name}"? Он будет скрыт из системы.`,
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
          <AccordionSection
            title={editingCrew ? "Редактировать наряд" : "Добавить наряд"}
            subtitle="Создание и управление нарядами"
            open={openedSections.form}
            onToggle={() => toggleSection("form")}
          >
            <form className="panel-card" onSubmit={handleSubmit}>
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
              <label className="field">
                <span>Тип наряда</span>
                <select
                  value={form.dutyType}
                  onChange={(event) => {
                    const dutyType = event.target.value as CrewDutyType;

                    setForm((prev) => ({
                      ...prev,
                      dutyType,
                      durationHours:
                        dutyType === "FULL_DAY"
                          ? "24"
                          : prev.durationHours === "24"
                            ? "12"
                            : prev.durationHours,
                    }));
                  }}
                >
                  <option value="FULL_DAY">Суточный</option>
                  <option value="DAY">Дневной</option>
                  <option value="NIGHT">Ночной</option>
                </select>
              </label>

              <label className="field">
                <span>Транспорт</span>
                <select
                  value={form.transportType}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      transportType: event.target.value as CrewTransportType,
                    }))
                  }
                >
                  <option value="AUTO">Авто</option>
                  <option value="MOTO">Мото</option>
                </select>
              </label>

              <label className="field">
                <span>Длительность, часов</span>
                <input
                  type="number"
                  min="0.25"
                  max="24"
                  step="0.25"
                  value={form.durationHours}
                  disabled={form.dutyType === "FULL_DAY"}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      durationHours: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="role-help-card">
                <strong>Расчет смены</strong>
                <span>
                  {form.dutyType === "FULL_DAY"
                    ? "Суточный наряд всегда считается как 24 часа = 1 смена"
                    : `${form.durationHours || 0} часов = ${getShiftEquivalent(
                        form.durationHours,
                      )} смены`}
                </span>
              </div>
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
          </AccordionSection>
        )}

        <AccordionSection
          title="Cписок нарядов"
          subtitle={`Всего: ${crews.length} · Страница ${page} из ${totalPages}`}
          open={openedSections.list}
          onToggle={() => toggleSection("list")}
        >
          <div className="panel-card table-card">
            <div className="table-header">
              <div>
                <p></p>
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
                  onChange={(event) =>
                    handleArchiveFilterChange(event.target.value)
                  }
                >
                  <option value="active">Рабочие</option>
                  <option value="archive">Архив</option>
                </select>
                <button
                  className="secondary-button"
                  onClick={() => loadCrews(selectedCityId, showArchive)}
                >
                  Обновить
                </button>
              </div>
            </div>

            {loading ? (
              <div className="empty-state">Загрузка...</div>
            ) : crews.length === 0 ? (
              <div className="empty-state">
                {showArchive
                  ? "В архиве нет нарядов"
                  : "Наряды еще не добавлены"}
              </div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Позывной</th>
                        <th>Город</th>
                        <th>Тип</th>
                        <th>Транспорт</th>
                        <th>Часы</th>
                        <th>Смены</th>
                        <th>Статус</th>
                        {canEditCrews && <th>Действия</th>}
                      </tr>
                    </thead>

                    <tbody>
                      {paginatedCrews.map((crew) => (
                        <tr key={crew.id}>
                          <td>{crew.id}</td>
                          <td>
                            <strong>{crew.name}</strong>
                          </td>
                          <td>{crew.city?.name ?? crew.cityId}</td>
                          <td>{getDutyTypeLabel(crew.dutyType)}</td>
                          <td>{getTransportTypeLabel(crew.transportType)}</td>
                          <td>{Number(crew.durationHours)}</td>
                          <td>{getShiftEquivalent(crew.durationHours)}</td>
                          <td>
                            {showArchive ? (
                              <span className="status-badge status-inactive">
                                В архиве
                              </span>
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
                                      label: crew.isActive
                                        ? "Отключить"
                                        : "Включить",
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
              </>
            )}
          </div>
        </AccordionSection>
      </div>
    </div>
  );
}
