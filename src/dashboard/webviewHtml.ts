import type { DashboardRow } from './dashboardService';
import type * as vscode from 'vscode';
import { dashboardWebviewStyles } from './webviewStyles';
import { renderDashboardScript } from './webviewScript';

export interface DashboardRenderState {
  loading?: boolean;
  message?: string;
  updatedAt?: number;
  filter?: string;
  activeTags?: string[];
  filterMinChars?: number;
  filterMatchMode?: 'substring' | 'fuzzy';
  authSummary?: string;
  progressCurrent?: number;
  progressTotal?: number;
  progressLabel?: string;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  colWidths?: Record<string, number>;
}

export function renderDashboardHtml(rows: DashboardRow[], webview: vscode.Webview, state?: DashboardRenderState): string {
  const nonce = randomNonce();
  const rowsHtml = rows.length > 0
    ? rows.map((row) => renderRow(row, state?.updatedAt)).join('')
    : renderEmptyState(state);
  const progressPercent = formatProgressPercent(state?.progressCurrent, state?.progressTotal);
  const progressHiddenClass = state?.loading ? '' : 'hidden';
  const filterMinChars = state?.filterMinChars ?? 0;
  const filterPlaceholder = filterMinChars > 0
    ? `Filter projects… (min ${filterMinChars} chars)`
    : 'Filter projects…';

  const initialState = {
    sortKey: state?.sortKey,
    sortDir: state?.sortDir,
    colWidths: state?.colWidths,
    activeTags: state?.activeTags ?? [],
    filterMinChars,
    filterMatchMode: state?.filterMatchMode ?? 'substring'
  };
  const initialStateJson = serializeJson(initialState);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ForgeFlow Dashboard</title>
  <style>
${dashboardWebviewStyles}
</style>
</head>
<body>
  <div class="progress ${progressHiddenClass}" id="progress">
    <div class="progress-fill" id="progress-fill" style="width: ${progressPercent};"></div>
  </div>
  <header>
    <div class="title">
      <h2>ForgeFlow: Dashboard</h2>
      ${state?.updatedAt ? `<span class="status">Updated ${escapeHtml(formatTimestamp(state.updatedAt))}</span>` : ''}
      ${state?.loading ? `<span class="status" id="status-refresh">${escapeHtml(formatRefreshLabel(state.progressCurrent, state.progressTotal, state.progressLabel))}</span>` : ''}
      ${state?.authSummary ? `<span class="status">${escapeHtml(state.authSummary)}</span>` : ''}
    </div>
    <div class="controls">
      <input class="filter" id="filter" type="text" placeholder="${escapeHtml(filterPlaceholder)}" value="${escapeHtml(state?.filter ?? '')}" />
      <button class="clear" id="clear">Clear</button>
      <button class="focus" id="focus">Focus</button>
      <span class="count" id="count"></span>
      ${state?.loading ? '<button class="cancel" id="cancel">Cancel</button>' : ''}
      <button class="refresh" id="refresh">Refresh</button>
    </div>
  </header>
  <div class="page">
  <table>
    <colgroup>
      <col data-col="local" />
      <col data-col="host" />
      <col data-col="actions" />
      <col data-col="activity" />
      <col data-col="refreshed" />
      <col data-col="health" />
      <col data-col="issues" />
      <col data-col="prs" />
      <col data-col="stars" />
      <col data-col="version" />
      <col data-col="released" />
      <col data-col="tags" />
      <col data-col="visibility" />
    </colgroup>
    <thead>
      <tr>
        <th class="resizable" data-col="local" data-key="local" data-type="string">local<span class="col-resizer" data-col="local"></span></th>
        <th class="resizable" data-col="host" data-key="repo" data-type="string">host<span class="col-resizer" data-col="host"></span></th>
        <th class="resizable" data-col="actions">actions<span class="col-resizer" data-col="actions"></span></th>
        <th class="resizable" data-col="activity" data-key="activityTs" data-type="number">activity<span class="col-resizer" data-col="activity"></span></th>
        <th class="resizable" data-col="refreshed" data-key="refreshedTs" data-type="number">refreshed<span class="col-resizer" data-col="refreshed"></span></th>
        <th class="resizable" data-col="health" data-key="health" data-type="number">health<span class="col-resizer" data-col="health"></span></th>
        <th class="resizable" data-col="issues" data-key="issues" data-type="number">issues<span class="col-resizer" data-col="issues"></span></th>
        <th class="resizable" data-col="prs" data-key="prs" data-type="number">PR<span class="col-resizer" data-col="prs"></span></th>
        <th class="resizable" data-col="stars" data-key="stars" data-type="number">stars<span class="col-resizer" data-col="stars"></span></th>
        <th class="resizable" data-col="version" data-key="version" data-type="string">version<span class="col-resizer" data-col="version"></span></th>
        <th class="resizable" data-col="released" data-key="releasedTs" data-type="number">released<span class="col-resizer" data-col="released"></span></th>
        <th class="resizable" data-col="tags" data-key="tags" data-type="string">tags<span class="col-resizer" data-col="tags"></span></th>
        <th class="resizable" data-col="visibility" data-key="visibility" data-type="string">visibility<span class="col-resizer" data-col="visibility"></span></th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr id="filter-empty" hidden>
        <td colspan="13" class="empty">No projects match the filter.</td>
      </tr>
    </tbody>
  </table>
  <div class="summary" id="summary"></div>
  </div>
  <div id="context-menu" class="context-menu hidden">
    <button class="context-item" data-action="openRepo">Open Repository</button>
    <button class="context-item" data-action="openProject">Open Project</button>
    <button class="context-item" data-action="revealInOs">Reveal in OS</button>
    <button class="context-item" data-action="copyPath">Copy Path</button>
    <button class="context-item" data-action="copyRelative">Copy Relative Path</button>
  </div>

  <script nonce="${nonce}">
${renderDashboardScript(initialStateJson)}
</script>
</body>
</html>`;
}

function renderRow(row: DashboardRow, updatedAt?: number): string {
  const issues = numericValue(row.issues);
  const prs = numericValue(row.prs);
  const stars = numericValue(row.stars);
  const releasedTs = dateValue(row.released);
  const refreshedTs = updatedAt ?? 0;
  const refreshedText = refreshedTs ? formatAge(refreshedTs) : 'n/a';
  const providerClass = normalizeProvider(row.provider);
  const visibilityClass = normalizeVisibility(row.visibility);
  const statusClass = normalizeStatus(row.providerStatus);
  const statusLabel = formatStatusLabel(row.providerStatus);
  const highlightClass = row.highlight ? 'warn' : '';
  const archivedClass = row.archived ? 'archived' : '';
  const favoriteClass = row.favorite ? 'favorite' : '';
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const rowClasses = [highlightClass, archivedClass, favoriteClass].filter(Boolean).join(' ');
  const tagsLabel = tags.length > 0 ? tags.join(', ') : 'n/a';
  const tagsCell = renderTagsCell(tags);
  const tagsLower = tags.map((tag) => tag.toLowerCase());
  const healthScore = typeof row.healthScore === 'number' ? row.healthScore : undefined;
  const healthIssues = Array.isArray(row.healthIssues) ? row.healthIssues : [];
  const healthStatus = row.healthStatus ?? (healthScore !== undefined ? 'warn' : 'unknown');
  const healthLabel = healthScore !== undefined ? String(healthScore) : 'n/a';
  const healthTitle = formatHealthTitle(healthScore, healthIssues);
  const repoCell = row.repoUrl
    ? `<a class="repo-link" data-url="${escapeHtml(row.repoUrl)}">${escapeHtml(row.repo)}</a>`
    : `<span>${escapeHtml(row.repo)}</span>`;
  const localCell = row.localPath
    ? `<span class="mono" title="${escapeHtml(row.projectPath ?? row.localPath)}">${escapeHtml(row.localPath)}</span>`
    : `<span class="mono">n/a</span>`;
  const actionsCell = buildActionsCell(row);

  const statusBadge = statusLabel
    ? `<span class="badge status ${statusClass}" title="${escapeHtml(formatStatusTooltip(row.providerStatus))}">${escapeHtml(statusLabel)}</span>`
    : '';
  const hostCell = `<div class="host-cell"><span class="host-line"><span class="badge ${providerClass}">${escapeHtml(row.provider)}</span>${statusBadge}</span>${repoCell}</div>`;
  const searchText = [
    row.repo,
    row.repoUrl,
    row.projectPath,
    row.localPath,
    row.provider,
    row.visibility,
    row.providerStatus,
    row.favorite ? 'favorite' : undefined,
    tags.join(' '),
    healthIssues.join(' ')
  ].filter(Boolean).join(' ');

  return `
    <tr class="${rowClasses}" data-row="data"
      data-activityTs="${row.activityTimestamp}"
      data-issues="${issues}"
      data-prs="${prs}"
      data-stars="${stars}"
      data-version="${escapeHtml(row.version)}"
      data-releasedTs="${releasedTs}"
      data-refreshedTs="${refreshedTs}"
      data-provider="${escapeHtml(row.provider)}"
      data-visibility="${escapeHtml(row.visibility)}"
      data-repo="${escapeHtml(row.repo)}"
      data-local="${escapeHtml(row.localPath ?? '')}"
      data-local-path="${escapeHtml(row.localPath ?? '')}"
      data-project-path="${escapeHtml(row.projectPath ?? '')}"
      data-repo-url="${escapeHtml(row.repoUrl ?? '')}"
      data-tags="${escapeHtml(tagsLabel)}"
      data-tags-list="${escapeHtml(tagsLower.join('|'))}"
      data-archived="${row.archived ? 'true' : 'false'}"
      data-favorite="${row.favorite ? 'true' : 'false'}"
      data-highlight="${row.highlight ? 'true' : 'false'}"
      data-health="${healthScore ?? ''}"
      data-search="${escapeHtml(searchText)}">
      <td data-col="local">${localCell}</td>
      <td data-col="host">${hostCell}</td>
      <td data-col="actions">${actionsCell}</td>
      <td data-col="activity">${escapeHtml(row.activity)}</td>
      <td data-col="refreshed">${escapeHtml(refreshedText)}</td>
      <td data-col="health"><span class="badge health ${escapeHtml(healthStatus)}" title="${escapeHtml(healthTitle)}">${escapeHtml(healthLabel)}</span></td>
      <td data-col="issues">${escapeHtml(row.issues)}</td>
      <td data-col="prs">${escapeHtml(row.prs)}</td>
      <td data-col="stars">${escapeHtml(row.stars)}</td>
      <td data-col="version">${escapeHtml(row.version)}</td>
      <td data-col="released">${escapeHtml(row.released)}</td>
      <td data-col="tags">${tagsCell}</td>
      <td data-col="visibility"><span class="badge ${visibilityClass}">${escapeHtml(row.visibility)}</span></td>
    </tr>
  `;
}

function buildActionsCell(row: DashboardRow): string {
  const actions: string[] = [];
  if (row.repoUrl) {
    actions.push(actionButton('repo-open', row.repoUrl, 'Open repository', iconLink(), 'data-url'));
  }
  if (row.projectPath) {
    actions.push(actionButton('open-local', row.projectPath, 'Open local project', iconFolderOpen(), 'data-path'));
    actions.push(actionButton('reveal-local', row.projectPath, 'Reveal in OS', iconReveal(), 'data-path'));
    actions.push(actionButton('copy-local', row.projectPath, 'Copy path', iconCopy(), 'data-path'));
    actions.push(actionButton('copy-relative', row.localPath ?? row.projectPath, 'Copy relative path', iconCopySmall(), 'data-relative'));
    actions.push(actionButton('open-terminal', row.projectPath, 'Open in terminal', iconTerminal(), 'data-path'));
    actions.push(actionButton('run-project', row.projectPath, 'Run entry point', iconRun(), 'data-path'));
    actions.push(actionButton('git-clean', row.projectPath, 'Git clean project', iconClean(), 'data-path'));
    actions.push(actionButton('open-vs', row.projectPath, 'Open in Visual Studio', iconWindow(), 'data-path'));
  }
  if (actions.length === 0) {
    return `<span class="mono">n/a</span>`;
  }
  return `<span class="actions">${actions.join('')}</span>`;
}

function renderTagsCell(tags: string[]): string {
  if (!Array.isArray(tags) || tags.length === 0) {
    return `<span class="mono">n/a</span>`;
  }
  return tags
    .map((tag) => `<button class="tag-chip" data-tag="${escapeHtml(tag)}" title="Toggle tag filter">${escapeHtml(tag)}</button>`)
    .join('');
}

function actionButton(className: string, value: string, title: string, icon: string, attr: 'data-path' | 'data-url' | 'data-relative'): string {
  const dataValue = escapeHtml(value);
  return `<button class="action-button ${className}" ${attr}="${dataValue}" title="${escapeHtml(title)}">${icon}<span class="sr-only">${escapeHtml(title)}</span></button>`;
}

function iconLink(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 1 0-8h4v2h-4a2 2 0 1 0 0 4h4v2h-4z"></path><path d="M14 18v-2h4a2 2 0 1 0 0-4h-4v-2h4a4 4 0 0 1 0 8h-4z"></path></svg>';
}

function iconFolderOpen(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3V6z"></path><path d="M3 9h18l-2 9H5L3 9z"></path></svg>';
}

function iconReveal(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5zm8 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"></path></svg>';
}

function iconCopy(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V7z"></path><path d="M6 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1H13V5H5v10h1v2z"></path></svg>';
}

function iconCopySmall(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9h10v10H9z"></path><path d="M5 5h10v2H7v8H5z"></path></svg>';
}

function iconTerminal(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm1.5 4.5 3.5 3.5-1.4 1.4-4.9-4.9 4.9-4.9 1.4 1.4-3.5 3.5zm5.5 4h6v2h-6v-2z"></path></svg>';
}

function iconRun(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>';
}

function iconClean(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v2H3V6zm2 4h14l-1.5 10h-11L5 10zm5-6h4l1 2H9l1-2z"></path></svg>';
}

function iconWindow(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm2 0v2h14V5H5zm0 4v10h14V9H5z"></path></svg>';
}

function renderEmptyState(state?: DashboardRenderState): string {
  if (state?.loading) {
    const message = state.message ?? 'Loading dashboard data...';
    return `<tr><td colspan="13" class="empty"><span class="loading"><span class="spinner"></span>${escapeHtml(message)}</span></td></tr>`;
  }
  return '<tr><td colspan="13" class="empty">No tracked projects configured.</td></tr>';
}

function numericValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : -1;
}

function dateValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? -1 : parsed;
}

function normalizeProvider(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes('github')) {
    return 'github';
  }
  if (lower.includes('gitlab')) {
    return 'gitlab';
  }
  if (lower.includes('azure')) {
    return 'azure';
  }
  return 'unknown';
}

function normalizeVisibility(value: string): string {
  const lower = value.toLowerCase();
  if (lower === 'private') {
    return 'private';
  }
  if (lower === 'public') {
    return 'public';
  }
  return 'unknown';
}

function normalizeStatus(value: string): string {
  if (!value) {
    return 'unknown';
  }
  return value.toLowerCase();
}

function formatStatusLabel(value: string): string {
  switch (value) {
    case 'limited':
      return 'LIMITED';
    case 'unauthorized':
      return 'AUTH';
    case 'error':
      return 'ERROR';
    default:
      return '';
  }
}

function formatStatusTooltip(value: string): string {
  switch (value) {
    case 'limited':
      return 'Provider status: LIMITED — API rate limit reached.';
    case 'unauthorized':
      return 'Provider status: UNAUTHORIZED — token missing or lacks access.';
    case 'error':
      return 'Provider status: ERROR — request failed (network or API error).';
    default:
      return 'Provider status: OK — authenticated and reachable.';
  }
}

function formatHealthTitle(score: number | undefined, issues: string[]): string {
  if (typeof score !== 'number') {
    return 'Health score: n/a.';
  }
  if (issues.length === 0) {
    return `Health score: ${score}/100 — all checks passed.`;
  }
  return `Health score: ${score}/100 — missing ${issues.join(', ')}.`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

function randomNonce(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 16; index += 1) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value;
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value ?? {}).replace(/</g, '\\u003c');
}

function formatTimestamp(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString();
}

function formatRefreshLabel(current?: number, total?: number, label?: string): string {
  const text = total && total > 0
    ? `Refreshing… (${current ?? 0}/${total})`
    : 'Refreshing…';
  if (label) {
    return `${text} • ${label}`;
  }
  return text;
}

function formatProgressPercent(current?: number, total?: number): string {
  if (!total || total <= 0 || current === undefined) {
    return '0%';
  }
  const percent = Math.min(100, Math.max(0, (current / total) * 100));
  return `${percent.toFixed(1)}%`;
}

function formatAge(value: number): string {
  const deltaMs = Date.now() - value;
  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    return 'n/a';
  }
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
