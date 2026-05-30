import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { getAdminMe } from "../api/auth.api";
import type { AdminRoleCode, AdminUser } from "../api/auth.api";

type RequireRoleProps = {
  allowedRoles: AdminRoleCode[];
  children: ReactNode;
};

export function RequireRole({ allowedRoles, children }: RequireRoleProps) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    async function loadUser() {
      try {
        const response = await getAdminMe();
        setUser(response.user);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

  if (loading) {
    return <div className="empty-state">Проверка доступа...</div>;
  }

  if (failed || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role.code)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}