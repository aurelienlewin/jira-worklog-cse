import { useEffect, useMemo, useRef, useState } from 'react';

const TOKEN_HELP_URL = String(import.meta.env.VITE_TOKEN_HELP_URL || 'https://example.com/token').trim();
const SETUP_GUIDE_URL = String(import.meta.env.VITE_SETUP_GUIDE_URL || 'https://example.com/guide').trim();
const ISSUE_BROWSE_BASE_URL = String(import.meta.env.VITE_ISSUE_BROWSE_BASE_URL || '')
  .trim()
  .replace(/\/+$/, '');

const TOKEN_SESSION_KEY = 'worklog_cse_token';
const USER_EMAIL_SESSION_KEY = 'worklog_cse_user_email';
const SESSION_CONNECTION_KEY = 'worklog_cse_connection';
const SESSION_REPORT_KEY = 'worklog_cse_report';
const SESSION_LEAVES_KEY = 'worklog_cse_leaves';
const SESSION_DATA_CONTEXT_KEY = 'worklog_cse_data_context';
const SESSION_DATA_CACHE_VERSION = 1;
const LEAVE_ANCHOR_ISSUE_KEY = String(import.meta.env.VITE_LEAVE_ANCHOR_ISSUE_KEY || 'ABS-1')
  .trim()
  .toUpperCase();
const LEAVE_SCOPE_LABEL = String(
  import.meta.env.VITE_LEAVE_SCOPE_LABEL ||
  `${(LEAVE_ANCHOR_ISSUE_KEY.split('-')[0] || 'ABS').toUpperCase()}-*`
).trim();
const BENCH_SCOPE_KEY = String(import.meta.env.VITE_BENCH_SCOPE_KEY || 'BENCH')
  .trim()
  .toUpperCase();
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
const EMPTY_PROGRESS_STATE = {
  active: false,
  value: 0,
  label: '',
  title: '',
  ariaLabel: '',
};

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

function readSessionJson(key) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSessionJson(key, value) {
  if (typeof window === 'undefined') return;
  try {
    if (value === undefined || value === null) {
      window.sessionStorage.removeItem(key);
      return;
    }
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage access errors.
  }
}

function clearSessionDataCache() {
  writeSessionJson(SESSION_CONNECTION_KEY, null);
  writeSessionJson(SESSION_REPORT_KEY, null);
  writeSessionJson(SESSION_LEAVES_KEY, null);
  writeSessionJson(SESSION_DATA_CONTEXT_KEY, null);
}

function hashString(value) {
  let hash = 0;
  const source = String(value || '');
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16);
}

function buildDataContextKey(tokenValue, userEmailValue) {
  const tokenPart = hashString(String(tokenValue || '').trim());
  const emailPart = String(userEmailValue || '').trim().toLowerCase();
  return `${tokenPart}:${emailPart}`;
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

function makeAbortError() {
  const err = new Error('Requête annulée.');
  err.name = 'AbortError';
  return err;
}

function isAbortError(err) {
  return Boolean(err && (err.name === 'AbortError' || String(err.message || '').toLowerCase().includes('aborted')));
}

function sleepWithSignal(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeAbortError());
      return;
    }

    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(makeAbortError());
    };

    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

function getIssueBrowseUrl(issueKey) {
  if (!ISSUE_BROWSE_BASE_URL || !issueKey) return '';
  return `${ISSUE_BROWSE_BASE_URL}/browse/${encodeURIComponent(String(issueKey))}`;
}

function sanitizeFilePart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 48);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function getInitials(value) {
  const text = String(value || '').trim();
  if (!text) return '?';
  const compact = text
    .replace(/[_\-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!compact.length) return text.slice(0, 1).toUpperCase();
  if (compact.length === 1) return compact[0].slice(0, 1).toUpperCase();
  return `${compact[0].slice(0, 1)}${compact[1].slice(0, 1)}`.toUpperCase();
}

function AccountAvatar({ src, label }) {
  const [hasError, setHasError] = useState(false);
  const initials = getInitials(label);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (!src || hasError) {
    return (
      <span className="account-avatar fallback" aria-hidden="true">
        {initials}
      </span>
    );
  }

  return (
    <img
      className="account-avatar"
      src={src}
      alt={`Avatar de ${label || 'l’utilisateur'}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
    />
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
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [reportProgress, setReportProgress] = useState(EMPTY_PROGRESS_STATE);
  const [postProgressFocusTarget, setPostProgressFocusTarget] = useState('');
  const [benchSubtasksVisibleCount, setBenchSubtasksVisibleCount] = useState(TABLE_PAGE_SIZE);
  const [benchIssuesVisibleCount, setBenchIssuesVisibleCount] = useState(TABLE_PAGE_SIZE);
  const [leavesSubtasksVisibleCount, setLeavesSubtasksVisibleCount] = useState(TABLE_PAGE_SIZE);
  const [leavesIssuesVisibleCount, setLeavesIssuesVisibleCount] = useState(TABLE_PAGE_SIZE);
  const stepButtonRefs = useRef([]);
  const toastTimersRef = useRef(new Map());
  const stepContentRef = useRef(null);
  const connectionResultRef = useRef(null);
  const summarySectionRef = useRef(null);
  const reportProgressRef = useRef(null);
  const activeRequestControllerRef = useRef(null);
  const dataContextRef = useRef('');

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

  const hasBenchHours = Number(summary.benchHours || 0) > 0;
  const hasLeavesHours = Number(summary.leavesHours || 0) > 0;

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
    const circles = [
      {
        title: 'Utilisation',
        subtitle: '100 % - taux bench',
        value: summary.utilizationRate,
        tone: 'leaf',
      },
      {
        title: 'Part heures travaillées',
        subtitle: `${formatNumber(summary.workedHours)} h`,
        value: workedShare,
        tone: 'sky',
      },
    ];

    if (hasBenchHours) {
      circles.push({
        title: 'Part bench',
        subtitle: `${formatNumber(summary.benchHours)} h sur vos heures 2025`,
        value: summary.benchRate,
        tone: 'sun',
      });
    }

    if (hasLeavesHours) {
      circles.push({
        title: 'Part congés/absences',
        subtitle: `${formatNumber(summary.leavesHours)} h (${formatNumber(summary.leavesDays)} jours)`,
        value: leavesShare,
        tone: 'rose',
      });
    }

    return circles;
  }, [summary, hasBenchHours, hasLeavesHours]);

  const analysisInfo = useMemo(() => {
    const fromReport = report?.user || null;
    const fromLeaves = leaves?.user || null;
    const resolvedEmail =
      fromLeaves?.resolvedEmail ||
      fromReport?.resolvedEmail ||
      String(targetEmail || '').trim() ||
      'Votre compte';
    const mode = fromLeaves?.mode || fromReport?.mode || 'current';
    const displayName =
      fromLeaves?.displayName ||
      fromReport?.displayName ||
      '';
    const avatarUrl =
      fromLeaves?.avatarDataUrl ||
      fromReport?.avatarDataUrl ||
      fromLeaves?.avatarUrl ||
      fromReport?.avatarUrl ||
      '';
    const fallback = mode === 'fallback_current';
    const delegated = mode === 'delegated';

    let message = 'Analyse de vos données.';
    if (delegated) {
      message = "Analyse d’un autre compte (selon les droits de votre clé d'accès).";
    } else if (fallback) {
      message = "L'e-mail demandé n'a pas été trouvé: affichage de votre compte.";
    }

    return { resolvedEmail, mode, message, fallback, delegated, displayName, avatarUrl };
  }, [report, leaves, targetEmail]);

  const exportIdentity = useMemo(() => {
    const fromReport = report?.user || null;
    const fromLeaves = leaves?.user || null;
    const displayName = String(fromLeaves?.displayName || fromReport?.displayName || '').trim();
    const resolvedEmail = String(
      fromLeaves?.resolvedEmail ||
      fromReport?.resolvedEmail ||
      targetEmail ||
      ''
    ).trim();
    const fallbackLabel = displayName || resolvedEmail || 'mon-compte';
    const filePart =
      sanitizeFilePart(displayName) ||
      sanitizeFilePart(resolvedEmail.split('@')[0] || resolvedEmail) ||
      'mon-compte';

    return {
      displayName: displayName || null,
      resolvedEmail: resolvedEmail || null,
      label: fallbackLabel,
      filePart,
    };
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
    const isPersistent = options.persistent === true || (options.persistent !== false && tone === 'error');
    setToasts((prev) => {
      const next = [...prev, toast];
      const overflow = next.length - 8;
      if (overflow > 0) {
        const removed = next.slice(0, overflow);
        for (const stale of removed) clearToastTimer(stale.id);
      }
      return next.slice(-8);
    });
    if (!isPersistent) {
      scheduleToastDismiss(toast.id, ttlMs);
    }
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

  function abortActiveRequests() {
    const controller = activeRequestControllerRef.current;
    if (controller && !controller.signal.aborted) {
      controller.abort();
    }
    activeRequestControllerRef.current = null;
  }

  function beginRequestController() {
    abortActiveRequests();
    const controller = new AbortController();
    activeRequestControllerRef.current = controller;
    return controller;
  }

  function releaseRequestController(controller) {
    if (activeRequestControllerRef.current === controller) {
      activeRequestControllerRef.current = null;
    }
  }

  function isStepLocked(index) {
    return index === 3 && !connectionOk;
  }

  function startAutoProgressTicker(options = {}) {
    if (typeof window === 'undefined') return () => {};
    const maxValue = clampPercent(options.maxValue ?? 90);
    const minStep = Math.max(0.3, Number(options.minStep || 0.9));
    const maxStep = Math.max(minStep, Number(options.maxStep || 2.8));
    const intervalMs = Math.max(240, Number(options.intervalMs || 700));
    const timer = window.setInterval(() => {
      setReportProgress((prev) => {
        if (!prev.active) return prev;
        if (Number(prev.value || 0) >= maxValue) return prev;
        const step = minStep + Math.random() * (maxStep - minStep);
        return {
          ...prev,
          value: Math.min(maxValue, Number(prev.value || 0) + step),
        };
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }

  useEffect(() => {
    return () => {
      clearAllToastTimers();
      abortActiveRequests();
    };
  }, []);

  async function postJson(url, payload, options = {}) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: options.signal,
      });
    } catch (err) {
      if (isAbortError(err)) throw err;
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
    const signal = options.signal;
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (signal?.aborted) throw makeAbortError();
      try {
        const data = await postJson(url, payload, { signal });
        if (attempt > 1) {
          addToast(`✅ ${label} réussie après ${attempt} tentatives.`, 'success');
        }
        return data;
      } catch (err) {
        if (isAbortError(err)) throw err;
        const message = err instanceof Error ? err.message : 'Erreur inconnue';
        lastError = new Error(message);
        if (attempt >= attempts) break;

        addToast(`⚠️ ${label}: tentative ${attempt}/${attempts} en échec. Nouvelle tentative...`, 'warn');
        await sleepWithSignal(API_RETRY_DELAY_MS * attempt, signal);
      }
    }

    throw lastError || new Error('Une erreur est survenue.');
  }

  async function loadYearlyData(tokenOverride, options = {}) {
    const controller = options.signal ? null : beginRequestController();
    const signal = options.signal || controller?.signal;
    const activeToken = String(tokenOverride || token || '').trim();
    const requestedUserEmail = options.userEmail ?? targetEmail ?? '';
    const activeUserEmail = String(requestedUserEmail).trim();
    if (!activeToken) {
      addToast("⚠️ Merci d'abord de renseigner votre clé d'accès.", 'error');
      return;
    }

    setBusyAction('report');
    setPostProgressFocusTarget('');
    setReportProgress({
      active: true,
      value: 6,
      title: 'Progression de la collecte',
      ariaLabel: 'Progression du chargement des données',
      label: 'Connexion au service en cours...',
    });
    try {
      setReportProgress({
        active: true,
        value: 22,
        title: 'Progression de la collecte',
        ariaLabel: 'Progression du chargement des données',
        label: 'Collecte des heures travaillées 2025...',
      });
      const hoursData = await postJsonWithRetry('/api/worklogs/report', {
        token: activeToken,
        detailedProjectKeys: BENCH_DETAIL_PROJECT_KEYS,
        userEmail: activeUserEmail || undefined,
      }, { label: 'Chargement des heures 2025', attempts: 3, signal });

      setReportProgress({
        active: true,
        value: 64,
        title: 'Progression de la collecte',
        ariaLabel: 'Progression du chargement des données',
        label: `Collecte des congés et absences ${LEAVE_SCOPE_LABEL}...`,
      });
      const leavesData = await postJsonWithRetry('/api/worklogs/leaves', {
        token: activeToken,
        issueKey: LEAVE_ANCHOR_ISSUE_KEY,
        userEmail: activeUserEmail || undefined,
      }, { label: 'Chargement des congés et absences 2025', attempts: 3, signal });

      setReportProgress({
        active: true,
        value: 91,
        title: 'Progression de la collecte',
        ariaLabel: 'Progression du chargement des données',
        label: 'Calcul des indicateurs en cours...',
      });

      setReport(hoursData);
      setLeaves(leavesData);
      const contextKey = buildDataContextKey(activeToken, activeUserEmail);
      dataContextRef.current = contextKey;
      writeSessionJson(SESSION_DATA_CONTEXT_KEY, {
        version: SESSION_DATA_CACHE_VERSION,
        key: contextKey,
        savedAt: Date.now(),
      });
      writeSessionJson(SESSION_REPORT_KEY, hoursData);
      writeSessionJson(SESSION_LEAVES_KEY, leavesData);
      setReportProgress({
        active: true,
        value: 100,
        title: 'Progression de la collecte',
        ariaLabel: 'Progression du chargement des données',
        label: 'Données prêtes.',
      });
      setPostProgressFocusTarget('summary');
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
    } catch (err) {
      if (isAbortError(err)) return;
      addToast(err.message || '❌ Impossible de charger les données 2025.', 'error');
    } finally {
      setReportProgress(EMPTY_PROGRESS_STATE);
      setBusyAction('');
      if (controller) releaseRequestController(controller);
    }
  }

  async function runSetup() {
    const activeToken = String(token || '').trim();
    if (!activeToken) {
      addToast("⚠️ Merci de coller votre clé d'accès pour continuer.", 'error');
      return;
    }

    const controller = beginRequestController();
    setBusyAction('setup');
    setPostProgressFocusTarget('');
    setReportProgress({
      active: true,
      value: 9,
      title: 'Progression de la configuration',
      ariaLabel: 'Progression de la configuration MCP',
      label: 'Préparation de la configuration MCP...',
    });
    const stopProgressTicker = startAutoProgressTicker({ maxValue: 87 });
    try {
      setReportProgress({
        active: true,
        value: 18,
        title: 'Progression de la configuration',
        ariaLabel: 'Progression de la configuration MCP',
        label: 'Configuration automatique en cours...',
      });
      const data = await postJsonWithRetry('/api/mcp/setup', { token: activeToken }, {
        label: 'Configuration MCP',
        attempts: 2,
        signal: controller.signal,
      });
      stopProgressTicker();
      addProgressToasts(data.logs || []);
      setConnection(data.handshake || null);
      writeSessionJson(SESSION_CONNECTION_KEY, data.handshake || null);
      if (data.handshake?.ok) {
        setReportProgress({
          active: true,
          value: 100,
          title: 'Progression de la configuration',
          ariaLabel: 'Progression de la configuration MCP',
          label: 'Configuration validée. Démarrage de la collecte...',
        });
        addToast('✅ Configuration terminée avec succès.', 'success');
        goToStep(3, { force: true });
        await loadYearlyData(activeToken, { signal: controller.signal });
      } else {
        setReportProgress({
          active: true,
          value: 100,
          title: 'Progression de la configuration',
          ariaLabel: 'Progression de la configuration MCP',
          label: 'Configuration terminée, mais connexion non validée.',
        });
        setPostProgressFocusTarget('connection');
        addToast('⚠️ La configuration est terminée, mais la connexion reste à corriger.', 'warn');
      }
    } catch (err) {
      stopProgressTicker();
      if (isAbortError(err)) return;
      setPostProgressFocusTarget('connection');
      addToast(err.message || '❌ Échec de la configuration.', 'error');
    } finally {
      stopProgressTicker();
      setReportProgress(EMPTY_PROGRESS_STATE);
      setBusyAction('');
      releaseRequestController(controller);
    }
  }

  async function runCheck(tokenOverride, options = {}) {
    const activeToken = String(tokenOverride || token || '').trim();
    const requestedUserEmail = String(options.userEmail ?? targetEmail ?? '').trim();
    const contextKey = buildDataContextKey(activeToken, requestedUserEmail);
    if (!activeToken) {
      addToast("⚠️ Aucune clé d'accès trouvée pour vérifier la connexion.", 'error');
      return;
    }

    const controller = beginRequestController();
    setBusyAction('check');
    setPostProgressFocusTarget('');
    setReportProgress({
      active: true,
      value: 10,
      title: 'Progression de la vérification',
      ariaLabel: 'Progression de la vérification de connexion',
      label: 'Vérification de la connexion en cours...',
    });
    const stopProgressTicker = startAutoProgressTicker({ maxValue: 90 });
    try {
      const data = await postJsonWithRetry('/api/mcp/check', { token: activeToken }, {
        label: 'Vérification de connexion',
        attempts: 3,
        signal: controller.signal,
      });
      stopProgressTicker();
      setReportProgress({
        active: true,
        value: 96,
        title: 'Progression de la vérification',
        ariaLabel: 'Progression de la vérification de connexion',
        label: 'Connexion vérifiée. Finalisation...',
      });
      addProgressToasts(data.logs || []);
      setConnection(data.handshake || null);
      writeSessionJson(SESSION_CONNECTION_KEY, data.handshake || null);

      if (data.handshake?.ok) {
        goToStep(3, { force: true });
        addToast('✅ Connexion validée. Ouverture de la vue des heures.', 'success');
        const shouldLoadData = options.forceDataLoad === true || dataContextRef.current !== contextKey;
        if (!options.skipDataLoad && shouldLoadData) {
          setReportProgress({
            active: true,
            value: 100,
            title: 'Progression de la vérification',
            ariaLabel: 'Progression de la vérification de connexion',
            label: 'Connexion validée. Démarrage de la collecte...',
          });
          await loadYearlyData(activeToken, { userEmail: requestedUserEmail, signal: controller.signal });
        } else if (!options.skipDataLoad && !shouldLoadData) {
          setPostProgressFocusTarget('summary');
          addToast('ℹ️ Données déjà disponibles dans la session. Rafraîchissez manuellement si besoin.', 'info');
        } else {
          setPostProgressFocusTarget('summary');
        }
      } else {
        setPostProgressFocusTarget('connection');
        goToStep(2);
        addToast("⚠️ Connexion non validée. Revenez à l'étape 3.", 'warn');
      }
    } catch (err) {
      stopProgressTicker();
      if (isAbortError(err)) return;
      setPostProgressFocusTarget('connection');
      goToStep(2);
      addToast(err.message || '❌ Échec de la vérification.', 'error');
    } finally {
      stopProgressTicker();
      setReportProgress(EMPTY_PROGRESS_STATE);
      setBusyAction('');
      releaseRequestController(controller);
    }
  }

  useEffect(() => {
    const savedToken = readStoredValue(TOKEN_SESSION_KEY);
    const savedUserEmail = readStoredValue(USER_EMAIL_SESSION_KEY);
    setTargetEmail(savedUserEmail);
    if (!savedToken) return;

    setToken(savedToken);
    addToast("ℹ️ Clé d'accès retrouvée dans cette session.", 'info');
    const contextKey = buildDataContextKey(savedToken, savedUserEmail);
    const cachedContext = readSessionJson(SESSION_DATA_CONTEXT_KEY);
    const contextMatches =
      cachedContext?.version === SESSION_DATA_CACHE_VERSION &&
      cachedContext?.key === contextKey;
    const cachedConnection = contextMatches ? readSessionJson(SESSION_CONNECTION_KEY) : null;
    const cachedReport = contextMatches ? readSessionJson(SESSION_REPORT_KEY) : null;
    const cachedLeaves = contextMatches ? readSessionJson(SESSION_LEAVES_KEY) : null;

    if (contextMatches) {
      dataContextRef.current = contextKey;
    }

    if (cachedConnection) {
      setConnection(cachedConnection);
    }

    if (cachedReport && cachedLeaves) {
      setReport(cachedReport);
      setLeaves(cachedLeaves);
      goToStep(3, { force: true });
      addToast('ℹ️ Données restaurées depuis la session (pas de nouvelle collecte).', 'info');
      return;
    }

    if (cachedConnection?.ok) {
      goToStep(3, { force: true });
      addToast('ℹ️ Session restaurée. Rafraîchissez manuellement les données si nécessaire.', 'info');
      return;
    }

    goToStep(2, { force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    writeStoredValue(TOKEN_SESSION_KEY, token);
  }, [token]);

  useEffect(() => {
    writeStoredValue(USER_EMAIL_SESSION_KEY, targetEmail);
  }, [targetEmail]);

  useEffect(() => {
    if (!token) return;
    const currentContext = buildDataContextKey(token, targetEmail);
    if (dataContextRef.current && dataContextRef.current !== currentContext) {
      setReport(null);
      setLeaves(null);
    }
  }, [token, targetEmail]);

  useEffect(() => {
    if (typeof window === 'undefined' || !reportProgress.active) return undefined;

    const focusProgress = () => {
      const progressEl = reportProgressRef.current;
      if (!progressEl) return;
      if (document.activeElement === progressEl) return;
      try {
        progressEl.focus({ preventScroll: true });
      } catch {
        progressEl.focus();
      }
    };

    const frame = window.requestAnimationFrame(focusProgress);

    const handleFocusIn = (event) => {
      const progressEl = reportProgressRef.current;
      if (!progressEl) return;
      if (event.target instanceof Node && progressEl.contains(event.target)) return;
      focusProgress();
    };

    const handleKeyDown = (event) => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      focusProgress();
    };

    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [reportProgress.active]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!postProgressFocusTarget || reportProgress.active) return undefined;

    const target =
      postProgressFocusTarget === 'summary'
        ? summarySectionRef.current
        : connectionResultRef.current || stepContentRef.current;

    setPostProgressFocusTarget('');
    if (!target) return undefined;

    const frame = window.requestAnimationFrame(() => {
      smoothFocusAndScroll(target, { durationMs: FOCUS_SCROLL_MS, offset: 10 });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [postProgressFocusTarget, reportProgress.active]);

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

  function goToStep(nextStepIndex, options = {}) {
    const force = Boolean(options.force);
    if (step === nextStepIndex) return;
    if (!force && isStepLocked(nextStepIndex)) {
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
    const wasBusy = isBusy;
    abortActiveRequests();
    setBusyAction('');
    setReportProgress(EMPTY_PROGRESS_STATE);
    setPostProgressFocusTarget('');
    setToken('');
    setTargetEmail('');
    setConnection(null);
    setReport(null);
    setLeaves(null);
    dataContextRef.current = '';
    writeStoredValue(TOKEN_SESSION_KEY, '');
    writeStoredValue(USER_EMAIL_SESSION_KEY, '');
    clearSessionDataCache();
    goToStep(0, { force: true });
    addToast(
      wasBusy
        ? '🛑 Session interrompue. Les requêtes en cours ont été annulées.'
        : 'ℹ️ Session fermée. Vous pouvez saisir une nouvelle clé.',
      'info'
    );
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

      function paintCard(sheet, startCol, startRow, title, value, subtitle, colorArgb) {
        const endCol = startCol + 2;
        const endRow = startRow + 3;
        sheet.mergeCells(startRow, startCol, startRow, endCol);
        sheet.mergeCells(startRow + 1, startCol, startRow + 2, endCol);
        sheet.mergeCells(startRow + 3, startCol, endRow, endCol);

        const titleCell = sheet.getCell(startRow, startCol);
        titleCell.value = title;
        titleCell.font = { bold: true, color: { argb: 'FF31462B' }, size: 11 };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

        const valueCell = sheet.getCell(startRow + 1, startCol);
        valueCell.value = value;
        valueCell.font = { bold: true, color: { argb: 'FF2B3F24' }, size: 16 };
        valueCell.alignment = { horizontal: 'center', vertical: 'middle' };

        const subtitleCell = sheet.getCell(startRow + 3, startCol);
        subtitleCell.value = subtitle;
        subtitleCell.font = { color: { argb: 'FF4F6949' }, size: 10 };
        subtitleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

        for (let row = startRow; row <= endRow; row += 1) {
          for (let col = startCol; col <= endCol; col += 1) {
            const cell = sheet.getCell(row, col);
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: colorArgb },
            };
            cell.border = {
              top: { style: 'thin', color: { argb: '66A2B88B' } },
              left: { style: 'thin', color: { argb: '66A2B88B' } },
              bottom: { style: 'thin', color: { argb: '66A2B88B' } },
              right: { style: 'thin', color: { argb: '66A2B88B' } },
            };
          }
        }
      }

      const analysedUser = exportIdentity.label || 'Mon compte';
      const generatedAt = new Date().toLocaleString('fr-FR');

      const summarySheet = workbook.addWorksheet('Synthese_UI');
      summarySheet.columns = [
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
      ];
      summarySheet.mergeCells('A1:F1');
      summarySheet.getCell('A1').value = 'Worklog CSE - Synthese 2025';
      summarySheet.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FF42583A' } };
      summarySheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
      summarySheet.getCell('A1').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF5FAEC' },
      };

      summarySheet.mergeCells('A2:C2');
      summarySheet.getCell('A2').value = `Utilisateur: ${analysedUser}`;
      summarySheet.getCell('A2').font = { bold: true, color: { argb: 'FF35532F' } };
      summarySheet.getCell('A2').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F8E6' },
      };
      summarySheet.mergeCells('D2:F2');
      summarySheet.getCell('D2').value = `Export: ${generatedAt}`;
      summarySheet.getCell('D2').font = { bold: true, color: { argb: 'FF35532F' } };
      summarySheet.getCell('D2').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F8E6' },
      };

      paintCard(
        summarySheet,
        1,
        4,
        'Heures travaillees',
        `${formatNumber(summary.workedHours)} h`,
        'Total des heures de travail en 2025',
        'FFF7FDF0'
      );
      paintCard(
        summarySheet,
        4,
        4,
        'Conges / absences',
        `${formatNumber(summary.leavesHours)} h`,
        `${formatNumber(summary.leavesDays)} jours`,
        'FFFFF8EE'
      );
      paintCard(
        summarySheet,
        1,
        9,
        'Taux bench',
        `${formatPercent(summary.benchRate)}`,
        `${formatNumber(summary.benchHours)} h sur ${BENCH_SCOPE_KEY}`,
        'FFF9F2EC'
      );
      paintCard(
        summarySheet,
        4,
        9,
        "Taux d'utilisation",
        `${formatPercent(summary.utilizationRate)}`,
        'Formule: 100% - taux bench',
        'FFEFF7F0'
      );

      summarySheet.mergeCells('A14:F14');
      summarySheet.getCell('A14').value = `Narratif bench: ${benchNarrative}`;
      summarySheet.getCell('A14').alignment = { wrapText: true, vertical: 'top' };
      summarySheet.getCell('A14').font = { color: { argb: 'FF4B6343' }, size: 10 };
      summarySheet.getCell('A14').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FBF4' },
      };
      summarySheet.getRow(1).height = 28;
      summarySheet.getRow(14).height = 36;
      summarySheet.views = [{ state: 'frozen', ySplit: 2 }];

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
      link.download = `worklog-cse-${exportIdentity.filePart}-${safeDate}.xlsx`;
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

  async function exportPdf() {
    if (!report || !leaves) {
      addToast("⚠️ Chargez d'abord les données 2025 avant d'exporter.", 'warn');
      return;
    }

    setIsExportingPdf(true);
    let printWindow = null;
    try {
      addToast('🧾 Préparation du PDF...', 'info');
      if (typeof window === 'undefined') {
        throw new Error('Export PDF indisponible dans ce contexte.');
      }
      printWindow = window.open('about:blank', '_blank');
      if (!printWindow || printWindow.closed) {
        throw new Error("Impossible d'ouvrir la fenêtre PDF. Vérifiez le blocage des popups pour ce site.");
      }

      const generatedAt = new Date().toLocaleString('fr-FR');
      const safeDate = new Date().toISOString().slice(0, 10);
      const docTitle = `worklog-cse-${exportIdentity.filePart}-${safeDate}.pdf`;
      const analysedUser = exportIdentity.label || 'Mon compte';

      const toRows = (items, headers, rowBuilder) => {
        if (!Array.isArray(items) || !items.length) {
          return `<p class="empty">Aucune donnée.</p>`;
        }
        const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
        const body = items.map((entry) => {
          const cols = rowBuilder(entry).map((cell) => `<td>${escapeHtml(cell)}</td>`).join('');
          return `<tr>${cols}</tr>`;
        }).join('');
        return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
      };

      const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(docTitle)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      --bg: #f7f5e9;
      --panel: #ffffff;
      --line: #d4dfc6;
      --text: #33452f;
      --muted: #5f7959;
      --title: #4b603f;
      --chip: #eef6e4;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Nunito", "Avenir Next", "Trebuchet MS", sans-serif;
      background: linear-gradient(180deg, #f7f5e9 0%, #fde8c8 45%, #dce9c4 100%);
      color: var(--text);
      line-height: 1.45;
    }
    .page {
      width: 100%;
      max-width: 1060px;
      margin: 0 auto;
      padding: 24px;
    }
    .panel {
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 12px;
    }
    h1 {
      margin: 0 0 6px;
      color: var(--title);
      font-size: 32px;
    }
    h2 {
      margin: 0 0 10px;
      color: var(--title);
      font-size: 20px;
    }
    h3 {
      margin: 12px 0 8px;
      color: #4f6341;
      font-size: 15px;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }
    .meta span {
      padding: 6px 10px;
      border-radius: 999px;
      background: var(--chip);
      border: 1px solid #cad8b6;
      font-size: 12px;
      color: #476042;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .card {
      border: 1px solid #d7e2cb;
      border-radius: 10px;
      padding: 10px;
      background: #fbfdf7;
    }
    .card strong {
      display: block;
      font-size: 12px;
      color: #5d7756;
    }
    .card p {
      margin: 6px 0 4px;
      font-size: 20px;
      font-weight: 700;
      color: #42593a;
    }
    .card small {
      color: #6c8467;
      font-size: 11px;
    }
    .narrative {
      margin-top: 10px;
      padding: 9px 10px;
      border-radius: 8px;
      border: 1px solid #d6e1c9;
      background: #f8fbf4;
      color: #4f6949;
      font-size: 13px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      font-size: 11px;
      background: #fff;
    }
    th, td {
      border: 1px solid #d8e2cc;
      padding: 6px 7px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #eef6e4;
      color: #445a3d;
      font-weight: 700;
    }
    .empty {
      margin: 0;
      color: #6d8169;
      font-size: 12px;
      font-style: italic;
    }
    .section-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }
    @media print {
      body { background: #fff; }
      .page { max-width: none; padding: 8mm; }
      .panel { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="panel">
      <h1>Worklog CSE - Export PDF 2025</h1>
      <div class="meta">
        <span>Utilisateur: ${escapeHtml(analysedUser)}</span>
        <span>Date export: ${escapeHtml(generatedAt)}</span>
        <span>Scope bench: ${escapeHtml(BENCH_SCOPE_KEY)}</span>
        <span>Scope congés: ${escapeHtml(LEAVE_SCOPE_LABEL)}</span>
      </div>
    </section>

    <section class="panel">
      <h2>Résumé</h2>
      <div class="cards">
        <article class="card">
          <strong>Heures travaillées</strong>
          <p>${escapeHtml(`${formatNumber(summary.workedHours)} h`)}</p>
          <small>Total des heures de travail en 2025.</small>
        </article>
        <article class="card">
          <strong>Congés / absences</strong>
          <p>${escapeHtml(`${formatNumber(summary.leavesHours)} h`)}</p>
          <small>${escapeHtml(`${formatNumber(summary.leavesDays)} jours`)}</small>
        </article>
        <article class="card">
          <strong>Taux bench</strong>
          <p>${escapeHtml(formatPercent(summary.benchRate))}</p>
          <small>${escapeHtml(`${formatNumber(summary.benchHours)} h sur ${BENCH_SCOPE_KEY}`)}</small>
        </article>
        <article class="card">
          <strong>Taux d'utilisation</strong>
          <p>${escapeHtml(formatPercent(summary.utilizationRate))}</p>
          <small>Formule: 100 % - taux bench.</small>
        </article>
      </div>
      <p class="narrative">${escapeHtml(benchNarrative)}</p>
    </section>

    <section class="panel">
      <h2>Heures par projet</h2>
      ${toRows(
        [...(report.projects || []), { projectKey: 'TOTAL', projectName: 'Activités 2025', hours: Number(report.totalHours || 0) }],
        ['Projet', 'Nom', 'Heures'],
        (project) => [project.projectKey, project.projectName, formatNumber(project.hours)]
      )}
    </section>

    <section class="panel">
      <h2>Détail bench (${escapeHtml(BENCH_SCOPE_KEY)})</h2>
      <div class="section-grid">
        <div>
          <h3>Répartition par type</h3>
          ${toRows(
            benchDetails?.issueTypeTotals || [],
            ["Type d'issue", 'Heures'],
            (entry) => [entry.issueType, formatNumber(entry.hours)]
          )}
        </div>
        <div>
          <h3>Sous-tâches bench</h3>
          ${toRows(
            benchDetails?.subtasks || [],
            ['Ticket', 'Type', 'Parent', 'Heures'],
            (issue) => [
              issue.issueKey,
              issue.issueType,
              issue.parentKey ? `${issue.parentKey} - ${issue.parentSummary}` : '-',
              formatNumber(issue.hours),
            ]
          )}
        </div>
        <div>
          <h3>Tous les tickets bench</h3>
          ${toRows(
            benchDetails?.issues || [],
            ['Ticket', 'Type', 'Parent', 'Résumé', 'Heures'],
            (issue) => [
              issue.issueKey,
              issue.issueType,
              issue.parentKey ? `${issue.parentKey} - ${issue.parentSummary}` : '-',
              issue.summary,
              formatNumber(issue.hours),
            ]
          )}
        </div>
        <div>
          <h3>Commentaires bench - thèmes</h3>
          ${toRows(
            benchCommentSummary?.themes || [],
            ['Thème', 'Heures', 'Saisies'],
            (theme) => [theme.label, formatNumber(theme.hours), String(theme.occurrences)]
          )}
        </div>
        <div>
          <h3>Commentaires bench - exemples</h3>
          ${toRows(
            benchCommentSummary?.highlights || [],
            ['Ticket', 'Heures', 'Commentaire'],
            (entry) => [entry.issueKey, formatNumber(entry.hours), entry.comment]
          )}
        </div>
      </div>
    </section>

    <section class="panel">
      <h2>Congés et absences (${escapeHtml(LEAVE_SCOPE_LABEL)})</h2>
      <div class="section-grid">
        <div>
          <h3>Répartition par type</h3>
          ${toRows(
            leavesDetails?.issueTypeTotals || [],
            ["Type d'issue", 'Heures'],
            (entry) => [entry.issueType, formatNumber(entry.hours)]
          )}
        </div>
        <div>
          <h3>Sous-tâches congés</h3>
          ${toRows(
            leavesDetails?.subtasks || [],
            ['Ticket', 'Type', 'Parent', 'Heures', 'Jours'],
            (issue) => [
              issue.issueKey,
              issue.issueType,
              issue.parentKey || '-',
              formatNumber(issue.hours),
              formatNumber(issue.days),
            ]
          )}
        </div>
        <div>
          <h3>Tous les tickets congés</h3>
          ${toRows(
            leaves?.issues || [],
            ['Ticket', 'Type', 'Statut', 'Parent', 'Résumé', 'Heures', 'Jours'],
            (issue) => [
              issue.issueKey,
              issue.issueType,
              issue.status,
              issue.parentKey || '-',
              issue.summary,
              formatNumber(issue.hours),
              formatNumber(issue.days),
            ]
          )}
        </div>
      </div>
    </section>
  </div>
</body>
</html>`;

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();

      const triggerPrint = () => {
        try {
          if (printWindow.closed) return;
          printWindow.focus();
          printWindow.print();
        } catch {
          // Keep a usable rendered page even if auto print cannot start.
        }
      };

      if (printWindow.document.readyState === 'complete') {
        window.setTimeout(triggerPrint, 220);
      } else {
        printWindow.addEventListener('load', () => {
          window.setTimeout(triggerPrint, 220);
        }, { once: true });
      }

      addToast(
        '✅ Vue PDF prête. Utilisez "Enregistrer en PDF" dans la fenêtre d’impression.',
        'success'
      );
    } catch (err) {
      if (printWindow && !printWindow.closed) {
        try {
          printWindow.close();
        } catch {
          // Ignore close errors.
        }
      }
      addToast(err.message || "❌ Impossible d'exporter le PDF.", 'error');
    } finally {
      setIsExportingPdf(false);
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
        <div
          ref={reportProgressRef}
          tabIndex="-1"
          className="glass data-progress reveal"
          role="status"
          aria-live="polite"
        >
          <div className="data-progress-top">
            <strong>{reportProgress.title || 'Progression en cours'}</strong>
            <span>{Math.round(reportProgress.value)}%</span>
          </div>
          <div
            className="data-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(clampPercent(reportProgress.value))}
            aria-label={reportProgress.ariaLabel || 'Progression en cours'}
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
                <div className="account-badge-head">
                  <AccountAvatar
                    src={analysisInfo.avatarUrl}
                    label={analysisInfo.displayName || analysisInfo.resolvedEmail}
                  />
                  <div className="account-badge-meta">
                    <strong>Compte analysé : {analysisInfo.resolvedEmail}</strong>
                    {analysisInfo.displayName ? (
                      <small>{analysisInfo.displayName}</small>
                    ) : null}
                  </div>
                </div>
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
                {hasLeavesHours ? (
                  <article className="summary-card">
                    <h4>🌴 Heures de congés</h4>
                    <p>{formatNumber(summary.leavesHours)} h</p>
                    <small>Soit {formatNumber(summary.leavesDays)} jours.</small>
                  </article>
                ) : null}
                {hasBenchHours ? (
                  <article className="summary-card">
                    <h4>🧱 Taux bench</h4>
                    <p>{formatPercent(summary.benchRate)}</p>
                    <small>
                      Calculé depuis {BENCH_SCOPE_KEY} ({formatNumber(summary.benchHours)} h).
                    </small>
                  </article>
                ) : null}
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
                  disabled={isExporting || isExportingPdf || isBusy || !report || !leaves}
                >
                  {isExporting ? 'Export Excel en cours...' : 'Exporter un fichier Excel (.xlsx)'}
                </button>
                <button
                  type="button"
                  className="neon-btn secondary"
                  onClick={exportPdf}
                  disabled={isExporting || isExportingPdf || isBusy || !report || !leaves}
                >
                  {isExportingPdf ? 'Préparation PDF...' : 'Exporter un PDF complet'}
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
              {!benchDetails || !benchDetails.issues?.length || !hasBenchHours ? (
                <p>
                  Aucun détail bench (&gt; 0h) pour le moment.
                </p>
              ) : (
                <>
                  <div className="meta-row">
                    <span>Tickets bench : {benchDetails.issueCount}</span>
                    <span>Total bench : {formatNumber(benchDetails.issueHours)} h</span>
                    {Number(benchDetails.subtaskCount || 0) > 0 ? (
                      <span>
                        Sous-tâches : {benchDetails.subtaskCount} ({formatNumber(benchDetails.subtaskHours)} h)
                      </span>
                    ) : null}
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

                    {benchDetails.subtasks?.length ? (
                      <details className="detail-block detail-disclosure">
                        <summary>
                          <span className="summary-title">🧩 Sous-tâches bench</span>
                          <span className="summary-meta">{benchDetails.subtasks.length} lignes</span>
                          <span className="summary-state" aria-hidden="true" />
                        </summary>
                        <div className="disclosure-content">
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
                        </div>
                      </details>
                    ) : null}
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
              {!leaves?.issues?.length || !hasLeavesHours ? (
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

                    {leavesDetails.subtasks?.length ? (
                      <details className="detail-block detail-disclosure">
                        <summary>
                          <span className="summary-title">🧩 Sous-tâches congés</span>
                          <span className="summary-meta">{leavesDetails.subtasks.length} lignes</span>
                          <span className="summary-state" aria-hidden="true" />
                        </summary>
                        <div className="disclosure-content">
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
                        </div>
                      </details>
                    ) : null}
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
