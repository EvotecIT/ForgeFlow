import type { DashboardRow } from './dashboardService';
import type * as vscode from 'vscode';

export function renderDashboardHtml(rows: DashboardRow[], webview: vscode.Webview): string {
  const nonce = randomNonce();
  const rowsHtml = rows.map((row) => {
    const highlightClass = row.highlight ? 'warn' : '';
    const archivedClass = row.archived ? 'archived' : '';
    return `
      <tr class="${[highlightClass, archivedClass].filter(Boolean).join(' ')}">
        <td>${escapeHtml(row.activity)}</td>
        <td>${escapeHtml(row.issues)}</td>
        <td>${escapeHtml(row.prs)}</td>
        <td>${escapeHtml(row.stars)}</td>
        <td>${escapeHtml(row.version)}</td>
        <td>${escapeHtml(row.released)}</td>
        <td>${escapeHtml(row.repo)}</td>
      </tr>
    `;
  }).join('');

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
      --ff-warn: var(--vscode-inputValidation-warningBackground);
      --ff-warn-text: var(--vscode-inputValidation-warningForeground);
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
    }
    button {
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
      padding: 4px 6px;
      border-bottom: 1px solid var(--ff-border);
      white-space: nowrap;
    }
    th {
      font-weight: 600;
      opacity: 0.8;
    }
    tr.warn {
      background: var(--ff-warn);
      color: var(--ff-warn-text);
    }
    tr.archived {
      opacity: 0.6;
    }
  </style>
</head>
<body>
  <header>
    <h2>ForgeFlow: Dashboard</h2>
    <button id="refresh">Refresh</button>
  </header>
  <table>
    <thead>
      <tr>
        <th>activity</th>
        <th>issues</th>
        <th>PR</th>
        <th>stars</th>
        <th>version</th>
        <th>released</th>
        <th>repo</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || '<tr><td colspan="7">No tracked projects configured.</td></tr>'}
    </tbody>
  </table>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('refresh')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'refresh' });
    });
  </script>
</body>
</html>`;
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
