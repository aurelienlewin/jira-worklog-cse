import { useMemo, useState } from 'react';

const PAT_URL =
  'https://dev.osf.digital/secure/ViewProfile.jspa?selectedTab=com.atlassian.pats.pats-plugin:jira-user-personal-access-tokens';
const CODEX_GUIDE_URL =
  'https://id.atlassian.com/login/select-account?application=confluence&continue=https%3A%2F%2Fosfdigital.atlassian.net%2Fwiki%2Fspaces%2FIAAP%2Fpages%2F6043435230%2FAllAi%2BCodex%2BUser%2BGuide%3Fmkt_tok%3DNDg0LU1YTy0zOTkAAAGefh8Jrty25p-c38C-t4pwUdS261E6ns3cANvUTrp4QEph9O6kERleTJKLyMs4JWc-EJqlqkBAQTpmQNUOxM3I3NE-k0E_OrUim1IsiSjQSXBC&login_hint=not%3Aaurelien.lewin%40osf.digital&redirectCount=1';

function hours(v) {
  return Number(v || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function App() {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState([]);
  const [connection, setConnection] = useState(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  const canReport = Boolean(connection?.ok);

  const statusLabel = useMemo(() => {
    if (busy) return 'Setup en cours...';
    if (connection?.ok) return 'MCP connecte';
    if (connection && !connection.ok) return 'MCP non connecte';
    return 'Pret';
  }, [busy, connection]);

  async function postJson(url, payload) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur API');
    return data;
  }

  async function runSetup() {
    if (!token.trim()) {
      setError('Colle ton PAT avant de lancer la configuration.');
      return;
    }
    setError('');
    setBusy(true);
    setReport(null);
    try {
      const data = await postJson('/api/mcp/setup', { token: token.trim() });
      setLogs(data.logs || []);
      setConnection(data.handshake || null);
    } catch (e) {
      setError(e.message || 'Echec setup');
    } finally {
      setBusy(false);
    }
  }

  async function runCheckSkip() {
    setError('');
    setBusy(true);
    setReport(null);
    try {
      const data = await postJson('/api/mcp/check', {
        token: token.trim() || undefined,
      });
      setLogs(data.logs || []);
      setConnection(data.handshake || null);
    } catch (e) {
      setError(e.message || 'Echec check');
    } finally {
      setBusy(false);
    }
  }

  async function runReport() {
    setError('');
    setReportBusy(true);
    try {
      const data = await postJson('/api/jira/report', {
        token: token.trim() || undefined,
      });
      setReport(data);
    } catch (e) {
      setError(e.message || 'Echec extraction des heures');
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <div className="page-wrap">
      <div className="bg-grid" aria-hidden="true" />
      <header className="hero glass">
        <p className="badge">Codex MCP + Jira 2025</p>
        <h1>Setup neon ultra rapide</h1>
        <p className="hero-sub">
          Guide francais, setup MCP automatique, verification handshake, puis total des heures
          travaillees par projet en 2025.
        </p>
        <p className="status">Statut: {statusLabel}</p>
      </header>

      <main className="layout">
        <section className="glass panel pulse-in">
          <h2>1) Cree ton PAT Jira</h2>
          <p>
            Ouvre la page, cree un token, copie-le. Garde cette fenetre ouverte pour coller le token.
          </p>
          <a className="neon-btn" href={PAT_URL} target="_blank" rel="noreferrer">
            Ouvrir la page PAT
          </a>
        </section>

        <section className="glass panel pulse-in delay-1">
          <h2>2) Suis le guide Codex</h2>
          <p>Ouvre le guide interne et fais les prerequis rapidement.</p>
          <a className="neon-btn secondary" href={CODEX_GUIDE_URL} target="_blank" rel="noreferrer">
            Ouvrir le guide Codex
          </a>
        </section>

        <section className="glass panel pulse-in delay-2">
          <h2>3) Colle ton PAT + configure</h2>
          <label htmlFor="pat-token">PAT Jira</label>
          <textarea
            id="pat-token"
            rows="3"
            className="token-input"
            placeholder="Colle ton token ici"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <div className="actions">
            <button type="button" className="neon-btn" onClick={runSetup} disabled={busy}>
              {busy ? 'Configuration...' : 'Configurer Codex + MCP'}
            </button>
            <button type="button" className="neon-btn ghost" onClick={runCheckSkip} disabled={busy}>
              Skip: deja configure, verifier handshake
            </button>
          </div>
          <p className="hint">
            Le setup tente d abord via <code>codex exec</code>, puis bascule sur un patch local
            automatique si necessaire.
          </p>
        </section>

        <section className="glass panel pulse-in delay-3">
          <h2>4) Rapport heures 2025</h2>
          <p>
            Lance l extraction de toutes tes heures 2025, groupees par projet Jira avec total final.
          </p>
          <button
            type="button"
            className="neon-btn"
            onClick={runReport}
            disabled={!canReport || reportBusy}
          >
            {reportBusy ? 'Extraction...' : 'Charger mes heures 2025'}
          </button>
        </section>

        <section className="glass panel full-width">
          <h2>Feedback live</h2>
          {error ? <p className="error-line">{error}</p> : null}
          <ul className="log-list">
            {(logs || []).map((line, i) => (
              <li key={`${line}-${i}`}>{line}</li>
            ))}
            {!logs?.length ? <li>Aucun log pour le moment.</li> : null}
          </ul>
          {connection ? (
            <p className={connection.ok ? 'ok-line' : 'error-line'}>
              Handshake: {connection.ok ? 'OK' : 'KO'}
              {connection.initSeconds ? ` (${connection.initSeconds}s)` : ''}
              {connection.message ? ` - ${connection.message}` : ''}
            </p>
          ) : null}
        </section>

        <section className="glass panel full-width">
          <h2>Heures par projet (2025)</h2>
          {!report?.projects?.length ? (
            <p>Pas encore de donnees.</p>
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
                  {report.projects.map((p) => (
                    <tr key={p.projectKey}>
                      <td>{p.projectKey}</td>
                      <td>{p.projectName}</td>
                      <td>{hours(p.hours)}</td>
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
