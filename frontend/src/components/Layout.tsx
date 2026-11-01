import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { isAdminRole, useAuth } from '../auth/AuthContext';
import { BrandMark, Icon, IconName } from './Icon';
import { NotificationBell } from './NotificationBell';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

function Item({ to, icon, children, end }: { to: string; icon: IconName; children: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end}>
      <Icon name={icon} />
      {children}
    </NavLink>
  );
}

export function Layout() {
  const { me, activeCompany, companies, selectCompany, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  // The drawer closes whenever the user navigates.
  useEffect(() => setNavOpen(false), [location.pathname]);
  const mainRef = useRef<HTMLElement>(null);
  // Tables turn into stacked cards on phones (see styles.css). Each cell is labelled from its column header here,
  // once, so no page has to repeat the labels.
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const label = () => {
      main.querySelectorAll('table').forEach((table) => {
        table.classList.add('stack-table');
        const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '');
        table.querySelectorAll('tbody tr').forEach((row) =>
          [...row.children].forEach((cell, i) => {
            if (!cell.hasAttribute('data-label')) cell.setAttribute('data-label', heads[i] ?? '');
          }),
        );
      });
    };
    label();
    const observer = new MutationObserver(label);
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  const admin = isAdminRole(me);
  const superAdmin = me?.role === 'SUPER_ADMIN';

  return (
    <div className="shell">
      <nav className={`sidebar ${navOpen ? 'open' : ''}`} aria-label="Main">
        <div className="brand">
          <BrandMark />
          <div>
            <div className="brand-name">CIMS</div>
            <div className="brand-sub">Incident management</div>
          </div>
        </div>

        {admin && <Item to="/" icon="dashboard" end>Dashboard</Item>}
        <Item to={admin ? '/my' : '/'} icon="inbox" end>My incidents</Item>
        <Item to="/incidents" icon="list">All incidents</Item>
        <Item to="/report" icon="plus">Report incident</Item>

        {admin && (
          <>
            <div className="section">Administration</div>
            <Item to="/admin/companies" icon="building">Companies</Item>
            <Item to="/admin/users" icon="users">Users</Item>
            <Item to="/admin/templates" icon="template">Templates</Item>
            <Item to="/admin/root-causes" icon="tag">Root causes</Item>
            <Item to="/admin/audit" icon="history">Audit log</Item>
            {superAdmin && <Item to="/admin/sla" icon="clock">Priority &amp; SLA</Item>}
            {superAdmin && <Item to="/admin/notifications" icon="bell">Notifications</Item>}
            {superAdmin && <Item to="/admin/settings" icon="cog">Settings</Item>}
          </>
        )}

        <div className="spacer" />
        <Item to="/change-password" icon="key">Change password</Item>
        <button className="link" onClick={() => logout().then(() => navigate('/login'))}>
          <Icon name="logout" />
          Log out
        </button>
        {me && (
          <div className="me-chip">
            <span className="avatar">{initials(me.name)}</span>
            <div className="who">
              <strong>{me.name}</strong>
              <span>{me.role.replace('_', ' ').toLowerCase()}</span>
            </div>
          </div>
        )}
      </nav>

      {navOpen && <button className="scrim" aria-label="Close menu" onClick={() => setNavOpen(false)} />}

      <div className="workspace">
        <header className="appbar">
          <button className="menu-btn" aria-label="Open menu" aria-expanded={navOpen} onClick={() => setNavOpen(true)}>
            <Icon name="menu" />
          </button>
          <div className="appbar-brand">
            <BrandMark size={26} />
            CIMS
          </div>
          {superAdmin ? (
            <label className="scope">
              <span>Viewing</span>
              <select
                aria-label="Company view"
                value={activeCompany?.id ?? ''}
                onChange={(e) => selectCompany(e.target.value || null)}
              >
                <option value="">All companies</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          ) : (
            activeCompany && (
              <div className="scope">
                <strong style={{ color: 'var(--ink)' }}>{activeCompany.name}</strong>
                {companies.length > 1 && <NavLink to="/select-company">Switch</NavLink>}
              </div>
            )
          )}
          <NotificationBell />
        </header>
        <main className="main" ref={mainRef}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
