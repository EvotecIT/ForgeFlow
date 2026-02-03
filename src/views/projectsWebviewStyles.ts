export const projectsWebviewStyles = `
    :root {
      color-scheme: light dark;
      --ff-bg: var(--vscode-editor-background);
      --ff-fg: var(--vscode-editor-foreground);
      --ff-border: var(--vscode-panel-border);
      --ff-muted: color-mix(in srgb, var(--ff-fg) 65%, transparent);
      --ff-accent: color-mix(in srgb, var(--vscode-textLink-foreground) 85%, transparent);
      --ff-row: color-mix(in srgb, var(--ff-fg) 8%, transparent);
      --ff-warn: color-mix(in srgb, var(--vscode-inputValidation-warningBackground) 60%, transparent);
      --ff-warn-text: var(--vscode-inputValidation-warningForeground);
    }
    body {
      margin: 0;
      font-family: var(--vscode-font-family);
      background: var(--ff-bg);
      color: var(--ff-fg);
    }
    .page {
      padding: 4px 6px 8px;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      position: sticky;
      top: 0;
      z-index: 4;
      background: var(--ff-bg);
      padding: 6px 0;
      border-bottom: 1px solid var(--ff-border);
    }
    .title {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    h2 {
      margin: 0;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .status {
      font-size: 9px;
      color: var(--ff-muted);
    }
    .controls {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    input.filter {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--ff-border);
      border-radius: 6px;
      padding: 3px 6px;
      font-size: 10px;
      min-width: 120px;
    }
    input.filter.minchars {
      border-color: var(--ff-warn);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--ff-warn) 70%, transparent);
    }
    button {
      background: transparent;
      border: 1px solid var(--ff-border);
      color: var(--ff-fg);
      padding: 2px 6px;
      font-size: 9px;
      border-radius: 6px;
      cursor: pointer;
    }
    button:hover {
      border-color: color-mix(in srgb, var(--ff-accent) 40%, var(--ff-border));
    }
    .tag-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: 4px 0;
      overflow-x: auto;
    }
    .tag-chip {
      border: 1px solid var(--ff-border);
      border-radius: 999px;
      padding: 2px 6px;
      font-size: 9px;
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
    .group {
      margin-top: 6px;
    }
    .group-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--ff-border);
      padding: 3px 0;
      font-size: 9px;
      color: var(--ff-muted);
    }
    .group-title {
      font-weight: 600;
      color: var(--ff-fg);
    }
    .project-row {
      display: grid;
      grid-template-columns: 12px minmax(0, 1fr) auto;
      grid-template-areas:
        "toggle main actions"
        "toggle details details";
      gap: 2px 6px;
      padding: 4px 2px;
      border-bottom: 1px solid var(--ff-border);
      align-items: center;
    }
    .project-row:nth-child(even) {
      background: var(--ff-row);
    }
    .project-row.hidden {
      display: none;
    }
    .toggle {
      border: none;
      background: transparent;
      font-size: 10px;
      color: var(--ff-muted);
      cursor: pointer;
      grid-area: toggle;
      padding: 0;
    }
    .project-main {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      grid-area: main;
    }
    .project-title {
      font-size: 11px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .project-path {
      font-size: 9px;
      color: var(--ff-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 6px;
      opacity: 0.85;
    }
    .project-path .path-text {
      min-width: 0;
      flex: 1 1 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .project-run {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      font-size: 9px;
      color: var(--ff-muted);
    }
    .run-pill {
      border: 1px dashed var(--ff-border);
      background: transparent;
      color: var(--ff-muted);
      padding: 1px 6px;
      border-radius: 999px;
      cursor: pointer;
      font-size: 9px;
    }
    .run-pill:hover {
      border-color: color-mix(in srgb, var(--ff-accent) 40%, var(--ff-border));
      color: var(--ff-fg);
    }
    .project-meta {
      font-size: 9px;
      color: var(--ff-muted);
      flex: 0 0 auto;
      opacity: 0.85;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 10px;
      border: 1px solid var(--ff-border);
    }
    .badge.favorite {
      border: none;
      padding: 0;
      color: var(--ff-accent);
    }
    .badge.favorite svg {
      width: 10px;
      height: 10px;
      fill: currentColor;
    }
    .actions {
      display: flex;
      gap: 3px;
      flex-wrap: nowrap;
      align-items: center;
      justify-content: flex-end;
      grid-area: actions;
      align-self: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
    }
    .project-row:hover .actions,
    .project-row:focus-within .actions {
      opacity: 1;
      pointer-events: auto;
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
      border-radius: 6px;
      cursor: pointer;
    }
    .action-button svg {
      width: 12px;
      height: 12px;
      fill: currentColor;
    }
    .details {
      grid-area: details;
      padding: 4px 0 2px;
      border-top: 1px dashed var(--ff-border);
      display: none;
      gap: 8px;
    }
    .details.open {
      display: grid;
    }
    .browse-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .browse-item {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 6px;
      align-items: center;
      padding: 2px 0;
    }
    .browse-item .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--ff-fg);
    }
    .browse-toggle {
      border: none;
      background: transparent;
      color: var(--ff-muted);
      cursor: pointer;
      font-size: 12px;
      padding: 0 4px 0 0;
    }
    .browse-children {
      margin-left: 14px;
      display: none;
    }
    .browse-children.open {
      display: block;
    }
    .detail-section {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 9px;
    }
    .detail-title {
      font-weight: 600;
      color: var(--ff-fg);
    }
    .detail-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .detail-item span {
      color: var(--ff-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .detail-actions {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .empty {
      padding: 6px 0;
      font-size: 9px;
      color: var(--ff-muted);
    }
    .muted {
      color: var(--ff-muted);
      font-size: 9px;
    }
    .load-more {
      margin-top: 6px;
    }
    @media (min-width: 560px) {
      .project-row {
        gap: 2px 8px;
      }
    }
`;
