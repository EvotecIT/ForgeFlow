import type { PowerForgeConfigSummary } from '../types';
import { renderConfigCardShell } from './cardShell';
import { renderBuildSection, renderInstallSection, renderManifestSection, renderPublishSection } from './sections/basic';
import { renderDocumentationSection, renderBuildDocumentationSection, renderValidationSection, renderFileConsistencySection, renderCompatibilitySection } from './sections/quality';
import { renderArtefactsSection, renderOptionsSection, renderFormattingSection } from './sections/artifacts';
import { renderBuildLibrariesSection, renderImportModulesSection, renderModuleDependenciesSection, renderPlaceholdersSection, renderTestsAfterMergeSection } from './sections/misc';

export function renderPipelineCard(config: PowerForgeConfigSummary, index: number): string {
  return renderConfigCardShell({
    config,
    index,
    pillLabel: 'Pipeline',
    actionsHtml: `
      <button data-action="openConfig">Open JSON</button>
      <button class="secondary" data-action="savePipeline">Save</button>
      <button data-action="planPipeline">Plan</button>
      <button data-action="runPipeline">Run</button>
    `,
    bodyHtml: `
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
    `
  });
}
