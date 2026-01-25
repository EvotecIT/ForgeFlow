import type { PowerForgeViewState } from '../types';
import { renderConfigCard, renderLegacyCard } from './cards';
import { renderStyles } from './styles';
import { renderWebviewScript } from './script';
import { escapeHtml } from '../utils';

export function renderView(state: PowerForgeViewState): string {
  const configCards = state.configs.length > 0
    ? state.configs.map((config, index) => renderConfigCard(config, index)).join('\n')
    : '<div class="empty">No PowerForge configs found in the current scope.</div>';
  const legacyCards = state.legacyBuildScripts.length > 0
    ? `
      <div class="section">
        <div class="section-title">Legacy Build Scripts</div>
        ${state.legacyBuildScripts.map((script) => renderLegacyCard(script)).join('\n')}
      </div>`
    : '';
  const scopeLabel = `Workspace: ${escapeHtml(state.workspaceLabel)}`;
  const configCount = state.configs.length;
  const legacyCount = state.legacyBuildScripts.length;
  const scopeHint = state.workspaceRoots.length === 0
    ? '<div class="hint">Open a folder/workspace to load PowerForge configs.</div>'
    : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        ${renderStyles()}
      </style>
    </head>
    <body>
      <header class="page-header">
        <div>
          <h1>ForgeFlow: PowerForge Manager</h1>
          <div class="subheading">
            <span class="pill">${scopeLabel}</span>
            <span class="pill">Configs: ${configCount}</span>
            <span class="pill">Legacy scripts: ${legacyCount}</span>
          </div>
          ${scopeHint}
        </div>
        <div class="toolbar">
          <button data-action="refresh">Refresh</button>
        </div>
      </header>
      ${renderTemplates()}
      <div class="grid">
        ${configCards}
      </div>
      ${legacyCards}
      <script>
        ${renderWebviewScript()}
      </script>
    </body>
    </html>
  `;
}

function renderTemplates(): string {
  return `
    <datalist id="pf-build-configs">
      <option value="Release"></option>
      <option value="Debug"></option>
    </datalist>
    <datalist id="pf-ps-versions">
      <option value="5.1"></option>
      <option value="7.2"></option>
      <option value="7.3"></option>
      <option value="7.4"></option>
      <option value="7.5"></option>
    </datalist>
    <template id="pf-dep-template">
      <div class="dep-row pf-dep-row" data-dependency-row>
        <select data-field="kind">
          <option value="RequiredModule">Required</option>
          <option value="ExternalModule">External</option>
          <option value="ApprovedModule">Approved</option>
        </select>
        <input data-field="moduleName" placeholder="Module name" />
        <input data-field="moduleVersion" placeholder="Module version" />
        <input data-field="minimumVersion" placeholder="Minimum version" />
        <input data-field="requiredVersion" placeholder="Required version" />
        <input data-field="guid" placeholder="Guid" />
        <button class="secondary" data-action="removeDependency" type="button">Remove</button>
      </div>
    </template>
    <template id="pf-placeholder-template">
      <div class="placeholder-row pf-placeholder-row" data-placeholder-row>
        <input data-field="find" placeholder="Find" />
        <input data-field="replace" placeholder="Replace" />
        <button class="secondary" data-action="removePlaceholder" type="button">Remove</button>
      </div>
    </template>
    <template id="pf-link-template">
      <div class="link-row pf-link-row" data-link-row>
        <input data-field="title" placeholder="Title" />
        <input data-field="url" placeholder="URL" />
        <button class="secondary" data-action="removeLink" type="button">Remove</button>
      </div>
    </template>
  `;
}
