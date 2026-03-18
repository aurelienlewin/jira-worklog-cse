import express from 'express';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { constants as fsConstants, existsSync, readFileSync } from 'fs';
import { spawn } from 'child_process';
import readline from 'readline';
import { fileURLToPath, pathToFileURL } from 'url';

const app = express();
const API_PORT = Number(process.env.API_PORT || 8787);
const DEFAULT_TRACKER_URL = 'https://example.com';

function parseCliLaunchOptions(argv = process.argv.slice(2)) {
  const options = {
    token: '',
    userEmail: '',
    headless: false,
    exportPdf: false,
    exportXlsx: false,
    outputDir: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || '');
    if (!arg) continue;

    if (arg === '-t' || arg === '--token') {
      const raw = String(argv[index + 1] || '').trim();
      if (raw) {
        options.token = raw;
        index += 1;
      }
      continue;
    }

    if (arg.startsWith('--token=')) {
      options.token = String(arg.slice('--token='.length) || '').trim();
      continue;
    }

    if (arg === '-u' || arg === '--user') {
      const raw = String(argv[index + 1] || '').trim();
      if (raw) {
        options.userEmail = raw;
        index += 1;
      }
      continue;
    }

    if (arg.startsWith('--user=')) {
      options.userEmail = String(arg.slice('--user='.length) || '').trim();
      continue;
    }

    if (arg === '--headless' || arg === '--no-ui') {
      options.headless = true;
      continue;
    }

    if (arg === '--pdf') {
      options.exportPdf = true;
      continue;
    }

    if (arg === '--xls' || arg === '--xlsx') {
      options.exportXlsx = true;
      continue;
    }

    if (arg === '-o' || arg === '--output-dir') {
      const raw = String(argv[index + 1] || '').trim();
      if (raw) {
        options.outputDir = raw;
        index += 1;
      }
      continue;
    }

    if (arg.startsWith('--output-dir=')) {
      const raw = String(arg.slice('--output-dir='.length) || '').trim();
      if (raw) {
        options.outputDir = raw;
      }
    }
  }

  return options;
}

const CLI_LAUNCH_OPTIONS = parseCliLaunchOptions();

function parseDotenvLine(rawLine) {
  const line = String(rawLine || '').trim();
  if (!line || line.startsWith('#')) return null;

  const eq = line.indexOf('=');
  if (eq <= 0) return null;

  const key = line.slice(0, eq).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  let value = line.slice(eq + 1).trim();
  const hasQuotes = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
  if (hasQuotes) {
    value = value.slice(1, -1);
  } else {
    const hashIdx = value.indexOf('#');
    if (hashIdx >= 0) value = value.slice(0, hashIdx).trim();
  }

  return { key, value };
}

function loadEnvFile(filePath, options = {}) {
  if (!existsSync(filePath)) return;
  const override = Boolean(options.override);
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const parsed = parseDotenvLine(rawLine);
    if (!parsed) continue;
    if (override || process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value;
    }
  }
}

function loadLocalEnvConfig() {
  const cwd = process.cwd();
  loadEnvFile(path.join(cwd, '.env'));
  loadEnvFile(path.join(cwd, '.env.local'), { override: true });
}

function isPlaceholderTrackerUrl(url) {
  const normalized = String(url || '')
    .trim()
    .replace(/\/+$/, '')
    .toLowerCase();
  return !normalized || normalized === DEFAULT_TRACKER_URL || normalized.includes('example.com');
}

loadLocalEnvConfig();

const LEGACY_URL_ENV_KEY = String.fromCharCode(74, 73, 82, 65, 95, 85, 82, 76);
const LEGACY_TOKEN_ENV_KEY = String.fromCharCode(
  74, 73, 82, 65, 95, 80, 69, 82, 83, 79, 78, 65, 76, 95, 84, 79, 75, 69, 78
);
const LEGACY_TIMEOUT_ENV_KEY = String.fromCharCode(74, 73, 82, 65, 95, 84, 73, 77, 69, 79, 85, 84);
const LEGACY_AGILE_TOOLSET = String.fromCharCode(106, 105, 114, 97, 95, 97, 103, 105, 108, 101);
const LEGACY_MCP_PACKAGE = String.fromCharCode(
  109, 99, 112, 45, 97, 116, 108, 97, 115, 115, 105, 97, 110, 64, 108, 97, 116, 101, 115, 116
);

const TRACKER_URL = String(process.env.ISSUE_TRACKER_URL || process.env.TRACKER_URL || process.env[LEGACY_URL_ENV_KEY] || DEFAULT_TRACKER_URL)
  .trim()
  .replace(/\/+$/, '');
const WORKLOG_START = new Date('2025-01-01T00:00:00.000Z');
const WORKLOG_END = new Date('2025-12-31T23:59:59.999Z');
const LEAVE_ANCHOR_ISSUE_KEY = String(process.env.LEAVE_ANCHOR_ISSUE_KEY || 'ABS-1').trim().toUpperCase();
const WORKING_DAY_HOURS = Number(process.env.WORKING_DAY_HOURS || 7);
const MAX_COMMENT_SAMPLES_PER_PROJECT = Number(process.env.MAX_COMMENT_SAMPLES_PER_PROJECT || 120);
const CODEX_SUMMARY_TIMEOUT_MS = Number(process.env.CODEX_SUMMARY_TIMEOUT_MS || 45000);
const AVATAR_FETCH_TIMEOUT_MS = Number(process.env.AVATAR_FETCH_TIMEOUT_MS || 8000);
const AVATAR_MAX_BYTES = Number(process.env.AVATAR_MAX_BYTES || 256 * 1024);
const BENCH_SCOPE_KEY = String(process.env.BENCH_SCOPE_KEY || 'BENCH').trim().toUpperCase();
const ROEMO_SCOPE_KEY = String(process.env.ROEMO_SCOPE_KEY || 'ROEMO').trim().toUpperCase();
const LEAVE_SCOPE_LABEL = String(
  process.env.LEAVE_SCOPE_LABEL ||
  `${(LEAVE_ANCHOR_ISSUE_KEY.split('-')[0] || 'ABS').toUpperCase()}-*`
).trim();
const HAS_DISTINCT_ROEMO_SCOPE = Boolean(ROEMO_SCOPE_KEY && ROEMO_SCOPE_KEY !== BENCH_SCOPE_KEY);
const CODEX_SUMMARY_PROJECT_KEYS = [...new Set([BENCH_SCOPE_KEY, ROEMO_SCOPE_KEY])].filter(Boolean);
const DEFAULT_DETAILED_PROJECT_KEYS = [];
const CONFIG_PATH = path.join(os.homedir(), '.codex', 'config.toml');
const MCP_SECTION = String(process.env.MCP_SERVER_SECTION || 'issue-tracker').trim();
const MCP_COMMAND = String(process.env.MCP_COMMAND || 'uvx').trim();
const MCP_PACKAGE = String(process.env.MCP_PACKAGE || LEGACY_MCP_PACKAGE).trim();
const MCP_TOOLSETS = String(process.env.MCP_TOOLSETS || `default,${LEGACY_AGILE_TOOLSET}`).trim();
const MCP_URL_ENV_KEY = String(process.env.MCP_URL_ENV_KEY || LEGACY_URL_ENV_KEY).trim();
const MCP_TOKEN_ENV_KEY = String(process.env.MCP_TOKEN_ENV_KEY || LEGACY_TOKEN_ENV_KEY).trim();
const MCP_TIMEOUT_ENV_KEY = String(process.env.MCP_TIMEOUT_ENV_KEY || LEGACY_TIMEOUT_ENV_KEY).trim();
const MCP_PROTOCOL_VERSION = String(process.env.MCP_PROTOCOL_VERSION || '2025-06-18').trim();
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SERVER_DIR, '..');
const CLIENT_DIST_DIR = path.join(ROOT_DIR, 'dist');
const CLIENT_DIST_INDEX = path.join(CLIENT_DIST_DIR, 'index.html');
const SERVER_DIST_ENTRY = path.join(ROOT_DIR, 'dist', 'server', 'entry-server.js');

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

function shellEscapeToml(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function tomlArray(values) {
  return `[${values.map((value) => `"${shellEscapeToml(value)}"`).join(', ')}]`;
}

function buildMcpEnvInline(token) {
  const pairs = [
    [MCP_URL_ENV_KEY, TRACKER_URL],
    [MCP_TOKEN_ENV_KEY, token.trim()],
    ['MCP_LOGGING_STDOUT', 'false'],
    ['MCP_VERBOSE', 'false'],
    ['MCP_VERY_VERBOSE', 'false'],
    [MCP_TIMEOUT_ENV_KEY, '120'],
    ['UV_CACHE_DIR', '/tmp/uv-cache'],
  ];

  return `{ ${pairs.map(([key, value]) => `${key} = "${shellEscapeToml(value)}"`).join(', ')} }`;
}

function makeMcpBlock(token) {
  const args = [MCP_PACKAGE, '--transport', 'stdio', '--toolsets', MCP_TOOLSETS];
  return (
    `[mcp_servers.${MCP_SECTION}]\n` +
    `command = "${shellEscapeToml(MCP_COMMAND)}"\n` +
    `args = ${tomlArray(args)}\n` +
    `env = ${buildMcpEnvInline(token)}\n` +
    `enabled = true\n` +
    `startup_timeout_sec = 45\n`
  );
}

function upsertMcpBlock(configText, token) {
  const newBlock = makeMcpBlock(token);
  const blockRegex = new RegExp(
    `\\[mcp_servers\\.${MCP_SECTION.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\][\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`,
    'm'
  );

  if (blockRegex.test(configText)) {
    return configText.replace(blockRegex, newBlock.trimEnd());
  }

  const featuresIndex = configText.indexOf('\n[features]');
  if (featuresIndex >= 0) {
    return `${configText.slice(0, featuresIndex)}\n\n${newBlock}${configText.slice(featuresIndex)}`;
  }

  return `${configText.replace(/\s*$/, '')}\n\n${newBlock}`;
}

function extractTokenFromConfig(configText) {
  const blockRegex = new RegExp(
    `\\[mcp_servers\\.${MCP_SECTION.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\][\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`,
    'm'
  );
  const block = configText.match(blockRegex)?.[0] || '';
  const tokenKeyPattern = MCP_TOKEN_ENV_KEY.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return block.match(new RegExp(`${tokenKeyPattern}\\s*=\\s*"([^"]+)"`))?.[1] || '';
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timeoutId;
    let killedByTimeout = false;

    child.stdout.on('data', (d) => {
      stdout += String(d);
    });
    child.stderr.on('data', (d) => {
      stderr += String(d);
    });

    if (options.timeoutMs) {
      timeoutId = setTimeout(() => {
        killedByTimeout = true;
        child.kill('SIGKILL');
      }, options.timeoutMs);
    }

    child.on('close', (code, signal) => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve({ code, signal, stdout, stderr, killedByTimeout });
    });

    child.on('error', (err) => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve({
        code: -1,
        signal: null,
        stdout,
        stderr: `${stderr}\n${err.message}`,
        killedByTimeout,
      });
    });
  });
}

async function setupViaCodexExec(token) {
  const args = [MCP_PACKAGE, '--transport', 'stdio', '--toolsets', MCP_TOOLSETS];
  const prompt = [
    'You are running locally on macOS.',
    `Update ~/.codex/config.toml for [mcp_servers.${MCP_SECTION}] using:`,
    `- command = ${MCP_COMMAND}`,
    `- args = ${JSON.stringify(args)}`,
    `- ${MCP_URL_ENV_KEY} = "${TRACKER_URL}"`,
    `- ${MCP_TOKEN_ENV_KEY} = "${token}"`,
    '- MCP_LOGGING_STDOUT = "false"',
    '- MCP_VERBOSE = "false"',
    '- MCP_VERY_VERBOSE = "false"',
    `- ${MCP_TIMEOUT_ENV_KEY} = "120"`,
    '- UV_CACHE_DIR = "/tmp/uv-cache"',
    '- enabled = true',
    '- startup_timeout_sec = 45',
    'Do not ask questions. Apply changes directly. Reply with SETUP_OK only.',
  ].join('\n');

  return runCommand(
    'codex',
    ['exec', '--skip-git-repo-check', '-C', process.cwd(), prompt],
    {
      timeoutMs: 120000,
      env: {
        CODEX_OTEL_ENABLED: 'false',
      },
    }
  );
}

async function setupViaLocalPatch(token) {
  const codexDir = path.dirname(CONFIG_PATH);
  await fs.mkdir(codexDir, { recursive: true });

  const existing = (await fileExists(CONFIG_PATH)) ? await fs.readFile(CONFIG_PATH, 'utf8') : '';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  if (existing.trim()) {
    const backupPath = `${CONFIG_PATH}.bak.${timestamp}`;
    await fs.writeFile(backupPath, existing, 'utf8');
  }

  const updated = upsertMcpBlock(existing || '', token);
  await fs.writeFile(CONFIG_PATH, updated, 'utf8');
}

async function getTokenFromRequestOrConfig(tokenFromBody) {
  if (tokenFromBody && String(tokenFromBody).trim()) {
    return String(tokenFromBody).trim();
  }

  if (!(await fileExists(CONFIG_PATH))) return '';
  const text = await fs.readFile(CONFIG_PATH, 'utf8');
  return extractTokenFromConfig(text);
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

async function runMcpHandshake(token) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      MCP_LOGGING_STDOUT: 'false',
      MCP_VERBOSE: 'false',
      MCP_VERY_VERBOSE: 'false',
      UV_CACHE_DIR: '/tmp/uv-cache',
    };
    env[MCP_URL_ENV_KEY] = TRACKER_URL;
    env[MCP_TOKEN_ENV_KEY] = token;
    env[MCP_TIMEOUT_ENV_KEY] = '120';

    const args = [MCP_PACKAGE, '--transport', 'stdio', '--toolsets', MCP_TOOLSETS];

    const child = spawn(
      MCP_COMMAND,
      args,
      { env, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    const startedAt = Date.now();
    let stderr = '';
    let initOk = false;
    let done = false;
    let negotiatedProtocolVersion = '';

    const rl = readline.createInterface({ input: child.stdout });

    const cleanup = (result) => {
      if (done) return;
      done = true;
      try {
        rl.close();
      } catch {}
      if (!child.killed) child.kill('SIGKILL');
      resolve(result);
    };

    const timeout = setTimeout(() => {
      cleanup({
        ok: false,
        initSeconds: null,
        message: 'La vérification de la connexion a pris trop de temps',
        stderr: stderr.slice(-1000),
      });
    }, 25000);

    child.stderr.on('data', (d) => {
      stderr += String(d);
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      cleanup({
        ok: false,
        initSeconds: null,
        message: err.message,
        stderr: stderr.slice(-1000),
      });
    });

    child.on('exit', (code, signal) => {
      if (done) return;
      clearTimeout(timeout);
      cleanup({
        ok: false,
        initSeconds: null,
        message: `Processus MCP terminé prématurément (code=${code ?? 'null'}, signal=${signal || 'none'}).`,
        stderr: stderr.slice(-1000),
      });
    });

    rl.on('line', (line) => {
      const msg = parseJsonLine(line);
      if (!msg) return;

      if (msg.id === 1 && msg.error && !initOk) {
        clearTimeout(timeout);
        const initSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(2));
        cleanup({
          ok: false,
          initSeconds,
          message: `Échec MCP initialize: ${msg.error?.message || 'erreur inconnue'}`,
          stderr: stderr.slice(-1000),
        });
        return;
      }

      if (msg.id === 1 && msg.result && !initOk) {
        initOk = true;
        negotiatedProtocolVersion = String(msg.result?.protocolVersion || '').trim();
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);
        return;
      }

      if (msg.id === 2 && msg.error) {
        clearTimeout(timeout);
        const initSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(2));
        cleanup({
          ok: false,
          initSeconds,
          message: `Échec MCP tools/list: ${msg.error?.message || 'erreur inconnue'}`,
          stderr: stderr.slice(-1000),
        });
        return;
      }

      if (msg.id === 2 && msg.result) {
        clearTimeout(timeout);
        const initSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(2));
        const toolCount = Array.isArray(msg.result?.tools) ? msg.result.tools.length : 0;
        const protocolLabel = negotiatedProtocolVersion
          ? ` | protocole ${negotiatedProtocolVersion}`
          : '';
        cleanup({
          ok: initOk,
          initSeconds,
          message: `Fonctions disponibles: ${toolCount}${protocolLabel}`,
          stderr: stderr.slice(-1000),
        });
      }
    });

    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'neon-webapp', version: '1.0.0' },
        },
      })}\n`
    );
  });
}

async function trackerFetchJson(token, endpoint) {
  if (isPlaceholderTrackerUrl(TRACKER_URL)) {
    throw new Error(
      `Configuration manquante: ISSUE_TRACKER_URL/TRACKER_URL pointe vers "${TRACKER_URL}". ` +
      "Renseignez l'URL réelle de votre instance dans .env.local puis redémarrez l'API."
    );
  }

  const url = `${TRACKER_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    const error = new Error(`API ${res.status} sur ${endpoint}: ${body.slice(0, 180)}`);
    error.status = res.status;
    error.endpoint = endpoint;
    throw error;
  }

  return res.json();
}

function makeApiPathCandidates(pathWithoutPrefix) {
  const cleanPath = String(pathWithoutPrefix || '').replace(/^\/+/, '');
  return [
    `/rest/api/2/${cleanPath}`,
    `/rest/api/3/${cleanPath}`,
    `/rest/api/latest/${cleanPath}`,
  ];
}

async function trackerFetchFirstAvailable(token, endpoints) {
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      return await trackerFetchJson(token, endpoint);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Erreur API: aucun endpoint disponible.');
}

async function fetchCurrentUser(token) {
  return trackerFetchFirstAvailable(token, makeApiPathCandidates('myself'));
}

async function fetchSearchPage(token, jql, startAt, maxResults, fields) {
  const params =
    `jql=${encodeURIComponent(jql)}` +
    `&startAt=${startAt}` +
    `&maxResults=${maxResults}` +
    `&fields=${encodeURIComponent(fields)}`;
  const endpoints = makeApiPathCandidates(`search?${params}`);
  return trackerFetchFirstAvailable(token, endpoints);
}

async function fetchIssueWorklogPage(token, issueKey, startAt, maxResults) {
  const safeIssueKey = encodeURIComponent(issueKey);
  const endpoints = makeApiPathCandidates(
    `issue/${safeIssueKey}/worklog?startAt=${startAt}&maxResults=${maxResults}`
  );
  return trackerFetchFirstAvailable(token, endpoints);
}

function inDateRange(dateValue) {
  if (!dateValue) return false;
  const dt = new Date(dateValue);
  if (Number.isNaN(dt.getTime())) return false;
  return dt >= WORKLOG_START && dt <= WORKLOG_END;
}

function collectNormalizedIdentities(user) {
  if (!user || typeof user !== 'object') return [];
  const rawValues = [
    user.name,
    user.key,
    user.emailAddress,
    user.accountId,
    user.displayName,
    user.self,
  ];
  const seen = new Set();
  const values = [];

  for (const raw of rawValues) {
    const normalized = String(raw || '').trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    values.push(normalized);
  }

  return values;
}

class IdentityMatcher {
  constructor(user) {
    this.identities = new Set(collectNormalizedIdentities(user));
  }

  matches(user) {
    if (!user || !this.identities.size) return false;
    const candidates = collectNormalizedIdentities(user);
    for (const candidate of candidates) {
      if (this.identities.has(candidate)) return true;
    }
    return false;
  }
}

class IssueMetricsAccumulator {
  constructor() {
    this.totalSeconds = 0;
    this.subtaskSeconds = 0;
    this.subtasks = [];
    this.issueTypeSeconds = new Map();
  }

  add(issue) {
    const seconds = Number(issue?.seconds || 0);
    if (!seconds) return;

    this.totalSeconds += seconds;
    const issueType = String(issue?.issueType || 'Issue');
    this.issueTypeSeconds.set(issueType, (this.issueTypeSeconds.get(issueType) || 0) + seconds);

    if (issue?.isSubtask) {
      this.subtasks.push(issue);
      this.subtaskSeconds += seconds;
    }
  }

  toIssueTypeTotals() {
    return [...this.issueTypeSeconds.entries()]
      .map(([issueType, seconds]) => ({
        issueType,
        hours: Number((seconds / 3600).toFixed(2)),
      }))
      .sort((a, b) => b.hours - a.hours);
  }
}

function sameUser(author, me) {
  if (!author || !me) return false;
  if (me instanceof IdentityMatcher) return me.matches(author);
  if (author instanceof IdentityMatcher) return author.matches(me);
  return new IdentityMatcher(me).matches(author);
}

async function mapLimit(items, limit, worker) {
  const results = [];
  let index = 0;

  async function run() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function searchAllIssuesByJql(token, jql, fields, maxResults = 100) {
  const allIssues = [];
  let startAt = 0;

  while (true) {
    const page = await fetchSearchPage(token, jql, startAt, maxResults, fields);

    const issues = page.issues || [];
    allIssues.push(...issues);
    startAt += issues.length;

    if (startAt >= (page.total || 0) || issues.length === 0) break;
  }

  return allIssues;
}

function escapeJqlString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function searchIssuesByJqlSafe(token, jql, fields) {
  try {
    const issues = await searchAllIssuesByJql(token, jql, fields);
    return { ok: true, issues, error: '' };
  } catch (err) {
    return { ok: false, issues: [], error: err?.message || 'Erreur JQL' };
  }
}

function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeAvatarUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^data:image\//i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('/')) return `${TRACKER_URL}${raw}`;
  try {
    return new URL(raw, `${TRACKER_URL}/`).toString();
  } catch {
    return raw;
  }
}

function avatarSizeScore(key) {
  const match = String(key || '').match(/(\d+)\s*x\s*(\d+)/i);
  if (!match) return 0;
  return Number(match[1] || 0) * Number(match[2] || 0);
}

function extractAvatarCandidates(user) {
  if (!user || typeof user !== 'object') return [];
  const avatars = user.avatarUrls && typeof user.avatarUrls === 'object'
    ? user.avatarUrls
    : {};
  const avatarEntries = Object.entries(avatars)
    .sort((left, right) => avatarSizeScore(right[0]) - avatarSizeScore(left[0]))
    .map(([, value]) => normalizeAvatarUrl(value));
  return uniqueNonEmpty([
    ...avatarEntries,
    normalizeAvatarUrl(user.avatarUrl),
  ]);
}

async function fetchAvatarAsDataUrl(token, url) {
  const source = normalizeAvatarUrl(url);
  if (!/^https?:\/\//i.test(source)) return '';
  const timeoutMs = Math.max(1200, AVATAR_FETCH_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { Accept: 'image/*' };

  try {
    const sourceUrl = new URL(source);
    const trackerOrigin = new URL(TRACKER_URL).origin;
    if (sourceUrl.origin === trackerOrigin) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // Keep anonymous fetch for malformed URLs.
  }

  try {
    const response = await fetch(source, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers,
    });
    if (!response.ok) return '';

    const contentType = String(response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!contentType.startsWith('image/')) return '';

    const lengthHeader = Number(response.headers.get('content-length') || 0);
    if (Number.isFinite(lengthHeader) && lengthHeader > AVATAR_MAX_BYTES) return '';

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > AVATAR_MAX_BYTES) return '';

    return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveUserAvatar(token, user) {
  const candidates = extractAvatarCandidates(user);
  const avatarUrl = candidates[0] || null;

  for (const candidate of candidates) {
    const avatarDataUrl = await fetchAvatarAsDataUrl(token, candidate);
    if (avatarDataUrl) {
      return { avatarUrl, avatarDataUrl };
    }
  }

  return { avatarUrl, avatarDataUrl: null };
}

function extractUserAvatarUrl(user) {
  const candidates = extractAvatarCandidates(user);
  return candidates[0] || null;
}

function normalizeTextForMatch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeTextForDisplay(value) {
  return String(value || '')
    .replace(/\r/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function flattenAdfNode(node, sink) {
  if (!node) return;
  if (typeof node === 'string') {
    sink.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) flattenAdfNode(child, sink);
    return;
  }
  if (typeof node === 'object') {
    if (typeof node.text === 'string') {
      sink.push(node.text);
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) flattenAdfNode(child, sink);
    }
  }
}

function extractWorklogCommentText(comment) {
  if (!comment) return '';
  if (typeof comment === 'string') return normalizeTextForDisplay(comment);
  const chunks = [];
  flattenAdfNode(comment, chunks);
  return normalizeTextForDisplay(chunks.join(' '));
}

const BENCH_THEME_RULES = [
  {
    label: 'Support interne et aide aux collègues',
    keywords: ['support', 'help', 'aide', 'entraide', 'peer', 'coach', 'accompagnement', 'mentorat'],
  },
  {
    label: 'Formation, montée en compétences',
    keywords: ['formation', 'learning', 'apprentissage', 'certification', 'training', 'upskill', 'veille'],
  },
  {
    label: 'Documentation et capitalisation',
    keywords: ['documentation', 'doc', 'wiki', 'readme', 'guide', 'process', 'template', 'knowledge'],
  },
  {
    label: 'Avant-vente, cadrage, préparation mission',
    keywords: ['presales', 'pre-sales', 'avantvente', 'avant-vente', 'proposal', 'estimation', 'cadrage', 'discovery'],
  },
  {
    label: 'Ops internes et coordination',
    keywords: ['meeting', 'sync', 'coordination', 'planification', 'planning', 'retro', 'standup', 'admin'],
  },
];

function summarizeBenchCommentsHeuristic(commentEntries, projectKey = '') {
  const normalizedProjectKey = String(projectKey || '').trim().toUpperCase();
  const projectLabel = normalizedProjectKey || 'ce projet';
  const validComments = (commentEntries || [])
    .filter((entry) => Number(entry.seconds || 0) > 0)
    .map((entry) => ({
      ...entry,
      comment: normalizeTextForDisplay(entry.comment),
    }))
    .filter((entry) => entry.comment);

  if (!validComments.length) {
    return {
      message: `Aucun commentaire exploitable n'a été trouvé pour ${projectLabel} dans vos saisies 2025.`,
      commentedWorklogs: 0,
      commentedHours: 0,
      themes: [],
      highlights: [],
      source: 'heuristic',
    };
  }

  const totalSeconds = validComments.reduce((sum, entry) => sum + Number(entry.seconds || 0), 0);
  const themeMap = new Map();
  const uniqueByText = new Set();
  const highlights = [];

  for (const entry of validComments) {
    const normalized = normalizeTextForMatch(entry.comment);
    let matchedTheme = false;

    for (const rule of BENCH_THEME_RULES) {
      const matches = rule.keywords.some((kw) => normalized.includes(normalizeTextForMatch(kw)));
      if (!matches) continue;
      const current = themeMap.get(rule.label) || { seconds: 0, occurrences: 0 };
      current.seconds += Number(entry.seconds || 0);
      current.occurrences += 1;
      themeMap.set(rule.label, current);
      matchedTheme = true;
    }

    if (!matchedTheme) {
      const current = themeMap.get('Autres activités projet') || { seconds: 0, occurrences: 0 };
      current.seconds += Number(entry.seconds || 0);
      current.occurrences += 1;
      themeMap.set('Autres activités projet', current);
    }

    const dedupeKey = normalizeTextForMatch(entry.comment);
    if (!dedupeKey || uniqueByText.has(dedupeKey)) continue;
    uniqueByText.add(dedupeKey);
    if (highlights.length < 5) {
      highlights.push({
        issueKey: entry.issueKey,
        hours: Number((Number(entry.seconds || 0) / 3600).toFixed(2)),
        comment: entry.comment.slice(0, 220),
      });
    }
  }

  const themes = [...themeMap.entries()]
    .map(([label, value]) => ({
      label,
      hours: Number((Number(value.seconds || 0) / 3600).toFixed(2)),
      occurrences: Number(value.occurrences || 0),
    }))
    .sort((a, b) => b.hours - a.hours);

  const topThemes = themes.slice(0, 3).map((theme) => `${theme.label} (${theme.hours} h)`);
  const message = topThemes.length
    ? `Sur ${projectLabel}, vos commentaires parlent surtout de ${topThemes.join(', ')}.`
    : `Vos commentaires ${projectLabel} existent, mais aucun thème dominant n'a été détecté.`;

  return {
    message,
    commentedWorklogs: validComments.length,
    commentedHours: Number((totalSeconds / 3600).toFixed(2)),
    themes,
    highlights,
    source: 'heuristic',
  };
}

function safeJsonObjectFromText(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {}

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first < 0 || last <= first) return null;
  const candidate = text.slice(first, last + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function normalizeCodexThemes(themes) {
  if (!Array.isArray(themes)) return [];
  return themes
    .map((theme) => ({
      label: String(theme?.label || '').trim(),
      hours: Number(theme?.hours || 0),
      occurrences: Number(theme?.occurrences || 0),
    }))
    .filter((theme) => theme.label)
    .map((theme) => ({
      ...theme,
      hours: Number(Number(theme.hours || 0).toFixed(2)),
      occurrences: Number.isFinite(theme.occurrences) && theme.occurrences > 0
        ? Math.round(theme.occurrences)
        : 0,
    }));
}

function normalizeCodexHighlights(highlights) {
  if (!Array.isArray(highlights)) return [];
  return highlights
    .map((entry) => ({
      issueKey: String(entry?.issueKey || '').trim(),
      hours: Number(entry?.hours || 0),
      comment: normalizeTextForDisplay(entry?.comment || ''),
    }))
    .filter((entry) => entry.issueKey && entry.comment)
    .map((entry) => ({
      ...entry,
      hours: Number(Number(entry.hours || 0).toFixed(2)),
      comment: entry.comment.slice(0, 220),
    }));
}

function buildCodexBenchPrompt(projectKey, comments, heuristicSummary) {
  const compactComments = (comments || [])
    .slice(0, 40)
    .map((entry, index) => {
      const started = entry.started ? String(entry.started).slice(0, 10) : 'date inconnue';
      const hours = Number((Number(entry.seconds || 0) / 3600).toFixed(2));
      return `${index + 1}. ${entry.issueKey} | ${started} | ${hours} h | ${entry.comment}`;
    })
    .join('\n');

  const context = [
    `Projet: ${projectKey}`,
    `Saisies commentées: ${heuristicSummary.commentedWorklogs}`,
    `Heures commentées: ${heuristicSummary.commentedHours}`,
  ].join('\n');

  return [
    'Tu es Codex. Tu aides une personne à expliquer clairement son activité projet en français.',
    `Objectif: résumer le type d'activités réellement décrit pour le projet ${projectKey} dans les commentaires ci-dessous.`,
    'Contraintes:',
    '- Français simple, concret, humain, sans jargon technique.',
    '- Pas de jugement, pas de spéculation.',
    '- Résume seulement ce qui est présent dans les commentaires.',
    '- Réponds UNIQUEMENT en JSON strict.',
    'Format JSON attendu:',
    '{"message":"string","themes":[{"label":"string","hours":0,"occurrences":0}],"highlights":[{"issueKey":"PROJECT-1","hours":0,"comment":"string"}]}',
    '',
    'Contexte:',
    context,
    '',
    'Commentaires projet:',
    compactComments || '(aucun commentaire exploitable)',
  ].join('\n');
}

async function summarizeBenchCommentsWithCodex(projectKey, commentEntries) {
  const heuristic = summarizeBenchCommentsHeuristic(commentEntries, projectKey);
  if (!heuristic.commentedWorklogs) return heuristic;

  const sortedEntries = [...(commentEntries || [])]
    .filter((entry) => normalizeTextForDisplay(entry.comment))
    .sort((a, b) => {
      const right = new Date(b.started || 0).getTime();
      const left = new Date(a.started || 0).getTime();
      return right - left;
    });

  const prompt = buildCodexBenchPrompt(projectKey, sortedEntries, heuristic);
  const result = await runCommand(
    'codex',
    ['exec', '--skip-git-repo-check', '-C', process.cwd(), prompt],
    {
      timeoutMs: CODEX_SUMMARY_TIMEOUT_MS,
      env: {
        CODEX_OTEL_ENABLED: 'false',
      },
    }
  );

  if (result.code !== 0) {
    return {
      ...heuristic,
      source: 'heuristic_fallback',
    };
  }

  const parsed = safeJsonObjectFromText(result.stdout);
  if (!parsed || typeof parsed !== 'object') {
    return {
      ...heuristic,
      source: 'heuristic_fallback',
    };
  }

  const parsedMessage = normalizeTextForDisplay(parsed.message || '');
  const parsedThemes = normalizeCodexThemes(parsed.themes);
  const parsedHighlights = normalizeCodexHighlights(parsed.highlights);

  return {
    message: parsedMessage || heuristic.message,
    commentedWorklogs: heuristic.commentedWorklogs,
    commentedHours: heuristic.commentedHours,
    themes: parsedThemes.length ? parsedThemes : heuristic.themes,
    highlights: parsedHighlights.length ? parsedHighlights : heuristic.highlights,
    source: 'codex_exec',
  };
}

function extractLeaveTargetFromComment(comment) {
  const text = extractWorklogCommentText(comment);
  const match = text.match(/Leave Day record for user\s*:\s*([^,]+)/i);
  return match?.[1]?.trim() || '';
}

function makeLeaveUserMatchers(userContext) {
  const target = userContext?.targetUser || {};
  const fullNameFromEmail = String(target.emailAddress || '')
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .trim();

  const candidates = uniqueNonEmpty([
    target.displayName,
    target.name,
    target.emailAddress,
    userContext?.requestedEmail,
    fullNameFromEmail,
  ]).map((value) => normalizeTextForMatch(value));

  return candidates.filter(Boolean);
}

function isWorklogForLeaveTarget(worklog, userContext, matchTokens, targetMatcher = null) {
  if (sameUser(worklog?.author, targetMatcher || userContext?.targetMatcher || userContext?.targetUser)) return true;
  const leaveUserName = extractLeaveTargetFromComment(worklog?.comment);
  if (!leaveUserName) return false;
  const normalized = normalizeTextForMatch(leaveUserName);
  if (!normalized) return false;
  return matchTokens.some((token) => normalized.includes(token) || token.includes(normalized));
}

function uniqueNonEmpty(values) {
  return [...new Set((values || []).map((v) => String(v || '').trim()).filter(Boolean))];
}

async function searchUsersSafe(token, endpoint) {
  try {
    const users = await trackerFetchJson(token, endpoint);
    if (Array.isArray(users)) return users;
    if (Array.isArray(users?.users)) return users.users;
    if (Array.isArray(users?.values)) return users.values;
    if (users && typeof users === 'object' && users.accountId) return [users];
    return [];
  } catch {
    return [];
  }
}

function dedupeUsers(users) {
  const seen = new Set();
  const deduped = [];

  for (const user of users || []) {
    const key = normalizeIdentity(user?.accountId || user?.emailAddress || user?.name || user?.key || user?.displayName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(user);
  }

  return deduped;
}

async function findUsersByEmail(token, email) {
  const normalized = String(email || '').trim();
  if (!normalized) return [];
  const localPart = normalized.includes('@') ? normalized.split('@')[0] : '';
  const searchQueries = uniqueNonEmpty([normalized, localPart]);
  const searchEndpoints = [];

  for (const query of searchQueries) {
    const encoded = encodeURIComponent(query);
    searchEndpoints.push(
      ...makeApiPathCandidates(`user/search?query=${encoded}`),
      ...makeApiPathCandidates(`user/picker?query=${encoded}`),
      ...makeApiPathCandidates(`user/search/query?query=${encoded}`),
      ...makeApiPathCandidates(`user/search?username=${encoded}`)
    );
  }

  const encodedIdentity = encodeURIComponent(normalized);
  searchEndpoints.push(...makeApiPathCandidates(`user?accountId=${encodedIdentity}`));
  const allUsers = [];

  for (const endpoint of uniqueNonEmpty(searchEndpoints)) {
    const users = await searchUsersSafe(token, endpoint);
    allUsers.push(...users);
  }

  return dedupeUsers(allUsers);
}

function pickBestUserMatch(users, requestedEmail) {
  if (!users.length) return null;
  const target = normalizeIdentity(requestedEmail);
  const exact = users.find((user) => normalizeIdentity(user?.emailAddress) === target);
  if (exact) return exact;
  const byIdentity = users.find((user) => {
    const identities = uniqueNonEmpty([user?.accountId, user?.name, user?.key, user?.emailAddress, user?.displayName]);
    return identities.some((value) => normalizeIdentity(value) === target);
  });
  return byIdentity || users[0];
}

function buildAuthorScopes(targetUser, me) {
  const scopes = [];
  if (sameUser(targetUser, me)) {
    scopes.push('worklogAuthor = currentUser()');
  }

  const identifiers = uniqueNonEmpty([
    targetUser?.accountId,
    targetUser?.name,
    targetUser?.key,
    targetUser?.emailAddress,
  ]);
  for (const identifier of identifiers) {
    scopes.push(`worklogAuthor = "${escapeJqlString(identifier)}"`);
  }

  return uniqueNonEmpty(scopes);
}

async function resolveTargetUser(token, requestedEmail) {
  const me = await fetchCurrentUser(token);
  const meMatcher = new IdentityMatcher(me);
  const email = String(requestedEmail || '').trim();

  if (!email) {
    return {
      me,
      targetUser: me,
      meMatcher,
      targetMatcher: meMatcher,
      authorScopes: ['worklogAuthor = currentUser()'],
      notes: [],
      mode: 'current',
      requestedEmail: '',
    };
  }

  const meMatchesEmail = uniqueNonEmpty([
    me?.emailAddress,
    me?.accountId,
    me?.name,
    me?.key,
    me?.displayName,
  ]).some((value) => normalizeIdentity(value) === normalizeIdentity(email));

  let targetUser = meMatchesEmail ? me : null;
  const notes = [];

  if (!targetUser) {
    const mergedUsers = await findUsersByEmail(token, email);
    targetUser = pickBestUserMatch(mergedUsers, email);
  }

  if (!targetUser) {
    notes.push(
      "Adresse e-mail introuvable ou non accessible avec cette clé. Retour automatique sur votre propre compte."
    );
    targetUser = me;
  }

  const authorScopes = buildAuthorScopes(targetUser, me);
  if (!authorScopes.length) {
    notes.push('Aucun filtre auteur exploitable, retour sur currentUser().');
    authorScopes.push('worklogAuthor = currentUser()');
  }

  const resolvedToCurrent = sameUser(targetUser, me);
  const mode = notes.length && resolvedToCurrent && email
    ? 'fallback_current'
    : resolvedToCurrent
      ? 'current'
      : 'delegated';

  return {
    me,
    targetUser,
    meMatcher,
    targetMatcher: new IdentityMatcher(targetUser),
    authorScopes,
    notes,
    mode,
    requestedEmail: email,
  };
}

function normalizeProjectKeys(inputKeys) {
  if (!Array.isArray(inputKeys) || !inputKeys.length) {
    return [...DEFAULT_DETAILED_PROJECT_KEYS];
  }
  return [...new Set(inputKeys.map((v) => String(v || '').trim().toUpperCase()).filter(Boolean))];
}

async function collectWorkedHours2025(token, detailedProjectKeys = DEFAULT_DETAILED_PROJECT_KEYS, requestedEmail = '') {
  const userContext = await resolveTargetUser(token, requestedEmail);
  const targetMatcher = userContext.targetMatcher || new IdentityMatcher(userContext.targetUser);
  const detailedSet = new Set(normalizeProjectKeys(detailedProjectKeys));
  const issueByKey = new Map();
  const discoveryLogs = [...userContext.notes];

  for (const authorScope of userContext.authorScopes) {
    const jql = `${authorScope} AND worklogDate >= "2025-01-01" AND worklogDate <= "2025-12-31"`;
    const result = await searchIssuesByJqlSafe(token, jql, 'project,key,summary,issuetype,parent');
    if (!result.ok) {
      discoveryLogs.push(`Filtre auteur non disponible: ${authorScope}`);
      continue;
    }
    for (const issue of result.issues) {
      issueByKey.set(issue.key, issue);
    }
  }
  const allIssues = [...issueByKey.values()];

  const byProject = new Map();
  const detailedByProject = new Map();
  let keptWorklogs = 0;

  await mapLimit(allIssues, 8, async (issue) => {
    const issueKey = issue.key;
    const projectKey = issue.fields?.project?.key || 'UNKNOWN';
    const projectName = issue.fields?.project?.name || 'Projet inconnu';
    const issueSummary = issue.fields?.summary || 'Sans titre';
    const issueTypeName = issue.fields?.issuetype?.name || 'Issue';
    const isSubtask = Boolean(issue.fields?.issuetype?.subtask || issue.fields?.parent?.key);
    const parentKey = issue.fields?.parent?.key || null;
    const parentSummary = issue.fields?.parent?.fields?.summary || 'Parent';

    let wlStart = 0;
    const wlMax = 1000;

    while (true) {
      let logs;
      try {
        logs = await fetchIssueWorklogPage(token, issueKey, wlStart, wlMax);
      } catch (err) {
        discoveryLogs.push(`Ticket ${issueKey}: lecture des worklogs interrompue (${err?.message || 'worklog inaccessible'}).`);
        break;
      }

      const worklogs = logs.worklogs || [];

      for (const wl of worklogs) {
        if (!inDateRange(wl.started)) continue;
        if (!sameUser(wl.author, targetMatcher)) continue;

        keptWorklogs += 1;
        const seconds = Number(wl.timeSpentSeconds || 0);
        const current = byProject.get(projectKey) || {
          projectKey,
          projectName,
          seconds: 0,
        };
        current.seconds += seconds;
        byProject.set(projectKey, current);

        if (detailedSet.has(projectKey)) {
          const projectDetail = detailedByProject.get(projectKey) || {
            projectKey,
            projectName,
            issues: new Map(),
            commentEntries: [],
          };

          const issueDetail = projectDetail.issues.get(issueKey) || {
            issueKey,
            issueSummary,
            issueTypeName,
            isSubtask,
            parentKey,
            parentSummary,
            seconds: 0,
          };
          issueDetail.seconds += seconds;
          projectDetail.issues.set(issueKey, issueDetail);

          const commentText = extractWorklogCommentText(wl.comment);
          if (commentText && projectDetail.commentEntries.length < MAX_COMMENT_SAMPLES_PER_PROJECT) {
            projectDetail.commentEntries.push({
              issueKey,
              started: wl.started || null,
              seconds,
              comment: commentText,
            });
          }

          detailedByProject.set(projectKey, projectDetail);
        }
      }

      wlStart += worklogs.length;
      if (wlStart >= (logs.total || 0) || worklogs.length === 0) break;
    }
  });

  const projects = [...byProject.values()]
    .map((p) => ({
      projectKey: p.projectKey,
      projectName: p.projectName,
      seconds: p.seconds,
      hours: Number((p.seconds / 3600).toFixed(2)),
    }))
    .sort((a, b) => b.seconds - a.seconds);

  const totalSeconds = projects.reduce((sum, p) => sum + p.seconds, 0);
  const detailedProjects = [...detailedByProject.values()]
    .map((project) => {
      const allDetailedIssues = [...project.issues.values()].sort((a, b) => b.seconds - a.seconds);
      const issues = [];
      const issueMetrics = new IssueMetricsAccumulator();

      for (const issue of allDetailedIssues) {
        if (issue.seconds <= 0) continue;
        const normalizedIssue = {
          issueKey: issue.issueKey,
          summary: issue.issueSummary,
          parentKey: issue.parentKey,
          parentSummary: issue.parentSummary,
          issueType: issue.issueTypeName,
          isSubtask: issue.isSubtask,
          seconds: issue.seconds,
          hours: Number((issue.seconds / 3600).toFixed(2)),
        };
        issues.push(normalizedIssue);
        issueMetrics.add(normalizedIssue);
      }
      const issueTypeTotals = issueMetrics.toIssueTypeTotals();
      const commentEntries = [...(project.commentEntries || [])]
        .sort((a, b) => {
          const left = new Date(a.started || 0).getTime();
          const right = new Date(b.started || 0).getTime();
          return right - left;
        });
      const commentSummary = summarizeBenchCommentsHeuristic(commentEntries, project.projectKey);
      return {
        projectKey: project.projectKey,
        projectName: project.projectName,
        issueCount: issues.length,
        issueHours: Number((issueMetrics.totalSeconds / 3600).toFixed(2)),
        issueTypeTotals,
        subtaskCount: issueMetrics.subtasks.length,
        subtaskHours: Number((issueMetrics.subtaskSeconds / 3600).toFixed(2)),
        issues,
        subtasks: issueMetrics.subtasks,
        commentCount: commentSummary.commentedWorklogs,
        commentHours: commentSummary.commentedHours,
        commentSummary,
        _commentEntries: commentEntries,
      };
    });

  const projectNameByKey = new Map(projects.map((project) => [project.projectKey, project.projectName]));
  const existingDetailedKeys = new Set(detailedProjects.map((project) => project.projectKey));

  for (const projectKey of detailedSet) {
    if (existingDetailedKeys.has(projectKey)) continue;
    const foundProjectName = projectNameByKey.get(projectKey);
    detailedProjects.push({
      projectKey,
      projectName: foundProjectName || projectKey,
      issueCount: 0,
      issueHours: 0,
      issueTypeTotals: [],
      subtaskCount: 0,
      subtaskHours: 0,
      issues: [],
      subtasks: [],
      commentCount: 0,
      commentHours: 0,
      commentSummary: {
        message: `Aucun commentaire exploitable n'a été trouvé pour ${projectKey} dans vos saisies 2025.`,
        commentedWorklogs: 0,
        commentedHours: 0,
        themes: [],
        highlights: [],
        source: 'heuristic',
      },
      _commentEntries: [],
    });
    existingDetailedKeys.add(projectKey);
  }
  detailedProjects.sort((a, b) => a.projectKey.localeCompare(b.projectKey));

  await mapLimit(detailedProjects, 2, async (project) => {
    const entries = Array.isArray(project._commentEntries) ? project._commentEntries : [];
    if (!entries.length) return;
    if (!CODEX_SUMMARY_PROJECT_KEYS.includes(project.projectKey)) return;

    const codexSummary = await summarizeBenchCommentsWithCodex(project.projectKey, entries);
    project.commentSummary = codexSummary;
    project.commentCount = codexSummary.commentedWorklogs;
    project.commentHours = codexSummary.commentedHours;

    if (codexSummary.source === 'codex_exec') {
      discoveryLogs.push(`Résumé des commentaires ${project.projectKey}: généré avec codex exec.`);
    } else {
      discoveryLogs.push(`Résumé des commentaires ${project.projectKey}: mode secours (règles locales).`);
    }
  });

  for (const project of detailedProjects) {
    delete project._commentEntries;
  }

  const avatar = await resolveUserAvatar(token, userContext.targetUser);
  return {
    user: {
      mode: userContext.mode,
      requestedEmail: userContext.requestedEmail || null,
      resolvedEmail: userContext.targetUser?.emailAddress || null,
      avatarUrl: avatar.avatarUrl || extractUserAvatarUrl(userContext.targetUser),
      avatarDataUrl: avatar.avatarDataUrl,
      displayName:
        userContext.targetUser?.displayName ||
        userContext.targetUser?.name ||
        userContext.targetUser?.emailAddress ||
        'Utilisateur',
    },
    discovery: {
      sourceIssueCount: allIssues.length,
      authorScopeCount: userContext.authorScopes.length,
      notes: discoveryLogs,
    },
    projects,
    detailedProjects,
    totalHours: Number((totalSeconds / 3600).toFixed(2)),
    issueCount: allIssues.length,
    worklogCount: keptWorklogs,
  };
}

async function collectAnnualLeaves2025(token, rootIssueKey = LEAVE_ANCHOR_ISSUE_KEY, requestedEmail = '') {
  const userContext = await resolveTargetUser(token, requestedEmail);
  const targetMatcher = userContext.targetMatcher || new IdentityMatcher(userContext.targetUser);
  const normalizedRootKey = String(rootIssueKey || LEAVE_ANCHOR_ISSUE_KEY).trim().toUpperCase();
  const leavesProjectKey = normalizedRootKey.includes('-') ? normalizedRootKey.split('-')[0] : normalizedRootKey;
  const fields = 'key,summary,status,issuetype,parent';
  const issueByKey = new Map();
  const discoveryLogs = [...userContext.notes];
  let usedFallbackScope = false;

  const projectResult = await searchIssuesByJqlSafe(token, `project = ${leavesProjectKey}`, fields);
  if (projectResult.ok) {
    for (const issue of projectResult.issues) {
      issueByKey.set(issue.key, issue);
    }
    discoveryLogs.push(
      `Périmètre congés chargé via le projet ${leavesProjectKey} (${projectResult.issues.length} tickets).`
    );
  } else {
    usedFallbackScope = true;
    discoveryLogs.push(`Projet ${leavesProjectKey} inaccessible (${projectResult.error}).`);
    const authorScope = 'worklogAuthor = currentUser()';
    const fallbackJql =
      `${authorScope} AND worklogDate >= "2025-01-01" AND worklogDate <= "2025-12-31" AND project = ${leavesProjectKey}`;
    const fallbackResult = await searchIssuesByJqlSafe(token, fallbackJql, fields);
    if (fallbackResult.ok) {
      for (const issue of fallbackResult.issues) {
        issueByKey.set(issue.key, issue);
      }
    }
  }

  const leavesIssues = [...issueByKey.values()];
  const leaveUserTokens = makeLeaveUserMatchers(userContext);

  let keptWorklogs = 0;
  let totalSeconds = 0;
  const issues = [];

  for (const issue of leavesIssues) {
    const issueKey = issue.key;
    const issueSummary = issue.fields?.summary || 'Sans titre';
    const issueType = issue.fields?.issuetype?.name || 'Issue';
    const status = issue.fields?.status?.name || 'Inconnu';
    const parentKey = issue.fields?.parent?.key || null;
    const isSubtask = Boolean(issue.fields?.issuetype?.subtask || parentKey);

    let wlStart = 0;
    const wlMax = 1000;
    let issueSeconds = 0;
    let skipIssue = false;

    while (true) {
      let logs;
      try {
        logs = await fetchIssueWorklogPage(token, issueKey, wlStart, wlMax);
      } catch (err) {
        discoveryLogs.push(`Ticket congé ${issueKey} ignoré (${err?.message || 'worklog inaccessible'}).`);
        skipIssue = true;
        break;
      }
      const worklogs = logs.worklogs || [];

      for (const wl of worklogs) {
        if (!inDateRange(wl.started)) continue;
        if (!isWorklogForLeaveTarget(wl, userContext, leaveUserTokens, targetMatcher)) continue;
        const seconds = Number(wl.timeSpentSeconds || 0);
        if (!seconds) continue;
        keptWorklogs += 1;
        issueSeconds += seconds;
      }

      wlStart += worklogs.length;
      if (wlStart >= (logs.total || 0) || worklogs.length === 0) break;
    }

    if (skipIssue) continue;
    if (issueSeconds <= 0) continue;

    totalSeconds += issueSeconds;
    issues.push({
      issueKey,
      summary: issueSummary,
      issueType,
      status,
      parentKey,
      isSubtask,
      seconds: issueSeconds,
      hours: Number((issueSeconds / 3600).toFixed(2)),
      days: Number((issueSeconds / 3600 / WORKING_DAY_HOURS).toFixed(2)),
    });
  }

  issues.sort((a, b) => b.seconds - a.seconds);
  const issueMetrics = new IssueMetricsAccumulator();
  for (const issue of issues) {
    issueMetrics.add(issue);
  }
  const issueTypeTotals = issueMetrics.toIssueTypeTotals();
  const subtasks = issueMetrics.subtasks;

  const totalHours = Number((totalSeconds / 3600).toFixed(2));
  const totalDays = Number((totalHours / WORKING_DAY_HOURS).toFixed(2));

  const avatar = await resolveUserAvatar(token, userContext.targetUser);
  return {
    user: {
      mode: userContext.mode,
      requestedEmail: userContext.requestedEmail || null,
      resolvedEmail: userContext.targetUser?.emailAddress || null,
      avatarUrl: avatar.avatarUrl || extractUserAvatarUrl(userContext.targetUser),
      avatarDataUrl: avatar.avatarDataUrl,
      displayName:
        userContext.targetUser?.displayName ||
        userContext.targetUser?.name ||
        userContext.targetUser?.emailAddress ||
        'Utilisateur',
    },
    issueKey: normalizedRootKey,
    issueCount: issues.length,
    worklogCount: keptWorklogs,
    totalHours,
    totalDays,
    issueTypeTotals,
    subtaskCount: subtasks.length,
    subtaskHours: Number((issueMetrics.subtaskSeconds / 3600).toFixed(2)),
    discovery: {
      projectKey: leavesProjectKey,
      usedFallbackScope,
      userMatchMode: 'author_or_comment',
      sourceIssueCount: leavesIssues.length,
      notes: discoveryLogs,
    },
    workingDayHours: WORKING_DAY_HOURS,
    issues,
  };
}

function formatNumberForExport(value) {
  return Number(value || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercentForExport(value) {
  return `${Number(value || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} %`;
}

function clampPercent(value) {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return 0;
  if (num < 0) return 0;
  if (num > 100) return 100;
  return num;
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

function safeText(value) {
  return String(value ?? '').trim();
}

function getInitials(value) {
  const text = safeText(value);
  if (!text) return '?';
  const compact = text
    .replace(/[_\-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!compact.length) return text.slice(0, 1).toUpperCase();
  if (compact.length === 1) return compact[0].slice(0, 1).toUpperCase();
  return `${compact[0].slice(0, 1)}${compact[1].slice(0, 1)}`.toUpperCase();
}

function buildExportIdentity(report, leaves, requestedEmail) {
  const fromReport = report?.user || null;
  const fromLeaves = leaves?.user || null;
  const displayName = safeText(fromLeaves?.displayName || fromReport?.displayName || '');
  const resolvedEmail = safeText(fromLeaves?.resolvedEmail || fromReport?.resolvedEmail || requestedEmail || '');
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
}

function buildLeavesDetailsForExport(leaves) {
  const issues = leaves?.issues || [];
  const subtasks = [];
  let computedSubtaskSeconds = 0;

  for (const issue of issues) {
    if (issue?.isSubtask || issue?.parentKey) {
      subtasks.push(issue);
      computedSubtaskSeconds += Number(issue?.seconds || 0);
    }
  }

  const issueTypeTotals =
    Array.isArray(leaves?.issueTypeTotals) && leaves.issueTypeTotals.length
      ? leaves.issueTypeTotals
      : [];

  const subtaskCount = Number(leaves?.subtaskCount ?? subtasks.length);
  const subtaskHours = Number(leaves?.subtaskHours ?? Number((computedSubtaskSeconds / 3600).toFixed(2)));

  return {
    issueTypeTotals,
    subtasks,
    subtaskCount,
    subtaskHours,
  };
}

function buildNarrativeForProject(projectDetails, projectKey, label = projectKey) {
  if (!projectDetails?.issues?.length) {
    return `Aucune activité ${label} détectée pour 2025.`;
  }
  const topType = projectDetails.issueTypeTotals?.[0];
  const topIssue = projectDetails.issues?.[0];
  const subtaskShare =
    Number(projectDetails.issueHours || 0) > 0
      ? (Number(projectDetails.subtaskHours || 0) / Number(projectDetails.issueHours || 0)) * 100
      : 0;
  const parts = [
    `Vous avez saisi ${formatNumberForExport(projectDetails.issueHours)} h sur ${projectDetails.issueCount} tickets ${label}.`,
    topType ? `Le type principal est "${topType.issueType}" avec ${formatNumberForExport(topType.hours)} h.` : null,
    `Les sous-tâches représentent ${formatPercentForExport(subtaskShare)} du temps ${label}.`,
    topIssue ? `Le ticket le plus chargé est ${topIssue.issueKey} (${formatNumberForExport(topIssue.hours)} h).` : null,
  ].filter(Boolean);
  return parts.join(' ');
}

function buildAnalysisInfo(report, leaves, requestedEmail) {
  const fromReport = report?.user || null;
  const fromLeaves = leaves?.user || null;
  const resolvedEmail =
    fromLeaves?.resolvedEmail ||
    fromReport?.resolvedEmail ||
    safeText(requestedEmail) ||
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
}

function buildProgressCircles(summary) {
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
      subtitle: `${formatNumberForExport(summary.workedHours)} h`,
      value: workedShare,
      tone: 'sky',
    },
  ];

  if (Number(summary.benchHours || 0) > 0) {
    circles.push({
      title: 'Part bench',
      subtitle: `${formatNumberForExport(summary.benchHours)} h sur vos heures 2025`,
      value: summary.benchRate,
      tone: 'sun',
    });
  }

  if (Number(summary.leavesHours || 0) > 0) {
    circles.push({
      title: 'Part congés/absences',
      subtitle: `${formatNumberForExport(summary.leavesHours)} h (${formatNumberForExport(summary.leavesDays)} jours)`,
      value: leavesShare,
      tone: 'rose',
    });
  }

  return circles;
}

function buildExportContext(report, leaves, requestedEmail) {
  const projectByKey = new Map();
  const detailedByKey = new Map();

  for (const project of report?.projects || []) {
    const key = safeText(project?.projectKey).toUpperCase();
    if (!key || projectByKey.has(key)) continue;
    projectByKey.set(key, project);
  }

  for (const project of report?.detailedProjects || []) {
    const key = safeText(project?.projectKey).toUpperCase();
    if (!key || detailedByKey.has(key)) continue;
    detailedByKey.set(key, project);
  }

  const workedHours = Number(report?.totalHours || 0);
  const leavesHours = Number(leaves?.totalHours || 0);
  const leavesDays = Number(leaves?.totalDays || 0);
  const benchProject = projectByKey.get(BENCH_SCOPE_KEY) || null;
  const benchHours = Number(benchProject?.hours || 0);
  const benchRate = workedHours > 0 ? (benchHours / workedHours) * 100 : 0;
  const utilizationRate = Math.max(0, 100 - benchRate);
  const benchDetails = detailedByKey.get(BENCH_SCOPE_KEY) || null;
  const roemoDetails = detailedByKey.get(ROEMO_SCOPE_KEY) || null;
  const leavesDetails = buildLeavesDetailsForExport(leaves);
  const exportIdentity = buildExportIdentity(report, leaves, requestedEmail);
  const benchNarrative = buildNarrativeForProject(benchDetails, BENCH_SCOPE_KEY, 'bench');
  const roemoNarrative = buildNarrativeForProject(roemoDetails, ROEMO_SCOPE_KEY, ROEMO_SCOPE_KEY);
  const analysisInfo = buildAnalysisInfo(report, leaves, requestedEmail);
  const summary = {
    workedHours,
    leavesHours,
    leavesDays,
    benchHours,
    benchRate,
    utilizationRate,
  };
  const progressCircles = buildProgressCircles(summary);

  return {
    report,
    leaves,
    summary,
    benchDetails,
    roemoDetails,
    leavesDetails,
    analysisInfo,
    progressCircles,
    exportIdentity,
    benchNarrative,
    roemoNarrative,
  };
}

async function writeHeadlessXlsx(filePath, context) {
  const excelModule = await import('exceljs');
  const ExcelJS = excelModule.default || excelModule;
  if (!ExcelJS?.Workbook) {
    throw new Error("Le module d'export Excel n'a pas pu être chargé correctement.");
  }

  const { report, leaves, summary, benchDetails, roemoDetails, leavesDetails } = context;
  const benchCommentSummary = benchDetails?.commentSummary || null;
  const roemoCommentSummary = roemoDetails?.commentSummary || null;
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

  function projectSheetName(projectKey, suffix) {
    const normalizedKey = safeText(projectKey || 'PROJECT').toUpperCase() || 'PROJECT';
    const normalizedSuffix = safeText(suffix || '');
    const candidate = normalizedSuffix ? `${normalizedKey}_${normalizedSuffix}` : normalizedKey;
    return candidate.slice(0, 31);
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

  const analysedUser = context.exportIdentity.label || 'Mon compte';
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
    `${formatNumberForExport(summary.workedHours)} h`,
    'Total des heures de travail en 2025',
    'FFF7FDF0'
  );
  paintCard(
    summarySheet,
    4,
    4,
    'Conges / absences',
    `${formatNumberForExport(summary.leavesHours)} h`,
    `${formatNumberForExport(summary.leavesDays)} jours`,
    'FFFFF8EE'
  );
  paintCard(
    summarySheet,
    1,
    9,
    'Taux bench',
    `${formatPercentForExport(summary.benchRate)}`,
    `${formatNumberForExport(summary.benchHours)} h sur ${BENCH_SCOPE_KEY}`,
    'FFF9F2EC'
  );
  paintCard(
    summarySheet,
    4,
    9,
    "Taux d'utilisation",
    `${formatPercentForExport(summary.utilizationRate)}`,
    'Formule: 100% - taux bench',
    'FFEFF7F0'
  );

  summarySheet.mergeCells('A14:F14');
  summarySheet.getCell('A14').value = `Narratif bench: ${context.benchNarrative}`;
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

  const projectRows = (report?.projects || []).map((project) => ({
    Projet: project.projectKey,
    Nom: project.projectName,
    Heures: Number(project.hours || 0),
  }));
  projectRows.push({
    Projet: 'TOTAL',
    Nom: 'Activités 2025',
    Heures: Number(report?.totalHours || 0),
  });
  addWorksheet('Projets_2025', projectRows);

  addWorksheet(
    'Bench_Types',
    (benchDetails?.issueTypeTotals || []).map((entry) => ({
      Type: entry.issueType,
      Heures: Number(entry.hours || 0),
    }))
  );
  addWorksheet(
    'Bench_Tickets',
    (benchDetails?.issues || []).map((issue) => ({
      Ticket: issue.issueKey,
      Type: issue.issueType,
      Parent: issue.parentKey ? `${issue.parentKey} - ${issue.parentSummary}` : '',
      Résumé: issue.summary,
      Heures: Number(issue.hours || 0),
    }))
  );
  addWorksheet(
    'Bench_Commentaires_Themes',
    (benchCommentSummary?.themes || []).map((theme) => ({
      Thème: theme.label,
      Heures: Number(theme.hours || 0),
      Saisies: Number(theme.occurrences || 0),
    }))
  );
  addWorksheet(
    'Bench_Commentaires_Exemples',
    (benchCommentSummary?.highlights || []).map((entry) => ({
      Ticket: entry.issueKey,
      Heures: Number(entry.hours || 0),
      Commentaire: entry.comment,
    }))
  );

  if (HAS_DISTINCT_ROEMO_SCOPE) {
    addWorksheet(
      projectSheetName(ROEMO_SCOPE_KEY, 'Types'),
      (roemoDetails?.issueTypeTotals || []).map((entry) => ({
        Type: entry.issueType,
        Heures: Number(entry.hours || 0),
      }))
    );
    addWorksheet(
      projectSheetName(ROEMO_SCOPE_KEY, 'Tickets'),
      (roemoDetails?.issues || []).map((issue) => ({
        Ticket: issue.issueKey,
        Type: issue.issueType,
        Parent: issue.parentKey ? `${issue.parentKey} - ${issue.parentSummary}` : '',
        Résumé: issue.summary,
        Heures: Number(issue.hours || 0),
      }))
    );
    addWorksheet(
      projectSheetName(ROEMO_SCOPE_KEY, 'Commentaires_Themes'),
      (roemoCommentSummary?.themes || []).map((theme) => ({
        Thème: theme.label,
        Heures: Number(theme.hours || 0),
        Saisies: Number(theme.occurrences || 0),
      }))
    );
    addWorksheet(
      projectSheetName(ROEMO_SCOPE_KEY, 'Commentaires_Exemples'),
      (roemoCommentSummary?.highlights || []).map((entry) => ({
        Ticket: entry.issueKey,
        Heures: Number(entry.hours || 0),
        Commentaire: entry.comment,
      }))
    );
  }

  addWorksheet(
    'Conges_Types',
    (leavesDetails.issueTypeTotals || []).map((entry) => ({
      Type: entry.issueType,
      Heures: Number(entry.hours || 0),
    }))
  );
  addWorksheet(
    'Conges_Tickets',
    (leaves?.issues || []).map((issue) => ({
      Ticket: issue.issueKey,
      Type: issue.issueType,
      Statut: issue.status,
      Parent: issue.parentKey || '',
      Résumé: issue.summary,
      Heures: Number(issue.hours || 0),
      Jours: Number(issue.days || 0),
    }))
  );

  await workbook.xlsx.writeFile(filePath);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHeadlessPdfHtml(context, docTitle) {
  const { report, leaves, summary, benchDetails, roemoDetails, leavesDetails, analysisInfo, progressCircles } = context;
  const benchCommentSummary = benchDetails?.commentSummary || null;
  const roemoCommentSummary = roemoDetails?.commentSummary || null;
  const generatedAt = new Date().toLocaleString('fr-FR');
  const analysedUser = context.exportIdentity.label || 'Mon compte';
  const avatarLabel = analysisInfo?.displayName || analysisInfo?.resolvedEmail || analysedUser;
  const avatarInitials = getInitials(avatarLabel);
  const avatarHtml = analysisInfo?.avatarUrl
    ? `<img class="account-avatar" src="${escapeHtml(analysisInfo.avatarUrl)}" alt="${escapeHtml(avatarLabel)}" />`
    : `<span class="account-avatar fallback" aria-hidden="true">${escapeHtml(avatarInitials)}</span>`;
  const accountBadgeClass = analysisInfo?.fallback ? 'warn' : analysisInfo?.delegated ? 'info' : 'ok';
  const circlesHtml = (progressCircles || []).map((item) => {
    const safeValue = clampPercent(item.value);
    return `<article class="progress-card">
      <div class="progress-circle tone-${escapeHtml(item.tone)}" style="--pct: ${safeValue}%">
        <span>${escapeHtml(formatPercentForExport(safeValue))}</span>
      </div>
      <h4>${escapeHtml(item.title)}</h4>
      <small>${escapeHtml(item.subtitle)}</small>
    </article>`;
  }).join('');

  const toRows = (items, headers, rowBuilder) => {
    if (!Array.isArray(items) || !items.length) {
      return '<p class="empty">Aucune donnée.</p>';
    }
    const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
    const body = items.map((entry) => {
      const cols = rowBuilder(entry).map((cell) => `<td>${escapeHtml(cell)}</td>`).join('');
      return `<tr>${cols}</tr>`;
    }).join('');
    return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  };

  return `<!doctype html>
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
    .account-badge {
      display: grid;
      gap: 2px;
      margin: 0 0 12px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(107, 141, 89, 0.35);
      background: rgba(255, 255, 255, 0.75);
    }
    .account-badge strong {
      color: #2d4b2c;
    }
    .account-badge-head {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .account-badge-meta {
      display: grid;
      gap: 2px;
      min-width: 0;
    }
    .account-badge-meta small {
      color: #567255;
      font-size: 12px;
      line-height: 1.2;
    }
    .account-avatar {
      width: 36px;
      height: 36px;
      border-radius: 999px;
      border: 1px solid rgba(107, 141, 89, 0.35);
      object-fit: cover;
      background: rgba(255, 255, 255, 0.9);
      flex: 0 0 auto;
    }
    .account-avatar.fallback {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      color: #466045;
      background: linear-gradient(145deg, rgba(232, 245, 216, 0.96), rgba(248, 255, 241, 0.96));
    }
    .account-badge span {
      color: #50694a;
      font-size: 13px;
    }
    .account-badge.warn {
      border-color: rgba(195, 143, 61, 0.6);
      background: rgba(255, 248, 231, 0.86);
    }
    .account-badge.warn strong {
      color: #6b4a1f;
    }
    .account-badge.info {
      border-color: rgba(93, 142, 154, 0.55);
      background: rgba(239, 249, 250, 0.88);
    }
    .progress-dashboard {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 12px;
    }
    .progress-card {
      border: 1px solid rgba(145, 170, 118, 0.24);
      border-radius: 12px;
      padding: 12px;
      background: rgba(255, 255, 255, 0.66);
      display: grid;
      justify-items: center;
      text-align: center;
      gap: 6px;
    }
    .progress-card h4 {
      margin: 0;
      font-size: 14px;
      color: #4f6341;
    }
    .progress-card small {
      color: var(--muted);
      font-size: 11px;
    }
    .progress-circle {
      --pct: 0%;
      width: 96px;
      height: 96px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      position: relative;
      background: conic-gradient(var(--ring-color, #7fa567) var(--pct), rgba(220, 229, 205, 0.8) var(--pct));
    }
    .progress-circle::before {
      content: '';
      position: absolute;
      inset: 10px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.94);
      border: 1px solid rgba(141, 167, 114, 0.22);
    }
    .progress-circle span {
      position: relative;
      z-index: 1;
      font-weight: 700;
      color: #4f6642;
      font-size: 14px;
    }
    .progress-circle.tone-leaf {
      --ring-color: #7fa567;
    }
    .progress-circle.tone-sun {
      --ring-color: #dda262;
    }
    .progress-circle.tone-sky {
      --ring-color: #8fb6ba;
    }
    .progress-circle.tone-rose {
      --ring-color: #d78e83;
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
        ${HAS_DISTINCT_ROEMO_SCOPE ? `<span>Scope projet: ${escapeHtml(ROEMO_SCOPE_KEY)}</span>` : ''}
        <span>Scope congés: ${escapeHtml(LEAVE_SCOPE_LABEL)}</span>
      </div>
    </section>

    <section class="panel">
      <h2>Résumé</h2>
      <div class="account-badge ${accountBadgeClass}">
        <div class="account-badge-head">
          ${avatarHtml}
          <div class="account-badge-meta">
            <strong>Compte analysé : ${escapeHtml(analysisInfo?.resolvedEmail || analysedUser)}</strong>
            ${analysisInfo?.displayName ? `<small>${escapeHtml(analysisInfo.displayName)}</small>` : ''}
          </div>
        </div>
        <span>${escapeHtml(analysisInfo?.message || 'Analyse de vos données.')}</span>
      </div>
      <div class="progress-dashboard">
        ${circlesHtml}
      </div>
      <div class="cards">
        <article class="card">
          <strong>Heures travaillées</strong>
          <p>${escapeHtml(`${formatNumberForExport(summary.workedHours)} h`)}</p>
          <small>Total des heures de travail en 2025.</small>
        </article>
        <article class="card">
          <strong>Congés / absences</strong>
          <p>${escapeHtml(`${formatNumberForExport(summary.leavesHours)} h`)}</p>
          <small>${escapeHtml(`${formatNumberForExport(summary.leavesDays)} jours`)}</small>
        </article>
        <article class="card">
          <strong>Taux bench</strong>
          <p>${escapeHtml(formatPercentForExport(summary.benchRate))}</p>
          <small>${escapeHtml(`${formatNumberForExport(summary.benchHours)} h sur ${BENCH_SCOPE_KEY}`)}</small>
        </article>
        <article class="card">
          <strong>Taux d'utilisation</strong>
          <p>${escapeHtml(formatPercentForExport(summary.utilizationRate))}</p>
          <small>Formule: 100 % - taux bench.</small>
        </article>
      </div>
      <p class="narrative">${escapeHtml(context.benchNarrative)}</p>
    </section>

    <section class="panel">
      <h2>Heures par projet</h2>
      ${toRows(
        [...(report.projects || []), { projectKey: 'TOTAL', projectName: 'Activités 2025', hours: Number(report.totalHours || 0) }],
        ['Projet', 'Nom', 'Heures'],
        (project) => [project.projectKey, project.projectName, formatNumberForExport(project.hours)]
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
            (entry) => [entry.issueType, formatNumberForExport(entry.hours)]
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
              formatNumberForExport(issue.hours),
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
              formatNumberForExport(issue.hours),
            ]
          )}
        </div>
        <div>
          <h3>Commentaires bench - thèmes</h3>
          ${toRows(
            benchCommentSummary?.themes || [],
            ['Thème', 'Heures', 'Saisies'],
            (theme) => [theme.label, formatNumberForExport(theme.hours), String(theme.occurrences)]
          )}
        </div>
        <div>
          <h3>Commentaires bench - exemples</h3>
          ${toRows(
            benchCommentSummary?.highlights || [],
            ['Ticket', 'Heures', 'Commentaire'],
            (entry) => [entry.issueKey, formatNumberForExport(entry.hours), entry.comment]
          )}
        </div>
      </div>
    </section>

    ${HAS_DISTINCT_ROEMO_SCOPE ? `
    <section class="panel">
      <h2>Détail projet (${escapeHtml(ROEMO_SCOPE_KEY)})</h2>
      <p class="narrative">${escapeHtml(context.roemoNarrative)}</p>
      <div class="section-grid">
        <div>
          <h3>Répartition par type</h3>
          ${toRows(
            roemoDetails?.issueTypeTotals || [],
            ["Type d'issue", 'Heures'],
            (entry) => [entry.issueType, formatNumberForExport(entry.hours)]
          )}
        </div>
        <div>
          <h3>Sous-tâches ${escapeHtml(ROEMO_SCOPE_KEY)}</h3>
          ${toRows(
            roemoDetails?.subtasks || [],
            ['Ticket', 'Type', 'Parent', 'Heures'],
            (issue) => [
              issue.issueKey,
              issue.issueType,
              issue.parentKey ? `${issue.parentKey} - ${issue.parentSummary}` : '-',
              formatNumberForExport(issue.hours),
            ]
          )}
        </div>
        <div>
          <h3>Tous les tickets ${escapeHtml(ROEMO_SCOPE_KEY)}</h3>
          ${toRows(
            roemoDetails?.issues || [],
            ['Ticket', 'Type', 'Parent', 'Résumé', 'Heures'],
            (issue) => [
              issue.issueKey,
              issue.issueType,
              issue.parentKey ? `${issue.parentKey} - ${issue.parentSummary}` : '-',
              issue.summary,
              formatNumberForExport(issue.hours),
            ]
          )}
        </div>
        <div>
          <h3>Commentaires ${escapeHtml(ROEMO_SCOPE_KEY)} - thèmes</h3>
          ${toRows(
            roemoCommentSummary?.themes || [],
            ['Thème', 'Heures', 'Saisies'],
            (theme) => [theme.label, formatNumberForExport(theme.hours), String(theme.occurrences)]
          )}
        </div>
        <div>
          <h3>Commentaires ${escapeHtml(ROEMO_SCOPE_KEY)} - exemples</h3>
          ${toRows(
            roemoCommentSummary?.highlights || [],
            ['Ticket', 'Heures', 'Commentaire'],
            (entry) => [entry.issueKey, formatNumberForExport(entry.hours), entry.comment]
          )}
        </div>
      </div>
    </section>
    ` : ''}

    <section class="panel">
      <h2>Congés et absences (${escapeHtml(LEAVE_SCOPE_LABEL)})</h2>
      <div class="section-grid">
        <div>
          <h3>Répartition par type</h3>
          ${toRows(
            leavesDetails?.issueTypeTotals || [],
            ["Type d'issue", 'Heures'],
            (entry) => [entry.issueType, formatNumberForExport(entry.hours)]
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
              formatNumberForExport(issue.hours),
              formatNumberForExport(issue.days),
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
              formatNumberForExport(issue.hours),
              formatNumberForExport(issue.days),
            ]
          )}
        </div>
      </div>
    </section>
  </div>
</body>
</html>`;
}

async function renderPdfWithChrome(filePath, html) {
  const chromeBinary = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!(await fileExists(chromeBinary))) {
    throw new Error('Google Chrome est requis pour l’export PDF headless (binaire introuvable).');
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'worklog-cse-pdf-'));
  const htmlPath = path.join(tempDir, 'report.html');
  const profileDir = path.join(tempDir, 'chrome-profile');
  await fs.writeFile(htmlPath, html, 'utf8');

  const baseArgs = [
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--allow-file-access-from-files',
    '--print-to-pdf-no-header',
    `--user-data-dir=${profileDir}`,
    `--print-to-pdf=${filePath}`,
    pathToFileURL(htmlPath).href,
  ];

  let result = await runCommand(chromeBinary, ['--headless=new', ...baseArgs], {
    timeoutMs: 180000,
  });
  if (result.code !== 0) {
    result = await runCommand(chromeBinary, ['--headless', ...baseArgs], {
      timeoutMs: 180000,
    });
  }

  const pdfOk = (await fileExists(filePath)) && (await fs.stat(filePath)).size > 0;
  await fs.rm(tempDir, { recursive: true, force: true });

  if (!pdfOk) {
    const details = (result.stderr || result.stdout || '').trim().split('\n').slice(-4).join(' | ');
    throw new Error(`Échec de la génération PDF headless via Chrome.${details ? ` Détail: ${details}` : ''}`);
  }

  if (result.code !== 0) {
    const details = (result.stderr || result.stdout || '').trim().split('\n').slice(-2).join(' | ');
    if (details) {
      console.warn(`PDF headless: Chrome a renvoyé un code non nul mais le fichier a bien été généré. ${details}`);
    }
  }
}

async function writeHeadlessPdf(filePath, context) {
  const html = buildHeadlessPdfHtml(context, path.basename(filePath));
  await renderPdfWithChrome(filePath, html);
}

async function runHeadlessExports(options) {
  const userEmail = safeText(options.userEmail || '');
  const token = await getTokenFromRequestOrConfig(options.token);
  if (!token) {
    throw new Error("Mode headless: aucune clé d'accès trouvée. Utilisez -t/--token ou configurez ~/.codex/config.toml.");
  }

  const shouldExportXlsx = Boolean(options.exportXlsx || (!options.exportXlsx && !options.exportPdf));
  const shouldExportPdf = Boolean(options.exportPdf || (!options.exportXlsx && !options.exportPdf));
  const outputDir = path.resolve(process.cwd(), safeText(options.outputDir || process.cwd()));
  await fs.mkdir(outputDir, { recursive: true });

  console.log('Headless mode: collecte des données 2025...');
  const [report, leaves] = await Promise.all([
    collectWorkedHours2025(token, [BENCH_SCOPE_KEY, ROEMO_SCOPE_KEY], userEmail),
    collectAnnualLeaves2025(token, LEAVE_ANCHOR_ISSUE_KEY, userEmail),
  ]);
  const context = buildExportContext(report, leaves, userEmail);
  const safeDate = new Date().toISOString().slice(0, 10);
  const baseName = `worklog-cse-${context.exportIdentity.filePart}-${safeDate}`;
  const generatedFiles = [];

  if (shouldExportXlsx) {
    const xlsxPath = path.join(outputDir, `${baseName}.xlsx`);
    await writeHeadlessXlsx(xlsxPath, context);
    generatedFiles.push(xlsxPath);
  }

  if (shouldExportPdf) {
    const pdfPath = path.join(outputDir, `${baseName}.pdf`);
    await writeHeadlessPdf(pdfPath, context);
    generatedFiles.push(pdfPath);
  }

  console.log('Headless mode: exports terminés.');
  for (const filePath of generatedFiles) {
    console.log(`- ${filePath}`);
  }
}

app.get('/api/health', (_, res) => {
  res.json({ ok: true, port: API_PORT });
});

app.get('/api/bootstrap', (_, res) => {
  const token = String(CLI_LAUNCH_OPTIONS.token || '').trim();
  const userEmail = String(CLI_LAUNCH_OPTIONS.userEmail || '').trim();
  const shouldAutoLaunch = Boolean(token);
  res.json({
    token,
    userEmail,
    shouldAutoLaunch,
    targetStep: shouldAutoLaunch ? 4 : null,
  });
});

app.post('/api/mcp/setup', async (req, res) => {
  const logs = [];
  try {
    const token = String(req.body?.token || '').trim();
    if (!token) {
      res.status(400).json({ error: "La clé d'accès est requise." });
      return;
    }

    logs.push('Démarrage de la configuration automatique...');
    logs.push('Tentative 1 : configuration automatique.');

    const codexResult = await setupViaCodexExec(token);
    const codexOk = codexResult.code === 0;

    if (codexOk) {
      logs.push('Tentative 1 : réussie.');
    } else {
      logs.push('Tentative 1 : échec. Tentative 2 en cours.');
      const tail = (codexResult.stderr || codexResult.stdout || '').trim().split('\n').slice(-2).join(' | ');
      if (tail) logs.push(`Détail technique : ${tail.slice(0, 180)}`);
      await setupViaLocalPatch(token);
      logs.push('Tentative 2 : configuration locale appliquée.');
    }

    const handshake = await runMcpHandshake(token);
    logs.push(handshake.ok ? 'Vérification de connexion : réussie.' : 'Vérification de connexion : échec.');
    if (handshake.message) logs.push(handshake.message);

    res.json({ ok: handshake.ok, logs, handshake });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erreur pendant la configuration', logs });
  }
});

app.post('/api/mcp/check', async (req, res) => {
  const logs = [];
  try {
    const token = await getTokenFromRequestOrConfig(req.body?.token);
    if (!token) {
      res.status(400).json({ error: "Aucune clé d'accès trouvée.", logs });
      return;
    }

    logs.push('Vérification de la connexion en cours...');
    const handshake = await runMcpHandshake(token);
    logs.push(handshake.ok ? 'Vérification de connexion : réussie.' : 'Vérification de connexion : échec.');
    if (handshake.message) logs.push(handshake.message);

    res.json({ ok: handshake.ok, logs, handshake });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erreur pendant la vérification', logs });
  }
});

app.post('/api/worklogs/report', async (req, res) => {
  try {
    const token = await getTokenFromRequestOrConfig(req.body?.token);
    if (!token) {
      res.status(400).json({ error: "Aucune clé d'accès trouvée." });
      return;
    }

    const report = await collectWorkedHours2025(token, req.body?.detailedProjectKeys, req.body?.userEmail);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erreur lors du chargement des heures 2025' });
  }
});

app.post('/api/worklogs/leaves', async (req, res) => {
  try {
    const token = await getTokenFromRequestOrConfig(req.body?.token);
    if (!token) {
      res.status(400).json({ error: "Aucune clé d'accès trouvée." });
      return;
    }

    const leaves = await collectAnnualLeaves2025(
      token,
      req.body?.issueKey || LEAVE_ANCHOR_ISSUE_KEY,
      req.body?.userEmail
    );
    res.json(leaves);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erreur lors du chargement des congés annuels' });
  }
});

async function setupFrontendRoutes() {
  if (!(await fileExists(CLIENT_DIST_INDEX))) return;

  app.use(express.static(CLIENT_DIST_DIR, { index: false }));

  const template = await fs.readFile(CLIENT_DIST_INDEX, 'utf8');
  let render = null;

  if (await fileExists(SERVER_DIST_ENTRY)) {
    try {
      const moduleUrl = `${pathToFileURL(SERVER_DIST_ENTRY).href}?v=${Date.now()}`;
      const ssrModule = await import(moduleUrl);
      if (typeof ssrModule.render === 'function') {
        render = ssrModule.render;
      }
    } catch (err) {
      console.warn(`SSR disabled: ${err.message}`);
    }
  }

  app.get('*', async (req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }

    try {
      if (!render) {
        res.sendFile(CLIENT_DIST_INDEX);
        return;
      }

      const appHtml = await render(req.originalUrl || '/');
      const html = template.replace('<!--ssr-outlet-->', appHtml);
      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
    } catch (err) {
      next(err);
    }
  });
}

async function startServer() {
  await setupFrontendRoutes();
  if (isPlaceholderTrackerUrl(TRACKER_URL)) {
    console.warn(
      'Configuration warning: ISSUE_TRACKER_URL/TRACKER_URL is still set to a placeholder. ' +
      'Set it in .env.local before using API endpoints.'
    );
  }
  app.listen(API_PORT, '127.0.0.1', () => {
    console.log(`API ready on http://localhost:${API_PORT}`);
  });
}

async function main() {
  if (CLI_LAUNCH_OPTIONS.headless) {
    await runHeadlessExports(CLI_LAUNCH_OPTIONS);
    return;
  }
  await startServer();
}

main().catch((err) => {
  console.error(`Startup error: ${err.message}`);
  process.exit(1);
});
