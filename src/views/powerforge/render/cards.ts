import type { PowerForgeConfigSummary } from '../types';
import { escapeHtml } from '../utils';
import { renderPipelineCard } from './pipelineCard';

export function renderConfigCard(config: PowerForgeConfigSummary, index: number): string {
  if (config.kind === 'pipeline') {
    return renderPipelineCard(config, index);
  }
  return renderDotnetCard(config, index);
}

function renderDotnetCard(config: PowerForgeConfigSummary, index: number): string {
  const title = escapeHtml(config.title);
  const configPath = escapeHtml(config.path);
  const projectRoot = escapeHtml(config.projectRoot ?? '');
  return `
    <div class="card" data-config-path="${configPath}" data-config-id="${index}">
      <div class="card-header">
        <div class="card-title-row">
          <div class="card-title">${title}</div>
          <span class="pill">DotNet Publish</span>
        </div>
        <div class="card-meta">${configPath}</div>
        ${projectRoot ? `<div class="card-meta">Project: ${projectRoot}</div>` : ''}
        <div class="card-actions">
          <button data-action="openConfig">Open JSON</button>
          <button class="secondary" data-action="saveDotnetPublish">Save</button>
          <button data-action="planDotnetPublish">Plan</button>
          <button data-action="runDotnetPublish">Publish</button>
          <button data-action="validateDotnetPublish">Validate</button>
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>Project Root</label>
          <input id="pf-dotnet-root-${index}" value="${escapeHtml(config.dotnet?.projectRoot ?? '')}" />
        </div>
        <div class="field">
          <label>Solution Path</label>
          <input id="pf-dotnet-sln-${index}" value="${escapeHtml(config.dotnet?.solutionPath ?? '')}" />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>Configuration</label>
          <input id="pf-dotnet-config-${index}" value="${escapeHtml(config.dotnet?.configuration ?? '')}" />
        </div>
        <div class="field">
          <label>Runtimes (comma separated)</label>
          <input id="pf-dotnet-runtimes-${index}" value="${escapeHtml((config.dotnet?.runtimes ?? []).join(', '))}" />
        </div>
      </div>
    </div>
  `;
}

export function renderLegacyCard(scriptPath: string): string {
  const display = escapeHtml(scriptPath);
  return `
    <div class="card">
      <div class="card-header">
        <div class="card-title-row">
          <div class="card-title">Build-Module.ps1</div>
          <span class="pill">Legacy</span>
        </div>
        <div class="card-meta">${display}</div>
        <div class="card-actions">
          <button data-template-path="${display}">Create powerforge.json template</button>
        </div>
      </div>
    </div>
  `;
}
