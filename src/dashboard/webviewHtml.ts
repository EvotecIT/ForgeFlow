import type { DashboardRow } from './dashboardService';
import type * as vscode from 'vscode';

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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ForgeFlow Dashboard</title>
  <style>
    :root {
      color-scheme: light dark;
      --ff-bg: var(--vscode-editor-background);
      --ff-fg: var(--vscode-editor-foreground);
      --ff-border: var(--vscode-panel-border);
      --ff-warn: color-mix(in srgb, var(--vscode-inputValidation-warningBackground) 60%, transparent);
      --ff-warn-text: var(--vscode-inputValidation-warningForeground);
      --ff-muted: color-mix(in srgb, var(--ff-fg) 65%, transparent);
      --ff-accent: color-mix(in srgb, var(--vscode-textLink-foreground) 85%, transparent);
      --ff-row: color-mix(in srgb, var(--ff-fg) 8%, transparent);
    }
    body {
      margin: 0;
      font-family: ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      background: var(--ff-bg);
      color: var(--ff-fg);
    }
    .page {
      padding: 12px;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      gap: 8px;
      flex-wrap: wrap;
      position: sticky;
      top: 0;
      z-index: 4;
      background: var(--ff-bg);
      padding: 12px 12px 8px;
      border-bottom: 1px solid var(--ff-border);
    }
    .progress {
      height: 4px;
      background: color-mix(in srgb, var(--ff-fg) 10%, transparent);
      border-radius: 999px;
      overflow: hidden;
      margin: 0 12px 8px;
    }
    .progress.hidden {
      display: none;
    }
    .progress-fill {
      height: 100%;
      width: 0%;
      background: var(--vscode-textLink-foreground);
      transition: width 0.2s ease;
    }
    .title {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .controls {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .status {
      font-size: 12px;
      color: var(--ff-muted);
      margin-right: 8px;
    }
    h2 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    button.refresh {
      background: transparent;
      border: 1px solid var(--ff-border);
      color: var(--ff-fg);
      padding: 4px 8px;
      font-size: 12px;
      cursor: pointer;
    }
    button.clear {
      background: transparent;
      border: 1px solid var(--ff-border);
      color: var(--ff-fg);
      padding: 4px 8px;
      font-size: 12px;
      cursor: pointer;
    }
    button.focus {
      background: transparent;
      border: 1px solid var(--ff-border);
      color: var(--ff-fg);
      padding: 4px 8px;
      font-size: 12px;
      cursor: pointer;
    }
    button.cancel {
      background: transparent;
      border: 1px solid var(--ff-border);
      color: var(--ff-fg);
      padding: 4px 8px;
      font-size: 12px;
      cursor: pointer;
    }
    input.filter {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--ff-border);
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 12px;
      min-width: 200px;
    }
    input.filter.minchars {
      border-color: var(--ff-warn);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--ff-warn) 70%, transparent);
    }
    .count {
      font-size: 11px;
      color: var(--ff-muted);
      margin-left: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 12px;
    }
    th, td {
      text-align: left;
      padding: 6px 8px;
      border-bottom: 1px solid var(--ff-border);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    th {
      font-weight: 600;
      opacity: 0.85;
      cursor: pointer;
      user-select: none;
      position: sticky;
      top: var(--ff-header-height, 48px);
      background: var(--ff-bg);
      z-index: 3;
    }
    th.resizable {
      position: sticky;
    }
    th.resizable .col-resizer {
      position: absolute;
      top: 0;
      right: 0;
      width: 6px;
      height: 100%;
      cursor: col-resize;
      user-select: none;
    }
    th.resizing {
      cursor: col-resize;
    }
    th .col-resizer:hover {
      background: color-mix(in srgb, var(--ff-accent) 25%, transparent);
    }
    th.sort-asc::after {
      content: ' ▲';
      opacity: 0.6;
    }
    th.sort-desc::after {
      content: ' ▼';
      opacity: 0.6;
    }
    tbody tr:nth-child(even) {
      background: var(--ff-row);
    }
    tbody tr:hover {
      background: color-mix(in srgb, var(--ff-accent) 12%, transparent);
    }
    tr.warn {
      background: var(--ff-warn);
      color: var(--ff-warn-text);
    }
    tr.archived {
      opacity: 0.55;
    }
    tr.favorite {
      box-shadow: inset 3px 0 0 var(--vscode-textLink-foreground);
    }
    tr.favorite td:first-child {
      position: relative;
      padding-left: 14px;
    }
    tr.favorite td:first-child::before {
      content: '*';
      position: absolute;
      left: 4px;
      top: 7px;
      font-size: 10px;
      color: var(--vscode-textLink-foreground);
    }
    td.empty {
      padding: 16px 8px;
      color: var(--ff-muted);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border: 1px solid color-mix(in srgb, var(--ff-border) 80%, transparent);
    }
    .badge.github { color: #8bb4ff; border-color: #3b82f6; }
    .badge.gitlab { color: #ffb18b; border-color: #f97316; }
    .badge.azure { color: #8cd0ff; border-color: #0ea5e9; }
    .badge.unknown { color: var(--ff-muted); }
    .badge.private { color: #fca5a5; border-color: #ef4444; }
    .badge.public { color: #86efac; border-color: #22c55e; }
    .badge.status { margin-left: 6px; }
    .badge.status.limited { color: #facc15; border-color: #eab308; }
    .badge.status.unauthorized { color: #fca5a5; border-color: #f87171; }
    .badge.status.error { color: #f87171; border-color: #ef4444; }
    .badge.health.ok { color: #86efac; border-color: #22c55e; }
    .badge.health.warn { color: #facc15; border-color: #eab308; }
    .badge.health.bad { color: #f87171; border-color: #ef4444; }
    .badge.health.unknown { color: var(--ff-muted); }
    .repo-link {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      cursor: pointer;
    }
    .repo-link:hover {
      text-decoration: underline;
    }
    .host-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .host-line {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .actions {
      display: inline-flex;
      gap: 6px;
      align-items: center;
    }
    .action-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--ff-border);
      border-radius: 6px;
      width: 24px;
      height: 24px;
      text-decoration: none;
      color: var(--ff-fg);
      background: color-mix(in srgb, var(--ff-fg) 6%, transparent);
      cursor: pointer;
      padding: 0;
    }
    .action-button.primary {
      border-color: color-mix(in srgb, var(--vscode-textLink-foreground) 60%, transparent);
      color: var(--vscode-textLink-foreground);
    }
    .action-button svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .action-button:hover {
      background: color-mix(in srgb, var(--ff-accent) 18%, transparent);
    }
    .mono {
      color: var(--ff-muted);
    }
    .loading {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .spinner {
      width: 12px;
      height: 12px;
      border: 2px solid color-mix(in srgb, var(--ff-fg) 20%, transparent);
      border-top-color: var(--vscode-textLink-foreground);
      border-radius: 999px;
      animation: spin 0.9s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .summary {
      margin-top: 8px;
      font-size: 11px;
      color: var(--ff-muted);
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .context-menu {
      position: fixed;
      min-width: 180px;
      background: var(--vscode-menu-background, var(--ff-bg));
      border: 1px solid var(--ff-border);
      border-radius: 8px;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3);
      padding: 6px 0;
      z-index: 10;
    }
    .context-menu.hidden {
      display: none;
    }
    .context-item {
      width: 100%;
      text-align: left;
      background: transparent;
      border: none;
      color: var(--ff-fg);
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
    }
    .context-item:hover {
      background: color-mix(in srgb, var(--ff-accent) 18%, transparent);
    }
    .context-item.disabled {
      opacity: 0.5;
      cursor: default;
    }
    .tag-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--ff-border) 80%, transparent);
      background: color-mix(in srgb, var(--ff-fg) 6%, transparent);
      color: var(--ff-fg);
      padding: 2px 8px;
      font-size: 11px;
      cursor: pointer;
    }
    .tag-chip.active {
      border-color: var(--vscode-textLink-foreground);
      color: var(--vscode-textLink-foreground);
      background: color-mix(in srgb, var(--vscode-textLink-foreground) 15%, transparent);
    }
    .tag-chip + .tag-chip {
      margin-left: 4px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--ff-border) 80%, transparent);
      background: color-mix(in srgb, var(--ff-fg) 6%, transparent);
      font-size: 11px;
      color: var(--ff-fg);
    }
    .pill .icon {
      width: 12px;
      height: 12px;
      display: inline-flex;
    }
    .pill .icon svg {
      width: 12px;
      height: 12px;
      fill: currentColor;
    }
    .pill.emphasis {
      border-color: color-mix(in srgb, var(--vscode-textLink-foreground) 60%, transparent);
      color: var(--vscode-textLink-foreground);
    }
    @media (max-width: 1200px) {
      col[data-col="released"],
      th[data-col="released"],
      td[data-col="released"],
      col[data-col="version"],
      th[data-col="version"],
      td[data-col="version"] {
        display: none;
      }
    }
    @media (max-width: 1000px) {
      col[data-col="stars"],
      th[data-col="stars"],
      td[data-col="stars"],
      col[data-col="prs"],
      th[data-col="prs"],
      td[data-col="prs"],
      col[data-col="issues"],
      th[data-col="issues"],
      td[data-col="issues"] {
        display: none;
      }
    }
    @media (max-width: 850px) {
      col[data-col="refreshed"],
      th[data-col="refreshed"],
      td[data-col="refreshed"],
      col[data-col="health"],
      th[data-col="health"],
      td[data-col="health"] {
        display: none;
      }
    }
    @media (max-width: 720px) {
      col[data-col="tags"],
      th[data-col="tags"],
      td[data-col="tags"],
      col[data-col="visibility"],
      th[data-col="visibility"],
      td[data-col="visibility"] {
        display: none;
      }
    }
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
    const vscode = acquireVsCodeApi();
    const initialState = ${serializeJson(initialState)};
    document.getElementById('refresh')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'refresh' });
    });

    document.querySelectorAll('.repo-link, .repo-open').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const url = link.getAttribute('data-url');
        if (url) {
          vscode.postMessage({ type: 'openUrl', url });
        }
      });
    });
    document.querySelectorAll('.open-local').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const path = link.getAttribute('data-path');
        if (path) {
          vscode.postMessage({ type: 'openProject', path });
        }
      });
    });
    document.querySelectorAll('.reveal-local').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const path = link.getAttribute('data-path');
        if (path) {
          vscode.postMessage({ type: 'revealInOs', path });
        }
      });
    });
    document.querySelectorAll('.copy-local').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const path = link.getAttribute('data-path');
        if (path) {
          vscode.postMessage({ type: 'copyPath', path });
        }
      });
    });
    document.querySelectorAll('.copy-relative').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const rel = link.getAttribute('data-relative');
        if (rel) {
          vscode.postMessage({ type: 'copyRelativePath', path: rel });
        }
      });
    });
    document.querySelectorAll('.open-terminal').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const path = link.getAttribute('data-path');
        if (path) {
          vscode.postMessage({ type: 'openTerminal', path });
        }
      });
    });
    document.querySelectorAll('.run-project').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const path = link.getAttribute('data-path');
        if (path) {
          vscode.postMessage({ type: 'runProject', path });
        }
      });
    });
    document.querySelectorAll('.git-clean').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const path = link.getAttribute('data-path');
        if (path) {
          vscode.postMessage({ type: 'gitCleanProject', path });
        }
      });
    });
    document.querySelectorAll('.open-vs').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const path = link.getAttribute('data-path');
        if (path) {
          vscode.postMessage({ type: 'openVisualStudio', path });
        }
      });
    });

    const headers = document.querySelectorAll('th[data-key]');
    const tbody = document.querySelector('tbody');
    const filterInput = document.getElementById('filter');
    const clearButton = document.getElementById('clear');
    const focusButton = document.getElementById('focus');
    const cancelButton = document.getElementById('cancel');
    const countLabel = document.getElementById('count');
    const emptyRow = document.getElementById('filter-empty');
    const summaryEl = document.getElementById('summary');
    const refreshStatus = document.getElementById('status-refresh');
    const progressBar = document.getElementById('progress');
    const progressFill = document.getElementById('progress-fill');
    const resizers = document.querySelectorAll('.col-resizer');
    const columns = Array.from(document.querySelectorAll('col[data-col]'));
    const columnMap = new Map(columns.map((col) => [col.dataset.col, col]));
    const contextMenu = document.getElementById('context-menu');
    const contextItems = contextMenu ? Array.from(contextMenu.querySelectorAll('.context-item')) : [];
    let sortKey = 'activityTs';
    let sortDir = 'desc';
    const filterConfig = {
      minChars: Number(initialState.filterMinChars || 0),
      matchMode: initialState.filterMatchMode === 'fuzzy' ? 'fuzzy' : 'substring'
    };
    let activeTags = new Map();
    let lastFilter = '';
    let headerHeight = 48;
    let colWidths = {};
    let contextTarget = null;

    document.querySelectorAll('.tag-chip').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const tag = button.getAttribute('data-tag');
        if (!tag) {
          return;
        }
        const key = tag.toLowerCase();
        if (activeTags.has(key)) {
          activeTags.delete(key);
        } else {
          activeTags.set(key, tag);
        }
        updateTagChips();
        postTagFilter();
        applyFilter();
      });
    });

    function updateHeaderHeight() {
      const header = document.querySelector('header');
      if (!header) {
        return;
      }
      headerHeight = header.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--ff-header-height', headerHeight + 'px');
    }

    function updateProgress(current, total, label) {
      const safeTotal = Number(total || 0);
      const safeCurrent = Number(current || 0);
      if (progressBar && progressFill) {
        if (safeTotal > 0) {
          progressBar.classList.remove('hidden');
          const percent = Math.min(100, Math.max(0, (safeCurrent / safeTotal) * 100));
          progressFill.style.width = percent.toFixed(1) + '%';
        } else {
          progressFill.style.width = '0%';
        }
      }
      if (refreshStatus) {
        refreshStatus.textContent = safeTotal > 0
          ? 'Refreshing… (' + String(safeCurrent) + '/' + String(safeTotal) + ')' + (label ? ' • ' + label : '')
          : 'Refreshing…' + (label ? ' • ' + label : '');
      }
    }

    function updateHeaders() {
      headers.forEach((th) => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.key === sortKey) {
          th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
      });
    }

    function compareValues(a, b, type) {
      if (type === 'number') {
        return (Number(a) || 0) - (Number(b) || 0);
      }
      return String(a).localeCompare(String(b));
    }

    function sortRows() {
      if (!tbody) {
        return;
      }
      const rows = Array.from(tbody.querySelectorAll('tr[data-row="data"]'));
      rows.sort((rowA, rowB) => {
        const a = rowA.dataset[sortKey] || '';
        const b = rowB.dataset[sortKey] || '';
        const type = document.querySelector('th[data-key="' + sortKey + '"]')?.dataset.type || 'string';
        const result = compareValues(a, b, type);
        return sortDir === 'asc' ? result : -result;
      });
      rows.forEach((row) => tbody.appendChild(row));
    }

    function updateCount(visible, total) {
      if (countLabel) {
        countLabel.textContent = total > 0 ? String(visible) + '/' + String(total) : '';
      }
    }

    function updateSummary(rows, visible) {
      if (!summaryEl) {
        return;
      }
      let favorites = 0;
      let isPublic = 0;
      let isPrivate = 0;
      let unknownVisibility = 0;
      let archived = 0;
      let alerts = 0;
      let issueSum = 0;
      let prSum = 0;
      let starSum = 0;
      const hosts = { github: 0, gitlab: 0, azure: 0, unknown: 0 };
      rows.forEach((row) => {
        if (row.hidden) {
          return;
        }
        if (row.dataset.favorite === 'true') {
          favorites += 1;
        }
        if (row.dataset.archived === 'true') {
          archived += 1;
        }
        if (row.dataset.highlight === 'true') {
          alerts += 1;
        }
        const issues = Number(row.dataset.issues ?? -1);
        if (Number.isFinite(issues) && issues >= 0) {
          issueSum += issues;
        }
        const prs = Number(row.dataset.prs ?? -1);
        if (Number.isFinite(prs) && prs >= 0) {
          prSum += prs;
        }
        const stars = Number(row.dataset.stars ?? -1);
        if (Number.isFinite(stars) && stars >= 0) {
          starSum += stars;
        }
        const visibility = (row.dataset.visibility || '').toLowerCase();
        if (visibility === 'public') {
          isPublic += 1;
        } else if (visibility === 'private') {
          isPrivate += 1;
        } else {
          unknownVisibility += 1;
        }
        const provider = (row.dataset.provider || '').toLowerCase();
        if (provider.includes('github')) {
          hosts.github += 1;
        } else if (provider.includes('gitlab')) {
          hosts.gitlab += 1;
        } else if (provider.includes('azure')) {
          hosts.azure += 1;
        } else {
          hosts.unknown += 1;
        }
      });
      const pills = [
        pill(iconList(), 'Visible', String(visible) + '/' + String(rows.length), 'emphasis'),
        pill(iconStar(), 'Favorites', String(favorites)),
        pill(iconAlert(), 'Alerts', String(alerts)),
        pill(iconIssue(), 'Issues', String(issueSum)),
        pill(iconPr(), 'PR', String(prSum)),
        pill(iconSparkles(), 'Stars', String(starSum)),
        pill(iconUnlock(), 'Public', String(isPublic)),
        pill(iconLock(), 'Private', String(isPrivate)),
        pill(iconArchive(), 'Archived', String(archived)),
        pill(iconGitHub(), 'GH', String(hosts.github)),
        pill(iconGitLab(), 'GL', String(hosts.gitlab)),
        pill(iconAzure(), 'AZ', String(hosts.azure))
      ];
      if (unknownVisibility > 0 || hosts.unknown > 0) {
        pills.push(pill(iconQuestion(), 'Unknown', String(unknownVisibility + hosts.unknown)));
      }
      summaryEl.innerHTML = pills.join('');
    }

    function applyColumnWidths(widths) {
      Object.keys(widths || {}).forEach((key) => {
        const col = columnMap.get(key);
        const value = Number(widths[key]);
        if (col && Number.isFinite(value) && value > 40) {
          col.style.width = value + 'px';
        }
      });
    }

    function persistState() {
      const current = vscode.getState() || {};
      vscode.setState({
        ...current,
        filter: lastFilter,
        sortKey,
        sortDir,
        colWidths,
        activeTags: Array.from(activeTags.values())
      });
      vscode.postMessage({ type: 'setViewState', sortKey, sortDir, colWidths });
    }

    function normalizeFilter(value) {
      const trimmed = String(value || '').trim();
      if (!trimmed || trimmed.length < filterConfig.minChars) {
        return '';
      }
      return trimmed;
    }

    function matchesToken(haystack, needle) {
      if (!needle) {
        return true;
      }
      if (filterConfig.matchMode === 'fuzzy') {
        let needleIndex = 0;
        for (let i = 0; i < haystack.length; i += 1) {
          if (haystack[i] === needle[needleIndex]) {
            needleIndex += 1;
            if (needleIndex >= needle.length) {
              return true;
            }
          }
        }
        return false;
      }
      return haystack.includes(needle);
    }

    function tokenizeFilter(value) {
      const raw = String(value || '').trim();
      if (!raw) {
        return [];
      }
      const tokens = [];
      const regex = /"([^"]+)"|'([^']+)'|\S+/g;
      let match = null;
      while ((match = regex.exec(raw)) !== null) {
        const token = match[1] || match[2] || match[0];
        if (token) {
          tokens.push(token);
        }
      }
      return tokens;
    }

    function parseFilterQuery(value) {
      const tokens = tokenizeFilter(value);
      const includes = [];
      const excludes = [];
      tokens.forEach((token) => {
        if (!token) {
          return;
        }
        const first = token[0];
        if (first === '-' || first === '!') {
          const cleaned = token.slice(1).trim().toLowerCase();
          if (cleaned) {
            excludes.push(cleaned);
          }
          return;
        }
        if (first === '+') {
          const cleaned = token.slice(1).trim().toLowerCase();
          if (cleaned) {
            includes.push(cleaned);
          }
          return;
        }
        includes.push(token.toLowerCase());
      });
      return { includes, excludes };
    }

    function matchesFilterQuery(haystack, query) {
      const parsed = parseFilterQuery(query);
      if (parsed.includes.length === 0 && parsed.excludes.length === 0) {
        return true;
      }
      for (let i = 0; i < parsed.includes.length; i += 1) {
        if (!matchesToken(haystack, parsed.includes[i])) {
          return false;
        }
      }
      for (let i = 0; i < parsed.excludes.length; i += 1) {
        if (matchesToken(haystack, parsed.excludes[i])) {
          return false;
        }
      }
      return true;
    }

    function setActiveTags(tags) {
      activeTags = new Map();
      (tags || []).forEach((tag) => {
        const value = String(tag || '').trim();
        if (!value) {
          return;
        }
        const key = value.toLowerCase();
        if (!activeTags.has(key)) {
          activeTags.set(key, value);
        }
      });
      updateTagChips();
    }

    function updateTagChips() {
      document.querySelectorAll('.tag-chip').forEach((button) => {
        const tag = button.getAttribute('data-tag') || '';
        const key = tag.toLowerCase();
        button.classList.toggle('active', activeTags.has(key));
      });
    }

    function postTagFilter() {
      vscode.postMessage({ type: 'setTagFilter', tags: Array.from(activeTags.values()) });
    }

    function applyFilter() {
      const raw = (filterInput && 'value' in filterInput) ? String(filterInput.value || '') : '';
      const trimmed = raw.trim();
      const filter = normalizeFilter(raw);
      const activeTagKeys = Array.from(activeTags.keys());
      const rows = Array.from(document.querySelectorAll('tr[data-row="data"]'));
      let visible = 0;
      rows.forEach((row) => {
        const haystack = (row.dataset.search || '').toLowerCase();
        const tagsList = String(row.dataset.tagsList || '').toLowerCase().split('|').filter(Boolean);
        const tagSet = new Set(tagsList);
        const tagsMatch = activeTagKeys.length === 0
          ? true
          : activeTagKeys.every((tag) => tagSet.has(tag));
        const isMatch = matchesFilterQuery(haystack, filter) && tagsMatch;
        row.hidden = !isMatch;
        if (isMatch) {
          visible += 1;
        }
      });
      if (emptyRow) {
        emptyRow.hidden = visible !== 0 || rows.length === 0;
      }
      if (filterInput && filterConfig.minChars > 0) {
        filterInput.classList.toggle('minchars', trimmed.length > 0 && trimmed.length < filterConfig.minChars);
      }
      updateCount(visible, rows.length);
      updateSummary(rows, visible);
      if (trimmed !== lastFilter) {
        lastFilter = trimmed;
        vscode.postMessage({ type: 'setFilter', filter: trimmed });
      }
      persistState();
    }

    function pill(icon, label, value, className) {
      const classes = ['pill'];
      if (className) {
        classes.push(className);
      }
      return '<span class="' + classes.join(' ') + '"><span class="icon">' + icon + '</span>' + label + ' ' + value + '</span>';
    }

    function iconList() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v2H4zM4 11h16v2H4zM4 16h16v2H4z"></path></svg>';
    }

    function iconStar() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"></path></svg>';
    }

    function iconAlert() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 16H3l9-16zm-1 6v5h2V9h-2zm0 7v2h2v-2h-2z"></path></svg>';
    }

    function iconIssue() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 .001 20A10 10 0 0 0 12 2zm1 5v6h-2V7h2zm0 8v2h-2v-2h2z"></path></svg>';
    }

    function iconPr() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3a3 3 0 1 1 0 6v12h2v-8h4a4 4 0 0 0 4-4V5h-2v4a2 2 0 0 1-2 2H8V9a3 3 0 0 1-2-6zm12 8a3 3 0 1 1 0 6v4h-2v-4a3 3 0 0 1 2-6z"></path></svg>';
    }

    function iconSparkles() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.8 4.4L18 8l-4.2 1.6L12 14l-1.8-4.4L6 8l4.2-1.6L12 2zm7 10l.8 2 2 0.8-2 0.8-.8 2-.8-2-2-.8 2-.8.8-2zM4 13l1 2.4L7.4 16 5 16.6 4 19l-1-2.4L1 16l2.4-.6L4 13z"></path></svg>';
    }

    function iconUnlock() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 8V6a5 5 0 0 0-9.7-2H5.3a7 7 0 0 1 13.4 2v2h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h10zm-5 5a2 2 0 0 0-1 3.7V19h2v-2.3A2 2 0 0 0 12 13z"></path></svg>';
    }

    function iconLock() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h1zm2 0h6V7a3 3 0 0 0-6 0v3zm3 4a2 2 0 0 0-1 3.7V19h2v-1.3A2 2 0 0 0 12 14z"></path></svg>';
    }

    function iconArchive() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h18l1 4H2l1-4zm2 6h14v11H5V9zm4 2h6v2H9v-2z"></path></svg>';
    }

    function iconGitHub() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .8a11.2 11.2 0 0 0-3.5 21.8c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.5-1.8-1.5-1.8-1.2-.9.1-.9.1-.9 1.3.1 2 .8 2 .8 1.2 2.1 3.1 1.5 3.8 1.1.1-.9.5-1.5.8-1.8-2.7-.3-5.5-1.4-5.5-6.1 0-1.3.5-2.3 1.2-3.2-.1-.3-.5-1.6.1-3.3 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 3 .1 3.3.8.9 1.2 2 1.2 3.2 0 4.7-2.8 5.8-5.5 6.1.5.4.9 1.2.9 2.4v3.5c0 .3.2.7.8.6A11.2 11.2 0 0 0 12 .8z"></path></svg>';
    }

    function iconGitLab() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22l4.4-13.6H7.6L12 22zm0 0L1.8 8.4h5.8L12 22zm0 0L22.2 8.4h-5.8L12 22zM7.6 8.4L9.6 2h4.8l2 6.4H7.6z"></path></svg>';
    }

    function iconAzure() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19l4-12 6-3 4 15-7-5-7 5zm9-8.5L8.8 6.2 6.2 15.4 14 10.5z"></path></svg>';
    }

    function iconQuestion() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 .001 20A10 10 0 0 0 12 2zm1 15h-2v-2h2v2zm1.7-6.5c-.4.6-1.1 1-1.5 1.3-.7.5-.9.7-.9 1.2v.5h-2v-.7c0-1.3.7-2 1.5-2.6.6-.4 1.1-.8 1.3-1.2.3-.6 0-1.4-.8-1.7-.9-.4-2 .1-2.3 1l-1.9-.6c.6-1.8 2.7-2.8 4.8-2.1 1.8.6 2.8 2.5 1.8 4.9z"></path></svg>';
    }

    function startResize(event) {
      const resizer = event.target;
      if (!resizer || !('dataset' in resizer)) {
        return;
      }
      const key = resizer.dataset.col;
      if (!key) {
        return;
      }
      const col = columnMap.get(key);
      if (!col) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = col.getBoundingClientRect().width;
      const header = document.querySelector('th[data-col="' + key + '"]');
      if (header) {
        header.classList.add('resizing');
      }
      document.body.style.cursor = 'col-resize';

      const onMove = (moveEvent) => {
        const delta = moveEvent.clientX - startX;
        const nextWidth = Math.max(60, startWidth + delta);
        col.style.width = nextWidth + 'px';
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        if (header) {
          header.classList.remove('resizing');
        }
        const width = col.getBoundingClientRect().width;
        colWidths = { ...colWidths, [key]: width };
        persistState();
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    function hideContextMenu() {
      if (contextMenu) {
        contextMenu.classList.add('hidden');
      }
      contextTarget = null;
    }

    function setMenuItemState(action, enabled) {
      if (!contextMenu) {
        return;
      }
      const item = contextMenu.querySelector('.context-item[data-action="' + action + '"]');
      if (!item) {
        return;
      }
      if (enabled) {
        item.classList.remove('disabled');
      } else {
        item.classList.add('disabled');
      }
    }

    function showContextMenu(row, x, y) {
      if (!contextMenu) {
        return;
      }
      const repoUrl = row.dataset.repoUrl || '';
      const projectPath = row.dataset.projectPath || '';
      const localPath = row.dataset.localPath || row.dataset.local || '';
      contextTarget = {
        repoUrl,
        projectPath,
        localPath,
        relativePath: localPath || projectPath
      };
      setMenuItemState('openRepo', !!repoUrl);
      setMenuItemState('openProject', !!projectPath);
      setMenuItemState('revealInOs', !!projectPath);
      setMenuItemState('copyPath', !!projectPath);
      setMenuItemState('copyRelative', !!(localPath || projectPath));
      contextMenu.style.left = x + 'px';
      contextMenu.style.top = y + 'px';
      contextMenu.classList.remove('hidden');
    }

    headers.forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        if (!key) {
          return;
        }
        if (sortKey === key) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = key;
          sortDir = 'desc';
        }
        updateHeaders();
        sortRows();
        applyFilter();
      });
    });

    resizers.forEach((resizer) => {
      resizer.addEventListener('mousedown', startResize);
    });

    if (contextMenu && contextItems.length > 0) {
      contextItems.forEach((item) => {
        item.addEventListener('click', () => {
          const action = item.getAttribute('data-action');
          if (!action || item.classList.contains('disabled') || !contextTarget) {
            return;
          }
          if (action === 'openRepo' && contextTarget.repoUrl) {
            vscode.postMessage({ type: 'openUrl', url: contextTarget.repoUrl });
          }
          if (action === 'openProject' && contextTarget.projectPath) {
            vscode.postMessage({ type: 'openProject', path: contextTarget.projectPath });
          }
          if (action === 'revealInOs' && contextTarget.projectPath) {
            vscode.postMessage({ type: 'revealInOs', path: contextTarget.projectPath });
          }
          if (action === 'copyPath' && contextTarget.projectPath) {
            vscode.postMessage({ type: 'copyPath', path: contextTarget.projectPath });
          }
          if (action === 'copyRelative' && contextTarget.relativePath) {
            vscode.postMessage({ type: 'copyRelativePath', path: contextTarget.relativePath });
          }
          hideContextMenu();
        });
      });
      document.addEventListener('contextmenu', (event) => {
        const target = event.target;
        const row = target && typeof target.closest === 'function' ? target.closest('tr[data-row="data"]') : null;
        if (!row) {
          return;
        }
        event.preventDefault();
        showContextMenu(row, event.clientX, event.clientY);
      });
      document.addEventListener('click', () => hideContextMenu());
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          hideContextMenu();
        }
      });
      window.addEventListener('scroll', () => hideContextMenu(), true);
    }

    const saved = vscode.getState() || {};
    const seeded = (initialState && typeof initialState === 'object') ? initialState : {};
    const seededSortKey = typeof seeded.sortKey === 'string' ? seeded.sortKey : undefined;
    const seededSortDir = seeded.sortDir === 'asc' || seeded.sortDir === 'desc' ? seeded.sortDir : undefined;
    const seededWidths = seeded.colWidths || {};
    const savedTags = Array.isArray(saved.activeTags) ? saved.activeTags : [];
    const seededTags = Array.isArray(seeded.activeTags) ? seeded.activeTags : [];
    if (saved.sortKey || seededSortKey) {
      sortKey = String(saved.sortKey || seededSortKey);
    }
    if (saved.sortDir === 'asc' || saved.sortDir === 'desc') {
      sortDir = saved.sortDir;
    } else if (seededSortDir) {
      sortDir = seededSortDir;
    }
    colWidths = saved.colWidths || seededWidths || {};
    setActiveTags(savedTags.length > 0 ? savedTags : seededTags);
    applyColumnWidths(colWidths);
    updateHeaders();
    sortRows();
    if (filterInput && 'value' in filterInput) {
      const initialFilter = String(filterInput.value || '') || String(saved.filter || '');
      filterInput.value = initialFilter;
    }
    if (clearButton) {
      clearButton.addEventListener('click', () => {
        if (filterInput && 'value' in filterInput) {
          filterInput.value = '';
        }
        applyFilter();
      });
    }
    if (focusButton) {
      focusButton.addEventListener('click', () => {
        if (filterInput && 'focus' in filterInput) {
          filterInput.focus();
          if ('select' in filterInput) {
            filterInput.select();
          }
        }
      });
    }
    if (cancelButton) {
      cancelButton.addEventListener('click', () => {
        vscode.postMessage({ type: 'cancelRefresh' });
      });
    }
    if (filterInput) {
      filterInput.addEventListener('input', () => {
        applyFilter();
      });
    }
    updateHeaderHeight();
    window.addEventListener('resize', () => {
      updateHeaderHeight();
    });
    window.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.type === 'focusFilter' && filterInput && 'focus' in filterInput) {
        filterInput.focus();
        if ('select' in filterInput) {
          filterInput.select();
        }
      }
      if (message.type === 'applyFilter' && filterInput && 'value' in filterInput) {
        filterInput.value = String(message.filter || '');
        applyFilter();
      }
      if (message.type === 'applyTagFilter') {
        const tags = Array.isArray(message.tags) ? message.tags : [];
        setActiveTags(tags);
        applyFilter();
      }
      if (message.type === 'progress') {
        const current = Number(message.current || 0);
        const total = Number(message.total || 0);
        const label = message.label ? String(message.label) : '';
        updateProgress(current, total, label);
      }
    });
    applyFilter();
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
