import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { getAccessibleCities } from "../api/cities.api";
import type { City } from "../api/cities.api";
import {
  bulkImportStreets,
  createStreet,
  deleteStreet,
  getStreets,
  updateStreet,
  type Street,
} from "../api/streets.api";
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

function getErrorMessage(error: unknown, fallback: string) {
  const maybe = error as { response?: { data?: { message?: string } } };
  return maybe.response?.data?.message || fallback;
}

function normalizeStreetList(text: string) {
  const seen = new Set<string>();

  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => {
      if (!line) return false;

      const key = line.toLocaleLowerCase("uk-UA");

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
}

export function StreetsPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [streets, setStreets] = useState<Street[]>([]);
  const [selectedCityId, setSelectedCityId] = useState(0);
  const [form, setForm] = useState<FormState>(initialForm);
  const [editingStreet, setEditingStreet] = useState<Street | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeCities = useMemo(
    () => cities.filter((city) => city.isActive),
    [cities],
  );

  const parsedBulkNames = useMemo(() => normalizeStreetList(bulkText), [bulkText]);

  async function loadStreets(cityId = selectedCityId) {
    const data = await getStreets({
      cityId: cityId || undefined,
      includeInactive: false,
    });

    setStreets(data);
  }

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const citiesData = await getAccessibleCities(false);
        setCities(citiesData);

        const firstCityId = citiesData[0]?.id ?? 0;
        setSelectedCityId(firstCityId);
        setForm((prev) => ({ ...prev, cityId: firstCityId }));

        const streetsData = await getStreets({
          cityId: firstCityId || undefined,
          includeInactive: false,
        });

        setStreets(streetsData);
      } catch (caught) {
        setError(getErrorMessage(caught, "Не вдалося завантажити вулиці"));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  async function handleCityFilterChange(cityId: number) {
    setSelectedCityId(cityId);
    setEditingStreet(null);
    setForm((prev) => ({ ...prev, cityId: cityId || activeCities[0]?.id || 0 }));
    await loadStreets(cityId);
  }

  function resetForm() {
    setEditingStreet(null);
    setForm({
      ...initialForm,
      cityId: selectedCityId || activeCities[0]?.id || 0,
    });
    setError("");
  }

  function startEdit(street: Street) {
    setEditingStreet(street);
    setForm({
      cityId: street.cityId,
      name: street.name,
      isActive: street.isActive,
    });
    setError("");
    setSuccess("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.cityId) {
      setError("Оберіть місто");
      return;
    }

    if (!form.name.trim()) {
      setError("Введіть назву вулиці");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (editingStreet) {
        await updateStreet(editingStreet.id, {
          cityId: form.cityId,
          name: form.name.trim(),
          isActive: form.isActive,
        });
        setSuccess("Вулицю оновлено");
      } else {
        await createStreet({
          cityId: form.cityId,
          name: form.name.trim(),
          isActive: form.isActive,
        });
        setSuccess("Вулицю додано");
      }

      resetForm();
      await loadStreets(selectedCityId);
    } catch (caught) {
      setError(getErrorMessage(caught, "Не вдалося зберегти вулицю"));
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkImport() {
    const cityId = selectedCityId || form.cityId;

    if (!cityId) {
      setError("Оберіть місто для імпорту");
      return;
    }

    if (parsedBulkNames.length === 0) {
      setError("Вставте список вулиць: одна назва — один рядок");
      return;
    }

    if (replaceExisting && !window.confirm("Замінити всі наявні вулиці цього міста новим списком?")) {
      return;
    }

    setBulkSaving(true);
    setError("");
    setSuccess("");

    try {
      const result = await bulkImportStreets({
        cityId,
        text: bulkText,
        replaceExisting,
      });

      setSuccess(
        `Список оновлено: додано ${result.created}, пропущено ${result.skipped}, всього активних ${result.total}`
      );
      setBulkText("");
      setReplaceExisting(false);
      await loadStreets(cityId);
    } catch (caught) {
      setError(getErrorMessage(caught, "Не вдалося імпортувати список вулиць"));
    } finally {
      setBulkSaving(false);
    }
  }

  async function handleArchive(street: Street) {
    if (!window.confirm(`Видалити вулицю "${street.name}" зі списку підказок?`)) return;

    try {
      await deleteStreet(street.id);
      setSuccess("Вулицю видалено зі списку підказок");
      await loadStreets(selectedCityId);
    } catch (caught) {
      setError(getErrorMessage(caught, "Не вдалося видалити вулицю"));
    }
  }

  return (
    <div className="page-card">
      <div className="page-header">
        <div>
          <h1>Вулиці</h1>
          <p>Список вулиць для підказок у мобільному застосунку. Дані кешуються на телефоні для офлайн-роботи.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Місто
          <select
            value={form.cityId}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, cityId: Number(event.target.value) }))
            }
          >
            <option value={0}>Оберіть місто</option>
            {activeCities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Назва вулиці
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Наприклад: Соборний проспект"
          />
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, isActive: event.target.checked }))
            }
          />
          Активна
        </label>

        <div className="form-actions">
          <button type="submit" disabled={saving}>
            {saving ? "Збереження..." : editingStreet ? "Оновити" : "Додати"}
          </button>
          {editingStreet && (
            <button type="button" className="secondary-button" onClick={resetForm}>
              Скасувати
            </button>
          )}
        </div>
      </form>

      <div className="panel-card" style={{ marginTop: 16 }}>
        <div className="table-header">
          <div>
            <h2>Імпорт списком</h2>
            <p>Формат: одна назва вулиці в одному рядку. Дублікати в списку будуть прибрані.</p>
          </div>
        </div>

        <div className="form-grid">
          <label style={{ gridColumn: "1 / -1" }}>
            Список вулиць
            <textarea
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              rows={10}
              placeholder={"Авраменко вулиця\nСоборний проспект\nШевченка вулиця"}
            />
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(event) => setReplaceExisting(event.target.checked)}
            />
            Замінити наявний список цього міста
          </label>

          <div className="form-actions">
            <button type="button" onClick={handleBulkImport} disabled={bulkSaving}>
              {bulkSaving ? "Імпортуємо..." : "Імпортувати список"}
            </button>
            <span className="muted-text">До імпорту: {parsedBulkNames.length}</span>
          </div>
        </div>
      </div>

      <div className="filters-row" style={{ marginTop: 16 }}>
        <label>
          Місто
          <select
            value={selectedCityId}
            onChange={(event) => handleCityFilterChange(Number(event.target.value))}
          >
            <option value={0}>Усі міста</option>
            {activeCities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p>Завантаження...</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Вулиця</th>
                <th>Місто</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {streets.map((street) => (
                <tr key={street.id}>
                  <td>{street.name}</td>
                  <td>{street.city?.name || street.cityId}</td>
                  <td>{street.isActive ? "Активна" : "Вимкнена"}</td>
                  <td>
                    <RowActionMenu
                      items={[
                        { label: "Редагувати", onClick: () => startEdit(street), variant: "edit" },
                        { label: "Видалити", onClick: () => handleArchive(street), variant: "danger" },
                      ]}
                    />
                  </td>
                </tr>
              ))}

              {streets.length === 0 && (
                <tr>
                  <td colSpan={4}>Немає вулиць</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
