import type { PowerForgeConfigSummary } from '../../types';
import { escapeHtml, renderDependencyRows, renderPlaceholderRows, renderSectionSummary, renderSelectOption } from '../../utils';

export function renderBuildLibrariesSection(config: PowerForgeConfigSummary, index: number): string {
  const configured = Boolean(
    config.buildLibraries?.segmentEnabled
    || config.buildLibraries?.enable
    || config.buildLibraries?.configuration
    || (config.buildLibraries?.frameworks?.length ?? 0) > 0
    || config.buildLibraries?.projectName
    || config.buildLibraries?.netProjectPath
    || config.buildLibraries?.excludeMainLibrary
  );
  const note = config.buildLibraries?.projectName ?? config.buildLibraries?.configuration ?? '';
  return `
    <details ${configured ? 'data-configured="true"' : ''}>
      <summary>${renderSectionSummary('Build Libraries', configured, note)}</summary>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-buildlibs-segment-${index}" ${config.buildLibraries?.segmentEnabled ? 'checked' : ''} />
        <label for="pf-buildlibs-segment-${index}">Include build libraries segment</label>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-buildlibs-enable-${index}" ${config.buildLibraries?.enable ? 'checked' : ''} />
        <label for="pf-buildlibs-enable-${index}">Enable build libraries</label>
      </div>
      <div class="row">
        <div class="field">
          <label>Configuration</label>
          <input id="pf-buildlibs-config-${index}" value="${escapeHtml(config.buildLibraries?.configuration ?? '')}" />
        </div>
        <div class="field">
          <label>Frameworks (comma separated)</label>
          <input id="pf-buildlibs-frameworks-${index}" value="${escapeHtml((config.buildLibraries?.frameworks ?? []).join(', '))}" />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>Project Name</label>
          <input id="pf-buildlibs-project-${index}" value="${escapeHtml(config.buildLibraries?.projectName ?? '')}" />
        </div>
        <div class="field">
          <label>NET Project Path</label>
          <input id="pf-buildlibs-netpath-${index}" value="${escapeHtml(config.buildLibraries?.netProjectPath ?? '')}" />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>Exclude Main Library</label>
          <input type="checkbox" id="pf-buildlibs-exclude-main-${index}" ${config.buildLibraries?.excludeMainLibrary ? 'checked' : ''} />
        </div>
        <div class="field">
          <label>Disable Cmdlet Scan</label>
          <input type="checkbox" id="pf-buildlibs-cmdletscan-${index}" ${config.buildLibraries?.binaryModuleCmdletScanDisabled ? 'checked' : ''} />
        </div>
      </div>
    </details>
  `;
}

export function renderImportModulesSection(config: PowerForgeConfigSummary, index: number): string {
  const configured = Boolean(
    config.importModules?.segmentEnabled
    || config.importModules?.self
    || config.importModules?.requiredModules
    || config.importModules?.verbose
  );
  const note = config.importModules?.self ? 'self' : config.importModules?.requiredModules ? 'required' : '';
  return `
    <details ${configured ? 'data-configured="true"' : ''}>
      <summary>${renderSectionSummary('Import Modules', configured, note)}</summary>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-import-segment-${index}" ${config.importModules?.segmentEnabled ? 'checked' : ''} />
        <label for="pf-import-segment-${index}">Include import modules segment</label>
      </div>
      <div class="row">
        <div class="field">
          <label>Import Self</label>
          <input type="checkbox" id="pf-import-self-${index}" ${config.importModules?.self ? 'checked' : ''} />
        </div>
        <div class="field">
          <label>Import Required Modules</label>
          <input type="checkbox" id="pf-import-required-${index}" ${config.importModules?.requiredModules ? 'checked' : ''} />
        </div>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-import-verbose-${index}" ${config.importModules?.verbose ? 'checked' : ''} />
        <label for="pf-import-verbose-${index}">Verbose import</label>
      </div>
    </details>
  `;
}

export function renderModuleDependenciesSection(config: PowerForgeConfigSummary, index: number): string {
  const configured = Boolean(
    (config.moduleDependencies?.length ?? 0) > 0
  );
  const note = config.moduleDependencies?.length ? `${config.moduleDependencies.length} deps` : '';
  return `
    <details ${configured ? 'data-configured="true"' : ''}>
      <summary>${renderSectionSummary('Module Dependencies', configured, note)}</summary>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-deps-segment-${index}" ${config.moduleDependencies?.length ? 'checked' : ''} />
        <label for="pf-deps-segment-${index}">Include module dependencies</label>
      </div>
      <div class="pf-deps-list">
        ${renderDependencyRows(config.moduleDependencies)}
      </div>
      <div class="actions">
        <button class="secondary" data-action="addDependency" type="button">Add dependency</button>
      </div>
    </details>
  `;
}

export function renderPlaceholdersSection(config: PowerForgeConfigSummary, index: number): string {
  const configured = Boolean(
    config.placeHolderOption?.segmentEnabled
    || config.placeHolderOption?.skipBuiltinReplacements
    || (config.placeHolders?.length ?? 0) > 0
  );
  const note = config.placeHolders?.length ? `${config.placeHolders.length} entries` : '';
  return `
    <details ${configured ? 'data-configured="true"' : ''}>
      <summary>${renderSectionSummary('Placeholders', configured, note)}</summary>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-placeholder-option-segment-${index}" ${config.placeHolderOption?.segmentEnabled ? 'checked' : ''} />
        <label for="pf-placeholder-option-segment-${index}">Include placeholder options</label>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-placeholder-option-skip-${index}" ${config.placeHolderOption?.skipBuiltinReplacements ? 'checked' : ''} />
        <label for="pf-placeholder-option-skip-${index}">Skip builtin replacements</label>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-placeholder-segment-${index}" ${config.placeHolders?.length ? 'checked' : ''} />
        <label for="pf-placeholder-segment-${index}">Include placeholder replacements</label>
      </div>
      <div class="pf-placeholder-list">
        ${renderPlaceholderRows(config.placeHolders)}
      </div>
      <div class="actions">
        <button class="secondary" data-action="addPlaceholder" type="button">Add placeholder</button>
      </div>
    </details>
  `;
}

export function renderTestsAfterMergeSection(config: PowerForgeConfigSummary, index: number): string {
  const configured = Boolean(
    config.testsAfterMerge?.segmentEnabled
    || config.testsAfterMerge?.when
    || config.testsAfterMerge?.testsPath
    || config.testsAfterMerge?.force
  );
  const note = config.testsAfterMerge?.when ?? '';
  return `
    <details ${configured ? 'data-configured="true"' : ''}>
      <summary>${renderSectionSummary('Tests After Merge', configured, note)}</summary>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-tests-merge-segment-${index}" ${config.testsAfterMerge?.segmentEnabled ? 'checked' : ''} />
        <label for="pf-tests-merge-segment-${index}">Include TestsAfterMerge segment</label>
      </div>
      <div class="row">
        <div class="field">
          <label>When</label>
          <select id="pf-tests-merge-when-${index}">
            <option value=""></option>
            ${renderSelectOption('AfterMerge', config.testsAfterMerge?.when)}
          </select>
        </div>
        <div class="field">
          <label>Tests Path</label>
          <input id="pf-tests-merge-path-${index}" value="${escapeHtml(config.testsAfterMerge?.testsPath ?? '')}" />
        </div>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-tests-merge-force-${index}" ${config.testsAfterMerge?.force ? 'checked' : ''} />
        <label for="pf-tests-merge-force-${index}">Force tests</label>
      </div>
    </details>
  `;
}
