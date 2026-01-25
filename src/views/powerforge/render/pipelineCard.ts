import type { PowerForgeConfigSummary } from '../types';
import { escapeHtml } from '../utils';
import { renderBuildSection, renderInstallSection, renderManifestSection, renderPublishSection } from './sections/basic';
import { renderDocumentationSection, renderBuildDocumentationSection, renderValidationSection, renderFileConsistencySection, renderCompatibilitySection } from './sections/quality';
import { renderArtefactsSection, renderOptionsSection, renderFormattingSection } from './sections/artifacts';
import { renderBuildLibrariesSection, renderImportModulesSection, renderModuleDependenciesSection, renderPlaceholdersSection, renderTestsAfterMergeSection } from './sections/misc';

export function renderPipelineCard(config: PowerForgeConfigSummary, index: number): string {
  const title = escapeHtml(config.title);
  const configPath = escapeHtml(config.path);
  const projectRoot = escapeHtml(config.projectRoot ?? '');
  return `
    <div class="card" data-config-path="${configPath}" data-config-id="${index}">
      <div class="card-header">
        <div class="card-title-row">
          <div class="card-title">${title}</div>
          <span class="pill">Pipeline</span>
        </div>
        <div class="card-meta">${configPath}</div>
        ${projectRoot ? `<div class="card-meta">Project: ${projectRoot}</div>` : ''}
        <div class="card-actions">
          <button data-action="openConfig">Open JSON</button>
          <button class="secondary" data-action="savePipeline">Save</button>
          <button data-action="planPipeline">Plan</button>
          <button data-action="runPipeline">Run</button>
        </div>
      </div>
      ${renderBuildSection(config, index)}
      ${renderInstallSection(config, index)}
      ${renderManifestSection(config, index)}
      ${renderPublishSection(config, index)}
      ${renderDocumentationSection(config, index)}
      ${renderBuildDocumentationSection(config, index)}
      ${renderValidationSection(config, index)}
      ${renderFileConsistencySection(config, index)}
      ${renderCompatibilitySection(config, index)}
      ${renderArtefactsSection(config, index)}
      ${renderOptionsSection(config, index)}
      ${renderFormattingSection(config, index)}
      ${renderBuildLibrariesSection(config, index)}
      ${renderImportModulesSection(config, index)}
      ${renderModuleDependenciesSection(config, index)}
      ${renderPlaceholdersSection(config, index)}
      ${renderTestsAfterMergeSection(config, index)}
    </div>
  `;
}
