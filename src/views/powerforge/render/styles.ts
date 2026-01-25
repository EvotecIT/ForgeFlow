export function renderStyles(): string {
  return `
    :root {
      color-scheme: light dark;
    }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 16px;
    }
    h1 {
      font-size: 16px;
      margin: 0;
    }
    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }
    .subheading {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 6px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .hint {
      margin-top: 6px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .pill {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
    }
    .toolbar {
      display: flex;
      gap: 8px;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .grid {
      display: grid;
      gap: 12px;
    }
    .card {
      border: 1px solid var(--vscode-widget-border);
      background: var(--vscode-sideBar-background);
      border-radius: 8px;
      padding: 12px;
    }
    .card-header {
      display: grid;
      gap: 8px;
      margin-bottom: 10px;
    }
    .card-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .card-title {
      font-size: 14px;
      font-weight: 600;
    }
    .card-meta {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .card-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 8px;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .field label {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .field input {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 4px 6px;
    }
    .field select {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 4px 6px;
    }
    .field textarea {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 4px 6px;
      resize: vertical;
      min-height: 40px;
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    .section {
      margin-top: 16px;
    }
    .section-title {
      font-size: 13px;
      margin-bottom: 8px;
      color: var(--vscode-descriptionForeground);
    }
    .empty {
      padding: 16px;
      border: 1px dashed var(--vscode-widget-border);
      border-radius: 6px;
    }
    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--vscode-foreground);
    }
    details {
      border: 1px solid var(--vscode-widget-border);
      border-radius: 6px;
      padding: 8px;
      margin-top: 10px;
      background: var(--vscode-sideBar-background);
    }
    summary {
      cursor: pointer;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
      list-style: none;
    }
    summary::before {
      content: '▸';
      color: var(--vscode-descriptionForeground);
    }
    details[open] summary::before {
      content: '▾';
    }
    summary::-webkit-details-marker {
      display: none;
    }
    .summary-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      justify-content: space-between;
    }
    .summary-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .summary-label {
      font-weight: 600;
      color: var(--vscode-foreground);
    }
    .summary-meta {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .badge {
      background: var(--vscode-notificationsInfoIcon-foreground);
      color: var(--vscode-editor-background);
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 10px;
    }
    .dep-row {
      display: grid;
      grid-template-columns: 120px 1.2fr 1fr 1fr 1fr 1fr auto;
      gap: 6px;
      align-items: center;
      margin-bottom: 6px;
    }
    .dep-row input,
    .dep-row select {
      width: 100%;
    }
    .placeholder-row {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: 6px;
      align-items: center;
      margin-bottom: 6px;
    }
    .link-row {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: 6px;
      align-items: center;
      margin-bottom: 6px;
    }
  `;
}
