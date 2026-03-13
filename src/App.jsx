import { useEffect, useMemo, useRef, useState } from 'react';

const TOKEN_HELP_URL = String(import.meta.env.VITE_TOKEN_HELP_URL || 'https://example.com/token').trim();
const SETUP_GUIDE_URL = String(import.meta.env.VITE_SETUP_GUIDE_URL || 'https://example.com/guide').trim();
const ISSUE_BROWSE_BASE_URL = String(import.meta.env.VITE_ISSUE_BROWSE_BASE_URL || '')
  .trim()
  .replace(/\/+$/, '');

const TOKEN_SESSION_KEY = 'worklog_cse_token';
const USER_EMAIL_SESSION_KEY = 'worklog_cse_user_email';
const LEAVE_ANCHOR_ISSUE_KEY = 'ABS-1';
const LEAVE_SCOPE_LABEL = 'ABS-*';
const BENCH_SCOPE_KEY = 'BENCH';
const BENCH_DETAIL_PROJECT_KEYS = [BENCH_SCOPE_KEY];
const KOFI_URL = 'https://ko-fi.com/aurelienlewin';

const STEPS = [
  { id: 'pat', title: "🔑 Créer votre clé d'accès" },
  { id: 'guide', title: '📘 Lire le guide de configuration' },
  { id: 'setup', title: '⚙️ Lancer la configuration' },
  { id: 'report', title: '📊 Voir heures et congés 2025' },
];

const ACTION_LABELS = {
  setup: '⚙️ Configuration en cours...',
  check: '🔎 Vérification de la connexion en cours...',
  report: '📥 Chargement des heures et des congés en cours...',
};
const TABLE_PAGE_SIZE = 60;
const API_RETRY_ATTEMPTS = 3;
const API_RETRY_DELAY_MS = 900;
const TOAST_TTL_MS = 6000;
const TOAST_FADE_MS = 320;
const FOCUS_SCROLL_MS = 150;

function readStoredValue(key) {
  if (typeof window === 'undefined') return '';

  try {
    const localValue = window.localStorage.getItem(key);
    if (localValue) return localValue;
  } catch {
    // Ignore storage access errors.
  }

  try {
    return window.sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeStoredValue(key, rawValue) {
  if (typeof window === 'undefined') return;
  const value = String(rawValue || '').trim();

  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // Ignore storage access errors.
  }

  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage access errors.
  }
}

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
  return { id, message, tone, exiting: false };
}

function clampPercent(value) {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return 0;
  if (num < 0) return 0;
  if (num > 100) return 100;
  return num;
}

function nextChunkSize(visible, total) {
  const remaining = Math.max(0, total - visible);
  return Math.min(TABLE_PAGE_SIZE, remaining);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getIssueBrowseUrl(issueKey) {
  if (!ISSUE_BROWSE_BASE_URL || !issueKey) return '';
  return `${ISSUE_BROWSE_BASE_URL}/browse/${encodeURIComponent(String(issueKey))}`;
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function smoothFocusAndScroll(element, options = {}) {
  if (!element || typeof window === 'undefined') return;

  const durationMs = Math.max(80, Number(options.durationMs || FOCUS_SCROLL_MS));
  const offset = Number(options.offset || 12);
  const shouldFocus = options.focus !== false;
  const reduceMotion = prefersReducedMotion();
  const startY = window.scrollY || window.pageYOffset || 0;
  const targetY = Math.max(0, startY + element.getBoundingClientRect().top - offset);

  const focusTarget = () => {
    if (!shouldFocus) return;
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
  };

  if (reduceMotion || Math.abs(targetY - startY) < 2) {
    window.scrollTo(0, targetY);
    focusTarget();
    return;
  }

  const start = performance.now();
  const easeOut = (t) => 1 - (1 - t) ** 3;

  const tick = (now) => {
    const progress = Math.min(1, (now - start) / durationMs);
    const eased = easeOut(progress);
    window.scrollTo(0, startY + (targetY - startY) * eased);
    if (progress < 1) {
      window.requestAnimationFrame(tick);
      return;
    }
    focusTarget();
  };

  window.requestAnimationFrame(tick);
}

function ProgressCircle({ value, title, subtitle, tone = 'leaf' }) {
  const safeValue = clampPercent(value);
  return (
    <article className="progress-card">
      <div className={`progress-circle tone-${tone}`} style={{ '--pct': `${safeValue}%` }}>
        <span>{formatPercent(safeValue)}</span>
      </div>
      <h4>{title}</h4>
      <small>{subtitle}</small>
    </article>
  );
}

export default function App() {
  const [step, setStep] = useState(0);
  const [token, setToken] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const [connection, setConnection] = useState(null);
  const [report, setReport] = useState(null);
  const [leaves, setLeaves] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [busyAction, setBusyAction] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [reportProgress, setReportProgress] = useState({ active: false, value: 0, label: '' });
  const [benchSubtasksVisibleCount, setBenchSubtasksVisibleCount] = useState(TABLE_PAGE_SIZE);
  const [benchIssuesVisibleCount, setBenchIssuesVisibleCount] = useState(TABLE_PAGE_SIZE);
  const [leavesSubtasksVisibleCount, setLeavesSubtasksVisibleCount] = useState(TABLE_PAGE_SIZE);
  const [leavesIssuesVisibleCount, setLeavesIssuesVisibleCount] = useState(TABLE_PAGE_SIZE);
  const stepButtonRefs = useRef([]);
  const toastTimersRef = useRef(new Map());
  const stepContentRef = useRef(null);
  const connectionResultRef = useRef(null);
  const summarySectionRef = useRef(null);

  const isBusy = Boolean(busyAction);
  const canGoNext = step < STEPS.length - 1;
  const canGoPrev = step > 0;
  const connectionOk = Boolean(connection?.ok);
  const isSummaryReady = report !== null && leaves !== null;
  const isProjectsReady = report !== null;
  const isBenchReady = report !== null;
  const isLeavesReady = leaves !== null;

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
    const benchProject = report?.projects?.find((project) => project.projectKey === BENCH_SCOPE_KEY);
    const benchHours = Number(benchProject?.hours || 0);
    const benchRate = workedHours > 0 ? (benchHours / workedHours) * 100 : 0;
    const utilizationRate = Math.max(0, 100 - benchRate);
    return {
      workedHours,
      leavesHours,
      leavesDays,
      benchHours,
      benchRate,
      utilizationRate,
    };
  }, [report, leaves]);

  const benchDetails = useMemo(() => {
    return report?.detailedProjects?.find((project) => project.projectKey === BENCH_SCOPE_KEY) || null;
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

  const visibleBenchSubtasks = useMemo(
    () => (benchDetails?.subtasks || []).slice(0, benchSubtasksVisibleCount),
    [benchDetails, benchSubtasksVisibleCount]
  );
  const visibleBenchIssues = useMemo(
    () => (benchDetails?.issues || []).slice(0, benchIssuesVisibleCount),
    [benchDetails, benchIssuesVisibleCount]
  );
  const visibleLeavesSubtasks = useMemo(
    () => (leavesDetails?.subtasks || []).slice(0, leavesSubtasksVisibleCount),
    [leavesDetails, leavesSubtasksVisibleCount]
  );
  const visibleLeavesIssues = useMemo(
    () => (leaves?.issues || []).slice(0, leavesIssuesVisibleCount),
    [leaves, leavesIssuesVisibleCount]
  );

  const progressCircles = useMemo(() => {
    const trackedHours = summary.workedHours + summary.leavesHours;
    const workedShare = trackedHours > 0 ? (summary.workedHours / trackedHours) * 100 : 0;
    const leavesShare = trackedHours > 0 ? (summary.leavesHours / trackedHours) * 100 : 0;
    return [
      {
        title: 'Utilisation',
        subtitle: '100 % - taux bench',
        value: summary.utilizationRate,
        tone: 'leaf',
      },
      {
        title: 'Part bench',
        subtitle: `${formatNumber(summary.benchHours)} h sur vos heures 2025`,
        value: summary.benchRate,
        tone: 'sun',
      },
      {
        title: 'Part heures travaillées',
        subtitle: `${formatNumber(summary.workedHours)} h`,
        value: workedShare,
        tone: 'sky',
      },
      {
        title: 'Part congés/absences',
        subtitle: `${formatNumber(summary.leavesHours)} h (${formatNumber(summary.leavesDays)} jours)`,
        value: leavesShare,
        tone: 'rose',
      },
    ];
  }, [summary]);

  const analysisInfo = useMemo(() => {
    const fromReport = report?.user || null;
    const fromLeaves = leaves?.user || null;
    const resolvedEmail =
      fromLeaves?.resolvedEmail ||
      fromReport?.resolvedEmail ||
      String(targetEmail || '').trim() ||
      'Votre compte';
    const mode = fromLeaves?.mode || fromReport?.mode || 'current';
    const fallback = mode === 'fallback_current';
    const delegated = mode === 'delegated';

    let message = 'Analyse de vos données.';
    if (delegated) {
      message = "Analyse d’un autre compte (selon les droits de votre clé d'accès).";
    } else if (fallback) {
      message = "L'e-mail demandé n'a pas été trouvé: affichage de votre compte.";
    }

    return { resolvedEmail, mode, message, fallback, delegated };
  }, [report, leaves, targetEmail]);

  const benchNarrative = useMemo(() => {
    if (!benchDetails?.issues?.length) {
      return 'Aucune activité bench détectée pour 2025.';
    }
    const topType = benchDetails.issueTypeTotals?.[0];
    const topIssue = benchDetails.issues?.[0];
    const subtaskShare =
      Number(benchDetails.issueHours || 0) > 0
        ? (Number(benchDetails.subtaskHours || 0) / Number(benchDetails.issueHours || 0)) * 100
        : 0;
    const parts = [
      `Vous avez saisi ${formatNumber(benchDetails.issueHours)} h sur ${benchDetails.issueCount} tickets bench.`,
      topType
        ? `Le type principal est "${topType.issueType}" avec ${formatNumber(topType.hours)} h.`
        : null,
      `Les sous-tâches représentent ${formatPercent(subtaskShare)} du temps bench.`,
      topIssue
        ? `Le ticket le plus chargé est ${topIssue.issueKey} (${formatNumber(topIssue.hours)} h).`
        : null,
    ].filter(Boolean);
    return parts.join(' ');
  }, [benchDetails]);

  const benchCommentSummary = useMemo(() => {
    return benchDetails?.commentSummary || null;
  }, [benchDetails]);

  function clearToastTimer(id) {
    const timers = toastTimersRef.current.get(id);
    if (!timers) return;
    if (timers.dismissTimer) clearTimeout(timers.dismissTimer);
    if (timers.removeTimer) clearTimeout(timers.removeTimer);
    toastTimersRef.current.delete(id);
  }

  function clearAllToastTimers() {
    for (const id of toastTimersRef.current.keys()) {
      clearToastTimer(id);
    }
  }

  function scheduleToastDismiss(id, ttlMs = TOAST_TTL_MS) {
    clearToastTimer(id);
    const dismissTimer = setTimeout(() => {
      setToasts((prev) =>
        prev.map((toast) => (toast.id === id ? { ...toast, exiting: true } : toast))
      );
      const removeTimer = setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
        clearToastTimer(id);
      }, TOAST_FADE_MS);
      toastTimersRef.current.set(id, { dismissTimer, removeTimer });
    }, ttlMs);
    toastTimersRef.current.set(id, { dismissTimer });
  }

  function addToast(message, tone = 'info', options = {}) {
    const ttlMs = Math.max(1200, Number(options.ttlMs || TOAST_TTL_MS));
    const toast = makeToast(message, tone);
    setToasts((prev) => {
      const next = [...prev, toast];
      const overflow = next.length - 8;
      if (overflow > 0) {
        const removed = next.slice(0, overflow);
        for (const stale of removed) clearToastTimer(stale.id);
      }
      return next.slice(-8);
    });
    scheduleToastDismiss(toast.id, ttlMs);
  }

  function addProgressToasts(lines) {
    for (const line of lines || []) {
      addToast(line, 'info');
    }
  }

  function dismissToast(id) {
    const existing = toasts.find((toast) => toast.id === id);
    if (!existing) return;
    clearToastTimer(id);
    setToasts((prev) =>
      prev.map((toast) => (toast.id === id ? { ...toast, exiting: true } : toast))
    );
    const removeTimer = setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      clearToastTimer(id);
    }, TOAST_FADE_MS);
    toastTimersRef.current.set(id, { removeTimer });
  }

  function dismissAllToasts() {
    clearAllToastTimers();
    setToasts([]);
  }

  function isStepLocked(index) {
    return index === 3 && !connectionOk;
  }

  useEffect(() => {
    return () => {
      clearAllToastTimers();
    };
  }, []);

  async function postJson(url, payload) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new Error("Impossible de joindre le serveur local. Vérifiez que l'application tourne avec `npm run dev`.");
    }

    const rawText = await response.text();
    let data = {};
    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        if (response.ok) {
          throw new Error('Le serveur a répondu dans un format temporairement invalide. Nouvel essai recommandé.');
        }
        throw new Error(`Le serveur a renvoyé une réponse invalide (${response.status}).`);
      }
    }

    if (!response.ok) throw new Error(data.error || 'Une erreur est survenue.');
    return data;
  }

  async function postJsonWithRetry(url, payload, options = {}) {
    const attempts = Math.max(1, Number(options.attempts || API_RETRY_ATTEMPTS));
    const label = String(options.label || 'Requête');
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const data = await postJson(url, payload);
        if (attempt > 1) {
          addToast(`✅ ${label} réussie après ${attempt} tentatives.`, 'success');
        }
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erreur inconnue';
        lastError = new Error(message);
        if (attempt >= attempts) break;

        addToast(`⚠️ ${label}: tentative ${attempt}/${attempts} en échec. Nouvelle tentative...`, 'warn');
        await sleep(API_RETRY_DELAY_MS * attempt);
      }
    }

    throw lastError || new Error('Une erreur est survenue.');
  }

  async function loadYearlyData(tokenOverride) {
    const activeToken = String(tokenOverride || token || '').trim();
    const activeUserEmail = String(targetEmail || '').trim();
    if (!activeToken) {
      addToast("⚠️ Merci d'abord de renseigner votre clé d'accès.", 'error');
      return;
    }

    setBusyAction('report');
    setReportProgress({ active: true, value: 6, label: 'Connexion au service en cours...' });
    try {
      setReportProgress({ active: true, value: 22, label: 'Collecte des heures travaillées 2025...' });
      const hoursData = await postJsonWithRetry('/api/worklogs/report', {
        token: activeToken,
        detailedProjectKeys: BENCH_DETAIL_PROJECT_KEYS,
        userEmail: activeUserEmail || undefined,
      }, { label: 'Chargement des heures 2025', attempts: 3 });

      setReportProgress({ active: true, value: 64, label: `Collecte des congés et absences ${LEAVE_SCOPE_LABEL}...` });
      const leavesData = await postJsonWithRetry('/api/worklogs/leaves', {
        token: activeToken,
        issueKey: LEAVE_ANCHOR_ISSUE_KEY,
        userEmail: activeUserEmail || undefined,
      }, { label: 'Chargement des congés et absences 2025', attempts: 3 });

      setReportProgress({ active: true, value: 91, label: 'Calcul des indicateurs en cours...' });

      setReport(hoursData);
      setLeaves(leavesData);
      setReportProgress({ active: true, value: 100, label: 'Données prêtes.' });
      const userLabel = leavesData?.user?.resolvedEmail || hoursData?.user?.resolvedEmail || activeUserEmail || '';
      if (userLabel) {
        addToast(`👤 Analyse réalisée pour : ${userLabel}`, 'info');
      }
      if (activeUserEmail && (hoursData?.user?.mode === 'fallback_current' || leavesData?.user?.mode === 'fallback_current')) {
        addToast(
          "ℹ️ L'e-mail saisi n'a pas pu être résolu avec cette clé. Les données affichées correspondent à votre compte.",
          'warn'
        );
      }
      addToast(
        `✅ Rapport chargé : ${formatNumber(hoursData.totalHours)} h de travail en 2025.`,
        'success'
      );
      addToast(
        `🌴 Congés/absences chargés (${LEAVE_SCOPE_LABEL}) : ${formatNumber(leavesData.totalHours)} h, soit ${formatNumber(leavesData.totalDays)} jours.`,
        'success'
      );
      if (!Number(leavesData.totalHours || 0)) {
        addToast(
          `ℹ️ Aucun temps trouvé sur ${LEAVE_SCOPE_LABEL} pour 2025 avec cette clé.`,
          'warn'
        );
      }
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          smoothFocusAndScroll(summarySectionRef.current, { durationMs: FOCUS_SCROLL_MS, offset: 10 });
        });
      }
    } catch (err) {
      addToast(err.message || '❌ Impossible de charger les données 2025.', 'error');
    } finally {
      setReportProgress({ active: false, value: 0, label: '' });
      setBusyAction('');
    }
  }

  async function runSetup() {
    const activeToken = String(token || '').trim();
    if (!activeToken) {
      addToast("⚠️ Merci de coller votre clé d'accès pour continuer.", 'error');
      return;
    }

    setBusyAction('setup');
    try {
      const data = await postJsonWithRetry('/api/mcp/setup', { token: activeToken }, {
        label: 'Configuration MCP',
        attempts: 2,
      });
      addProgressToasts(data.logs || []);
      setConnection(data.handshake || null);
      if (data.handshake?.ok) {
        addToast('✅ Configuration terminée avec succès.', 'success');
        goToStep(3);
        await loadYearlyData(activeToken);
      } else {
        addToast('⚠️ La configuration est terminée, mais la connexion reste à corriger.', 'warn');
        if (typeof window !== 'undefined') {
          window.requestAnimationFrame(() => {
            smoothFocusAndScroll(connectionResultRef.current, { durationMs: FOCUS_SCROLL_MS, offset: 10 });
          });
        }
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
      const data = await postJsonWithRetry('/api/mcp/check', { token: activeToken }, {
        label: 'Vérification de connexion',
        attempts: 3,
      });
      addProgressToasts(data.logs || []);
      setConnection(data.handshake || null);

      if (data.handshake?.ok) {
        goToStep(3);
        addToast('✅ Connexion validée. Ouverture de la vue des heures.', 'success');
        if (!options.skipDataLoad) {
          await loadYearlyData(activeToken);
        }
      } else {
        goToStep(2);
        addToast("⚠️ Connexion non validée. Revenez à l'étape 3.", 'warn');
      }
    } catch (err) {
      goToStep(2);
      addToast(err.message || '❌ Échec de la vérification.', 'error');
    } finally {
      setBusyAction('');
    }
  }

  useEffect(() => {
    const savedToken = readStoredValue(TOKEN_SESSION_KEY);
    const savedUserEmail = readStoredValue(USER_EMAIL_SESSION_KEY);
    setTargetEmail(savedUserEmail);
    if (!savedToken) return;

    setToken(savedToken);
    addToast("ℹ️ Clé d'accès retrouvée dans cette session.", 'info');
    runCheck(savedToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    writeStoredValue(TOKEN_SESSION_KEY, token);
  }, [token]);

  useEffect(() => {
    writeStoredValue(USER_EMAIL_SESSION_KEY, targetEmail);
  }, [targetEmail]);

  useEffect(() => {
    setBenchSubtasksVisibleCount(TABLE_PAGE_SIZE);
    setBenchIssuesVisibleCount(TABLE_PAGE_SIZE);
  }, [benchDetails]);

  useEffect(() => {
    setLeavesSubtasksVisibleCount(TABLE_PAGE_SIZE);
    setLeavesIssuesVisibleCount(TABLE_PAGE_SIZE);
  }, [leavesDetails, leaves]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const frame = window.requestAnimationFrame(() => {
      smoothFocusAndScroll(stepContentRef.current, { durationMs: FOCUS_SCROLL_MS, offset: 10 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [step]);

  function goToStep(nextStepIndex) {
    if (step === nextStepIndex) return;
    if (isStepLocked(nextStepIndex)) {
      addToast("🔒 L'étape 4 sera disponible après la vérification de la connexion (étape 3).", 'info', {
        ttlMs: 4200,
      });
      return;
    }
    dismissAllToasts();
    setStep(nextStepIndex);
  }

  function nextStep() {
    if (!canGoNext) return;
    goToStep(step + 1);
  }

  function prevStep() {
    if (!canGoPrev) return;
    goToStep(step - 1);
  }

  function handleStepKeyDown(event, index) {
    let targetIndex = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      targetIndex = Math.min(STEPS.length - 1, index + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      targetIndex = Math.max(0, index - 1);
    } else if (event.key === 'Home') {
      targetIndex = 0;
    } else if (event.key === 'End') {
      targetIndex = STEPS.length - 1;
    }

    if (targetIndex === null) return;
    event.preventDefault();
    goToStep(targetIndex);
    stepButtonRefs.current[targetIndex]?.focus();
  }

  function clearTokenAndRestart() {
    setToken('');
    setTargetEmail('');
    setConnection(null);
    setReport(null);
    setLeaves(null);
    writeStoredValue(TOKEN_SESSION_KEY, '');
    writeStoredValue(USER_EMAIL_SESSION_KEY, '');
    goToStep(0);
    addToast('ℹ️ Clé supprimée. Vous pouvez en saisir une nouvelle.', 'info');
  }

  async function exportExcel() {
    if (!report || !leaves) {
      addToast("⚠️ Chargez d'abord les données 2025 avant d'exporter.", 'warn');
      return;
    }

    setIsExporting(true);
    try {
      addToast('📦 Préparation du fichier Excel...', 'info');
      const excelModule = await import('exceljs');
      const ExcelJS = excelModule.default || excelModule;
      if (!ExcelJS?.Workbook) {
        throw new Error("Le module d'export Excel n'a pas pu être chargé correctement.");
      }
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Worklog CSE';
      workbook.created = new Date();

      function addWorksheet(sheetName, rows) {
        const sheet = workbook.addWorksheet(sheetName);
        const safeRows = rows.length ? rows : [{ Information: 'Aucune donnée' }];
        const headers = Object.keys(safeRows[0]);

        sheet.columns = headers.map((header) => ({
          header,
          key: header,
          width: Math.max(14, Math.min(48, header.length + 4)),
        }));

        safeRows.forEach((row) => {
          sheet.addRow(row);
        });

        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FF2E4A2E' } };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFEAF4DC' },
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
      }

      const analysedUser =
        leaves?.user?.resolvedEmail ||
        report?.user?.resolvedEmail ||
        String(targetEmail || '').trim() ||
        'Mon compte';
      const generatedAt = new Date().toLocaleString('fr-FR');

      const summaryRows = [
        { Indicateur: "Date d'export", Valeur: generatedAt },
        { Indicateur: 'Utilisateur analysé', Valeur: analysedUser },
        { Indicateur: 'Total heures travaillées 2025', Valeur: summary.workedHours },
        { Indicateur: 'Total heures congés/absences 2025', Valeur: summary.leavesHours },
        { Indicateur: 'Total jours congés/absences 2025', Valeur: summary.leavesDays },
        { Indicateur: 'Heures BENCH', Valeur: summary.benchHours },
        { Indicateur: 'Taux bench (%)', Valeur: Number(summary.benchRate.toFixed(2)) },
        { Indicateur: "Taux d'utilisation (%)", Valeur: Number(summary.utilizationRate.toFixed(2)) },
        {
          Indicateur: 'Résumé commentaires bench',
          Valeur: benchCommentSummary?.source === 'codex_exec' ? 'Codex (codex exec)' : 'Mode secours local',
        },
      ];
      addWorksheet('Synthèse', summaryRows);

      const projectRows = (report.projects || []).map((project) => ({
        Projet: project.projectKey,
        Nom: project.projectName,
        Heures: Number(project.hours || 0),
      }));
      projectRows.push({
        Projet: 'TOTAL',
        Nom: 'Activités 2025',
        Heures: Number(report.totalHours || 0),
      });
      addWorksheet('Projets_2025', projectRows);

      const benchTypeRows = (benchDetails?.issueTypeTotals || []).map((entry) => ({
        Type: entry.issueType,
        Heures: Number(entry.hours || 0),
      }));
      addWorksheet('Bench_Types', benchTypeRows);

      const benchIssueRows = (benchDetails?.issues || []).map((issue) => ({
        Ticket: issue.issueKey,
        Type: issue.issueType,
        Parent: issue.parentKey ? `${issue.parentKey} - ${issue.parentSummary}` : '',
        Résumé: issue.summary,
        Heures: Number(issue.hours || 0),
      }));
      addWorksheet('Bench_Tickets', benchIssueRows);

      const benchCommentThemeRows = (benchCommentSummary?.themes || []).map((theme) => ({
        Thème: theme.label,
        Heures: Number(theme.hours || 0),
        'Nombre de saisies': Number(theme.occurrences || 0),
      }));
      addWorksheet('Bench_Commentaires_Themes', benchCommentThemeRows);

      const benchCommentHighlightsRows = (benchCommentSummary?.highlights || []).map((entry) => ({
        Ticket: entry.issueKey,
        Heures: Number(entry.hours || 0),
        Commentaire: entry.comment,
      }));
      addWorksheet('Bench_Commentaires_Exemples', benchCommentHighlightsRows);

      const leavesTypeRows = (leavesDetails.issueTypeTotals || []).map((entry) => ({
        Type: entry.issueType,
        Heures: Number(entry.hours || 0),
      }));
      addWorksheet('Congés_Types', leavesTypeRows);

      const leavesRows = (leaves.issues || []).map((issue) => ({
        Ticket: issue.issueKey,
        Type: issue.issueType,
        Statut: issue.status,
        Parent: issue.parentKey || '',
        Résumé: issue.summary,
        Heures: Number(issue.hours || 0),
        Jours: Number(issue.days || 0),
      }));
      addWorksheet('Congés_Tickets', leavesRows);

      const safeDate = new Date().toISOString().slice(0, 10);
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob(
        [buffer],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
      );
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `worklog-cse-${safeDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      addToast('✅ Fichier Excel exporté avec succès.', 'success');
    } catch (err) {
      addToast(err.message || "❌ Impossible d'exporter le fichier Excel.", 'error');
    } finally {
      setIsExporting(false);
    }
  }

  function renderStepContent() {
    if (step === 0) {
      return (
        <section ref={stepContentRef} tabIndex="-1" className="glass step-card reveal">
          <h2>🔑 Étape 1 : créer votre clé d'accès</h2>
          <p>
            Cliquez sur le bouton ci-dessous, créez une clé d'accès personnelle,
            puis revenez ici pour la coller.
          </p>
          <a className="neon-btn" href={TOKEN_HELP_URL} target="_blank" rel="noreferrer">
            Ouvrir la page de création du jeton
          </a>
          <p className="hint">Astuce : donnez un nom clair, par exemple "Worklog CSE".</p>
        </section>
      );
    }

    if (step === 1) {
      return (
        <section ref={stepContentRef} tabIndex="-1" className="glass step-card reveal">
          <h2>📘 Étape 2 : lire le guide</h2>
          <p>
            Ouvrez le guide de configuration et suivez les prérequis.
            Quand c'est fait, passez à l'étape suivante.
          </p>
          <a className="neon-btn secondary" href={SETUP_GUIDE_URL} target="_blank" rel="noreferrer">
            Ouvrir le guide
          </a>
        </section>
      );
    }

    if (step === 2) {
      return (
        <section ref={stepContentRef} tabIndex="-1" className="glass step-card reveal">
          <h2>⚙️ Étape 3 : lancer la configuration</h2>
          <label htmlFor="pat-token">Collez votre clé d'accès</label>
          <textarea
            id="pat-token"
            rows="4"
            className="token-input"
            placeholder="Collez votre clé ici"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
          <label htmlFor="user-email">Adresse e-mail à analyser (optionnel)</label>
          <input
            id="user-email"
            type="email"
            className="text-input"
            placeholder="prenom.nom@exemple.fr"
            autoComplete="email"
            value={targetEmail}
            onChange={(event) => setTargetEmail(event.target.value)}
          />
          <p className="hint">
            Cas d'usage : laissez vide pour vos propres données, ou saisissez un autre e-mail si votre clé a les droits.
          </p>

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
            <p ref={connectionResultRef} tabIndex="-1" className={connection.ok ? 'ok-line' : 'error-line'}>
              Résultat de la connexion : {connection.ok ? '✅ Réussie' : '❌ Échec'}
              {connection.initSeconds ? ` (${connection.initSeconds}s)` : ''}
              {connection.message ? ` - ${connection.message}` : ''}
            </p>
          ) : null}
        </section>
      );
    }

    return (
      <section ref={stepContentRef} tabIndex="-1" className="glass step-card reveal">
        <h2>📊 Étape 4 : vos heures et vos congés 2025</h2>
        <p>
          Cette action charge votre bilan 2025 :
          temps de travail par projet, puis congés et absences sur {LEAVE_SCOPE_LABEL}.
        </p>
        {targetEmail ? (
          <p className="hint">Utilisateur ciblé : {targetEmail}</p>
        ) : (
          <p className="hint">Utilisateur ciblé : votre propre compte</p>
        )}
        <div className="actions">
          <button
            type="button"
            className="neon-btn"
            onClick={() => loadYearlyData()}
            disabled={isBusy || !connectionOk}
          >
            {busyAction === 'report' ? 'Chargement...' : 'Charger / rafraîchir mes données 2025'}
          </button>
          <button type="button" className="neon-btn ghost" onClick={() => goToStep(2)} disabled={isBusy}>
            Revenir pour modifier ma clé
          </button>
        </div>
        {!connectionOk ? (
          <p className="hint">Validez d'abord la connexion à l'étape 3.</p>
        ) : null}
      </section>
    );
  }

  return (
    <div className="page-wrap">
      <a className="skip-link" href="#contenu-principal">
        Aller au contenu principal
      </a>
      <div className="bg-grid" aria-hidden="true" />

      <header className="hero glass reveal">
        <p className="badge">Worklog CSE</p>
        <h1>Heures travaillées en 2025</h1>
        <p className="hero-sub">
          Suivez les étapes pour connecter votre espace de travail, puis consulter vos heures, congés et indicateurs 2025.
        </p>
        <p className="status">{headerStatus}</p>
      </header>

      {isBusy ? (
        <div className="glass loading-strip" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>{ACTION_LABELS[busyAction]}</span>
        </div>
      ) : null}

      {reportProgress.active ? (
        <div className="glass data-progress reveal" role="status" aria-live="polite">
          <div className="data-progress-top">
            <strong>Progression de la collecte</strong>
            <span>{Math.round(reportProgress.value)}%</span>
          </div>
          <div
            className="data-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(clampPercent(reportProgress.value))}
            aria-label="Progression du chargement des données"
          >
            <span style={{ width: `${clampPercent(reportProgress.value)}%` }} />
          </div>
          <p>{reportProgress.label}</p>
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
          <div key={toast.id} className={`toast toast-${toast.tone}${toast.exiting ? ' is-exiting' : ''}`}>
            <p>{toast.message}</p>
            <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Fermer">
              ✕
            </button>
          </div>
        ))}
      </aside>

      <main id="contenu-principal" className="wizard-wrap" tabIndex="-1" aria-busy={isBusy}>
        <section className="glass stepper reveal">
          <p className="step-count">
            Étape {step + 1} / {STEPS.length}
          </p>
          {isStepLocked(3) ? (
            <p className="stepper-hint">🔒 L'étape 4 se débloque après une connexion validée.</p>
          ) : null}
          <ol>
            {STEPS.map((item, index) => {
              const isLocked = isStepLocked(index);
              const baseClass = index === step ? 'active' : index < step ? 'done' : '';
              const className = `${baseClass}${isLocked ? ' locked' : ''}`.trim();
              return (
              <li key={item.id} className={className}>
                <button
                  ref={(el) => {
                    stepButtonRefs.current[index] = el;
                  }}
                  type="button"
                  disabled={isBusy}
                  aria-disabled={isLocked ? 'true' : undefined}
                  aria-current={index === step ? 'step' : undefined}
                  title={isLocked ? "Étape indisponible: vérifiez d'abord la connexion." : undefined}
                  onClick={() => goToStep(index)}
                  onKeyDown={(event) => handleStepKeyDown(event, index)}
                >
                  <span>{index + 1}</span>
                  <strong>{item.title}</strong>
                  {isLocked ? <small className="step-note">Connexion requise</small> : null}
                </button>
              </li>
              );
            })}
          </ol>
        </section>

        {renderStepContent()}

        <section className="glass nav-card reveal">
          <div className="actions">
            <button type="button" className="neon-btn ghost" onClick={prevStep} disabled={!canGoPrev || isBusy}>
              Étape précédente
            </button>
            <button
              type="button"
              className="neon-btn"
              onClick={nextStep}
              disabled={!canGoNext || isBusy || isStepLocked(step + 1)}
            >
              Étape suivante
            </button>
          </div>
        </section>

        {step === 3 ? (
          <>
            <section
              ref={summarySectionRef}
              tabIndex="-1"
              className={`glass feedback-card reveal${isSummaryReady ? '' : ' section-pending'}`}
              aria-busy={!isSummaryReady}
            >
              <h3>🧮 Résumé 2025</h3>
              {!isSummaryReady ? (
                <p className="section-state">⏳ Cette section se remplit après le chargement des données 2025.</p>
              ) : null}
              <div className={`account-badge ${analysisInfo.fallback ? 'warn' : analysisInfo.delegated ? 'info' : 'ok'}`}>
                <strong>Compte analysé : {analysisInfo.resolvedEmail}</strong>
                <span>{analysisInfo.message}</span>
              </div>
              <div className="progress-dashboard">
                {progressCircles.map((item) => (
                  <ProgressCircle
                    key={item.title}
                    value={item.value}
                    title={item.title}
                    subtitle={item.subtitle}
                    tone={item.tone}
                  />
                ))}
              </div>
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
                  <h4>🧱 Taux bench</h4>
                  <p>{formatPercent(summary.benchRate)}</p>
                  <small>
                    Calculé depuis {BENCH_SCOPE_KEY} ({formatNumber(summary.benchHours)} h).
                  </small>
                </article>
                <article className="summary-card">
                  <h4>✅ Taux d'utilisation</h4>
                  <p>{formatPercent(summary.utilizationRate)}</p>
                  <small>Formule : 100 % - taux bench.</small>
                </article>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="neon-btn secondary"
                  onClick={exportExcel}
                  disabled={isExporting || isBusy || !report || !leaves}
                >
                  {isExporting ? 'Export Excel en cours...' : 'Exporter un fichier Excel (.xlsx)'}
                </button>
              </div>
            </section>

            <section className={`glass feedback-card reveal${isProjectsReady ? '' : ' section-pending'}`} aria-busy={!isProjectsReady}>
              <h3>📌 Heures par projet (2025)</h3>
              {!isProjectsReady ? (
                <p className="section-state">⏳ En attente du chargement des heures par projet.</p>
              ) : null}
              {!report?.projects?.length ? (
                <p>Pas encore de résultat. Cliquez sur "Charger / rafraîchir mes données 2025".</p>
              ) : (
                <>
                  <div className="meta-row">
                    <span>Tickets analysés : {report.issueCount}</span>
                    <span>Temps saisis retenus : {report.worklogCount}</span>
                  </div>
                  <div className="table-wrap" tabIndex="0" aria-label="Tableau des heures par projet en 2025">
                    <table className="neon-table">
                      <thead>
                        <tr>
                          <th scope="col">Projet</th>
                          <th scope="col">Nom</th>
                          <th scope="col">Heures</th>
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
                  </div>
                </>
              )}
            </section>

            <section className={`glass feedback-card reveal${isBenchReady ? '' : ' section-pending'}`} aria-busy={!isBenchReady}>
              <h3>🧱 Détail du bench ({BENCH_SCOPE_KEY})</h3>
              {!isBenchReady ? (
                <p className="section-state">⏳ En attente du chargement des données bench.</p>
              ) : null}
              <p className="bench-summary">{benchNarrative}</p>
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
                    <span>
                      Commentaires bench : {benchDetails.commentCount || 0} ({formatNumber(benchDetails.commentHours || 0)} h)
                    </span>
                  </div>

                  <div className="detail-grid">
                    <article className="detail-block">
                      <h4>🧠 Résumé Codex de vos commentaires bench</h4>
                      {!benchCommentSummary ? (
                        <p>Résumé indisponible pour le moment.</p>
                      ) : (
                        <>
                          <p className="hint">{benchCommentSummary.message}</p>
                          <p className="hint">
                            Source du résumé : {benchCommentSummary.source === 'codex_exec' ? 'Codex (codex exec)' : 'Mode secours local'}
                          </p>
                          <p className="hint">
                            Saisies commentées : {benchCommentSummary.commentedWorklogs || 0}
                            {' · '}
                            Temps couvert : {formatNumber(benchCommentSummary.commentedHours || 0)} h
                          </p>
                          {!benchCommentSummary.themes?.length ? (
                            <p>Aucun thème clair détecté.</p>
                          ) : (
                            <div className="table-wrap" tabIndex="0" aria-label="Synthèse des thèmes bench">
                              <table className="neon-table">
                                <thead>
                                  <tr>
                                    <th scope="col">Thème détecté</th>
                                    <th scope="col">Heures</th>
                                    <th scope="col">Saisies</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {benchCommentSummary.themes.map((theme) => (
                                    <tr key={theme.label}>
                                      <td>{theme.label}</td>
                                      <td>{formatNumber(theme.hours)}</td>
                                      <td>{theme.occurrences}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {!benchCommentSummary.highlights?.length ? null : (
                            <>
                              <h5>Exemples représentatifs</h5>
                              <ul className="hint-list">
                                {benchCommentSummary.highlights.map((entry, index) => (
                                  <li key={`${entry.issueKey}-${index}`}>
                                    <strong>{entry.issueKey}</strong> ({formatNumber(entry.hours)} h): {entry.comment}
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </>
                      )}
                    </article>

                    <article className="detail-block">
                      <h4>📚 Répartition par type d'issue (bench)</h4>
                      {!benchDetails.issueTypeTotals?.length ? (
                        <p>Pas de répartition disponible.</p>
                      ) : (
                        <div className="table-wrap" tabIndex="0" aria-label="Répartition bench par type d'issue">
                          <table className="neon-table">
                            <thead>
                              <tr>
                                <th scope="col">Type d'issue</th>
                                <th scope="col">Heures</th>
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
                        </div>
                      )}
                    </article>

                    <details className="detail-block detail-disclosure">
                      <summary>
                        <span className="summary-title">🧩 Sous-tâches bench</span>
                        <span className="summary-meta">{benchDetails.subtasks.length} lignes</span>
                        <span className="summary-state" aria-hidden="true" />
                      </summary>
                      <div className="disclosure-content">
                        {!benchDetails.subtasks?.length ? (
                          <p>Aucune sous-tâche bench avec heures en 2025.</p>
                        ) : (
                          <>
                            <p className="hint">
                              Affichage de {visibleBenchSubtasks.length} sur {benchDetails.subtasks.length} lignes.
                            </p>
                            <div className="table-wrap" tabIndex="0" aria-label="Sous-tâches bench">
                              <table className="neon-table">
                                <thead>
                                  <tr>
                                    <th scope="col">Ticket</th>
                                    <th scope="col">Type</th>
                                    <th scope="col">Parent</th>
                                    <th scope="col">Heures</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {visibleBenchSubtasks.map((issue) => (
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
                            </div>
                            {visibleBenchSubtasks.length < benchDetails.subtasks.length ? (
                              <button
                                type="button"
                                className="neon-btn ghost compact"
                                onClick={() =>
                                  setBenchSubtasksVisibleCount((prev) => prev + nextChunkSize(prev, benchDetails.subtasks.length))
                                }
                              >
                                Afficher {nextChunkSize(visibleBenchSubtasks.length, benchDetails.subtasks.length)} lignes de plus
                              </button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </details>
                  </div>

                  <details className="detail-block detail-disclosure">
                    <summary>
                      <span className="summary-title">🗂️ Tous les tickets bench (tous types)</span>
                      <span className="summary-meta">{benchDetails.issues.length} lignes</span>
                      <span className="summary-state" aria-hidden="true" />
                    </summary>
                    <div className="disclosure-content">
                      {!benchDetails.issues?.length ? (
                        <p>Aucun ticket bench avec heures en 2025.</p>
                      ) : (
                        <>
                          <p className="hint">
                            Affichage de {visibleBenchIssues.length} sur {benchDetails.issues.length} lignes.
                          </p>
                          <div className="table-wrap" tabIndex="0" aria-label="Tous les tickets bench">
                            <table className="neon-table">
                              <thead>
                                <tr>
                                  <th scope="col">Ticket</th>
                                  <th scope="col">Type</th>
                                  <th scope="col">Parent</th>
                                  <th scope="col">Heures</th>
                                </tr>
                              </thead>
                              <tbody>
                                {visibleBenchIssues.map((issue) => (
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
                          </div>
                          {visibleBenchIssues.length < benchDetails.issues.length ? (
                            <button
                              type="button"
                              className="neon-btn ghost compact"
                              onClick={() =>
                                setBenchIssuesVisibleCount((prev) => prev + nextChunkSize(prev, benchDetails.issues.length))
                              }
                            >
                              Afficher {nextChunkSize(visibleBenchIssues.length, benchDetails.issues.length)} lignes de plus
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </details>
                </>
              )}
            </section>

            <section className={`glass feedback-card reveal${isLeavesReady ? '' : ' section-pending'}`} aria-busy={!isLeavesReady}>
              <h3>🌴 Suivi des congés et absences ({LEAVE_SCOPE_LABEL})</h3>
              {!isLeavesReady ? (
                <p className="section-state">⏳ En attente du chargement des congés et absences.</p>
              ) : null}
              {!leaves?.issues?.length ? (
                <p>Pas de congés/absences chargés pour le moment.</p>
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
                  {leaves?.discovery?.usedFallbackScope ? (
                    <p className="hint">
                      Certains filtres n'étaient pas disponibles. Un mode de secours a été utilisé.
                    </p>
                  ) : null}

                  <div className="detail-grid">
                    <article className="detail-block">
                      <h4>📚 Répartition par type d'issue (congés)</h4>
                      {!leavesDetails.issueTypeTotals?.length ? (
                        <p>Pas de répartition disponible.</p>
                      ) : (
                        <div className="table-wrap" tabIndex="0" aria-label="Répartition congés par type d'issue">
                          <table className="neon-table">
                            <thead>
                              <tr>
                                <th scope="col">Type d'issue</th>
                                <th scope="col">Heures</th>
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
                        </div>
                      )}
                    </article>

                    <details className="detail-block detail-disclosure">
                      <summary>
                        <span className="summary-title">🧩 Sous-tâches congés</span>
                        <span className="summary-meta">{leavesDetails.subtasks.length} lignes</span>
                        <span className="summary-state" aria-hidden="true" />
                      </summary>
                      <div className="disclosure-content">
                        {!leavesDetails.subtasks?.length ? (
                          <p>Aucune sous-tâche congés avec heures en 2025.</p>
                        ) : (
                          <>
                            <p className="hint">
                              {leavesDetails.subtaskCount} sous-tâches, soit {formatNumber(leavesDetails.subtaskHours)} h.
                            </p>
                            <p className="hint">
                              Affichage de {visibleLeavesSubtasks.length} sur {leavesDetails.subtasks.length} lignes.
                            </p>
                            <div className="table-wrap" tabIndex="0" aria-label="Sous-tâches congés">
                              <table className="neon-table">
                                <thead>
                                  <tr>
                                    <th scope="col">Ticket</th>
                                    <th scope="col">Type</th>
                                    <th scope="col">Parent</th>
                                    <th scope="col">Heures</th>
                                    <th scope="col">Jours</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {visibleLeavesSubtasks.map((issue) => (
                                    <tr key={issue.issueKey}>
                                      <td>
                                        {getIssueBrowseUrl(issue.issueKey) ? (
                                          <a href={getIssueBrowseUrl(issue.issueKey)} target="_blank" rel="noreferrer">
                                            {issue.issueKey}
                                          </a>
                                        ) : (
                                          <span>{issue.issueKey}</span>
                                        )}
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
                            </div>
                            {visibleLeavesSubtasks.length < leavesDetails.subtasks.length ? (
                              <button
                                type="button"
                                className="neon-btn ghost compact"
                                onClick={() =>
                                  setLeavesSubtasksVisibleCount((prev) => prev + nextChunkSize(prev, leavesDetails.subtasks.length))
                                }
                              >
                                Afficher {nextChunkSize(visibleLeavesSubtasks.length, leavesDetails.subtasks.length)} lignes de plus
                              </button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </details>
                  </div>

                  <details className="detail-block detail-disclosure">
                    <summary>
                      <span className="summary-title">🗂️ Tous les tickets congés (tous types)</span>
                      <span className="summary-meta">{leaves.issues.length} lignes</span>
                      <span className="summary-state" aria-hidden="true" />
                    </summary>
                    <div className="disclosure-content">
                      <p className="hint">
                        Affichage de {visibleLeavesIssues.length} sur {leaves.issues.length} lignes.
                      </p>
                      <div className="table-wrap" tabIndex="0" aria-label="Tous les tickets congés">
                        <table className="neon-table">
                          <thead>
                            <tr>
                              <th scope="col">Ticket</th>
                              <th scope="col">Type</th>
                              <th scope="col">Statut</th>
                              <th scope="col">Parent</th>
                              <th scope="col">Heures</th>
                              <th scope="col">Jours</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleLeavesIssues.map((issue) => (
                              <tr key={issue.issueKey}>
                                <td>
                                  {getIssueBrowseUrl(issue.issueKey) ? (
                                    <a href={getIssueBrowseUrl(issue.issueKey)} target="_blank" rel="noreferrer">
                                      {issue.issueKey}
                                    </a>
                                  ) : (
                                    <span>{issue.issueKey}</span>
                                  )}
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
                      </div>
                      {visibleLeavesIssues.length < leaves.issues.length ? (
                        <button
                          type="button"
                          className="neon-btn ghost compact"
                          onClick={() =>
                            setLeavesIssuesVisibleCount((prev) => prev + nextChunkSize(prev, leaves.issues.length))
                          }
                        >
                          Afficher {nextChunkSize(visibleLeavesIssues.length, leaves.issues.length)} lignes de plus
                        </button>
                      ) : null}
                    </div>
                  </details>
                </>
              )}
            </section>
          </>
        ) : null}
      </main>

      <footer className="glass support-footer reveal">
        <h3>☕ Soutenir ce projet</h3>
        <p>
          Ce projet est né un vendredi 13, à l'heure où la ville bâille encore.
          Un signe de chance, peut-être, ou juste le bon moment pour faire quelque chose d'utile.
        </p>
        <p>
          Il a été construit sur du temps perso, sur un ordinateur perso, avec des tokens Codex persos.
          Un geste simple : enlever un peu de poids des épaules, remettre de la clarté dans les chiffres,
          et garder un cap quand la mer n'est pas très calme.
        </p>
        <p>
          Il y a des périodes où les couloirs changent de musique.
          On ne dit pas toujours les choses, mais on les sent.
          Alors ce projet avance comme une lampe de poche dans la brume : pas pour faire du bruit,
          juste pour éclairer quelques pas de plus.
        </p>
        <p>
          J'y ai croisé des personnes solides, fines, lumineuses.
          Cette page est une façon de leur dire merci, sans grand discours.
        </p>
        <p>
          Si tu veux soutenir ce travail :
        </p>
        <a className="neon-btn secondary" href={KOFI_URL} target="_blank" rel="noreferrer">
          Ouvrir la page Ko-fi
        </a>
      </footer>
    </div>
  );
}
