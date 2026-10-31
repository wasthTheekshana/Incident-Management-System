import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { isAdminRole, useAuth } from '../auth/AuthContext';
import { NotificationBell } from './NotificationBell';

export function Layout() {
  const { me, activeCompany, companies, logout } = useAuth();
  const navigate = useNavigate();
  const admin = isAdminRole(me);

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">CIMS</div>
        <NavLink to="/">My Incidents</NavLink>
        <NavLink to="/incidents">All Incidents</NavLink>
        <NavLink to="/report">Report Incident</NavLink>
        {admin && (
          <>
            <div className="section">Administration</div>
            <NavLink to="/admin/companies">Companies</NavLink>
            <NavLink to="/admin/users">Users</NavLink>
            <NavLink to="/admin/templates">Templates</NavLink>
            <NavLink to="/admin/root-causes">Root Causes</NavLink>
            {me?.role === 'SUPER_ADMIN' && <NavLink to="/admin/sla">Priority &amp; SLA</NavLink>}
            {me?.role === 'SUPER_ADMIN' && <NavLink to="/admin/notifications">Notifications</NavLink>}
            {me?.role === 'SUPER_ADMIN' && <NavLink to="/admin/settings">Settings</NavLink>}
          </>
        )}
        <div className="spacer" />
        <NavLink to="/change-password">Change password</NavLink>
        <button className="link" onClick={() => logout().then(() => navigate('/login'))}>Log out</button>
      </nav>
      <main className="main">
        <div className="topbar">
          <div>
            <strong>{me?.name}</strong> <span className="muted">· {me?.role.replace('_', ' ').toLowerCase()}</span>
            {activeCompany && (
              <>
                {' · '}
                <span>{activeCompany.name}</span>
                {companies.length > 1 && <> (<NavLink to="/select-company">switch</NavLink>)</>}
              </>
            )}
          </div>
          <NotificationBell />
        </div>
        <Outlet />
      </main>
    </div>
  );
}
