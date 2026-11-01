import { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '../api/types';
import { useAuth } from '../auth/AuthContext';

/** Gate for every signed-in page. The server enforces access independently; this only routes the user sensibly. */
export function RequireAuth() {
  const { me, loading, companies, activeCompany } = useAuth();
  const location = useLocation();

  if (loading) return <p className="muted" style={{ padding: 24 }}>Loading…</p>;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (me.mustChangePassword && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />;

  const needsCompany = !me.mustChangePassword && companies.length > 1 && !activeCompany && me.role !== 'SUPER_ADMIN';
  if (needsCompany && location.pathname !== '/select-company') return <Navigate to="/select-company" replace />;

  return <Outlet />;
}

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { me } = useAuth();
  if (!me || !roles.includes(me.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
