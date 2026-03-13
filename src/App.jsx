import { useEffect, useMemo, useState } from 'react';

const PAT_URL =
  'https://dev.osf.digital/secure/ViewProfile.jspa?selectedTab=com.atlassian.pats.pats-plugin:jira-user-personal-access-tokens';
const CODEX_GUIDE_URL =
  'https://id.atlassian.com/login/select-account?application=confluence&continue=https%3A%2F%2Fosfdigital.atlassian.net%2Fwiki%2Fspaces%2FIAAP%2Fpages%2F6043435230%2FAllAi%2BCodex%2BUser%2BGuide%3Fmkt_tok%3DNDg0LU1YTy0zOTkAAAGefh8Jrty25p-c38C-t4pwUdS261E6ns3cANvUTrp4QEph9O6kERleTJKLyMs4JWc-EJqlqkBAQTpmQNUOxM3I3NE-k0E_OrUim1IsiSjQSXBC&login_hint=not%3Aaurelien.lewin%40osf.digital&redirectCount=1';

const TOKEN_SESSION_KEY = 'jira_worklog_cse_token';
const LEAVES_ISSUE_KEY = 'ZLH-1';
const BENCH_PROJECT_KEY = 'WAROE';
const BENCH_DETAIL_PROJECT_KEYS = [BENCH_PROJECT_KEY];

const STEPS = [
  { id: 'pat', title: "🔑 Créer votre clé d'accès Jira" },
  { id: 'guide', title: '📘 Lire le guide Codex' },
  { id: 'setup', title: '⚙️ Lancer la configuration' },
  { id: 'report', title: '📊 Voir heures et congés 2025' },
];

const ACTION_LABELS = {
  setup: '⚙️ Configuration en cours...',
  check: '🔎 Vérification de la connexion en cours...',
  report: '📥 Chargement des heures et des congés en cours...',
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} %`;
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
    if (isBusy) return ACTION_LABELS[busyAction] || '⏳ Traitement en cours...';
    if (connectionOk) return '✅ Connexion prête';
    if (connection && !connection.ok) return '⚠️ Connexion à corriger';
    return '🌿 Suivez les étapes tranquillement';
  }, [busyAction, connection, connectionOk, isBusy]);

  const summary = useMemo(() => {
    const workedHours = Number(report?.totalHours || 0);
    const leavesHours = Number(leaves?.totalHours || 0);
    const leavesDays = Number(leaves?.totalDays || 0);
    const waroeProject = report?.projects?.find((project) => project.projectKey === BENCH_PROJECT_KEY);
    const waroeHours = Number(waroeProject?.hours || 0);
    const waroeRate = workedHours > 0 ? (waroeHours / workedHours) * 100 : 0;
    const utilizationRate = Math.max(0, 100 - waroeRate);
    return {
      workedHours,
      leavesHours,
      leavesDays,
      waroeHours,
      waroeRate,
      utilizationRate,
    };
  }, [report, leaves]);

  const benchDetails = useMemo(() => {
    return report?.detailedProjects?.find((project) => project.projectKey === BENCH_PROJECT_KEY) || null;
  }, [report]);

  const leavesDetails = useMemo(() => {
    const issues = leaves?.issues || [];
    const subtasks = [];

    for (const issue of issues) {
      if (issue.isSubtask || issue.parentKey) {
        subtasks.push(issue);
      }
    }

    const issueTypeTotals =
      Array.isArray(leaves?.issueTypeTotals) && leaves.issueTypeTotals.length
        ? leaves.issueTypeTotals
        : [];

    const subtaskSeconds = subtasks.reduce((sum, issue) => sum + Number(issue.seconds || 0), 0);
    const subtaskCount = Number(leaves?.subtaskCount ?? subtasks.length);
    const subtaskHours = Number(leaves?.subtaskHours ?? Number((subtaskSeconds / 3600).toFixed(2)));

    return {
      issueTypeTotals,
      subtasks,
      subtaskCount,
      subtaskHours,
    };
  }, [leaves]);

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

  function dismissAllToasts() {
    setToasts([]);
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Une erreur est survenue.');
    return data;
  }

  async function loadYearlyData(tokenOverride) {
    const activeToken = String(tokenOverride || token || '').trim();
    if (!activeToken) {
      addToast("⚠️ Merci d'abord de renseigner votre clé d'accès Jira.", 'error');
      return;
    }

    setBusyAction('report');
    try {
      const [hoursData, leavesData] = await Promise.all([
        postJson('/api/jira/report', {
          token: activeToken,
          detailedProjectKeys: BENCH_DETAIL_PROJECT_KEYS,
        }),
        postJson('/api/jira/leaves', {
          token: activeToken,
          issueKey: LEAVES_ISSUE_KEY,
        }),
      ]);

      setReport(hoursData);
      setLeaves(leavesData);
      addToast(
        `✅ Rapport chargé : ${formatNumber(hoursData.totalHours)} h de travail en 2025.`,
        'success'
      );
      addToast(
        `🌴 Congés chargés (${LEAVES_ISSUE_KEY}) : ${formatNumber(leavesData.totalHours)} h, soit ${formatNumber(leavesData.totalDays)} jours.`,
        'success'
      );
    } catch (err) {
      addToast(err.message || '❌ Impossible de charger les données 2025.', 'error');
    } finally {
      setBusyAction('');
    }
  }

  async function runSetup() {
    const activeToken = String(token || '').trim();
    if (!activeToken) {
      addToast("⚠️ Merci de coller votre clé d'accès Jira pour continuer.", 'error');
      return;
    }

    setBusyAction('setup');
    try {
      const data = await postJson('/api/mcp/setup', { token: activeToken });
      addProgressToasts(data.logs || []);
      setConnection(data.handshake || null);
      if (data.handshake?.ok) {
        addToast('✅ Configuration terminée avec succès.', 'success');
        setStep(3);
        await loadYearlyData(activeToken);
      } else {
        addToast('⚠️ La configuration est terminée, mais la connexion reste à corriger.', 'warn');
      }
    } catch (err) {
      addToast(err.message || '❌ Échec de la configuration.', 'error');
    } finally {
      setBusyAction('');
    }
  }

  async function runCheck(tokenOverride, options = {}) {
    const activeToken = String(tokenOverride || token || '').trim();
    if (!activeToken) {
      addToast("⚠️ Aucune clé d'accès trouvée pour vérifier la connexion.", 'error');
      return;
    }

    setBusyAction('check');
    try {
      const data = await postJson('/api/mcp/check', { token: activeToken });
      addProgressToasts(data.logs || []);
      setConnection(data.handshake || null);

      if (data.handshake?.ok) {
        setStep(3);
        addToast('✅ Connexion validée. Ouverture de la vue des heures.', 'success');
        if (!options.skipDataLoad) {
          await loadYearlyData(activeToken);
        }
      } else {
        setStep(2);
        addToast('⚠️ Connexion non validée. Revenez à l étape 3.', 'warn');
      }
    } catch (err) {
      setStep(2);
      addToast(err.message || '❌ Échec de la vérification.', 'error');
    } finally {
      setBusyAction('');
    }
  }

  useEffect(() => {
    const savedToken = sessionStorage.getItem(TOKEN_SESSION_KEY) || '';
    if (!savedToken) return;

    setToken(savedToken);
    addToast('ℹ️ Clé d accès retrouvée dans cette session.', 'info');
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
    addToast('ℹ️ Clé supprimée. Vous pouvez en saisir une nouvelle.', 'info');
  }

  function renderStepContent() {
    if (step === 0) {
      return (
        <section className="glass step-card reveal">
          <h2>🔑 Étape 1 : créer votre clé d accès Jira</h2>
          <p>
            Cliquez sur le bouton ci-dessous, créez une clé d accès personnelle,
            puis revenez ici pour la coller.
          </p>
          <a className="neon-btn" href={PAT_URL} target="_blank" rel="noreferrer">
            Ouvrir la page de création de la clé
          </a>
          <p className="hint">Astuce : donnez un nom clair, par exemple "Jira Worklog CSE".</p>
        </section>
      );
    }

    if (step === 1) {
      return (
        <section className="glass step-card reveal">
          <h2>📘 Étape 2 : lire le guide Codex</h2>
          <p>
            Ouvrez le guide interne et suivez les prérequis.
            Quand c est fait, passez à l étape suivante.
          </p>
          <a className="neon-btn secondary" href={CODEX_GUIDE_URL} target="_blank" rel="noreferrer">
            Ouvrir le guide
          </a>
        </section>
      );
    }

    if (step === 2) {
      return (
        <section className="glass step-card reveal">
          <h2>⚙️ Étape 3 : lancer la configuration</h2>
          <label htmlFor="pat-token">Collez votre clé d accès Jira</label>
          <textarea
            id="pat-token"
            rows="4"
            className="token-input"
            placeholder="Collez votre clé ici"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />

          <div className="actions">
            <button type="button" className="neon-btn" onClick={runSetup} disabled={isBusy}>
              {busyAction === 'setup' ? 'Configuration...' : 'Configurer automatiquement'}
            </button>
            <button type="button" className="neon-btn ghost" onClick={() => runCheck()} disabled={isBusy}>
              {busyAction === 'check' ? 'Vérification...' : 'Vérifier ma configuration'}
            </button>
            <button type="button" className="neon-btn ghost" onClick={clearTokenAndRestart} disabled={isBusy}>
              Changer de clé
            </button>
          </div>

          {connection ? (
            <p className={connection.ok ? 'ok-line' : 'error-line'}>
              Résultat de la connexion : {connection.ok ? '✅ Réussie' : '❌ Échec'}
              {connection.initSeconds ? ` (${connection.initSeconds}s)` : ''}
              {connection.message ? ` - ${connection.message}` : ''}
            </p>
          ) : null}
        </section>
      );
    }

    return (
      <section className="glass step-card reveal">
        <h2>📊 Étape 4 : vos heures et vos congés 2025</h2>
        <p>
          Cette action charge votre bilan 2025 :
          temps de travail par projet et suivi des congés ({LEAVES_ISSUE_KEY}).
        </p>
        <div className="actions">
          <button
            type="button"
            className="neon-btn"
            onClick={() => loadYearlyData()}
            disabled={isBusy || !connectionOk}
          >
            {busyAction === 'report' ? 'Chargement...' : 'Charger / rafraîchir mes données 2025'}
          </button>
          <button type="button" className="neon-btn ghost" onClick={() => setStep(2)} disabled={isBusy}>
            Revenir pour modifier ma clé
          </button>
        </div>
        {!connectionOk ? (
          <p className="hint">Validez d abord la connexion à l étape 3.</p>
        ) : null}
      </section>
    );
  }

  return (
    <div className="page-wrap">
      <div className="bg-grid" aria-hidden="true" />

      <header className="hero glass reveal">
        <p className="badge">Jira Worklog CSE</p>
        <h1>Un assistant simple et clair</h1>
        <p className="hero-sub">
          Suivez les étapes pour connecter Jira, puis retrouver vos heures et vos congés 2025.
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
        {toasts.length ? (
          <div className="toast-toolbar">
            <strong>Messages</strong>
            <button type="button" onClick={dismissAllToasts}>Tout fermer</button>
          </div>
        ) : null}
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            <p>{toast.message}</p>
            <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Fermer">
              ✕
            </button>
          </div>
        ))}
      </aside>

      <main className="wizard-wrap">
        <section className="glass stepper reveal">
          <p className="step-count">
            Étape {step + 1} / {STEPS.length}
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
              Étape précédente
            </button>
            <button type="button" className="neon-btn" onClick={nextStep} disabled={!canGoNext || isBusy}>
              Étape suivante
            </button>
          </div>
        </section>

        {step === 3 ? (
          <>
            <section className="glass feedback-card reveal">
              <h3>🧮 Résumé 2025</h3>
              <div className="summary-grid">
                <article className="summary-card">
                  <h4>⏱️ Heures travaillées</h4>
                  <p>{formatNumber(summary.workedHours)} h</p>
                  <small>Total des heures de travail en 2025.</small>
                </article>
                <article className="summary-card">
                  <h4>🌴 Heures de congés</h4>
                  <p>{formatNumber(summary.leavesHours)} h</p>
                  <small>Soit {formatNumber(summary.leavesDays)} jours.</small>
                </article>
                <article className="summary-card">
                  <h4>🧱 Taux WAROE</h4>
                  <p>{formatPercent(summary.waroeRate)}</p>
                  <small>
                    Calculé depuis {BENCH_PROJECT_KEY} ({formatNumber(summary.waroeHours)} h).
                  </small>
                </article>
                <article className="summary-card">
                  <h4>✅ Taux d'utilisation</h4>
                  <p>{formatPercent(summary.utilizationRate)}</p>
                  <small>Formule: 100 % - taux WAROE.</small>
                </article>
              </div>
            </section>

            <section className="glass feedback-card reveal">
              <h3>📌 Heures par projet (2025)</h3>
              {!report?.projects?.length ? (
                <p>Pas encore de résultat. Cliquez sur "Charger / rafraîchir mes données 2025".</p>
              ) : (
                <>
                  <div className="meta-row">
                    <span>Tickets analysés : {report.issueCount}</span>
                    <span>Temps saisis retenus : {report.worklogCount}</span>
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
                        <td>Activités 2025</td>
                        <td>{formatNumber(report.totalHours)}</td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )}
            </section>

            <section className="glass feedback-card reveal">
              <h3>🧱 Détail du bench ({BENCH_PROJECT_KEY})</h3>
              {!benchDetails ? (
                <p>
                  Aucun détail bench pour le moment. Lancez le chargement 2025 pour récupérer
                  les sous-tâches et la répartition par type d'issue.
                </p>
              ) : (
                <>
                  <div className="meta-row">
                    <span>Tickets bench : {benchDetails.issueCount}</span>
                    <span>Total bench : {formatNumber(benchDetails.issueHours)} h</span>
                    <span>
                      Sous-tâches : {benchDetails.subtaskCount} ({formatNumber(benchDetails.subtaskHours)} h)
                    </span>
                  </div>

                  <div className="detail-grid">
                    <article className="detail-block">
                      <h4>📚 Répartition par type d'issue (bench)</h4>
                      {!benchDetails.issueTypeTotals?.length ? (
                        <p>Pas de répartition disponible.</p>
                      ) : (
                        <table className="neon-table">
                          <thead>
                            <tr>
                              <th>Type d'issue</th>
                              <th>Heures</th>
                            </tr>
                          </thead>
                          <tbody>
                            {benchDetails.issueTypeTotals.map((entry) => (
                              <tr key={entry.issueType}>
                                <td>{entry.issueType}</td>
                                <td>{formatNumber(entry.hours)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </article>

                    <article className="detail-block">
                      <h4>🧩 Sous-tâches bench</h4>
                      {!benchDetails.subtasks?.length ? (
                        <p>Aucune sous-tâche bench avec heures en 2025.</p>
                      ) : (
                        <table className="neon-table">
                          <thead>
                            <tr>
                              <th>Ticket</th>
                              <th>Type</th>
                              <th>Parent</th>
                              <th>Heures</th>
                            </tr>
                          </thead>
                          <tbody>
                            {benchDetails.subtasks.map((issue) => (
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
                  </div>

                  <article className="detail-block">
                    <h4>🗂️ Tous les tickets bench (tous types)</h4>
                    {!benchDetails.issues?.length ? (
                      <p>Aucun ticket bench avec heures en 2025.</p>
                    ) : (
                      <table className="neon-table">
                        <thead>
                          <tr>
                            <th>Ticket</th>
                            <th>Type</th>
                            <th>Parent</th>
                            <th>Heures</th>
                          </tr>
                        </thead>
                        <tbody>
                          {benchDetails.issues.map((issue) => (
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
                </>
              )}
            </section>

            <section className="glass feedback-card reveal">
              <h3>🌴 Suivi des congés annuels ({LEAVES_ISSUE_KEY})</h3>
              {!leaves?.issues?.length ? (
                <p>Pas de congés chargés pour le moment.</p>
              ) : (
                <>
                  <div className="meta-row">
                    <span>Tickets congés : {leaves.issueCount}</span>
                    <span>Temps saisis retenus : {leaves.worklogCount}</span>
                    <span>Total : {formatNumber(leaves.totalHours)} h</span>
                    <span>
                      Jours ({leaves.workingDayHours}h) : {formatNumber(leaves.totalDays)}
                    </span>
                  </div>

                  <div className="detail-grid">
                    <article className="detail-block">
                      <h4>📚 Répartition par type d'issue (congés)</h4>
                      {!leavesDetails.issueTypeTotals?.length ? (
                        <p>Pas de répartition disponible.</p>
                      ) : (
                        <table className="neon-table">
                          <thead>
                            <tr>
                              <th>Type d'issue</th>
                              <th>Heures</th>
                            </tr>
                          </thead>
                          <tbody>
                            {leavesDetails.issueTypeTotals.map((entry) => (
                              <tr key={entry.issueType}>
                                <td>{entry.issueType}</td>
                                <td>{formatNumber(entry.hours)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </article>

                    <article className="detail-block">
                      <h4>🧩 Sous-tâches congés</h4>
                      {!leavesDetails.subtasks?.length ? (
                        <p>Aucune sous-tâche congés avec heures en 2025.</p>
                      ) : (
                        <>
                          <p className="hint">
                            {leavesDetails.subtaskCount} sous-tâches, soit {formatNumber(leavesDetails.subtaskHours)} h.
                          </p>
                          <table className="neon-table">
                            <thead>
                              <tr>
                                <th>Ticket</th>
                                <th>Type</th>
                                <th>Parent</th>
                                <th>Heures</th>
                                <th>Jours</th>
                              </tr>
                            </thead>
                            <tbody>
                              {leavesDetails.subtasks.map((issue) => (
                                <tr key={issue.issueKey}>
                                  <td>
                                    <a href={`https://dev.osf.digital/browse/${issue.issueKey}`} target="_blank" rel="noreferrer">
                                      {issue.issueKey}
                                    </a>
                                    <br />
                                    <span>{issue.summary}</span>
                                  </td>
                                  <td>{issue.issueType}</td>
                                  <td>{issue.parentKey || '-'}</td>
                                  <td>{formatNumber(issue.hours)}</td>
                                  <td>{formatNumber(issue.days)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      )}
                    </article>
                  </div>

                  <h4>🗂️ Tous les tickets congés (tous types)</h4>
                  <table className="neon-table">
                    <thead>
                      <tr>
                        <th>Ticket</th>
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
