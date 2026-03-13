import { useEffect, useMemo, useState } from 'react';

const PAT_URL =
  'https://dev.osf.digital/secure/ViewProfile.jspa?selectedTab=com.atlassian.pats.pats-plugin:jira-user-personal-access-tokens';
const CODEX_GUIDE_URL =
  'https://id.atlassian.com/login/select-account?application=confluence&continue=https%3A%2F%2Fosfdigital.atlassian.net%2Fwiki%2Fspaces%2FIAAP%2Fpages%2F6043435230%2FAllAi%2BCodex%2BUser%2BGuide%3Fmkt_tok%3DNDg0LU1YTy0zOTkAAAGefh8Jrty25p-c38C-t4pwUdS261E6ns3cANvUTrp4QEph9O6kERleTJKLyMs4JWc-EJqlqkBAQTpmQNUOxM3I3NE-k0E_OrUim1IsiSjQSXBC&login_hint=not%3Aaurelien.lewin%40osf.digital&redirectCount=1';

const TOKEN_SESSION_KEY = 'jira_worklog_cse_token';
const DETAILED_PROJECT_KEYS = ['OSFO', 'ROEMO'];
const LEAVES_ISSUE_KEY = 'ZLH-1';

const STEPS = [
  { id: 'pat', title: "Creer votre cle d'acces Jira" },
  { id: 'guide', title: 'Lire le guide Codex' },
  { id: 'setup', title: 'Lancer la configuration automatique' },
  { id: 'report', title: 'Voir vos heures et conges 2025' },
];

const ACTION_LABELS = {
  setup: 'Configuration automatique en cours...',
  check: 'Verification de la connexion en cours...',
  report: 'Chargement des heures et des conges en cours...',
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function makeToast(message, tone = 'info') {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { id, message, tone };
}

export default function App() {
  const [step, setStep] = useState(0);
  const [token, setToken] = useState('');
  const [connection, setConnection] = useState(null);
  const [report, setReport] = useState(null);
  const [leaves, setLeaves] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [busyAction, setBusyAction] = useState('');

  const isBusy = Boolean(busyAction);
  const canGoNext = step < STEPS.length - 1;
  const canGoPrev = step > 0;
  const connectionOk = Boolean(connection?.ok);

  const headerStatus = useMemo(() => {
    if (isBusy) return ACTION_LABELS[busyAction] || 'Traitement en cours...';
    if (connectionOk) return 'Connexion validee';
    if (connection && !connection.ok) return 'Connexion a corriger';
    return 'Suivez les etapes une par une';
  }, [busyAction, connection, connectionOk, isBusy]);

  function addToast(message, tone = 'info') {
    setToasts((prev) => [...prev, makeToast(message, tone)]);
  }

  function addProgressToasts(lines) {
    for (const line of lines || []) {
      addToast(line, 'info');
    }
  }

  function dismissToast(id) {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

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

  async function loadYearlyData(tokenOverride) {
    const activeToken = String(tokenOverride || token || '').trim();
    if (!activeToken) {
      addToast("Veuillez d'abord renseigner votre cle d'acces Jira.", 'error');
      return;
    }

    setBusyAction('report');
    try {
      const [hoursData, leavesData] = await Promise.all([
        postJson('/api/jira/report', {
          token: activeToken,
          detailedProjectKeys: DETAILED_PROJECT_KEYS,
        }),
        postJson('/api/jira/leaves', {
          token: activeToken,
          issueKey: LEAVES_ISSUE_KEY,
        }),
      ]);

      setReport(hoursData);
      setLeaves(leavesData);
      addToast(
        `Rapport charge: ${formatNumber(hoursData.totalHours)} h travaillees en 2025.`,
        'success'
      );
      addToast(
        `Conges charges depuis ${LEAVES_ISSUE_KEY}: ${formatNumber(leavesData.totalHours)} h (${formatNumber(leavesData.totalDays)} jours).`,
        'success'
      );
    } catch (err) {
      addToast(err.message || 'Erreur lors du chargement des donnees 2025.', 'error');
    } finally {
      setBusyAction('');
    }
  }

  async function runSetup() {
    const activeToken = String(token || '').trim();
    if (!activeToken) {
      addToast("Veuillez coller votre cle d'acces Jira pour continuer.", 'error');
      return;
    }

    setBusyAction('setup');
    try {
      const data = await postJson('/api/mcp/setup', { token: activeToken });
      addProgressToasts(data.logs || []);
      setConnection(data.handshake || null);
      if (data.handshake?.ok) {
        addToast('Configuration terminee avec succes.', 'success');
        setStep(3);
        await loadYearlyData(activeToken);
      } else {
        addToast('La configuration est terminee mais la connexion reste a corriger.', 'warn');
      }
    } catch (err) {
      addToast(err.message || 'Echec de la configuration.', 'error');
    } finally {
      setBusyAction('');
    }
  }

  async function runCheck(tokenOverride, options = {}) {
    const activeToken = String(tokenOverride || token || '').trim();
    if (!activeToken) {
      addToast("Aucune cle d'acces disponible pour verifier la connexion.", 'error');
      return;
    }

    setBusyAction('check');
    try {
      const data = await postJson('/api/mcp/check', { token: activeToken });
      addProgressToasts(data.logs || []);
      setConnection(data.handshake || null);

      if (data.handshake?.ok) {
        setStep(3);
        addToast('Connexion validee. Ouverture directe de la vue des heures.', 'success');
        if (!options.skipDataLoad) {
          await loadYearlyData(activeToken);
        }
      } else {
        setStep(2);
        addToast('Connexion non validee. Revenez a l etape 3 pour corriger.', 'warn');
      }
    } catch (err) {
      setStep(2);
      addToast(err.message || 'Echec de la verification.', 'error');
    } finally {
      setBusyAction('');
    }
  }

  useEffect(() => {
    const savedToken = sessionStorage.getItem(TOKEN_SESSION_KEY) || '';
    if (!savedToken) return;

    setToken(savedToken);
    addToast('Cle d acces retrouvee dans cette session.', 'info');
    runCheck(savedToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const value = String(token || '').trim();
    if (!value) {
      sessionStorage.removeItem(TOKEN_SESSION_KEY);
      return;
    }
    sessionStorage.setItem(TOKEN_SESSION_KEY, value);
  }, [token]);

  function nextStep() {
    if (!canGoNext) return;
    setStep((prev) => prev + 1);
  }

  function prevStep() {
    if (!canGoPrev) return;
    setStep((prev) => prev - 1);
  }

  function clearTokenAndRestart() {
    setToken('');
    setConnection(null);
    setReport(null);
    setLeaves(null);
    sessionStorage.removeItem(TOKEN_SESSION_KEY);
    setStep(0);
    addToast('Cle supprimee de la session. Vous pouvez en renseigner une nouvelle.', 'info');
  }

  function renderStepContent() {
    if (step === 0) {
      return (
        <section className="glass step-card reveal">
          <h2>Etape 1: creer votre cle d'acces Jira</h2>
          <p>
            Cliquez sur le bouton ci-dessous, creez un token d'acces personnel puis revenez ici.
            Vous le collerez a l'etape suivante.
          </p>
          <a className="neon-btn" href={PAT_URL} target="_blank" rel="noreferrer">
            Ouvrir la page de creation du token
          </a>
          <p className="hint">Astuce: donnez un nom clair au token, par exemple "Jira Worklog CSE".</p>
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
          <label htmlFor="pat-token">Collez votre cle d'acces Jira</label>
          <textarea
            id="pat-token"
            rows="4"
            className="token-input"
            placeholder="Coller votre cle ici"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />

          <div className="actions">
            <button type="button" className="neon-btn" onClick={runSetup} disabled={isBusy}>
              {busyAction === 'setup' ? 'Configuration...' : 'Lancer la configuration automatique'}
            </button>
            <button type="button" className="neon-btn ghost" onClick={() => runCheck()} disabled={isBusy}>
              {busyAction === 'check' ? 'Verification...' : 'Verifier ma configuration actuelle'}
            </button>
            <button type="button" className="neon-btn ghost" onClick={clearTokenAndRestart} disabled={isBusy}>
              Changer de cle
            </button>
          </div>

          {connection ? (
            <p className={connection.ok ? 'ok-line' : 'error-line'}>
              Resultat de la connexion: {connection.ok ? 'Reussie' : 'Echec'}
              {connection.initSeconds ? ` (${connection.initSeconds}s)` : ''}
              {connection.message ? ` - ${connection.message}` : ''}
            </p>
          ) : null}
        </section>
      );
    }

    return (
      <section className="glass step-card reveal">
        <h2>Etape 4: vos heures et vos conges 2025</h2>
        <p>
          Cette action charge votre bilan horaire 2025 par projet, les details OSFO/ROEMO,
          et le suivi de conges depuis {LEAVES_ISSUE_KEY}.
        </p>
        <div className="actions">
          <button
            type="button"
            className="neon-btn"
            onClick={() => loadYearlyData()}
            disabled={isBusy || !connectionOk}
          >
            {busyAction === 'report' ? 'Chargement...' : 'Charger / rafraichir mes donnees 2025'}
          </button>
          <button type="button" className="neon-btn ghost" onClick={() => setStep(2)} disabled={isBusy}>
            Revenir pour modifier ma cle
          </button>
        </div>
        {!connectionOk ? (
          <p className="hint">Validez d'abord la connexion a l'etape 3.</p>
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
          Un parcours clair, etape par etape, pour connecter Jira puis afficher vos heures et conges de 2025.
        </p>
        <p className="status">{headerStatus}</p>
      </header>

      {isBusy ? (
        <div className="glass loading-strip" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>{ACTION_LABELS[busyAction]}</span>
        </div>
      ) : null}

      <aside className="toast-stack" aria-live="polite" aria-label="Messages de progression">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            <p>{toast.message}</p>
            <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Fermer">
              Fermer
            </button>
          </div>
        ))}
      </aside>

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

        {step === 3 ? (
          <>
            <section className="glass feedback-card reveal">
              <h3>Heures par projet (2025)</h3>
              {!report?.projects?.length ? (
                <p>Pas encore de resultat. Cliquez sur "Charger / rafraichir mes donnees 2025".</p>
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
                          <td>{formatNumber(project.hours)}</td>
                        </tr>
                      ))}
                      <tr className="total-row">
                        <td>TOTAL</td>
                        <td>Toutes activites 2025</td>
                        <td>{formatNumber(report.totalHours)}</td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )}
            </section>

            <section className="glass feedback-card reveal">
              <h3>Detail complet des issues pour OSFO et ROEMO</h3>
              {!report?.detailedProjects?.length ? (
                <p>Pas de detail disponible pour le moment.</p>
              ) : (
                <div className="detail-grid">
                  {report.detailedProjects.map((detail) => (
                    <article className="detail-block" key={detail.projectKey}>
                      <h4>
                        {detail.projectKey} - {detail.projectName}
                      </h4>
                      <p className="hint">
                        Issues: {detail.issueCount} | Total issues: {formatNumber(detail.issueHours)} h
                        {' '}| Sous-taches: {detail.subtaskCount} ({formatNumber(detail.subtaskHours)} h)
                      </p>
                      {!!detail.issueTypeTotals?.length ? (
                        <p className="hint">
                          Repartition par type:{' '}
                          {detail.issueTypeTotals
                            .map((entry) => `${entry.issueType}: ${formatNumber(entry.hours)} h`)
                            .join(' | ')}
                        </p>
                      ) : null}
                      {!detail.issues?.length ? (
                        <p>Aucune issue avec heures sur 2025.</p>
                      ) : (
                        <table className="neon-table">
                          <thead>
                            <tr>
                              <th>Issue</th>
                              <th>Type</th>
                              <th>Parent</th>
                              <th>Heures</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.issues.map((issue) => (
                              <tr key={issue.issueKey}>
                                <td>
                                  <strong>{issue.issueKey}</strong>
                                  <br />
                                  <span>{issue.summary}</span>
                                </td>
                                <td>{issue.issueType}</td>
                                <td>
                                  {issue.parentKey ? `${issue.parentKey} - ${issue.parentSummary}` : '-'}
                                </td>
                                <td>{formatNumber(issue.hours)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="glass feedback-card reveal">
              <h3>Suivi des conges annuels ({LEAVES_ISSUE_KEY})</h3>
              {!leaves?.issues?.length ? (
                <p>Pas de conges charges pour le moment.</p>
              ) : (
                <>
                  <div className="meta-row">
                    <span>Issues conges: {leaves.issueCount}</span>
                    <span>Worklogs retenus: {leaves.worklogCount}</span>
                    <span>Total: {formatNumber(leaves.totalHours)} h</span>
                    <span>
                      Jours ({leaves.workingDayHours}h): {formatNumber(leaves.totalDays)}
                    </span>
                  </div>
                  <table className="neon-table">
                    <thead>
                      <tr>
                        <th>Issue</th>
                        <th>Type</th>
                        <th>Statut</th>
                        <th>Parent</th>
                        <th>Heures</th>
                        <th>Jours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaves.issues.map((issue) => (
                        <tr key={issue.issueKey}>
                          <td>
                            <a href={`https://dev.osf.digital/browse/${issue.issueKey}`} target="_blank" rel="noreferrer">
                              {issue.issueKey}
                            </a>
                            <br />
                            <span>{issue.summary}</span>
                          </td>
                          <td>{issue.issueType}</td>
                          <td>{issue.status}</td>
                          <td>{issue.parentKey || '-'}</td>
                          <td>{formatNumber(issue.hours)}</td>
                          <td>{formatNumber(issue.days)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
