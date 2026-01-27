export const dashboardWebviewStyles = `
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
    }
    header h2 {
      margin: 0;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.03em;
    }
    header .summary {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 10px;
      color: var(--ff-muted);
    }
    header .summary .status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .controls {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .filter {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--ff-border);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 11px;
      min-width: 160px;
    }
    .filter.minchars {
      border-color: var(--ff-warn);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--ff-warn) 70%, transparent);
    }
    button {
      background: transparent;
      border: 1px solid var(--ff-border);
      color: var(--ff-fg);
      border-radius: 4px;
      font-size: 11px;
      padding: 4px 8px;
      cursor: pointer;
    }
    button:hover {
      border-color: color-mix(in srgb, var(--ff-accent) 40%, var(--ff-border));
    }
    button.cancel {
      border-color: color-mix(in srgb, var(--ff-warn) 80%, var(--ff-border));
      color: var(--ff-warn-text);
    }
    .progress {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 4px 0 8px;
    }
    .progress.hidden {
      display: none;
    }
    .progress-track {
      flex: 1 1 auto;
      height: 6px;
      background: color-mix(in srgb, var(--ff-fg) 8%, transparent);
      border-radius: 999px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: var(--ff-accent);
      width: 0%;
    }
    .progress-label {
      font-size: 10px;
      color: var(--ff-muted);
      min-width: 60px;
      text-align: right;
    }
    .tag-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 8px 0;
      overflow-x: auto;
    }
    .tag-chip {
      border: 1px solid var(--ff-border);
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 10px;
      background: color-mix(in srgb, var(--ff-accent) 12%, transparent);
      color: var(--ff-fg);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .tag-chip.active {
      background: var(--ff-accent);
      color: var(--vscode-editor-background);
      border-color: var(--ff-accent);
    }
    .tag-chip .count {
      font-size: 9px;
      opacity: 0.7;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    thead th {
      position: sticky;
      top: 52px;
      z-index: 3;
      background: var(--ff-bg);
      border-bottom: 1px solid var(--ff-border);
      padding: 6px 6px;
      text-align: left;
      font-weight: 600;
      color: var(--ff-muted);
      white-space: nowrap;
    }
    tbody tr {
      border-bottom: 1px solid var(--ff-border);
    }
    tbody tr:nth-child(even) {
      background: var(--ff-row);
    }
    tbody tr.hidden {
      display: none;
    }
    tbody td {
      padding: 6px 6px;
      vertical-align: top;
    }
    tbody td.mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 9px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      border-radius: 999px;
      font-size: 9px;
      border: 1px solid var(--ff-border);
      white-space: nowrap;
    }
    .badge.status {
      border-color: color-mix(in srgb, var(--ff-accent) 35%, var(--ff-border));
    }
    .badge.status.ok {
      color: var(--vscode-testing-iconPassed);
      border-color: color-mix(in srgb, var(--vscode-testing-iconPassed) 40%, var(--ff-border));
    }
    .badge.status.warn {
      color: var(--vscode-testing-iconQueued);
      border-color: color-mix(in srgb, var(--vscode-testing-iconQueued) 50%, var(--ff-border));
    }
    .badge.status.error {
      color: var(--vscode-testing-iconFailed);
      border-color: color-mix(in srgb, var(--vscode-testing-iconFailed) 45%, var(--ff-border));
    }
    .badge.provider {
      border-color: color-mix(in srgb, var(--ff-accent) 40%, var(--ff-border));
    }
    .badge.provider.github {
      color: #4fd1ff;
    }
    .badge.provider.gitlab {
      color: #ff9f43;
    }
    .badge.provider.azure {
      color: #4f6fff;
    }
    .badge.visibility {
      border-color: color-mix(in srgb, var(--ff-border) 65%, transparent);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge.visibility.public {
      color: var(--vscode-testing-iconPassed);
    }
    .badge.visibility.private {
      color: var(--vscode-testing-iconFailed);
    }
    .badge.visibility.unknown {
      color: var(--ff-muted);
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }
    .action-button {
      border: 1px solid var(--ff-border);
      background: transparent;
      color: var(--ff-fg);
      width: 20px;
      height: 20px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      cursor: pointer;
    }
    .action-button svg {
      width: 12px;
      height: 12px;
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
    .empty {
      padding: 12px;
      font-size: 11px;
      color: var(--ff-muted);
    }
    .hidden {
      display: none;
    }
    .resizer {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: 6px;
      cursor: col-resize;
    }
    .resizer:hover,
    .resizer.dragging {
      background: color-mix(in srgb, var(--ff-accent) 18%, transparent);
    }
    th .resize-handle {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: 6px;
      cursor: col-resize;
    }
    th .resize-handle:hover {
      background: color-mix(in srgb, var(--ff-accent) 18%, transparent);
    }
    th .resize-handle.dragging {
      background: color-mix(in srgb, var(--ff-accent) 28%, transparent);
    }
`;
