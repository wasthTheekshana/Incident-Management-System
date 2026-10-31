import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, setUnauthorizedHandler } from '../api/client';
import type { Company, Me } from '../api/types';

const COMPANY_KEY = 'cims.activeCompany';

interface AuthState {
  me: Me | null;
  loading: boolean;
  companies: Company[];
  activeCompany: Company | null;
  selectCompany: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const readStoredCompany = (): string | null => {
  try {
    return sessionStorage.getItem(COMPANY_KEY);
  } catch {
    return null;
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(readStoredCompany);

  const meQuery = useQuery({
    queryKey: ['me'],
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        return await api<Me>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
  });
  const me = meQuery.data ?? null;

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: () => api<Company[]>('/companies'),
    enabled: !!me && !me.mustChangePassword,
  });
  const companies = useMemo(() => (companiesQuery.data ?? []).filter((c) => c.active), [companiesQuery.data]);

  // FR-9: a user mapped to one company has it selected automatically.
  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeId) ?? (companies.length === 1 ? companies[0] : null),
    [companies, activeId],
  );

  const selectCompany = useCallback((id: string) => {
    setActiveId(id);
    try {
      sessionStorage.setItem(COMPANY_KEY, id);
    } catch {
      /* storage unavailable: the selection simply isn't remembered across reloads */
    }
  }, []);

  const clearSession = useCallback(() => {
    queryClient.clear();
    queryClient.setQueryData(['me'], null);
    setActiveId(null);
    try {
      sessionStorage.removeItem(COMPANY_KEY);
    } catch {
      /* ignore */
    }
  }, [queryClient]);

  useEffect(() => setUnauthorizedHandler(clearSession), [clearSession]);

  const value = useMemo<AuthState>(
    () => ({
      me,
      loading: meQuery.isLoading,
      companies,
      activeCompany,
      selectCompany,
      login: async (email, password) => {
        await api('/auth/login', { method: 'POST', body: { email, password }, ignoreUnauthorized: true });
        await queryClient.invalidateQueries({ queryKey: ['me'] });
      },
      logout: async () => {
        await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
        clearSession();
      },
      refresh: async () => {
        await queryClient.invalidateQueries({ queryKey: ['me'] });
      },
    }),
    [me, meQuery.isLoading, companies, activeCompany, selectCompany, queryClient, clearSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export const isAdminRole = (me: Me | null): boolean => me?.role === 'ADMIN' || me?.role === 'SUPER_ADMIN';
