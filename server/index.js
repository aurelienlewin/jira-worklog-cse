import express from 'express';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { spawn } from 'child_process';
import readline from 'readline';
import { fileURLToPath, pathToFileURL } from 'url';

const app = express();
const API_PORT = Number(process.env.API_PORT || 8787);
const JIRA_URL = 'https://dev.osf.digital';
const WORKLOG_START = new Date('2025-01-01T00:00:00.000Z');
const WORKLOG_END = new Date('2025-12-31T23:59:59.999Z');
const ANNUAL_LEAVES_ISSUE_KEY = 'ZLH-1';
const WORKING_DAY_HOURS = Number(process.env.WORKING_DAY_HOURS || 7);
const DEFAULT_DETAILED_PROJECT_KEYS = [];
const CONFIG_PATH = path.join(os.homedir(), '.codex', 'config.toml');
const MCP_SECTION = 'mcp-atlassian-dev-osf';
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

function makeMcpBlock(token) {
  const safeToken = shellEscapeToml(token.trim());
  return (
    `[mcp_servers.${MCP_SECTION}]\n` +
    `command = "uvx"\n` +
    `args = ["mcp-atlassian@latest", "--transport", "stdio", "--toolsets", "default,jira_agile"]\n` +
    `env = { JIRA_URL = "${JIRA_URL}", JIRA_PERSONAL_TOKEN = "${safeToken}", MCP_LOGGING_STDOUT = "false", MCP_VERBOSE = "false", MCP_VERY_VERBOSE = "false", JIRA_TIMEOUT = "120", UV_CACHE_DIR = "/tmp/uv-cache" }\n` +
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
  return block.match(/JIRA_PERSONAL_TOKEN\s*=\s*"([^"]+)"/)?.[1] || '';
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
  const prompt = [
    'You are running locally on macOS.',
    `Update ~/.codex/config.toml for [mcp_servers.${MCP_SECTION}] using:`,
    '- command = uvx',
    '- args = ["mcp-atlassian@latest", "--transport", "stdio", "--toolsets", "default,jira_agile"]',
    `- JIRA_URL = "${JIRA_URL}"`,
    `- JIRA_PERSONAL_TOKEN = "${token}"`,
    '- MCP_LOGGING_STDOUT = "false"',
    '- MCP_VERBOSE = "false"',
    '- MCP_VERY_VERBOSE = "false"',
    '- JIRA_TIMEOUT = "120"',
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
      JIRA_URL,
      JIRA_PERSONAL_TOKEN: token,
      MCP_LOGGING_STDOUT: 'false',
      MCP_VERBOSE: 'false',
      MCP_VERY_VERBOSE: 'false',
      JIRA_TIMEOUT: '120',
      UV_CACHE_DIR: '/tmp/uv-cache',
    };

    const child = spawn(
      'uvx',
      ['mcp-atlassian@latest', '--transport', 'stdio', '--toolsets', 'default,jira_agile'],
      { env, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    const startedAt = Date.now();
    let stderr = '';
    let initOk = false;

    const rl = readline.createInterface({ input: child.stdout });

    const cleanup = (result) => {
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

    rl.on('line', (line) => {
      const msg = parseJsonLine(line);
      if (!msg) return;

      if (msg.id === 1 && msg.result && !initOk) {
        initOk = true;
        const initSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(2));
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);
        return;
      }

      if (msg.id === 2 && msg.result) {
        clearTimeout(timeout);
        const initSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(2));
        const toolCount = Array.isArray(msg.result?.tools) ? msg.result.tools.length : 0;
        cleanup({
          ok: initOk,
          initSeconds,
          message: `Fonctions disponibles: ${toolCount}`,
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
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'neon-webapp', version: '1.0.0' },
        },
      })}\n`
    );
  });
}

async function jiraFetchJson(token, endpoint) {
  const url = `${JIRA_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira ${res.status} on ${endpoint}: ${body.slice(0, 180)}`);
  }

  return res.json();
}

function inDateRange(dateValue) {
  if (!dateValue) return false;
  const dt = new Date(dateValue);
  if (Number.isNaN(dt.getTime())) return false;
  return dt >= WORKLOG_START && dt <= WORKLOG_END;
}

function sameUser(author, me) {
  if (!author || !me) return false;

  const left = new Set(
    [author.name, author.key, author.emailAddress, author.accountId, author.displayName, author.self]
      .filter(Boolean)
      .map((v) => String(v).trim().toLowerCase())
  );
  const right = new Set(
    [me.name, me.key, me.emailAddress, me.accountId, me.displayName, me.self]
      .filter(Boolean)
      .map((v) => String(v).trim().toLowerCase())
  );

  for (const v of left) {
    if (right.has(v)) return true;
  }
  return false;
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
    const page = await jiraFetchJson(
      token,
      `/rest/api/2/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&fields=${encodeURIComponent(fields)}`
    );

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

function uniqueNonEmpty(values) {
  return [...new Set((values || []).map((v) => String(v || '').trim()).filter(Boolean))];
}

async function searchUsersSafe(token, endpoint) {
  try {
    const users = await jiraFetchJson(token, endpoint);
    return Array.isArray(users) ? users : [];
  } catch {
    return [];
  }
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
  const me = await jiraFetchJson(token, '/rest/api/2/myself');
  const email = String(requestedEmail || '').trim();

  if (!email) {
    return {
      me,
      targetUser: me,
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
    const queryResults = await searchUsersSafe(token, `/rest/api/2/user/search?query=${encodeURIComponent(email)}`);
    const usernameResults = await searchUsersSafe(token, `/rest/api/2/user/search?username=${encodeURIComponent(email)}`);
    const mergedUsers = [...queryResults, ...usernameResults];
    targetUser = pickBestUserMatch(mergedUsers, email);
  }

  if (!targetUser) {
    throw new Error(
      "Impossible de trouver cet utilisateur Jira. Vérifiez l'adresse e-mail, ou laissez le champ vide pour votre propre compte."
    );
  }

  const authorScopes = buildAuthorScopes(targetUser, me);
  if (!authorScopes.length) {
    notes.push('Aucun filtre auteur exploitable, retour sur currentUser().');
    authorScopes.push('worklogAuthor = currentUser()');
  }

  return {
    me,
    targetUser,
    authorScopes,
    notes,
    mode: sameUser(targetUser, me) ? 'current' : 'delegated',
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
      const logs = await jiraFetchJson(
        token,
        `/rest/api/2/issue/${encodeURIComponent(issueKey)}/worklog?startAt=${wlStart}&maxResults=${wlMax}`
      );

      const worklogs = logs.worklogs || [];

      for (const wl of worklogs) {
        if (!inDateRange(wl.started)) continue;
        if (!sameUser(wl.author, userContext.targetUser)) continue;

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
      const issues = allDetailedIssues
        .filter((issue) => issue.seconds > 0)
        .map((issue) => ({
          issueKey: issue.issueKey,
          summary: issue.issueSummary,
          parentKey: issue.parentKey,
          parentSummary: issue.parentSummary,
          issueType: issue.issueTypeName,
          isSubtask: issue.isSubtask,
          seconds: issue.seconds,
          hours: Number((issue.seconds / 3600).toFixed(2)),
        }));
      const issueSeconds = issues.reduce((sum, issue) => sum + issue.seconds, 0);
      const subtasks = issues.filter((issue) => issue.isSubtask);
      const subtaskSeconds = subtasks.reduce((sum, issue) => sum + issue.seconds, 0);
      const issueTypeTotalsMap = new Map();
      for (const issue of issues) {
        const current = issueTypeTotalsMap.get(issue.issueType) || 0;
        issueTypeTotalsMap.set(issue.issueType, current + issue.seconds);
      }
      const issueTypeTotals = [...issueTypeTotalsMap.entries()]
        .map(([issueType, seconds]) => ({
          issueType,
          hours: Number((seconds / 3600).toFixed(2)),
        }))
        .sort((a, b) => b.hours - a.hours);
      return {
        projectKey: project.projectKey,
        projectName: project.projectName,
        issueCount: issues.length,
        issueHours: Number((issueSeconds / 3600).toFixed(2)),
        issueTypeTotals,
        subtaskCount: subtasks.length,
        subtaskHours: Number((subtaskSeconds / 3600).toFixed(2)),
        issues,
        subtasks,
      };
    })
    .sort((a, b) => a.projectKey.localeCompare(b.projectKey));
  for (const projectKey of detailedSet) {
    if (detailedProjects.some((project) => project.projectKey === projectKey)) continue;
    const foundProject = projects.find((project) => project.projectKey === projectKey);
    detailedProjects.push({
      projectKey,
      projectName: foundProject?.projectName || projectKey,
      issueCount: 0,
      issueHours: 0,
      issueTypeTotals: [],
      subtaskCount: 0,
      subtaskHours: 0,
      issues: [],
      subtasks: [],
    });
  }
  detailedProjects.sort((a, b) => a.projectKey.localeCompare(b.projectKey));

  return {
    user: {
      mode: userContext.mode,
      requestedEmail: userContext.requestedEmail || null,
      resolvedEmail: userContext.targetUser?.emailAddress || null,
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

async function collectAnnualLeaves2025(token, rootIssueKey = ANNUAL_LEAVES_ISSUE_KEY, requestedEmail = '') {
  const userContext = await resolveTargetUser(token, requestedEmail);
  const normalizedRootKey = String(rootIssueKey || ANNUAL_LEAVES_ISSUE_KEY).trim().toUpperCase();
  const escapedRootKey = escapeJqlString(normalizedRootKey);
  const leavesProjectKey = normalizedRootKey.includes('-') ? normalizedRootKey.split('-')[0] : normalizedRootKey;
  const fields = 'key,summary,status,issuetype,parent';
  const issueByKey = new Map();
  const discoveryLogs = [...userContext.notes];
  let usedFallbackScope = false;

  for (const authorScope of userContext.authorScopes) {
    const projectScopeJql =
      `${authorScope} ` +
      'AND worklogDate >= "2025-01-01" ' +
      'AND worklogDate <= "2025-12-31" ' +
      `AND project = ${leavesProjectKey}`;

    const projectScopeResult = await searchIssuesByJqlSafe(token, projectScopeJql, fields);
    if (!projectScopeResult.ok) {
      discoveryLogs.push(`Projet ${leavesProjectKey} non accessible avec ${authorScope}.`);
      continue;
    }
    for (const issue of projectScopeResult.issues) {
      issueByKey.set(issue.key, issue);
    }
  }

  if (!issueByKey.size) {
    const scopeQueries = [
      `issuekey = ${normalizedRootKey}`,
      `parent = ${normalizedRootKey}`,
      `"Epic Link" = ${normalizedRootKey}`,
      `"Parent Link" = ${normalizedRootKey}`,
      `issue in linkedIssues("${escapedRootKey}")`,
    ];

    for (const authorScope of userContext.authorScopes) {
      for (const scope of scopeQueries) {
        const jql =
          `${authorScope} ` +
          'AND worklogDate >= "2025-01-01" ' +
          'AND worklogDate <= "2025-12-31" ' +
          `AND (${scope})`;
        const result = await searchIssuesByJqlSafe(token, jql, fields);
        if (!result.ok) {
          discoveryLogs.push(`Filtre non disponible: ${scope} / ${authorScope}`);
          continue;
        }
        for (const issue of result.issues) {
          issueByKey.set(issue.key, issue);
        }
      }
    }

    usedFallbackScope = true;
  }

  const leavesIssues = [...issueByKey.values()];

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

    while (true) {
      const logs = await jiraFetchJson(
        token,
        `/rest/api/2/issue/${encodeURIComponent(issueKey)}/worklog?startAt=${wlStart}&maxResults=${wlMax}`
      );
      const worklogs = logs.worklogs || [];

      for (const wl of worklogs) {
        if (!inDateRange(wl.started)) continue;
        if (!sameUser(wl.author, userContext.targetUser)) continue;
        const seconds = Number(wl.timeSpentSeconds || 0);
        if (!seconds) continue;
        keptWorklogs += 1;
        issueSeconds += seconds;
      }

      wlStart += worklogs.length;
      if (wlStart >= (logs.total || 0) || worklogs.length === 0) break;
    }

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
  const issueTypeTotalsMap = new Map();
  for (const issue of issues) {
    const current = issueTypeTotalsMap.get(issue.issueType) || 0;
    issueTypeTotalsMap.set(issue.issueType, current + issue.seconds);
  }
  const issueTypeTotals = [...issueTypeTotalsMap.entries()]
    .map(([issueType, seconds]) => ({
      issueType,
      hours: Number((seconds / 3600).toFixed(2)),
    }))
    .sort((a, b) => b.hours - a.hours);
  const subtasks = issues.filter((issue) => issue.isSubtask);
  const subtaskSeconds = subtasks.reduce((sum, issue) => sum + issue.seconds, 0);

  const totalHours = Number((totalSeconds / 3600).toFixed(2));
  const totalDays = Number((totalHours / WORKING_DAY_HOURS).toFixed(2));

  return {
    user: {
      mode: userContext.mode,
      requestedEmail: userContext.requestedEmail || null,
      resolvedEmail: userContext.targetUser?.emailAddress || null,
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
    subtaskHours: Number((subtaskSeconds / 3600).toFixed(2)),
    discovery: {
      projectKey: leavesProjectKey,
      usedFallbackScope,
      sourceIssueCount: leavesIssues.length,
      notes: discoveryLogs,
    },
    workingDayHours: WORKING_DAY_HOURS,
    issues,
  };
}

app.get('/api/health', (_, res) => {
  res.json({ ok: true, port: API_PORT });
});

app.post('/api/mcp/setup', async (req, res) => {
  const logs = [];
  try {
    const token = String(req.body?.token || '').trim();
    if (!token) {
      res.status(400).json({ error: "La clé d'accès Jira est requise." });
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

app.post('/api/jira/report', async (req, res) => {
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

app.post('/api/jira/leaves', async (req, res) => {
  try {
    const token = await getTokenFromRequestOrConfig(req.body?.token);
    if (!token) {
      res.status(400).json({ error: "Aucune clé d'accès trouvée." });
      return;
    }

    const leaves = await collectAnnualLeaves2025(
      token,
      req.body?.issueKey || ANNUAL_LEAVES_ISSUE_KEY,
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
  app.listen(API_PORT, '127.0.0.1', () => {
    console.log(`API ready on http://localhost:${API_PORT}`);
  });
}

startServer().catch((err) => {
  console.error(`Startup error: ${err.message}`);
  process.exit(1);
});
