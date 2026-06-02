import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { getAdminMe } from "../api/auth.api";
import type { AdminUser } from "../api/auth.api";

type MenuLink = {
  to: string;
  label: string;
};

type MenuGroup = {
  id: string;
  label: string;
  items: MenuLink[];
};

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState<AdminUser | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [openedGroupId, setOpenedGroupId] = useState<string>("main");

  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const response = await getAdminMe();
        setUser(response.user);
      } catch {
        localStorage.removeItem("admin_access_token");
        navigate("/login");
      }
    }

    loadCurrentUser();
  }, [navigate]);

  const roleCode = user?.role?.code;

  const isSuperAdmin = roleCode === "super_admin";
  const isAdmin = roleCode === "admin";

  const canWrite = isSuperAdmin || isAdmin;
  const canSeeActionLogs = isSuperAdmin;

  const menuGroups = useMemo<MenuGroup[]>(() => {
    const groups: MenuGroup[] = [
      {
        id: "main",
        label: "Основное",
        items: [{ to: "/", label: "Dashboard" }],
      },
      {
        id: "shifts",
        label: "Смены и дежурства",
        items: [
          ...(canWrite
            ? [{ to: "/manual-shifts/create", label: "Добавить смену ГБР" }]
            : []),
          ...(canWrite
            ? [{ to: "/manual-shifts/archive", label: "Архив смен ГБР" }]
            : []),
          { to: "/post-duties", label: "Постовые дежурства" },
        ],
      },
      {
  id: "notifications",
  label: "Уведомления",
  items: [
    { to: "/notifications/new", label: "Новое уведомление" },
    { to: "/notifications/history", label: "История уведомлений" },
  ],
},
      {
        id: "directories",
        label: "Справочники",
        items: [
          ...(isSuperAdmin ? [{ to: "/cities", label: "Города" }] : []),
          { to: "/mobile-users", label: "Пользователи приложения" },
          { to: "/employees", label: "Сотрудники" },
          { to: "/crews", label: "Наряды ГБР" },
          { to: "/duty-posts", label: "Доп. посты" },
          { to: "/vehicles", label: "Автомобили" },
          ...(isSuperAdmin
            ? [
                { to: "/trip-goals", label: "Цели поездок" },
                {
                  to: "/additional-alarm-reasons",
                  label: "Причины доп. сработок",
                },
              ]
            : []),
        ],
      },
      {
        id: "reports",
        label: "Отчеты",
        items: [
          { to: "/reports/general", label: "Общая статистика" },
          { to: "/reports/custom", label: "Кастомный отчет" },
          { to: "/reports/trips", label: "Все поездки" },
          { to: "/reports/shifts", label: "Итоги по сменам" },
          { to: "/reports/employees", label: "По сотрудникам" },
          { to: "/reports/crews", label: "По нарядам" },
          { to: "/reports/vehicles", label: "По автомобилям" },
          { to: "/reports/alarms", label: "По сработкам" },
        ],
      },
      {
        id: "administration",
        label: "Администрирование",
        items: [
          ...(isSuperAdmin
            ? [{ to: "/admin-users", label: "Администраторы" }]
            : []),
          ...(canSeeActionLogs
            ? [{ to: "/action-logs", label: "Журнал действий" }]
            : []),
        ],
      },
    ];

    return groups.filter((group) => group.items.length > 0);
  }, [canSeeActionLogs, canWrite, isSuperAdmin]);

  useEffect(() => {
    const activeGroup = menuGroups.find((group) =>
      group.items.some((item) =>
        item.to === "/"
          ? location.pathname === "/"
          : location.pathname.startsWith(item.to)
      )
    );

    if (activeGroup) {
      setOpenedGroupId(activeGroup.id);
    }
  }, [location.pathname, menuGroups]);

  function handleLogout() {
    localStorage.removeItem("admin_access_token");
    navigate("/login");
  }

  function toggleGroup(groupId: string) {
    setOpenedGroupId((current) => (current === groupId ? "" : groupId));
  }

  function isGroupActive(group: MenuGroup) {
    return group.items.some((item) =>
      item.to === "/"
        ? location.pathname === "/"
        : location.pathname.startsWith(item.to)
    );
  }

  return (
    <div
      className={
        sidebarOpen
          ? "admin-shell admin-shell-sidebar-open"
          : "admin-shell admin-shell-sidebar-closed"
      }
    >
      <button
        type="button"
        className="sidebar-toggle-button"
        onClick={() => setSidebarOpen((current) => !current)}
        aria-label={sidebarOpen ? "Скрыть меню" : "Показать меню"}
      >
        {sidebarOpen ? "‹" : "☰"}
      </button>

      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">Ж</div>

          <div>
            <div className="logo-title">Бортовой журнал</div>
            <div className="logo-subtitle">Админ-панель</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {menuGroups.map((group) => {
            const opened = openedGroupId === group.id;
            const active = isGroupActive(group);

            return (
              <div
                key={group.id}
                className={
                  opened
                    ? "nav-group nav-group-open"
                    : active
                      ? "nav-group nav-group-active"
                      : "nav-group"
                }
              >
                <button
                  type="button"
                  className={
                    active
                      ? "nav-group-trigger nav-group-trigger-active"
                      : "nav-group-trigger"
                  }
                  onClick={() => toggleGroup(group.id)}
                >
                  <span>{group.label}</span>
                  <span className="nav-chevron">{opened ? "▴" : "▾"}</span>
                </button>

                <div className="nav-submenu">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        isActive
                          ? "nav-sublink nav-sublink-active"
                          : "nav-sublink"
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <button className="logout-button" onClick={handleLogout}>
          Выйти
        </button>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}