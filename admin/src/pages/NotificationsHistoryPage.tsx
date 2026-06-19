import { useEffect, useMemo, useState } from "react";
import { getAccessibleCities } from "../api/cities.api";
import type { City } from "../api/cities.api";
import { getDepartments } from "../api/departments.api";
import type { Department } from "../api/departments.api";
import { getMobileUsers } from "../api/mobile-users.api";
import type { MobileUser } from "../api/mobile-users.api";
import {
  getNotificationById,
  getNotifications,
  type AdminNotification,
} from "../api/notifications.api";
import { AccordionSection } from "../components/AccordionSection";
import { dedupeDepartments, formatDepartmentOption } from "../utils/department-options";

type SectionId = "filters" | "list";

type Filters = {
  cityId: number;
  departmentId: number;
  mobileUserId: number;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
};

const initialFilters: Filters = {
  cityId: 0,
  departmentId: 0,
  mobileUserId: 0,
  dateFrom: "",
  dateTo: "",
  page: 1,
  pageSize: 20,
};

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function getDeliveredCount(notification: AdminNotification) {
  return notification.recipients.filter((recipient) => recipient.deliveredAt)
    .length;
}

function getNotificationStatusLabel(notification: AdminNotification) {
  const deliveredCount = getDeliveredCount(notification);

  if (
    notification.recipientsCount > 0 &&
    notification.repliedCount === notification.recipientsCount
  ) {
    return "Усі відповіли";
  }

  if (notification.repliedCount > 0) {
    return "Є відповіді";
  }

  if (
    notification.recipientsCount > 0 &&
    notification.readCount === notification.recipientsCount
  ) {
    return "Усі ознайомилися";
  }

  if (notification.readCount > 0) {
    return "Частково ознайомилися";
  }

  if (
    notification.recipientsCount > 0 &&
    deliveredCount === notification.recipientsCount
  ) {
    return "Доставлено";
  }

  if (deliveredCount > 0) {
    return "Частково доставлено";
  }

  return "Надіслано";
}

function getNotificationStatusClass(notification: AdminNotification) {
  if (notification.repliedCount > 0) {
    return "notification-status-replied";
  }

  if (notification.readCount > 0) {
    return "notification-status-read";
  }

  if (getDeliveredCount(notification) > 0) {
    return "notification-status-delivered";
  }

  return "notification-status-sent";
}

function getRecipientStatusLabel(
  recipient: AdminNotification["recipients"][number],
) {
  if (recipient.repliedAt) return "Відповів";
  if (recipient.readAt) return "Ознайомився";
  if (recipient.deliveredAt) return "Доставлено";

  return "Надіслано";
}

function getRecipientStatusClass(
  recipient: AdminNotification["recipients"][number],
) {
  if (recipient.repliedAt) return "notification-status-replied";
  if (recipient.readAt) return "notification-status-read";
  if (recipient.deliveredAt) return "notification-status-delivered";

  return "notification-status-sent";
}

function getRecipientTimelineItems(
  recipient: AdminNotification["recipients"][number],
) {
  return [
    {
      key: "sent",
      label: "Надіслано",
      value: recipient.sentAt,
      active: Boolean(recipient.sentAt),
    },
    {
      key: "delivered",
      label: "Доставлено",
      value: recipient.deliveredAt,
      active: Boolean(recipient.deliveredAt),
    },
    {
      key: "read",
      label: "Ознайомився",
      value: recipient.readAt,
      active: Boolean(recipient.readAt),
    },
    {
      key: "reply",
      label: "Відповів",
      value: recipient.repliedAt,
      active: Boolean(recipient.repliedAt),
    },
  ];
}

export function NotificationsHistoryPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [mobileUsers, setMobileUsers] = useState<MobileUser[]>([]);

  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [selectedNotification, setSelectedNotification] =
    useState<AdminNotification | null>(null);

  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });

  const [openedSections, setOpenedSections] = useState<
    Record<SectionId, boolean>
  >({
    filters: false,
    list: true,
  });

  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState("");

  const visibleDepartments = useMemo(() => {
    return dedupeDepartments(
      departments.filter((department) => {
        if (filters.cityId && department.cityId !== filters.cityId) return false;
        return department.isActive && !department.deletedAt;
      }),
    );
  }, [departments, filters.cityId]);

  const filteredMobileUsers = useMemo(() => {
    return mobileUsers.filter((user) => {
      if (filters.cityId && user.cityId !== filters.cityId) return false;
      if (filters.departmentId && user.departmentId !== filters.departmentId) return false;
      return true;
    });
  }, [filters.cityId, filters.departmentId, mobileUsers]);

  useEffect(() => {
    async function loadReferences() {
      try {
        const [citiesData, departmentsData, usersData] = await Promise.all([
          getAccessibleCities(false),
          getDepartments({ includeInactive: false }),
          getMobileUsers({ includeInactive: false }),
        ]);

        setCities(citiesData);
        setDepartments(departmentsData);
        setMobileUsers(usersData);
      } catch {
        setError("Не вдалося завантажити довідники");
      }
    }

    loadReferences();
  }, []);

  useEffect(() => {
    loadNotifications(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSection(sectionId: SectionId) {
    setOpenedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }

  async function loadNotifications(nextFilters = filters) {
    setLoading(true);
    setError("");

    try {
      const response = await getNotifications({
        page: nextFilters.page,
        pageSize: nextFilters.pageSize,
        cityId: nextFilters.cityId || undefined,
        departmentId: nextFilters.departmentId || undefined,
        mobileUserId: nextFilters.mobileUserId || undefined,
        dateFrom: nextFilters.dateFrom || undefined,
        dateTo: nextFilters.dateTo || undefined,
      });

      setNotifications(response.data);
      setPagination(response.pagination);
      setFilters(nextFilters);
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Не вдалося завантажити сповіщення",
      );
    } finally {
      setLoading(false);
    }
  }

  async function openNotification(notification: AdminNotification) {
    setDetailsLoading(true);
    setError("");

    try {
      const data = await getNotificationById(notification.id);
      setSelectedNotification(data);
    } catch (err: any) {
      setError(err.response?.data?.message || "Не вдалося відкрити сповіщення");
    } finally {
      setDetailsLoading(false);
    }
  }

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: key === "page" ? Number(value) : 1,
      ...(key === "cityId" ? { departmentId: 0, mobileUserId: 0 } : {}),
      ...(key === "departmentId" ? { mobileUserId: 0 } : {}),
    }));
  }

  function applyFilters() {
    loadNotifications({
      ...filters,
      page: 1,
    });
  }

  function resetFilters() {
    loadNotifications(initialFilters);
  }

  function changePage(nextPage: number) {
    loadNotifications({
      ...filters,
      page: nextPage,
    });
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Історія сповіщень</h1>
          <p>Список надісланих сповіщень і реакцій користувачів</p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="panel-card">
        <AccordionSection
          title="Фільтри"
          subtitle="Місто, отримувач і період надсилання"
          open={openedSections.filters}
          onToggle={() => toggleSection("filters")}
        >
          <div className="notifications-filters-grid">
            <label className="field">
              <span>Місто</span>
              <select
                value={filters.cityId}
                onChange={(event) =>
                  updateFilter("cityId", Number(event.target.value))
                }
              >
                <option value={0}>Усі доступні міста</option>

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
                value={filters.departmentId}
                onChange={(event) =>
                  updateFilter("departmentId", Number(event.target.value))
                }
              >
                <option value={0}>Усі підрозділи</option>

                {visibleDepartments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {formatDepartmentOption(department, { showCity: !filters.cityId })}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Користувач</span>
              <select
                value={filters.mobileUserId}
                onChange={(event) =>
                  updateFilter("mobileUserId", Number(event.target.value))
                }
              >
                <option value={0}>Усі користувачі</option>

                {filteredMobileUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.login}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Дата від</span>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(event) =>
                  updateFilter("dateFrom", event.target.value)
                }
              />
            </label>

            <label className="field">
              <span>Дата до</span>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(event) => updateFilter("dateTo", event.target.value)}
              />
            </label>

            <label className="field">
              <span>Рядків на сторінці</span>
              <select
                value={filters.pageSize}
                onChange={(event) =>
                  updateFilter("pageSize", Number(event.target.value))
                }
              >
                <option value={20}>20 рядків</option>
                <option value={50}>50 рядків</option>
                <option value={100}>100 рядків</option>
              </select>
            </label>
          </div>

          <div className="form-actions">
            <button className="primary-button" onClick={applyFilters}>
              Застосувати
            </button>

            <button className="secondary-button" onClick={resetFilters}>
              Скинути
            </button>
          </div>
        </AccordionSection>
      </div>

      <div className="panel-card table-card">
        <AccordionSection
          title="Список сповіщень"
          subtitle={`Усього: ${pagination.total} · Сторінка ${pagination.page} з ${pagination.totalPages}`}
          open={openedSections.list}
          onToggle={() => toggleSection("list")}
        >
          {loading ? (
            <div className="empty-state">Завантаження...</div>
          ) : notifications.length === 0 ? (
            <div className="empty-state">Сповіщень поки немає</div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="data-table notifications-table">
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>Дата</th>
                      <th>Місто</th>
                      <th>Підрозділ</th>
                      <th>Хто надіслав</th>
                      <th>Отримувачі</th>
                      <th>Доставлено</th>
                      <th>Ознайомилися</th>
                      <th>Відповіли</th>
                      <th>Статус</th>
                      <th>Заголовок</th>
                    </tr>
                  </thead>

                  <tbody>
                    {notifications.map((notification, index) => (
                      <tr
                        key={notification.id}
                        className="clickable-row"
                        onClick={() => openNotification(notification)}
                      >
                        <td>
                          {(pagination.page - 1) * pagination.pageSize +
                            index +
                            1}
                        </td>
                        <td>{formatDateTime(notification.createdAt)}</td>
                        <td>{notification.city.name}</td>
                        <td>{notification.department ? formatDepartmentOption(notification.department, { showCity: false }) : "Усі"}</td>
                        <td>
                          {notification.senderUser?.name ||
                            notification.senderUser?.login ||
                            "—"}
                        </td>
                        <td>{notification.recipientsCount}</td>
                        <td>{getDeliveredCount(notification)}</td>
                        <td>{notification.readCount}</td>
                        <td>{notification.repliedCount}</td>
                        <td>
                          <span
                            className={`status-badge ${getNotificationStatusClass(
                              notification,
                            )}`}
                          >
                            {getNotificationStatusLabel(notification)}
                          </span>
                        </td>
                        <td>{notification.title}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination-bar">
                <button
                  className="secondary-button"
                  disabled={pagination.page <= 1}
                  onClick={() => changePage(Math.max(pagination.page - 1, 1))}
                >
                  Назад
                </button>

                <span>
                  Сторінка {pagination.page} з {pagination.totalPages}
                </span>

                <button
                  className="secondary-button"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() =>
                    changePage(
                      Math.min(pagination.page + 1, pagination.totalPages),
                    )
                  }
                >
                  Вперед
                </button>
              </div>
            </>
          )}
        </AccordionSection>
      </div>

      {selectedNotification && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedNotification(null)}
        >
          <div
            className="modal-card notification-details-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="table-header">
              <div>
                <h2>Картка сповіщення</h2>
                <p>#{selectedNotification.id}</p>
              </div>

              <button
                className="small-button"
                onClick={() => setSelectedNotification(null)}
              >
                Закрити
              </button>
            </div>

            {detailsLoading ? (
              <div className="empty-state">Завантаження...</div>
            ) : (
              <>
                <div className="notification-detail-message">
                  <strong>{selectedNotification.title}</strong>
                  <p>{selectedNotification.message}</p>
                </div>

                <div className="notification-detail-grid">
                  <span>Місто</span>
                  <strong>{selectedNotification.city.name}</strong>

                  <span>Підрозділ</span>
                  <strong>{selectedNotification.department ? formatDepartmentOption(selectedNotification.department, { showCity: false }) : "Усі підрозділи"}</strong>

                  <span>Надіслав</span>
                  <strong>
                    {selectedNotification.senderUser?.name ||
                      selectedNotification.senderUser?.login ||
                      "—"}
                  </strong>

                  <span>Час надсилання</span>
                  <strong>
                    {formatDateTime(selectedNotification.createdAt)}
                  </strong>

                  <span>Отримувачів</span>
                  <strong>{selectedNotification.recipientsCount}</strong>

                  <span>Push</span>
                  <strong>
                    {selectedNotification.push.enabled ? "Увімкнено" : "Вимкнено"}
                  </strong>

                  <span>Push-токенів</span>
                  <strong>{selectedNotification.push.tokensCount}</strong>

                  <span>Успішно надіслано</span>
                  <strong>{selectedNotification.push.successCount}</strong>

                  <span>Помилок надсилання</span>
                  <strong>{selectedNotification.push.failureCount}</strong>

                  <span>Видалено невалідних токенів</span>
                  <strong>
                    {selectedNotification.push.removedInvalidTokens}
                  </strong>

                  <span>Push-статус</span>
                  <strong>{selectedNotification.push.message || "—"}</strong>

                  <span>Push оброблено</span>
                  <strong>
                    {formatDateTime(selectedNotification.push.processedAt)}
                  </strong>
                </div>

                <div className="notification-recipient-list">
                  {selectedNotification.recipients.map((recipient) => {
                    const timelineItems = getRecipientTimelineItems(recipient);

                    return (
                      <div
                        className="notification-recipient-card"
                        key={recipient.id}
                      >
                        <div className="notification-recipient-person">
                          <strong>{recipient.mobileUser.login}</strong>
                          <span>
                            {recipient.mobileUser.department
                              ? formatDepartmentOption(recipient.mobileUser.department, { showCity: false })
                              : recipient.mobileUser.city?.name ?? "—"}
                          </span>

                          <span
                            className={`status-badge notification-recipient-status ${getRecipientStatusClass(
                              recipient,
                            )}`}
                          >
                            {getRecipientStatusLabel(recipient)}
                          </span>
                        </div>

                        <div className="notification-recipient-timeline">
                          {timelineItems.map((item) => (
                            <div
                              className={
                                item.active
                                  ? "notification-timeline-item notification-timeline-item-active"
                                  : "notification-timeline-item"
                              }
                              key={item.key}
                            >
                              <span className="notification-timeline-dot" />

                              <div>
                                <strong>{item.label}</strong>
                                <span>{formatDateTime(item.value)}</span>
                              </div>
                            </div>
                          ))}

                          {recipient.replyText && (
                            <p className="notification-reply-text">
                              Відповідь: {recipient.replyText}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}