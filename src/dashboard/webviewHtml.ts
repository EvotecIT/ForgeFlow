import type { DashboardRow } from './dashboardService';
import type * as vscode from 'vscode';

export interface DashboardRenderState {
  loading?: boolean;
  message?: string;
}

export function renderDashboardHtml(rows: DashboardRow[], webview: vscode.Webview, state?: DashboardRenderState): string {
  const nonce = randomNonce();
  const rowsHtml = rows.length > 0
    ? rows.map((row) => renderRow(row)).join('')
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
    .repo-link {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      cursor: pointer;
    }
    .repo-link:hover {
      text-decoration: underline;
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
    <h2>ForgeFlow: Dashboard</h2>
    <button class="refresh" id="refresh">Refresh</button>
  </header>
  <table>
    <thead>
      <tr>
        <th data-key="activityTs" data-type="number">activity</th>
        <th data-key="issues" data-type="number">issues</th>
        <th data-key="prs" data-type="number">PR</th>
        <th data-key="stars" data-type="number">stars</th>
        <th data-key="version" data-type="string">version</th>
        <th data-key="releasedTs" data-type="number">released</th>
        <th data-key="provider" data-type="string">host</th>
        <th data-key="visibility" data-type="string">visibility</th>
        <th data-key="repo" data-type="string">repo</th>
        <th data-key="open" data-type="string">open</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
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

    const headers = document.querySelectorAll('th[data-key]');
    const tbody = document.querySelector('tbody');
    let sortKey = 'activityTs';
    let sortDir = 'desc';

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
        const type = document.querySelector('th[data-key=\"' + sortKey + '\"]')?.dataset.type || 'string';
        const result = compareValues(a, b, type);
        return sortDir === 'asc' ? result : -result;
      });
      rows.forEach((row) => tbody.appendChild(row));
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
      });
    });

    updateHeaders();
  </script>
</body>
</html>`;
}

function renderRow(row: DashboardRow): string {
  const issues = numericValue(row.issues);
  const prs = numericValue(row.prs);
  const stars = numericValue(row.stars);
  const releasedTs = dateValue(row.released);
  const providerClass = normalizeProvider(row.provider);
  const visibilityClass = normalizeVisibility(row.visibility);
  const highlightClass = row.highlight ? 'warn' : '';
  const archivedClass = row.archived ? 'archived' : '';
  const rowClasses = [highlightClass, archivedClass].filter(Boolean).join(' ');
  const repoCell = row.repoUrl
    ? `<a class="repo-link" data-url="${escapeHtml(row.repoUrl)}">${escapeHtml(row.repo)}</a>`
    : `<span>${escapeHtml(row.repo)}</span>`;
  const openCell = row.projectPath
    ? `<a class="repo-link open-local" data-path="${escapeHtml(row.projectPath)}">open</a>`
    : `<span class="mono">n/a</span>`;

  return `
    <tr class="${rowClasses}" data-row="data"
      data-activityTs="${row.activityTimestamp}"
      data-issues="${issues}"
      data-prs="${prs}"
      data-stars="${stars}"
      data-version="${escapeHtml(row.version)}"
      data-releasedTs="${releasedTs}"
      data-provider="${escapeHtml(row.provider)}"
      data-visibility="${escapeHtml(row.visibility)}"
      data-repo="${escapeHtml(row.repo)}">
      <td>${escapeHtml(row.activity)}</td>
      <td>${escapeHtml(row.issues)}</td>
      <td>${escapeHtml(row.prs)}</td>
      <td>${escapeHtml(row.stars)}</td>
      <td>${escapeHtml(row.version)}</td>
      <td>${escapeHtml(row.released)}</td>
      <td><span class="badge ${providerClass}">${escapeHtml(row.provider)}</span></td>
      <td><span class="badge ${visibilityClass}">${escapeHtml(row.visibility)}</span></td>
      <td>${repoCell}</td>
      <td>${openCell}</td>
    </tr>
  `;
}

function renderEmptyState(state?: DashboardRenderState): string {
  if (state?.loading) {
    const message = state.message ?? 'Loading dashboard data...';
    return `<tr><td colspan="10" class="empty"><span class="loading"><span class="spinner"></span>${escapeHtml(message)}</span></td></tr>`;
  }
  return '<tr><td colspan="10" class="empty">No tracked projects configured.</td></tr>';
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
