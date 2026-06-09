import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import type { AdminRoleCode } from "../api/auth.api";

type RequireRoleProps = {
  allowedRoles: AdminRoleCode[];
  children: ReactNode;
};

export function RequireRole({ allowedRoles, children }: RequireRoleProps) {
  const { loading, authenticated, hasAnyRole } = useAuth();

  if (loading) {
    return <div className="empty-state">Перевірка доступу...</div>;
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!hasAnyRole(allowedRoles)) {
    return <Navigate to="/access-denied" replace />;
  }

  return <>{children}</>;
}
