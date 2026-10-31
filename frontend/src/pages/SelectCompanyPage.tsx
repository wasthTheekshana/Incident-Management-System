import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/** FR-9 / UC-1: shown only when the user is mapped to more than one company. */
export function SelectCompanyPage() {
  const { companies, selectCompany, activeCompany } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>Select company</h1>
        <p className="muted">Choose the company you are working for.</p>
        {companies.map((company) => (
          <button
            key={company.id}
            className={company.id === activeCompany?.id ? '' : 'secondary'}
            style={{ width: '100%', marginBottom: 8 }}
            onClick={() => {
              selectCompany(company.id);
              navigate('/', { replace: true });
            }}
          >
            {company.name}
          </button>
        ))}
      </div>
    </div>
  );
}
