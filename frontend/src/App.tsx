import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth, RequireRole } from './components/guards';
import { ChangePasswordPage, ForgotPasswordPage, LoginPage, ResetPasswordPage } from './pages/AuthPages';
import { CompaniesAdminPage } from './pages/admin/CompaniesAdminPage';
import { NotificationSettingsPage } from './pages/admin/NotificationSettingsPage';
import { RootCausesAdminPage } from './pages/admin/RootCausesAdminPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { SlaAdminPage } from './pages/admin/SlaAdminPage';
import { TemplateEditorPage } from './pages/admin/TemplateEditorPage';
import { TemplatesAdminPage } from './pages/admin/TemplatesAdminPage';
import { UsersAdminPage } from './pages/admin/UsersAdminPage';
import { IncidentDetailPage } from './pages/IncidentDetailPage';
import { IncidentListPage } from './pages/IncidentListPage';
import { MyIncidentsPage } from './pages/MyIncidentsPage';
import { ReportIncidentPage } from './pages/ReportIncidentPage';
import { SelectCompanyPage } from './pages/SelectCompanyPage';

const ADMINS = ['SUPER_ADMIN', 'ADMIN'] as const;
const SUPER = ['SUPER_ADMIN'] as const;

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/select-company" element={<SelectCompanyPage />} />
        <Route element={<Layout />}>
          <Route index element={<MyIncidentsPage />} />
          <Route path="incidents" element={<IncidentListPage />} />
          <Route path="incidents/:id" element={<IncidentDetailPage />} />
          <Route path="report" element={<ReportIncidentPage />} />

          <Route path="admin/users" element={<RequireRole roles={[...ADMINS]}><UsersAdminPage /></RequireRole>} />
          <Route path="admin/templates" element={<RequireRole roles={[...ADMINS]}><TemplatesAdminPage /></RequireRole>} />
          <Route path="admin/templates/new" element={<RequireRole roles={[...ADMINS]}><TemplateEditorPage /></RequireRole>} />
          <Route path="admin/templates/:id" element={<RequireRole roles={[...ADMINS]}><TemplateEditorPage /></RequireRole>} />
          <Route path="admin/root-causes" element={<RequireRole roles={[...ADMINS]}><RootCausesAdminPage /></RequireRole>} />
          <Route path="admin/companies" element={<RequireRole roles={[...ADMINS]}><CompaniesAdminPage /></RequireRole>} />
          <Route path="admin/sla" element={<RequireRole roles={[...SUPER]}><SlaAdminPage /></RequireRole>} />
          <Route path="admin/notifications" element={<RequireRole roles={[...SUPER]}><NotificationSettingsPage /></RequireRole>} />
          <Route path="admin/settings" element={<RequireRole roles={[...SUPER]}><SettingsPage /></RequireRole>} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
