import type { PowerForgeConfigSummary } from '../types';
import { escapeHtml } from '../utils';

interface RenderConfigCardShellOptions {
  config: PowerForgeConfigSummary;
  index: number;
  pillLabel: string;
  actionsHtml: string;
  bodyHtml: string;
}

export function renderConfigCardShell(options: RenderConfigCardShellOptions): string {
  const { config, index, pillLabel, actionsHtml, bodyHtml } = options;
  const title = escapeHtml(config.title);
  const configPath = escapeHtml(config.path);
  const projectRoot = escapeHtml(config.projectRoot ?? '');
  return `
    <div class="card" data-config-path="${configPath}" data-config-id="${index}">
      <div class="card-header">
        <div class="card-title-row">
          <div class="card-title">${title}</div>
          <span class="pill">${pillLabel}</span>
        </div>
        <div class="card-meta">${configPath}</div>
        ${projectRoot ? `<div class="card-meta">Project: ${projectRoot}</div>` : ''}
        <div class="card-actions">
          ${actionsHtml}
        </div>
      </div>
      ${bodyHtml}
    </div>
  `;
}

