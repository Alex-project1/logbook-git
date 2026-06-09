import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { getAccessibleCities } from "../api/cities.api";
import type { City } from "../api/cities.api";
import { getDepartments } from "../api/departments.api";
import type { Department } from "../api/departments.api";
import { getAdminMe } from "../api/auth.api";
import type { AdminUser } from "../api/auth.api";
import { getDutyPosts } from "../api/duty-posts.api";
import type { DutyPost } from "../api/duty-posts.api";
import { getEmployees } from "../api/employees.api";
import type { Employee } from "../api/employees.api";
import { getVehicles } from "../api/vehicles.api";
import type { Vehicle } from "../api/vehicles.api";
import { RowActionMenu } from "../components/RowActionMenu";
import { dedupeDepartments, formatDepartmentOption } from "../utils/department-options";
import {
  createPostDuty,
  deletePostDuty,
  getPostDuties,
  restorePostDuty,
  updatePostDuty,
} from "../api/post-duties.api";
import type {
  PostDuty,
  PostDutiesFilters,
  PostDutiesResponse,
} from "../api/post-duties.api";

type FormMember = {
  employeeId: number;
  hasWeapon: boolean;
  isDriver: boolean;
  comment: string;
};

type FormState = {
  cityId: number;
  departmentId: number;
  postId: number;
  vehicleId: number;
  dutyDate: string;
  durationHours: number;
  note: string;
  members: FormMember[];
};

const initialMember: FormMember = {
  employeeId: 0,
  hasWeapon: false,
  isDriver: false,
  comment: "",
};

const initialForm: FormState = {
  cityId: 0,
  departmentId: 0,
  postId: 0,
  vehicleId: 0,
  dutyDate: "",
  durationHours: 6,
  note: "",
  members: [{ ...initialMember }],
};

const defaultFilters: PostDutiesFilters = {
  page: 1,
  pageSize: 20,
  archive: false,
};

function toDateInputValue(value: string) {
  return value ? value.slice(0, 10) : "";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU");
}

function formatNumber(value: number) {
  return value.toLocaleString("ru-RU", {
    maximumFractionDigits: 2,
  });
}

type AccordionSectionId =
  | "form"
  | "main"
  | "vehicle"
  | "members"
  | "list"
  | "filters";

type AccordionSectionProps = {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

function AccordionSection({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: AccordionSectionProps) {
  return (
    <section
      className={
        open
          ? "accordion-section accordion-section-open"
          : "accordion-section"
      }
    >
      <button
        type="button"
        className="accordion-section-trigger"
        onClick={onToggle}
      >
        <span>
          <strong>{title}</strong>
          {subtitle && <small>{subtitle}</small>}
        </span>

        <span className="accordion-section-icon">{open ? "−" : "+"}</span>
      </button>

      {open && <div className="accordion-section-content">{children}</div>}
    </section>
  );
}



export function PostDutiesPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [dutyPosts, setDutyPosts] = useState<DutyPost[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const [filters, setFilters] = useState<PostDutiesFilters>(defaultFilters);
  const [report, setReport] = useState<PostDutiesResponse | null>(null);

  const [form, setForm] = useState<FormState>(initialForm);
  const [editingDuty, setEditingDuty] = useState<PostDuty | null>(null);

  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);

  const [loading, setLoading] = useState(true);
  const [referencesLoading, setReferencesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [openedSections, setOpenedSections] = useState<
    Record<AccordionSectionId, boolean>
  >({
    form: false,
    main: false,
    vehicle: false,
    members: false,
    list: false,
    filters: false,
  });

  function toggleSection(sectionId: AccordionSectionId) {
    setOpenedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }

  const rows = report?.data ?? [];
  const pagination = report?.pagination;

  const activeCities = useMemo(
    () => cities.filter((city) => city.isActive),
    [cities]
  );

  const activeDepartments = useMemo(
    () => dedupeDepartments(departments.filter((department) => department.isActive && !department.deletedAt)),
    [departments]
  );

  const formDepartments = useMemo(
    () => activeDepartments.filter((department) => department.cityId === form.cityId),
    [activeDepartments, form.cityId]
  );

  const filterDepartments = useMemo(
    () => activeDepartments.filter((department) => !filters.cityId || department.cityId === filters.cityId),
    [activeDepartments, filters.cityId]
  );

  const activePosts = useMemo(
    () => dutyPosts.filter((post) => post.isActive),
    [dutyPosts]
  );

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.isActive),
    [employees]
  );

  const activeVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.isActive),
    [vehicles]
  );

  const roleCode = currentUser?.role?.code;
  const canEditPostDuties = roleCode === "super_admin" || roleCode === "admin";

  async function loadCurrentUser() {
    try {
      const response = await getAdminMe();
      setCurrentUser(response.user);
    } catch {
      setCurrentUser(null);
    }
  }

  async function loadCityReferences(cityId: number, departmentId = 0) {
    if (!cityId) {
      setDutyPosts([]);
      setEmployees([]);
      setVehicles([]);
      return;
    }

    setReferencesLoading(true);

    try {
      const params = {
        cityId,
        departmentId: departmentId || undefined,
        includeInactive: false,
        archive: false,
      };

      const [postsData, employeesData, vehiclesData] = await Promise.all([
        getDutyPosts(params),
        getEmployees(params),
        getVehicles(params),
      ]);

      setDutyPosts(postsData);
      setEmployees(employeesData);
      setVehicles(vehiclesData);
    } catch {
      setError("Не удалось загрузить справочники по міста и підрозділу");
    } finally {
      setReferencesLoading(false);
    }
  }

  async function loadPostDuties(nextFilters = filters) {
    setLoading(true);
    setError("");

    try {
      const data = await getPostDuties(nextFilters);
      setReport(data);
    } catch {
      setError("Не удалось загрузить постовые дежурства");
    } finally {
      setLoading(false);
    }
  }

  async function loadInitialData() {
    setLoading(true);
    setReferencesLoading(true);
    setError("");

    try {
      const [citiesData, departmentsData] = await Promise.all([
        getAccessibleCities(),
        getDepartments({ includeInactive: false }),
      ]);
      setCities(citiesData);
      setDepartments(departmentsData);

      const firstCityId = citiesData[0]?.id ?? 0;
      const firstDepartmentId = departmentsData.find((department) => department.cityId === firstCityId && department.isActive)?.id ?? 0;

      const nextFilters: PostDutiesFilters = {
        ...defaultFilters,
        cityId: undefined,
        departmentId: undefined,
      };
      
      setFilters(nextFilters);
      setForm((prev) => ({
        ...prev,
        cityId: firstCityId,
        departmentId: firstDepartmentId,
      }));
      
      await loadCityReferences(firstCityId, firstDepartmentId);
      
      const data = await getPostDuties(nextFilters);
      setReport(data);
    } catch {
      setError("Не удалось загрузить данные");
    } finally {
      setLoading(false);
      setReferencesLoading(false);
    }
  }

  useEffect(() => {
    loadCurrentUser();
    loadInitialData();
  }, []);

  function updateForm<Key extends keyof FormState>(
    key: Key,
    value: FormState[Key]
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function updateMember(index: number, patch: Partial<FormMember>) {
    setForm((prev) => ({
      ...prev,
      members: prev.members.map((member, memberIndex) =>
        memberIndex === index ? { ...member, ...patch } : member
      ),
    }));
  }

  function setDriver(index: number) {
    if (!form.vehicleId) return;

    setForm((prev) => ({
      ...prev,
      members: prev.members.map((member, memberIndex) => ({
        ...member,
        isDriver: memberIndex === index,
      })),
    }));
  }

  function addMember() {
    setForm((prev) => ({
      ...prev,
      members: [...prev.members, { ...initialMember }],
    }));
  }

  function removeMember(index: number) {
    setForm((prev) => {
      const nextMembers = prev.members.filter((_, memberIndex) => {
        return memberIndex !== index;
      });

      return {
        ...prev,
        members: nextMembers.length > 0 ? nextMembers : [{ ...initialMember }],
      };
    });
  }

  async function handleCityChange(cityId: number) {
    const departmentId = activeDepartments.find((department) => department.cityId === cityId)?.id ?? 0;
    const nextFilters: PostDutiesFilters = {
      ...filters,
      page: 1,
      cityId: cityId || undefined,
      departmentId: departmentId || undefined,
      postId: undefined,
      vehicleId: undefined,
      employeeId: undefined,
    };

    setFilters(nextFilters);
    setEditingDuty(null);
    setForm({
      ...initialForm,
      cityId,
      departmentId,
    });

    setSuccess("");
    setError("");

    await loadCityReferences(cityId, departmentId);
    await loadPostDuties(nextFilters);
  }
  async function handleFilterCityChange(cityId: number) {
    const nextFilters: PostDutiesFilters = {
      ...filters,
      page: 1,
      cityId: cityId || undefined,
      departmentId: undefined,
      postId: undefined,
      vehicleId: undefined,
      employeeId: undefined,
    };
  
    setFilters(nextFilters);
    setSuccess("");
    setError("");
  
    if (cityId) {
      await loadCityReferences(cityId, 0);
    } else {
      setDutyPosts([]);
      setEmployees([]);
      setVehicles([]);
    }
  
    await loadPostDuties(nextFilters);
  }

  async function handleFilterDepartmentChange(departmentId: number) {
    const selectedDepartment = activeDepartments.find((department) => department.id === departmentId);
    const cityId = filters.cityId ?? selectedDepartment?.cityId ?? form.cityId;
    const nextFilters: PostDutiesFilters = {
      ...filters,
      page: 1,
      cityId: filters.cityId || selectedDepartment?.cityId || undefined,
      departmentId: departmentId || undefined,
      postId: undefined,
      vehicleId: undefined,
      employeeId: undefined,
    };

    setFilters(nextFilters);
    setSuccess("");
    setError("");

    if (cityId) {
      await loadCityReferences(cityId, departmentId);
    }

    await loadPostDuties(nextFilters);
  }

  async function handleFormDepartmentChange(departmentId: number) {
    setForm((prev) => ({
      ...prev,
      departmentId,
      postId: 0,
      vehicleId: 0,
      members: prev.members.map((member) => ({ ...member, isDriver: false })),
    }));
    await loadCityReferences(form.cityId, departmentId);
  }
  function validateForm() {
    if (!form.cityId) return "Выберите город";
    if (!form.departmentId) return "Выберите подразделение";
    if (!form.postId) return "Выберите пост";
    if (!form.dutyDate) return "Выберите дату дежурства";
    if (!form.durationHours || form.durationHours <= 0) {
      return "Укажите длительность больше 0 часов";
    }
    if (form.durationHours > 24) {
      return "Длительность не может быть больше 24 часов";
    }

    const validMembers = form.members.filter((member) => member.employeeId);

    if (validMembers.length === 0) {
      return "Добавьте хотя бы одного співробітника";
    }

    const employeeIds = validMembers.map((member) => member.employeeId);
    const uniqueEmployeeIds = new Set(employeeIds);

    if (uniqueEmployeeIds.size !== employeeIds.length) {
      return "Один співробітник не может быть додано дважды";
    }

    if (form.vehicleId) {
      const driversCount = validMembers.filter((member) => member.isDriver).length;

      if (driversCount !== 1) {
        return "Если выбран автомобіль, должен быть ровно один водитель";
      }
    }

    return "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      setSuccess("");

      setOpenedSections((prev) => ({
        ...prev,
        form: true,
        main: true,
        members: true,
      }));

      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const normalizedMembers = form.members
      .filter((member) => member.employeeId)
      .map((member) => ({
        employeeId: member.employeeId,
        hasWeapon: member.hasWeapon,
        isDriver: form.vehicleId ? member.isDriver : false,
        comment: member.comment.trim() || null,
      }));

    const payload = {
      cityId: form.cityId,
      departmentId: form.departmentId,
      postId: form.postId,
      vehicleId: form.vehicleId || null,
      dutyDate: `${form.dutyDate}T00:00:00.000Z`,
      durationHours: Number(form.durationHours),
      note: form.note.trim() || null,
      members: normalizedMembers,
    };

    try {
      if (editingDuty) {
        await updatePostDuty(editingDuty.id, payload);
        setSuccess("Постовое чергування оновленоо");
      } else {
        await createPostDuty(payload);
        setSuccess("Постовое чергування создано");
      }

      setEditingDuty(null);
      setForm({
        ...initialForm,
        cityId: form.cityId,
      });

      await loadPostDuties(filters);
    } catch (err: any) {
      setError(err.response?.data?.message || "Не удалось зберегти чергування");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(duty: PostDuty) {
    setEditingDuty(duty);

    setForm({
      cityId: duty.cityId,
      departmentId: duty.departmentId,
      postId: duty.postId,
      vehicleId: duty.vehicleId ?? 0,
      dutyDate: toDateInputValue(duty.dutyDate),
      durationHours: duty.durationHours,
      note: duty.note ?? "",
      members: duty.members.map((member) => ({
        employeeId: member.employeeId,
        hasWeapon: member.hasWeapon,
        isDriver: member.isDriver,
        comment: member.comment ?? "",
      })),
    });

    if (duty.cityId !== form.cityId || duty.departmentId !== form.departmentId) {
      loadCityReferences(duty.cityId, duty.departmentId);
    }

    setError("");
    setSuccess("");
    setOpenedSections((prev) => ({
      ...prev,
      form: true,
      main: true,
      vehicle: true,
      members: true,
    }));
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function resetForm() {
    setEditingDuty(null);
    const cityId = filters.cityId ?? activeCities[0]?.id ?? 0;
    const departmentId = filters.departmentId ?? activeDepartments.find((department) => department.cityId === cityId)?.id ?? 0;
    setForm({
      ...initialForm,
      cityId,
      departmentId,
    });
    setError("");
  }

  async function handleDelete(duty: PostDuty) {
    const confirmed = window.confirm(
      `Удалить постовое чергування "${duty.post.name}" от ${formatDate(
        duty.dutyDate
      )}?`
    );

    if (!confirmed) return;

    setDeletingId(duty.id);
    setError("");
    setSuccess("");

    try {
      await deletePostDuty(duty.id);
      setSuccess("Постовое чергування удалено");
      await loadPostDuties(filters);
    } catch (err: any) {
      setError(err.response?.data?.message || "Не удалось удалить чергування");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRestore(duty: PostDuty) {
    setRestoringId(duty.id);
    setError("");
    setSuccess("");

    try {
      await restorePostDuty(duty.id);
      setSuccess("Постовое чергування відновленоо");
      await loadPostDuties(filters);
    } catch (err: any) {
      setError(err.response?.data?.message || "Не удалось восстановить чергування");
    } finally {
      setRestoringId(null);
    }
  }

  async function applyFilters() {
    const nextFilters: PostDutiesFilters = {
      ...filters,
      page: 1,
    };

    setFilters(nextFilters);
    await loadPostDuties(nextFilters);
  }

  async function handleArchiveFilterChange(value: string) {
    const archive = value === "archive";

    const nextFilters: PostDutiesFilters = {
      ...filters,
      page: 1,
      archive,
    };

    setFilters(nextFilters);
    setEditingDuty(null);
    setSuccess("");
    setError("");

    await loadPostDuties(nextFilters);
  }

  async function handlePageChange(page: number) {
    const nextFilters: PostDutiesFilters = {
      ...filters,
      page,
    };

    setFilters(nextFilters);
    await loadPostDuties(nextFilters);
  }

  async function handlePageSizeChange(pageSize: number) {
    const nextFilters: PostDutiesFilters = {
      ...filters,
      page: 1,
      pageSize,
    };

    setFilters(nextFilters);
    await loadPostDuties(nextFilters);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Постові чергування</h1>
          <p>Додаткові и стационарные посты с учетом часов и співробітников</p>
        </div>
      </div>

      <div className="content-grid">
        {canEditPostDuties && (
          <form className="panel-card" onSubmit={handleSubmit}>
            <AccordionSection
              title={
                editingDuty
                  ? "Редагувати чергування"
                  : "Додати чергування"
              }
              subtitle="Основные данные, автомобіль, співробітники и сохранение"
              open={openedSections.form}
              onToggle={() => toggleSection("form")}
            >
              <AccordionSection
                title="Основне"
                subtitle="Місто, пост, дата и длительность"
                open={openedSections.main}
                onToggle={() => toggleSection("main")}
              >
                <label className="field">
                  <span>Місто</span>
                  <select
                    value={form.cityId}
                    onChange={(event) => handleCityChange(Number(event.target.value))}
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
                  <span>Підрозділ</span>
                  <select
                    value={form.departmentId}
                    onChange={(event) => handleFormDepartmentChange(Number(event.target.value))}
                    disabled={referencesLoading || !form.cityId}
                  >
                    <option value={0}>Выберите подразделение</option>
                    {formDepartments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {formatDepartmentOption(department, { showCity: false })}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Пост</span>
                  <select
                    value={form.postId}
                    onChange={(event) => updateForm("postId", Number(event.target.value))}
                    disabled={referencesLoading}
                  >
                    <option value={0}>Выберите пост</option>
                    {activePosts.map((post) => (
                      <option key={post.id} value={post.id}>
                        {post.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Дата</span>
                  <input
                    type="date"
                    value={form.dutyDate}
                    onChange={(event) => updateForm("dutyDate", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Длительность, часов</span>
                  <input
                    type="number"
                    min={0.25}
                    max={24}
                    step={0.25}
                    value={form.durationHours}
                    onChange={(event) =>
                      updateForm("durationHours", Number(event.target.value))
                    }
                  />
                </label>

                <div className="role-help-card">
                  <strong>Эквивалент зміни</strong>
                  <span>
                    {formatNumber(Number(form.durationHours || 0) / 24)} от полной
                    24-часовой зміни
                  </span>
                </div>
              </AccordionSection>

              <AccordionSection
                title="Автомобіль і коментар"
                subtitle="Авто необов’язково, но при выборе нужен водитель"
                open={openedSections.vehicle}
                onToggle={() => toggleSection("vehicle")}
              >
                <label className="field">
                  <span>Автомобіль, необов’язково</span>
                  <select
                    value={form.vehicleId}
                    onChange={(event) => {
                      const vehicleId = Number(event.target.value);

                      setForm((prev) => ({
                        ...prev,
                        vehicleId,
                        members: vehicleId
                          ? prev.members
                          : prev.members.map((member) => ({
                            ...member,
                            isDriver: false,
                          })),
                      }));
                    }}
                    disabled={referencesLoading}
                  >
                    <option value={0}>Без автомобиля</option>
                    {activeVehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.title}
                        {vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Коментар</span>
                  <textarea
                    rows={3}
                    value={form.note}
                    onChange={(event) => updateForm("note", event.target.value)}
                    placeholder="Необязательно"
                  />
                </label>
              </AccordionSection>

              <AccordionSection
                title="Співробітники"
                subtitle="Минимум 1 співробітник, оружие и водитель"
                open={openedSections.members}
                onToggle={() => toggleSection("members")}
              >
                <div className="duty-members-list">
                  {form.members.map((member, index) => (
                    <div className="duty-member-card" key={index}>
                      <label className="field">
                        <span>Співробітник</span>
                        <select
                          value={member.employeeId}
                          onChange={(event) =>
                            updateMember(index, {
                              employeeId: Number(event.target.value),
                            })
                          }
                          disabled={referencesLoading}
                        >
                          <option value={0}>Выберите співробітника</option>
                          {activeEmployees.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              {employee.fullName}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="duty-member-flags">
                        <label className="checkbox-field">
                          <input
                            type="checkbox"
                            checked={member.hasWeapon}
                            onChange={(event) =>
                              updateMember(index, {
                                hasWeapon: event.target.checked,
                              })
                            }
                          />
                          <span>С оружием</span>
                        </label>

                        <label className="checkbox-field">
                          <input
                            type="radio"
                            checked={member.isDriver}
                            disabled={!form.vehicleId}
                            onChange={() => setDriver(index)}
                          />
                          <span>Водитель</span>
                        </label>
                      </div>

                      <label className="field">
                        <span>Коментар співробітника</span>
                        <input
                          value={member.comment}
                          onChange={(event) =>
                            updateMember(index, {
                              comment: event.target.value,
                            })
                          }
                          placeholder="Необязательно"
                        />
                      </label>

                      <button
                        type="button"
                        className="small-button danger-button"
                        onClick={() => removeMember(index)}
                      >
                        Убрать співробітника
                      </button>
                    </div>
                  ))}
                </div>

                <button type="button" className="secondary-button" onClick={addMember}>
                  Додати співробітника
                </button>
              </AccordionSection>

              {error && <div className="form-error">{error}</div>}
              {success && <div className="form-success">{success}</div>}

              <div className="form-actions">
                <button className="primary-button" disabled={saving}>
                  {saving
                    ? "Збереження..."
                    : editingDuty
                      ? "Зберегти"
                      : "Зберегти чергування"}
                </button>

                {editingDuty && (
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

        <div className="panel-card table-card">
          <AccordionSection
            title="Список дежурств"
            subtitle={` Усього: ${(pagination?.total ?? 0).toLocaleString("ru-RU")}`}
            open={openedSections.list}
            onToggle={() => toggleSection("list")}
          >
            <div className="table-header">
              <div>
              
                <p>
                  ·
                  Страница {pagination?.page ?? 1} из{" "}
                  {pagination?.totalPages ?? 1}
                </p>
              </div>

              <div className="table-header-actions">
                <select
                  className="compact-select"
                  value={filters.pageSize ?? 20}
                  onChange={(event) =>
                    handlePageSizeChange(Number(event.target.value))
                  }
                >
                  <option value={20}>20 строк</option>
                  <option value={50}>50 строк</option>
                  <option value={100}>100 строк</option>
                </select>
              </div>
            </div>

            <AccordionSection
              title="Фильтры списка"
              subtitle="Місто, пост, авто, співробітник, даты, поиск и архив"
              open={openedSections.filters}
              onToggle={() => toggleSection("filters")}
            >
              <div className="report-filters-grid">
                <label className="field">
                  <span>Місто</span>
                  <select
                    value={filters.cityId ?? 0}
                    onChange={(event) => handleFilterCityChange(Number(event.target.value))}
                  >
                    <option value={0}>Все доступные города</option>
                    {activeCities.map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Підрозділ</span>
                  <select
                    value={filters.departmentId ?? 0}
                    onChange={(event) => handleFilterDepartmentChange(Number(event.target.value))}
                  >
                    <option value={0}>Усі підрозділи</option>
                    {filterDepartments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {formatDepartmentOption(department, { showCity: !filters.cityId })}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Пост</span>
                  <select
                    value={filters.postId ?? 0}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        postId: Number(event.target.value) || undefined,
                      }))
                    }
                  >
                    <option value={0}>Все посты</option>
                    {dutyPosts.map((post) => (
                      <option key={post.id} value={post.id}>
                        {post.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Авто</span>
                  <select
                    value={filters.vehicleId ?? 0}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        vehicleId: Number(event.target.value) || undefined,
                      }))
                    }
                  >
                    <option value={0}>Все авто</option>
                    {vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.title}
                        {vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Співробітник</span>
                  <select
                    value={filters.employeeId ?? 0}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        employeeId: Number(event.target.value) || undefined,
                      }))
                    }
                  >
                    <option value={0}>Все співробітники</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.fullName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Дата від</span>
                  <input
                    type="date"
                    value={filters.dateFrom ?? ""}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        dateFrom: event.target.value || undefined,
                      }))
                    }
                  />
                </label>

                <label className="field">
                  <span>Дата до</span>
                  <input
                    type="date"
                    value={filters.dateTo ?? ""}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        dateTo: event.target.value || undefined,
                      }))
                    }
                  />
                </label>

                <label className="field">
                  <span>Пошук</span>
                  <input
                    value={filters.search ?? ""}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        search: event.target.value,
                      }))
                    }
                    placeholder="Пост, авто, співробітник..."
                  />
                </label>

                <label className="field">
                  <span>Статус</span>
                  <select
                    value={filters.archive ? "archive" : "active"}
                    onChange={(event) => handleArchiveFilterChange(event.target.value)}
                  >
                    <option value="active">Рабочие</option>
                    <option value="archive">Архів</option>
                  </select>
                </label>
              </div>

              <div className="report-filter-actions">
                <button className="primary-button" onClick={applyFilters}>
                  Сформировать
                </button>
              </div>
            </AccordionSection>


            {loading ? (
              <div className="empty-state">Завантаження...</div>
            ) : rows.length === 0 ? (
              <div className="empty-state">
                {filters.archive
                  ? "В архіве нет постовых дежурств"
                  : "Постові чергування еще не доданоы"}
              </div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data-table post-duties-table">
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Місто</th>
                        <th>Підрозділ</th>
                        <th>Пост</th>
                        <th>Часы</th>
                        <th>Зміна</th>
                        <th>Авто</th>
                        <th>Співробітники</th>
                        <th>Коментар</th>
                        {canEditPostDuties && <th>Действия</th>}
                      </tr>
                    </thead>

                    <tbody>
                      {rows.map((duty) => (
                        <tr key={duty.id}>
                          <td>{formatDate(duty.dutyDate)}</td>
                          <td>{duty.city.name}</td>
                          <td>{duty.department ? formatDepartmentOption(duty.department, { showCity: false }) : "—"}</td>
                          <td>
                            <strong>{duty.post.name}</strong>
                          </td>
                          <td>{formatNumber(duty.durationHours)}</td>
                          <td>{formatNumber(duty.shiftEquivalent)}</td>
                          <td>
                            {duty.vehicle
                              ? `${duty.vehicle.title}${duty.vehicle.licensePlate
                                ? ` · ${duty.vehicle.licensePlate}`
                                : ""
                              }`
                              : "—"}
                          </td>
                          <td>
                            <div className="post-duty-members-view">
                              {duty.members.map((member) => (
                                <div key={member.id} className="post-duty-member-line">
                                  <strong>{member.employee.fullName}</strong>
                                  {member.hasWeapon && <span> · оружие</span>}
                                  {member.isDriver && <span> · водитель</span>}
                                </div>
                              ))}
                            </div>
                          </td>
                          <td>{duty.note || "—"}</td>

                          {canEditPostDuties && (
                            <td className="actions-cell">
                              {filters.archive ? (
                                <RowActionMenu
                                  items={[
                                    {
                                      label:
                                        restoringId === duty.id ? "Восстанавливаем..." : "Відновити",
                                      disabled: restoringId === duty.id,
                                      onClick: () => handleRestore(duty),
                                    },
                                  ]}
                                />
                              ) : (
                                <RowActionMenu
                                  items={[
                                    {
                                      label: "Редагувати",
                                      variant: "edit",
                                      onClick: () => startEdit(duty),
                                    },
                                    {
                                      label: deletingId === duty.id ? "Удаляем..." : "Удалить",
                                      variant: "danger",
                                      disabled: deletingId === duty.id,
                                      onClick: () => handleDelete(duty),
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
                    disabled={(pagination?.page ?? 1) <= 1}
                    onClick={() => handlePageChange((pagination?.page ?? 1) - 1)}
                  >
                    Назад
                  </button>

                  <span>
                    Страница {pagination?.page ?? 1} из{" "}
                    {pagination?.totalPages ?? 1}
                  </span>

                  <button
                    className="secondary-button"
                    disabled={
                      (pagination?.page ?? 1) >= (pagination?.totalPages ?? 1)
                    }
                    onClick={() => handlePageChange((pagination?.page ?? 1) + 1)}
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