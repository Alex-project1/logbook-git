import { useEffect, useMemo, useState } from "react";
import { getAccessibleCities } from "../api/cities.api";
import type { City } from "../api/cities.api";
import { getDepartments } from "../api/departments.api";
import type { Department } from "../api/departments.api";
import { dedupeDepartments, formatDepartmentOption } from "../utils/department-options";
import { getMobileUsers } from "../api/mobile-users.api";
import type { MobileUser, MobileUserKind } from "../api/mobile-users.api";
import { AccordionSection } from "../components/AccordionSection";

function getKindLabel(kind: MobileUserKind) {
  return kind === "CREW" ? "Наряд ГБР" : "Пост";
}

function getBoundEntityLabel(user: MobileUser) {
  if (user.userKind === "CREW") {
    return user.crew?.name ?? user.displayName ?? "Наряд не знайдено";
  }

  return user.dutyPost?.name ?? user.displayName ?? "Пост не знайдено";
}

export function MobileUsersPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [mobileUsers, setMobileUsers] = useState<MobileUser[]>([]);

  const [selectedCityId, setSelectedCityId] = useState(0);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(0);
  const [selectedKind, setSelectedKind] = useState<MobileUserKind | "">("");
  const [showArchive, setShowArchive] = useState(false);
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openedSections, setOpenedSections] = useState({ filters: true, list: true });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const visibleDepartments = useMemo(() => {
    return dedupeDepartments(
      departments.filter((department) => {
        if (selectedCityId && department.cityId !== selectedCityId) return false;
        return !department.deletedAt;
      }),
    );
  }, [departments, selectedCityId]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return mobileUsers;

    return mobileUsers.filter((user) => {
      const haystack = [
        user.login,
        user.displayName ?? "",
        user.city?.name ?? "",
        user.department?.name ?? "",
        user.crew?.name ?? "",
        user.dutyPost?.name ?? "",
        user.comment ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [mobileUsers, search]);

  const totalPages = Math.max(Math.ceil(filteredUsers.length / pageSize), 1);
  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, page, pageSize]);

  async function loadReferences() {
    const [citiesData, departmentsData] = await Promise.all([
      getAccessibleCities(),
      getDepartments({ includeInactive: true }),
    ]);

    setCities(citiesData);
    setDepartments(departmentsData);
  }

  async function loadUsers(next?: {
    cityId?: number;
    departmentId?: number;
    userKind?: MobileUserKind | "";
    archive?: boolean;
  }) {
    setLoading(true);
    setError("");

    const cityId = next?.cityId ?? selectedCityId;
    const departmentId = next?.departmentId ?? selectedDepartmentId;
    const userKind = next?.userKind ?? selectedKind;
    const archive = next?.archive ?? showArchive;

    try {
      const data = await getMobileUsers({
        cityId: cityId || undefined,
        departmentId: departmentId || undefined,
        userKind: userKind || undefined,
        archive,
        includeInactive: true,
      });

      setMobileUsers(data);
      setPage(1);
    } catch {
      setError("Не вдалося завантажити користувачів застосунку");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function init() {
      try {
        await loadReferences();
        await loadUsers({ cityId: 0, departmentId: 0, userKind: "", archive: false });
      } catch {
        setError("Не вдалося завантажити довідники");
        setLoading(false);
      }
    }

    init();
  }, []);

  function toggleSection(section: "filters" | "list") {
    setOpenedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }

  async function handleCityChange(cityId: number) {
    setSelectedCityId(cityId);
    setSelectedDepartmentId(0);
    await loadUsers({ cityId, departmentId: 0 });
  }

  async function handleDepartmentChange(departmentId: number) {
    setSelectedDepartmentId(departmentId);
    await loadUsers({ departmentId });
  }

  async function handleKindChange(kind: MobileUserKind | "") {
    setSelectedKind(kind);
    await loadUsers({ userKind: kind });
  }

  async function handleArchiveChange(value: string) {
    const archive = value === "archive";
    setShowArchive(archive);
    await loadUsers({ archive });
  }

  async function handleReset() {
    setSelectedCityId(0);
    setSelectedDepartmentId(0);
    setSelectedKind("");
    setShowArchive(false);
    setSearch("");
    await loadUsers({ cityId: 0, departmentId: 0, userKind: "", archive: false });
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Користувачі застосунку</h1>
          <p>
            Перегляд логінів, які створюються через “Наряди ГБР” та “Доп. пости”.
            Нових користувачів тут не додаємо — вони привʼязані до наряду або поста.
          </p>
        </div>
      </div>

      <div className="content-grid single-column">
        <div className="panel-card">
          <AccordionSection
            title="Фільтри"
            subtitle="Місто, підрозділ, тип користувача та архів"
            open={openedSections.filters}
            onToggle={() => toggleSection("filters")}
          >
            <div className="filters-row">
              <label className="field">
                <span>Місто</span>
                <select
                  value={selectedCityId}
                  onChange={(event) => handleCityChange(Number(event.target.value))}
                >
                  <option value={0}>Усі міста</option>
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Підрозділ</span>
                <select
                  value={selectedDepartmentId}
                  onChange={(event) => handleDepartmentChange(Number(event.target.value))}
                >
                  <option value={0}>Усі підрозділи</option>
                  {visibleDepartments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {formatDepartmentOption(department, { showCity: !selectedCityId })}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Тип</span>
                <select
                  value={selectedKind}
                  onChange={(event) => handleKindChange(event.target.value as MobileUserKind | "")}
                >
                  <option value="">Усі типи</option>
                  <option value="CREW">Наряди ГБР</option>
                  <option value="POST">Пости</option>
                </select>
              </label>

              <label className="field">
                <span>Стан</span>
                <select
                  value={showArchive ? "archive" : "active"}
                  onChange={(event) => handleArchiveChange(event.target.value)}
                >
                  <option value="active">Робочі</option>
                  <option value="archive">Архів</option>
                </select>
              </label>

              <label className="field">
                <span>Пошук</span>
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Логін, позивний, пост, підрозділ..."
                />
              </label>
            </div>

            <div className="form-actions">
              <button className="primary-button" onClick={() => loadUsers()} disabled={loading}>
                {loading ? "Оновлюємо..." : "Оновити"}
              </button>
              <button className="secondary-button" onClick={handleReset}>
                Скинути
              </button>
            </div>
          </AccordionSection>
        </div>

        <div className="panel-card table-card">
          <AccordionSection
            title="Список користувачів"
            subtitle={`Знайдено: ${filteredUsers.length} · Сторінка ${page} з ${totalPages}`}
            open={openedSections.list}
            onToggle={() => toggleSection("list")}
          >
            {error && <div className="form-error">{error}</div>}

            <div className="table-header">
              <div>
                <h2>Користувачі застосунку</h2>
                <p>Логін, місто, підрозділ і привʼязаний наряд/пост</p>
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
                  <option value={20}>20 рядків</option>
                  <option value={50}>50 рядків</option>
                  <option value={100}>100 рядків</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="empty-state">Завантаження...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="empty-state">Користувачів не знайдено</div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Логін</th>
                        <th>Тип</th>
                        <th>Позивний / пост</th>
                        <th>Місто</th>
                        <th>Підрозділ</th>
                        <th>Статус</th>
                        <th>Коментар</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedUsers.map((user) => (
                        <tr key={user.id}>
                          <td>{user.id}</td>
                          <td><strong>{user.login}</strong></td>
                          <td>{getKindLabel(user.userKind)}</td>
                          <td>{getBoundEntityLabel(user)}</td>
                          <td>{user.city?.name ?? user.cityId}</td>
                          <td>
                            {user.department
                              ? formatDepartmentOption(user.department, { showCity: !selectedCityId })
                              : user.departmentId}
                          </td>
                          <td>
                            {showArchive || user.deletedAt ? (
                              <span className="status-badge status-inactive">В архіві</span>
                            ) : (
                              <span className={user.isActive ? "status-badge status-active" : "status-badge status-inactive"}>
                                {user.isActive ? "Активний" : "Вимкнений"}
                              </span>
                            )}
                          </td>
                          <td>{user.comment || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pagination-bar">
                  <button className="secondary-button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(current - 1, 1))}>
                    Назад
                  </button>
                  <span>Сторінка {page} з {totalPages}</span>
                  <button className="secondary-button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(current + 1, totalPages))}>
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
