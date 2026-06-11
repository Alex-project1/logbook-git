import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import {
  createAdditionalAlarmReason,
  deleteAdditionalAlarmReason,
  getAdditionalAlarmReasons,
  restoreAdditionalAlarmReason,
  updateAdditionalAlarmReason,
} from "../api/additional-alarm-reasons.api";
import type { AdditionalAlarmReason } from "../api/additional-alarm-reasons.api";
import { RowActionMenu } from "../components/RowActionMenu";
import { AccordionSection } from "../components/AccordionSection";

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

export function AdditionalAlarmReasonsPage() {
  const [reasons, setReasons] = useState<AdditionalAlarmReason[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [editingReason, setEditingReason] =
    useState<AdditionalAlarmReason | null>(null);
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

  async function loadReasons(archive = showArchive) {
    setLoading(true);
    setError("");

    try {
      const data = await getAdditionalAlarmReasons(archive);
      setReasons(data);
    } catch {
      setError("Не вдалося завантажити причини додаткових спрацювань");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReasons();
  }, []);

  function startEdit(reason: AdditionalAlarmReason) {
    setEditingReason(reason);

    setForm({
      name: reason.name,
      sortOrder: String(reason.sortOrder),
      isActive: reason.isActive,
    });

    setError("");
    setSuccess("");
  }

  function resetForm() {
    setEditingReason(null);
    setForm(initialForm);
    setError("");
  }

  async function handleArchiveFilterChange(value: string) {
    const archive = value === "archive";

    setShowArchive(archive);
    setEditingReason(null);
    setForm(initialForm);
    setError("");
    setSuccess("");

    await loadReasons(archive);
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
      setError("Введіть назву причини");
      return;
    }

    const sortOrder = getSortOrderValue();

    if (Number.isNaN(sortOrder)) {
      setError("Порядок має бути цілим числом");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (editingReason) {
        await updateAdditionalAlarmReason(editingReason.id, {
          name: form.name.trim(),
          sortOrder,
          isActive: form.isActive,
        });

        setSuccess("Причину оновлено");
      } else {
        await createAdditionalAlarmReason({
          name: form.name.trim(),
          sortOrder,
          isActive: form.isActive,
        });

        setSuccess("Причину додано");
      }

      resetForm();
      await loadReasons(showArchive);
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError("Причина з такою назвою вже існує");
      } else {
        setError("Не вдалося зберегти причину");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(reason: AdditionalAlarmReason) {
    setError("");
    setSuccess("");

    try {
      await updateAdditionalAlarmReason(reason.id, {
        isActive: !reason.isActive,
      });

      setSuccess(reason.isActive ? "Причину вимкнено" : "Причину увімкнено");
      await loadReasons(showArchive);
    } catch {
      setError("Не вдалося змінити статус причини");
    }
  }

  async function handleRestore(reason: AdditionalAlarmReason) {
    setError("");
    setSuccess("");

    try {
      await restoreAdditionalAlarmReason(reason.id);
      setSuccess("Причину відновлено");
      await loadReasons(showArchive);
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError(
          "Не можна відновити: активна причина з такою назвою вже існує",
        );
      } else {
        setError("Не вдалося відновити причину");
      }
    }
  }

  async function handleDelete(reason: AdditionalAlarmReason) {
    if (reason.isSystem) {
      setError("Системну причину не можна видалити. Її можна лише вимкнути.");
      return;
    }

    const confirmed = window.confirm(
      `Видалити причину "${reason.name}"? Її буде приховано в системі.`,
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      await deleteAdditionalAlarmReason(reason.id);
      setSuccess("Причину видалено");
      await loadReasons(showArchive);
    } catch {
      setError("Не вдалося видалити причину");
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Причини додаткових спрацювань</h1>
          <p>Довідник причин для масових і додаткових спрацювань</p>
        </div>
      </div>

      <div className="content-grid">
        {!showArchive && (
          <AccordionSection
            title={editingReason ? "Редагувати причину" : "Додати причину"}
            subtitle=""
            open={openedSections.form}
            onToggle={() => {
              toggleSection("form");
            }}
          >
            <form className="panel-card" onSubmit={handleSubmit}>
              <h2>
                
              </h2>

              {editingReason?.isSystem && (
                <div className="info-box">
                  Це системна причина. Можна змінити назву, порядок і
                  статус, але не можна видалити причину.
                </div>
              )}

              <label className="field">
                <span>Назва причини</span>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Наприклад: Воєнні дії"
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
                <span>Причина активна</span>
              </label>

              {error && <div className="form-error">{error}</div>}
              {success && <div className="form-success">{success}</div>}

              <div className="form-actions">
                <button className="primary-button" disabled={saving}>
                  {saving
                    ? "Збереження..."
                    : editingReason
                      ? "Зберегти"
                      : "Додати"}
                </button>

                {editingReason && (
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
            <h2>Архів причин</h2>
            <div className="info-box">
              Тут відображаються видалені звичайні причини додаткових спрацювань.
              Системні причини до архіву не потрапляють — їх можна лише вмикати
              або вимикати.
            </div>

            {error && <div className="form-error">{error}</div>}
            {success && <div className="form-success">{success}</div>}
          </div>
        )}

        <AccordionSection
          title="Список причин"
          subtitle={`Усього: ${reasons.length}`}
          open={openedSections.list}
          onToggle={() => {
            toggleSection("list");
          }}
        >
          <div className="panel-card table-card">
            <div className="table-header">
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
                  onClick={() => loadReasons(showArchive)}
                >
                  Оновити
                </button>
              </div>
            </div>

            {loading ? (
              <div className="empty-state">Завантаження...</div>
            ) : reasons.length === 0 ? (
              <div className="empty-state">
                {showArchive ? "В архіві немає причин" : "Причини ще не додано"}
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Назва</th>
                      <th>Тип</th>
                      <th>Порядок</th>
                      <th>Статус</th>
                      <th></th>
                    </tr>
                  </thead>

                  <tbody>
                    {reasons.map((reason) => (
                      <tr key={reason.id}>
                        <td>{reason.id}</td>
                        <td>
                          <strong>{reason.name}</strong>
                        </td>
                        <td>
                          <span
                            className={
                              reason.isSystem
                                ? "status-badge status-system"
                                : "status-badge status-custom"
                            }
                          >
                            {reason.isSystem ? "Системна" : "Звичайна"}
                          </span>
                        </td>
                        <td>{reason.sortOrder}</td>
                        <td>
                          {showArchive ? (
                            <span className="status-badge status-inactive">
                              В архіві
                            </span>
                          ) : (
                            <span
                              className={
                                reason.isActive
                                  ? "status-badge status-active"
                                  : "status-badge status-inactive"
                              }
                            >
                              {reason.isActive ? "Активна" : "Вимкнена"}
                            </span>
                          )}
                        </td>
                        <td className="actions-cell">
                          {showArchive ? (
                            <RowActionMenu
                              items={[
                                {
                                  label: "Відновити",
                                  onClick: () => handleRestore(reason),
                                },
                              ]}
                            />
                          ) : (
                            <RowActionMenu
                              items={[
                                {
                                  label: "Редагувати",
                                  variant: "edit",
                                  onClick: () => startEdit(reason),
                                },
                                {
                                  label: reason.isActive
                                    ? "Вимкнути"
                                    : "Увімкнути",
                                  onClick: () => handleToggleActive(reason),
                                },
                                ...(!reason.isSystem
                                  ? [
                                      {
                                        label: "Видалити",
                                        variant: "danger" as const,
                                        onClick: () => handleDelete(reason),
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
        </AccordionSection>
      </div>
    </div>
  );
}