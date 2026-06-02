import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { getAdminMe } from "../api/auth.api";
import type { AdminUser } from "../api/auth.api";
import { getAccessibleCities } from "../api/cities.api";
import type { City } from "../api/cities.api";
import {
  createVehicle,
  deleteVehicle,
  getVehicles,
  restoreVehicle,
  updateVehicle,
} from "../api/vehicles.api";
import type { Vehicle } from "../api/vehicles.api";
import { RowActionMenu } from "../components/RowActionMenu";
import { AccordionSection } from "../components/AccordionSection";

type FormState = {
  cityId: number;
  title: string;
  licensePlate: string;
  isActive: boolean;
};

const initialForm: FormState = {
  cityId: 0,
  title: "",
  licensePlate: "",
  isActive: true,
};

export function VehiclesPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<number>(0);
  const [showArchive, setShowArchive] = useState(false);

  const [form, setForm] = useState<FormState>(initialForm);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);

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
  const canEditVehicles = roleCode === "super_admin" || roleCode === "admin";

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

      const vehiclesData = await getVehicles(
        firstCityId || undefined,
        showArchive,
      );
      setVehicles(vehiclesData);
    } catch {
      setError("Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }

  async function loadVehicles(cityId = selectedCityId, archive = showArchive) {
    setError("");

    try {
      const data = await getVehicles(cityId || undefined, archive);
      setVehicles(data);
    } catch {
      setError("Не удалось загрузить автомобили");
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

    await loadVehicles(cityId, showArchive);
  }
  async function handleArchiveFilterChange(value: string) {
    const archive = value === "archive";

    setShowArchive(archive);
    setEditingVehicle(null);

    setForm({
      ...initialForm,
      cityId: selectedCityId || activeCities[0]?.id || 0,
    });

    setError("");
    setSuccess("");

    await loadVehicles(selectedCityId, archive);
  }
  function startEdit(vehicle: Vehicle) {
    setEditingVehicle(vehicle);

    setForm({
      cityId: vehicle.cityId,
      title: vehicle.title,
      licensePlate: vehicle.licensePlate ?? "",
      isActive: vehicle.isActive,
    });

    setError("");
    setSuccess("");
  }

  function resetForm() {
    setEditingVehicle(null);

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

    if (!form.title.trim()) {
      setError("Введите название автомобиля");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (editingVehicle) {
        await updateVehicle(editingVehicle.id, {
          cityId: form.cityId,
          title: form.title.trim(),
          licensePlate: form.licensePlate.trim() || null,
          isActive: form.isActive,
        });

        setSuccess("Автомобиль обновлен");
      } else {
        await createVehicle({
          cityId: form.cityId,
          title: form.title.trim(),
          licensePlate: form.licensePlate.trim() || null,
          isActive: form.isActive,
        });

        setSuccess("Автомобиль добавлен");
      }

      resetForm();
      await loadVehicles(selectedCityId);
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError("Автомобиль с таким госномером уже существует в этом городе");
      } else {
        setError("Не удалось сохранить автомобиль");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(vehicle: Vehicle) {
    setError("");
    setSuccess("");

    try {
      await updateVehicle(vehicle.id, {
        isActive: !vehicle.isActive,
      });

      setSuccess(
        vehicle.isActive ? "Автомобиль отключен" : "Автомобиль включен",
      );

      await loadVehicles(selectedCityId);
    } catch {
      setError("Не удалось изменить статус автомобиля");
    }
  }

  async function handleDelete(vehicle: Vehicle) {
    const confirmed = window.confirm(
      `Удалить автомобиль "${vehicle.title}"? Он будет скрыт из системы.`,
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      await deleteVehicle(vehicle.id);
      setSuccess("Автомобиль удален");
      await loadVehicles(selectedCityId);
    } catch {
      setError("Не удалось удалить автомобиль");
    }
  }
  async function handleRestore(vehicle: Vehicle) {
    setError("");
    setSuccess("");

    try {
      await restoreVehicle(vehicle.id);
      setSuccess("Автомобиль восстановлен");
      await loadVehicles(selectedCityId, showArchive);
    } catch {
      setError("Не удалось восстановить автомобиль");
    }
  }
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Автомобили</h1>
          <p>Управление автомобилями по городам</p>
        </div>
      </div>

      <div className="content-grid">
        {canEditVehicles && (
          <AccordionSection
            title={
              editingVehicle
                ? "Редактировать автомобиль"
                : "Добавить автомобиль"
            }
            subtitle=""
            open={openedSections.form}
            onToggle={() => {
              toggleSection("form");
            }}
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
                <span>Название автомобиля</span>
                <input
                  value={form.title}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Например: Renault Duster"
                />
              </label>

              <label className="field">
                <span>Госномер</span>
                <input
                  value={form.licensePlate}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      licensePlate: event.target.value,
                    }))
                  }
                  placeholder="Например: AX0000AA"
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
                <span>Автомобиль активен</span>
              </label>

              {error && <div className="form-error">{error}</div>}
              {success && <div className="form-success">{success}</div>}

              <div className="form-actions">
                <button className="primary-button" disabled={saving}>
                  {saving
                    ? "Сохранение..."
                    : editingVehicle
                      ? "Сохранить"
                      : "Добавить"}
                </button>

                {editingVehicle && (
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
          title="Список автомобилей"
          subtitle={`Всего: ${vehicles.length}`}
          open={openedSections.list}
          onToggle={() => {
            toggleSection("list");
          }}
        >
          <div className="panel-card table-card">
            <div className="table-header">
              <div>
                <h2></h2>
                <p></p>
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
                  onChange={(event) =>
                    handleArchiveFilterChange(event.target.value)
                  }
                >
                  <option value="active">Рабочие</option>
                  <option value="archive">Архив</option>
                </select>
                <button
                  className="secondary-button"
                  onClick={() => loadVehicles(selectedCityId)}
                >
                  Обновить
                </button>
              </div>
            </div>

            {loading ? (
              <div className="empty-state">Загрузка...</div>
            ) : vehicles.length === 0 ? (
              <div className="empty-state">
                {showArchive
                  ? "В архиве нет автомобилей"
                  : "Автомобили еще не добавлены"}
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Автомобиль</th>
                      <th>Город</th>
                      <th>Госномер</th>
                      <th>Статус</th>
                      {canEditVehicles && <th>Действия</th>}
                    </tr>
                  </thead>

                  <tbody>
                    {vehicles.map((vehicle) => (
                      <tr key={vehicle.id}>
                        <td>{vehicle.id}</td>
                        <td>
                          <strong>{vehicle.title}</strong>
                        </td>
                        <td>{vehicle.city?.name ?? vehicle.cityId}</td>
                        <td>{vehicle.licensePlate || "—"}</td>
                        <td>
                          {showArchive ? (
                            <span className="status-badge status-inactive">
                              В архиве
                            </span>
                          ) : (
                            <span
                              className={
                                vehicle.isActive
                                  ? "status-badge status-active"
                                  : "status-badge status-inactive"
                              }
                            >
                              {vehicle.isActive ? "Активен" : "Отключен"}
                            </span>
                          )}
                        </td>
                        {canEditVehicles && (
                          <td className="actions-cell">
                            {showArchive ? (
                              <RowActionMenu
                                items={[
                                  {
                                    label: "Восстановить",
                                    onClick: () => handleRestore(vehicle),
                                  },
                                ]}
                              />
                            ) : (
                              <RowActionMenu
                                items={[
                                  {
                                    label: "Редактировать",
                                    variant: "edit",
                                    onClick: () => startEdit(vehicle),
                                  },
                                  {
                                    label: vehicle.isActive
                                      ? "Отключить"
                                      : "Включить",
                                    onClick: () => handleToggleActive(vehicle),
                                  },
                                  {
                                    label: "Удалить",
                                    variant: "danger",
                                    onClick: () => handleDelete(vehicle),
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
        </AccordionSection>
      </div>
    </div>
  );
}
