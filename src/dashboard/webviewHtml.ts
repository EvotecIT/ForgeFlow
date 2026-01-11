import type { DashboardRow } from './dashboardService';
import type * as vscode from 'vscode';

export interface DashboardRenderState {
  loading?: boolean;
  message?: string;
  updatedAt?: number;
  filter?: string;
  authSummary?: string;
  progressCurrent?: number;
  progressTotal?: number;
  progressLabel?: string;
}

export function renderDashboardHtml(rows: DashboardRow[], webview: vscode.Webview, state?: DashboardRenderState): string {
  const nonce = randomNonce();
  const rowsHtml = rows.length > 0
    ? rows.map((row) => renderRow(row, state?.updatedAt)).join('')
    : renderEmptyState(state);

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
      padding: 12px;
      font-family: ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      background: var(--ff-bg);
      color: var(--ff-fg);
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      gap: 8px;
      flex-wrap: wrap;
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
    .count {
      font-size: 11px;
      color: var(--ff-muted);
      margin-left: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th, td {
      text-align: left;
      padding: 6px 8px;
      border-bottom: 1px solid var(--ff-border);
      white-space: nowrap;
    }
    th {
      font-weight: 600;
      opacity: 0.85;
      cursor: pointer;
      user-select: none;
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
    .repo-link {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      cursor: pointer;
    }
    .repo-link:hover {
      text-decoration: underline;
    }
    .actions {
      display: inline-flex;
      gap: 6px;
    }
    .action-button {
      border: 1px solid var(--ff-border);
      border-radius: 6px;
      padding: 2px 6px;
      font-size: 11px;
      text-decoration: none;
      color: var(--ff-fg);
      background: color-mix(in srgb, var(--ff-fg) 6%, transparent);
      cursor: pointer;
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
  </style>
</head>
<body>
  <header>
    <div class="title">
      <h2>ForgeFlow: Dashboard</h2>
      ${state?.updatedAt ? `<span class="status">Updated ${escapeHtml(formatTimestamp(state.updatedAt))}</span>` : ''}
      ${state?.loading ? `<span class="status" id="status-refresh">${escapeHtml(formatRefreshLabel(state.progressCurrent, state.progressTotal, state.progressLabel))}</span>` : ''}
      ${state?.authSummary ? `<span class="status">${escapeHtml(state.authSummary)}</span>` : ''}
    </div>
    <div class="controls">
      <input class="filter" id="filter" type="text" placeholder="Filter projects…" value="${escapeHtml(state?.filter ?? '')}" />
      <button class="clear" id="clear">Clear</button>
      <button class="focus" id="focus">Focus</button>
      <span class="count" id="count"></span>
      ${state?.loading ? '<button class="cancel" id="cancel">Cancel</button>' : ''}
      <button class="refresh" id="refresh">Refresh</button>
    </div>
  </header>
  <table>
    <thead>
      <tr>
        <th data-key="repo" data-type="string">repo</th>
        <th data-key="local" data-type="string">local</th>
        <th>actions</th>
        <th data-key="activityTs" data-type="number">activity</th>
        <th data-key="refreshedTs" data-type="number">refreshed</th>
        <th data-key="issues" data-type="number">issues</th>
        <th data-key="prs" data-type="number">PR</th>
        <th data-key="stars" data-type="number">stars</th>
        <th data-key="version" data-type="string">version</th>
        <th data-key="releasedTs" data-type="number">released</th>
        <th data-key="provider" data-type="string">host</th>
        <th data-key="visibility" data-type="string">visibility</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr id="filter-empty" hidden>
        <td colspan="12" class="empty">No projects match the filter.</td>
      </tr>
    </tbody>
  </table>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('refresh')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'refresh' });
    });

    document.querySelectorAll('.repo-link').forEach((link) => {
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

    const headers = document.querySelectorAll('th[data-key]');
    const tbody = document.querySelector('tbody');
    const filterInput = document.getElementById('filter');
    const clearButton = document.getElementById('clear');
    const focusButton = document.getElementById('focus');
    const cancelButton = document.getElementById('cancel');
    const countLabel = document.getElementById('count');
    const emptyRow = document.getElementById('filter-empty');
    const refreshStatus = document.getElementById('status-refresh');
    let sortKey = 'activityTs';
    let sortDir = 'desc';
    let lastFilter = '';

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

    function applyFilter() {
      const filter = (filterInput && 'value' in filterInput) ? String(filterInput.value || '').toLowerCase().trim() : '';
      const rows = Array.from(document.querySelectorAll('tr[data-row="data"]'));
      let visible = 0;
      rows.forEach((row) => {
        const haystack = (row.dataset.search || '').toLowerCase();
        const isMatch = !filter || haystack.includes(filter);
        row.hidden = !isMatch;
        if (isMatch) {
          visible += 1;
        }
      });
      if (emptyRow) {
        emptyRow.hidden = visible !== 0 || rows.length === 0;
      }
      updateCount(visible, rows.length);
      if (filter !== lastFilter) {
        lastFilter = filter;
        vscode.postMessage({ type: 'setFilter', filter });
      }
      vscode.setState({ filter, sortKey, sortDir });
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

    const saved = vscode.getState() || {};
    if (saved.sortKey) {
      sortKey = String(saved.sortKey);
    }
    if (saved.sortDir === 'asc' || saved.sortDir === 'desc') {
      sortDir = saved.sortDir;
    }
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
      if (message.type === 'progress' && refreshStatus) {
        const current = Number(message.current || 0);
        const total = Number(message.total || 0);
        const label = message.label ? String(message.label) : '';
        refreshStatus.textContent = total > 0
          ? 'Refreshing… (' + String(current) + '/' + String(total) + ')' + (label ? ' • ' + label : '')
          : 'Refreshing…' + (label ? ' • ' + label : '');
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
  const rowClasses = [highlightClass, archivedClass].filter(Boolean).join(' ');
  const repoCell = row.repoUrl
    ? `<a class="repo-link" data-url="${escapeHtml(row.repoUrl)}">${escapeHtml(row.repo)}</a>`
    : `<span>${escapeHtml(row.repo)}</span>`;
  const localCell = row.localPath
    ? `<span class="mono" title="${escapeHtml(row.projectPath ?? row.localPath)}">${escapeHtml(row.localPath)}</span>`
    : `<span class="mono">n/a</span>`;
  const actionsCell = row.projectPath
    ? `<span class="actions">
        <a class="action-button open-local" data-path="${escapeHtml(row.projectPath)}" title="Open">Open</a>
        <a class="action-button reveal-local" data-path="${escapeHtml(row.projectPath)}" title="Reveal in OS">Reveal</a>
        <a class="action-button copy-local" data-path="${escapeHtml(row.projectPath)}" title="Copy Path">Copy</a>
        <a class="action-button copy-relative" data-relative="${escapeHtml(row.localPath ?? row.projectPath)}" title="Copy Relative Path">Rel</a>
      </span>`
    : `<span class="mono">n/a</span>`;

  const statusBadge = statusLabel
    ? `<span class="badge status ${statusClass}">${escapeHtml(statusLabel)}</span>`
    : '';
  const searchText = [
    row.repo,
    row.repoUrl,
    row.projectPath,
    row.localPath,
    row.provider,
    row.visibility,
    row.providerStatus
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
      data-search="${escapeHtml(searchText)}">
      <td>${repoCell}</td>
      <td>${localCell}</td>
      <td>${actionsCell}</td>
      <td>${escapeHtml(row.activity)}</td>
      <td>${escapeHtml(refreshedText)}</td>
      <td>${escapeHtml(row.issues)}</td>
      <td>${escapeHtml(row.prs)}</td>
      <td>${escapeHtml(row.stars)}</td>
      <td>${escapeHtml(row.version)}</td>
      <td>${escapeHtml(row.released)}</td>
      <td><span class="badge ${providerClass}">${escapeHtml(row.provider)}</span>${statusBadge}</td>
      <td><span class="badge ${visibilityClass}">${escapeHtml(row.visibility)}</span></td>
    </tr>
  `;
}

function renderEmptyState(state?: DashboardRenderState): string {
  if (state?.loading) {
    const message = state.message ?? 'Loading dashboard data...';
    return `<tr><td colspan="12" class="empty"><span class="loading"><span class="spinner"></span>${escapeHtml(message)}</span></td></tr>`;
  }
  return '<tr><td colspan="12" class="empty">No tracked projects configured.</td></tr>';
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
