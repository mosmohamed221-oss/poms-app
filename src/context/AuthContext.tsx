import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, setMemoryAuthToken, setUnauthorizedHandler } from '../lib/api';
import { Employee, EmployeeRole } from '../types/poms';

interface AuthContextValue {
  employee: Employee | null;
  loading: boolean;
  needsSetup: boolean;
  envPasscodeActive: boolean;
  authError: string | null;
  loginWithCredentials: (username: string, password: string) => Promise<void>;
  setupInitialAdmin: (params: {
    username: string;
    password: string;
    fullName: string;
    jobTitle: string;
    phone?: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  hasPermission: (perm: string) => boolean;
  hasRole: (roles: EmployeeRole[]) => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [envPasscodeActive, setEnvPasscodeActive] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const checkBootstrap = useCallback(async () => {
    try {
      const res = await apiRequest<{ needsSetup: boolean; envPasscodeActive?: boolean }>('/api/auth/bootstrap-status');
      setNeedsSetup(res.needsSetup);
      setEnvPasscodeActive(Boolean(res.envPasscodeActive));
    } catch {
      setNeedsSetup(false);
      setEnvPasscodeActive(false);
    }
  }, []);

  const restoreSessionOnBoot = useCallback(async () => {
    setLoading(true);
    try {
      const sessionRes = await apiRequest<{
        authenticated: boolean;
        token: string | null;
        employee: Employee | null;
      }>('/api/auth/session', { method: 'POST' });

      if (sessionRes.authenticated && sessionRes.token && sessionRes.employee) {
        setMemoryAuthToken(sessionRes.token);
        setEmployee(sessionRes.employee);
        setNeedsSetup(false);
        setEnvPasscodeActive(false);
        return;
      }
    } catch {
      // Fallback to bootstrap check when session cannot be restored
    }
    await checkBootstrap();
  }, [checkBootstrap]);

  useEffect(() => {
    let active = true;
    (async () => {
      await restoreSessionOnBoot();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [restoreSessionOnBoot]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setMemoryAuthToken(null);
      setEmployee(null);
      setAuthError('انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // Periodic 60-second heartbeat to track exact system active hours
  useEffect(() => {
    if (!employee) return;
    const timer = window.setInterval(async () => {
      try {
        const res = await apiRequest<{ activeSeconds: number }>('/api/auth/heartbeat', {
          method: 'POST',
        });
        setEmployee((prev) => (prev ? { ...prev, activeSeconds: res.activeSeconds } : prev));
      } catch {
        // Ignore transient network errors during heartbeat
      }
    }, 60000);
    return () => window.clearInterval(timer);
  }, [employee?.uid]);

  const loginWithCredentials = useCallback(async (username: string, password: string) => {
    setAuthError(null);
    try {
      const res = await apiRequest<{ token: string; employee: Employee }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setMemoryAuthToken(res.token);
      setEmployee(res.employee);
      setNeedsSetup(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر تسجيل الدخول.';
      setAuthError(msg);
      throw err;
    }
  }, []);

  const setupInitialAdmin = useCallback(
    async (params: {
      username: string;
      password: string;
      fullName: string;
      jobTitle: string;
      phone?: string;
    }) => {
      setAuthError(null);
      try {
        const res = await apiRequest<{ token: string; employee: Employee }>('/api/auth/setup-admin', {
          method: 'POST',
          body: JSON.stringify(params),
        });
        setMemoryAuthToken(res.token);
        setEmployee(res.employee);
        setNeedsSetup(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'تعذر إعداد حساب مدير المكتب.';
        setAuthError(msg);
        throw err;
      }
    },
    []
  );

  const refreshProfile = useCallback(async () => {
    try {
      const res = await apiRequest<{ employee: Employee }>('/api/auth/me');
      setEmployee(res.employee);
    } catch {
      // Ignore
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore
    }
    setMemoryAuthToken(null);
    setEmployee(null);
    if (window.location.hash) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    void checkBootstrap();
  }, [checkBootstrap]);

  const hasPermission = useCallback(
    (perm: string) => {
      if (!employee || employee.status !== 'active') return false;
      if (employee.role === 'super_admin') return true;
      return employee.permissions.includes(perm);
    },
    [employee]
  );

  const hasRole = useCallback(
    (roles: EmployeeRole[]) => {
      if (!employee || employee.status !== 'active') return false;
      return roles.includes(employee.role);
    },
    [employee]
  );

  return (
    <AuthContext.Provider
      value={{
        employee,
        loading,
        needsSetup,
        envPasscodeActive,
        authError,
        loginWithCredentials,
        setupInitialAdmin,
        signOut,
        hasPermission,
        hasRole,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
