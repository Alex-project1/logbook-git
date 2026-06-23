import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

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
  const { user, loading, signOut, isSuperAdmin, canWrite } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [openedGroupId, setOpenedGroupId] = useState<string>("main");

  const canSeeActionLogs = isSuperAdmin;

  const menuGroups = useMemo<MenuGroup[]>(() => {
    const groups: MenuGroup[] = [
      {
        id: "main",
        label: "Основне",
        items: [{ to: "/", label: "Головна" }],
      },
      {
        id: "shifts",
        label: "Зміни та чергування",
        items: [
          ...(canWrite
            ? [{ to: "/manual-shifts/create", label: "Додати зміну ГШР" }]
            : []),
          ...(canWrite
            ? [{ to: "/manual-shifts/archive", label: "Архів змін ГШР" }]
            : []),
          { to: "/post-duties", label: "Постові чергування" },
        ],
      },
      {
        id: "notifications",
        label: "Сповіщення",
        items: [
          ...(canWrite
            ? [{ to: "/notifications/new", label: "Нове сповіщення" }]
            : []),
          { to: "/notifications/history", label: "Історія сповіщень" },
        ],
      },
      {
        id: "directories",
        label: "Довідники",
        items: [
          ...(isSuperAdmin ? [{ to: "/cities", label: "Міста" }] : []),
          { to: "/mobile-users", label: "Користувачі застосунку" },
          ...(canWrite ? [{ to: "/departments", label: "Підрозділи" }] : []),
          { to: "/employees", label: "Співробітники" },
          { to: "/crews", label: "Наряди ГШР" },
          { to: "/duty-posts", label: "Дод. пости" },
          { to: "/vehicles", label: "Автомобілі" },
          ...(isSuperAdmin ? [{ to: "/streets", label: "Вулиці" }] : []),
          ...(isSuperAdmin
            ? [
                { to: "/trip-goals", label: "Цілі поїздок" },
                {
                  to: "/additional-alarm-reasons",
                  label: "Причини дод. спрацювань",
                },
              ]
            : []),
        ],
      },
      {
        id: "reports",
        label: "Звіти",
        items: [
          { to: "/reports/general", label: "Загальна статистика" },
          { to: "/reports/custom", label: "Користувацький звіт" },
          { to: "/reports/trips", label: "Усі поїздки" },
          { to: "/reports/shifts", label: "Підсумки за змінами" },
          { to: "/reports/employees", label: "За співробітниками" },
          { to: "/reports/crews", label: "За нарядами" },
          { to: "/reports/vehicles", label: "За автомобілями" },
          { to: "/reports/alarms", label: "За спрацюваннями" },
        ],
      },
      {
        id: "administration",
        label: "Адміністрування",
        items: [
          ...(canWrite ? [{ to: "/telegram", label: "Telegram" }] : []),
          ...(isSuperAdmin
            ? [{ to: "/admin-users", label: "Адміністратори" }]
            : []),
          ...(canSeeActionLogs
            ? [{ to: "/action-logs", label: "Журнал дій" }]
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
          : location.pathname.startsWith(item.to),
      ),
    );

    if (activeGroup) {
      setOpenedGroupId(activeGroup.id);
    }
  }, [location.pathname, menuGroups]);

  function handleLogout() {
    signOut();
    navigate("/login");
  }

  function toggleGroup(groupId: string) {
    setOpenedGroupId((current) => (current === groupId ? "" : groupId));
  }

  function isGroupActive(group: MenuGroup) {
    return group.items.some((item) =>
      item.to === "/"
        ? location.pathname === "/"
        : location.pathname.startsWith(item.to),
    );
  }

  if (loading) {
    return <div className="empty-state">Завантаження профілю адміністратора...</div>;
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
        aria-label={sidebarOpen ? "Сховати меню" : "Показати меню"}
      >
        {sidebarOpen ? "‹" : "☰"}
      </button>

      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">
            <img src="./logo.webp" alt="" />
          </div>

          <div>
            <div className="logo-title">Бортовий журнал</div>
            <div className="logo-subtitle">
              {user?.name || "Адмін-панель"}
            </div>
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
          Вийти
        </button>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
