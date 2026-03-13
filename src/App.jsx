import { useMemo, useState } from 'react';

const PAT_URL =
  'https://dev.osf.digital/secure/ViewProfile.jspa?selectedTab=com.atlassian.pats.pats-plugin:jira-user-personal-access-tokens';
const CODEX_GUIDE_URL =
  'https://id.atlassian.com/login/select-account?application=confluence&continue=https%3A%2F%2Fosfdigital.atlassian.net%2Fwiki%2Fspaces%2FIAAP%2Fpages%2F6043435230%2FAllAi%2BCodex%2BUser%2BGuide%3Fmkt_tok%3DNDg0LU1YTy0zOTkAAAGefh8Jrty25p-c38C-t4pwUdS261E6ns3cANvUTrp4QEph9O6kERleTJKLyMs4JWc-EJqlqkBAQTpmQNUOxM3I3NE-k0E_OrUim1IsiSjQSXBC&login_hint=not%3Aaurelien.lewin%40osf.digital&redirectCount=1';

const STEPS = [
  { id: 'pat', title: 'Creer votre PAT Jira' },
  { id: 'guide', title: 'Lire le guide Codex' },
  { id: 'setup', title: 'Configurer la connexion' },
  { id: 'report', title: 'Voir vos heures 2025' },
];

const ACTION_LABELS = {
  setup: 'Configuration Codex + MCP en cours...',
  check: 'Verification de la connexion en cours...',
  report: 'Recuperation des heures 2025 en cours...',
};

function hours(value) {
  return Number(value || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function App() {
  const [step, setStep] = useState(0);
  const [token, setToken] = useState('');
  const [logs, setLogs] = useState([]);
  const [connection, setConnection] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState('');

  const isBusy = Boolean(busyAction);
  const canGoNext = step < STEPS.length - 1;
  const canGoPrev = step > 0;
  const connectionOk = Boolean(connection?.ok);

  const headerStatus = useMemo(() => {
    if (isBusy) return ACTION_LABELS[busyAction] || 'Traitement en cours...';
    if (connectionOk) return 'Connexion MCP validee';
    if (connection && !connection.ok) return 'Connexion MCP a corriger';
    return 'Suivez les etapes une par une';
  }, [busyAction, connection, connectionOk, isBusy]);

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erreur API');
    return data;
  }

  async function runSetup() {
    if (!token.trim()) {
      setError('Veuillez coller votre PAT Jira pour continuer.');
      return;
    }

    setError('');
    setReport(null);
    setBusyAction('setup');

    try {
      const data = await postJson('/api/mcp/setup', { token: token.trim() });
      setLogs(data.logs || []);
      setConnection(data.handshake || null);
      if (data.handshake?.ok) {
        setStep(3);
      }
    } catch (err) {
      setError(err.message || 'Echec de la configuration.');
    } finally {
      setBusyAction('');
    }
  }

  async function runCheck() {
    setError('');
    setReport(null);
    setBusyAction('check');

    try {
      const data = await postJson('/api/mcp/check', {
        token: token.trim() || undefined,
      });
      setLogs(data.logs || []);
      setConnection(data.handshake || null);
      if (data.handshake?.ok) {
        setStep(3);
      }
    } catch (err) {
      setError(err.message || 'Echec de la verification.');
    } finally {
      setBusyAction('');
    }
  }

  async function runReport() {
    setError('');
    setBusyAction('report');

    try {
      const data = await postJson('/api/jira/report', {
        token: token.trim() || undefined,
      });
      setReport(data);
    } catch (err) {
      setError(err.message || 'Echec de la recuperation des heures.');
    } finally {
      setBusyAction('');
    }
  }

  function nextStep() {
    if (!canGoNext) return;
    setStep((prev) => prev + 1);
  }

  function prevStep() {
    if (!canGoPrev) return;
    setStep((prev) => prev - 1);
  }

  function renderStepContent() {
    if (step === 0) {
      return (
        <section className="glass step-card reveal">
          <h2>Etape 1: creer votre token PAT Jira</h2>
          <p>
            Cliquez sur le bouton ci-dessous, creez un token puis revenez ici.
            Vous le collerez a l'etape suivante.
          </p>
          <a className="neon-btn" href={PAT_URL} target="_blank" rel="noreferrer">
            Ouvrir la page PAT Jira
          </a>
          <p className="hint">Astuce: donnez un nom clair au token, ex: "Jira Worklog CSE".</p>
        </section>
      );
    }

    if (step === 1) {
      return (
        <section className="glass step-card reveal">
          <h2>Etape 2: lire le guide Codex</h2>
          <p>
            Ouvrez le guide interne puis suivez les prerequis. Quand c'est fait,
            passez a l'etape suivante.
          </p>
          <a className="neon-btn secondary" href={CODEX_GUIDE_URL} target="_blank" rel="noreferrer">
            Ouvrir le guide Codex
          </a>
        </section>
      );
    }

    if (step === 2) {
      return (
        <section className="glass step-card reveal">
          <h2>Etape 3: configurer et verifier la connexion</h2>
          <label htmlFor="pat-token">Collez votre PAT Jira</label>
          <textarea
            id="pat-token"
            rows="4"
            className="token-input"
            placeholder="Coller votre token ici"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />

          <div className="actions">
            <button type="button" className="neon-btn" onClick={runSetup} disabled={isBusy}>
              {busyAction === 'setup' ? 'Configuration...' : 'Configurer Codex + MCP'}
            </button>
            <button type="button" className="neon-btn ghost" onClick={runCheck} disabled={isBusy}>
              {busyAction === 'check'
                ? 'Verification...'
                : 'Je suis deja configure, verifier'}
            </button>
          </div>

          {connection ? (
            <p className={connection.ok ? 'ok-line' : 'error-line'}>
              Resultat connexion: {connection.ok ? 'OK' : 'KO'}
              {connection.initSeconds ? ` (${connection.initSeconds}s)` : ''}
              {connection.message ? ` - ${connection.message}` : ''}
            </p>
          ) : null}

          <p className="hint">
            Le setup utilise <code>codex exec</code>, puis applique automatiquement une correction locale
            si necessaire.
          </p>
        </section>
      );
    }

    return (
      <section className="glass step-card reveal">
        <h2>Etape 4: afficher vos heures 2025</h2>
        <p>
          Cette action calcule vos heures de travail 2025 par projet Jira,
          puis affiche le total global.
        </p>
        <button
          type="button"
          className="neon-btn"
          onClick={runReport}
          disabled={isBusy || !connectionOk}
        >
          {busyAction === 'report' ? 'Chargement des heures...' : 'Charger mes heures 2025'}
        </button>
        {!connectionOk ? (
          <p className="hint">La connexion MCP doit etre validee a l'etape 3.</p>
        ) : null}
      </section>
    );
  }

  return (
    <div className="page-wrap">
      <div className="bg-grid" aria-hidden="true" />

      <header className="hero glass reveal">
        <p className="badge">Jira Worklog CSE</p>
        <h1>Assistant de configuration simple</h1>
        <p className="hero-sub">
          Un parcours clair, etape par etape, pour connecter Jira puis afficher vos heures 2025.
        </p>
        <p className="status">{headerStatus}</p>
      </header>

      {isBusy ? (
        <div className="glass loading-strip" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>{ACTION_LABELS[busyAction]}</span>
        </div>
      ) : null}

      <main className="wizard-wrap">
        <section className="glass stepper reveal">
          <p className="step-count">
            Etape {step + 1} / {STEPS.length}
          </p>
          <ol>
            {STEPS.map((item, index) => (
              <li key={item.id} className={index === step ? 'active' : index < step ? 'done' : ''}>
                <button type="button" disabled={isBusy} onClick={() => setStep(index)}>
                  <span>{index + 1}</span>
                  <strong>{item.title}</strong>
                </button>
              </li>
            ))}
          </ol>
        </section>

        {renderStepContent()}

        <section className="glass nav-card reveal">
          <div className="actions">
            <button type="button" className="neon-btn ghost" onClick={prevStep} disabled={!canGoPrev || isBusy}>
              Etape precedente
            </button>
            <button type="button" className="neon-btn" onClick={nextStep} disabled={!canGoNext || isBusy}>
              Etape suivante
            </button>
          </div>
        </section>

        <section className="glass feedback-card reveal">
          <h3>Feedback en direct</h3>
          {error ? <p className="error-line">{error}</p> : null}
          <ul className="log-list">
            {(logs || []).map((line, index) => (
              <li key={`${line}-${index}`}>{line}</li>
            ))}
            {!logs.length ? <li>Les retours techniques apparaitront ici.</li> : null}
          </ul>
        </section>

        <section className="glass feedback-card reveal">
          <h3>Heures par projet (2025)</h3>
          {!report?.projects?.length ? (
            <p>Pas encore de resultat. Lancez l'etape 4.</p>
          ) : (
            <>
              <div className="meta-row">
                <span>Issues scannees: {report.issueCount}</span>
                <span>Worklogs retenus: {report.worklogCount}</span>
              </div>
              <table className="neon-table">
                <thead>
                  <tr>
                    <th>Projet</th>
                    <th>Nom</th>
                    <th>Heures</th>
                  </tr>
                </thead>
                <tbody>
                  {report.projects.map((project) => (
                    <tr key={project.projectKey}>
                      <td>{project.projectKey}</td>
                      <td>{project.projectName}</td>
                      <td>{hours(project.hours)}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td>TOTAL</td>
                    <td>Toutes activites 2025</td>
                    <td>{hours(report.totalHours)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
