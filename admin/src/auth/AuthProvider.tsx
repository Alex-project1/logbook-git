import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { getAdminMe, loginAdmin } from "../api/auth.api";
import type { AdminRoleCode, AdminUser } from "../api/auth.api";

const TOKEN_STORAGE_KEY = "admin_access_token";

type AuthContextValue = {
  token: string | null;
  user: AdminUser | null;
  loading: boolean;
  authenticated: boolean;
  roleCode: AdminRoleCode | null;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  canWrite: boolean;
  hasAnyRole: (roles?: AdminRoleCode[]) => boolean;
  signIn: (credentials: { login: string; password: string }) => Promise<void>;
  signOut: () => void;
  reloadCurrentUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const reloadCurrentUser = useCallback(async () => {
    const currentToken = readStoredToken();

    if (!currentToken) {
      setToken(null);
      setUser(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const response = await getAdminMe();
      setToken(currentToken);
      setUser(response.user);
    } catch {
      signOut();
    } finally {
      setLoading(false);
    }
  }, [signOut]);

  useEffect(() => {
    reloadCurrentUser();
  }, [reloadCurrentUser]);

  const signIn = useCallback(
    async (credentials: { login: string; password: string }) => {
      const response = await loginAdmin(credentials);

      localStorage.setItem(TOKEN_STORAGE_KEY, response.accessToken);
      setToken(response.accessToken);
      setUser(response.user);
    },
    [],
  );

  const roleCode = user?.role?.code ?? null;
  const isSuperAdmin = roleCode === "super_admin";
  const isAdmin = roleCode === "admin";
  const canWrite = isSuperAdmin || isAdmin;

  const hasAnyRole = useCallback(
    (roles?: AdminRoleCode[]) => {
      if (!roles || roles.length === 0) {
        return true;
      }

      if (!roleCode) {
        return false;
      }

      return roles.includes(roleCode);
    },
    [roleCode],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      loading,
      authenticated: Boolean(token && user),
      roleCode,
      isSuperAdmin,
      isAdmin,
      canWrite,
      hasAnyRole,
      signIn,
      signOut,
      reloadCurrentUser,
    }),
    [
      token,
      user,
      loading,
      roleCode,
      isSuperAdmin,
      isAdmin,
      canWrite,
      hasAnyRole,
      signIn,
      signOut,
      reloadCurrentUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return value;
}
