import type { PowerForgeConfigSummary } from '../../types';
import { escapeHtml, renderSectionSummary, renderSelectOption } from '../../utils';

export function renderDocumentationSection(config: PowerForgeConfigSummary, index: number): string {
  const configured = Boolean(
    config.documentation?.segmentEnabled
    || config.documentation?.path
    || config.documentation?.readmePath
  );
  const note = config.documentation?.path ?? '';
  return `
    <details ${configured ? 'data-configured="true"' : ''}>
      <summary>${renderSectionSummary('Documentation', configured, note)}</summary>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-docs-segment-${index}" ${config.documentation?.segmentEnabled ? 'checked' : ''} />
        <label for="pf-docs-segment-${index}">Include documentation segment</label>
      </div>
      <div class="row">
        <div class="field">
          <label>Docs Path</label>
          <input id="pf-docs-path-${index}" value="${escapeHtml(config.documentation?.path ?? '')}" />
        </div>
        <div class="field">
          <label>Readme Path</label>
          <input id="pf-docs-readme-${index}" value="${escapeHtml(config.documentation?.readmePath ?? '')}" />
        </div>
      </div>
    </details>
  `;
}

export function renderBuildDocumentationSection(config: PowerForgeConfigSummary, index: number): string {
  const configured = Boolean(
    config.buildDocumentation?.segmentEnabled
    || config.buildDocumentation?.enable
    || config.buildDocumentation?.tool
    || config.buildDocumentation?.externalHelpCulture
  );
  const note = config.buildDocumentation?.tool ?? '';
  return `
    <details ${configured ? 'data-configured="true"' : ''}>
      <summary>${renderSectionSummary('Build Documentation', configured, note)}</summary>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-build-docs-segment-${index}" ${config.buildDocumentation?.segmentEnabled ? 'checked' : ''} />
        <label for="pf-build-docs-segment-${index}">Include build documentation segment</label>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-build-docs-enable-${index}" ${config.buildDocumentation?.enable ? 'checked' : ''} />
        <label for="pf-build-docs-enable-${index}">Enable generation</label>
      </div>
      <div class="row">
        <div class="field">
          <label>Tool</label>
          <select id="pf-build-docs-tool-${index}">
            <option value=""></option>
            ${renderSelectOption('PowerForge', config.buildDocumentation?.tool)}
            ${renderSelectOption('PlatyPS', config.buildDocumentation?.tool)}
            ${renderSelectOption('HelpOut', config.buildDocumentation?.tool)}
          </select>
        </div>
        <div class="field">
          <label>External Help Culture</label>
          <input id="pf-build-docs-culture-${index}" value="${escapeHtml(config.buildDocumentation?.externalHelpCulture ?? '')}" />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>Start Clean</label>
          <input type="checkbox" id="pf-build-docs-startclean-${index}" ${config.buildDocumentation?.startClean ? 'checked' : ''} />
        </div>
        <div class="field">
          <label>Update When New</label>
          <input type="checkbox" id="pf-build-docs-update-${index}" ${config.buildDocumentation?.updateWhenNew ? 'checked' : ''} />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>Sync External Help To Root</label>
          <input type="checkbox" id="pf-build-docs-sync-${index}" ${config.buildDocumentation?.syncExternalHelpToProjectRoot ? 'checked' : ''} />
        </div>
        <div class="field">
          <label>Generate External Help</label>
          <input type="checkbox" id="pf-build-docs-generate-${index}" ${config.buildDocumentation?.generateExternalHelp ? 'checked' : ''} />
        </div>
      </div>
    </details>
  `;
}

export function renderValidationSection(config: PowerForgeConfigSummary, index: number): string {
  const validation = config.validation;
  const configured = Boolean(
    validation?.segmentEnabled
    || validation?.enable
    || validation?.scriptAnalyzerEnable
    || validation?.checkTrailingWhitespace
    || validation?.checkSyntax
    || validation?.structure?.severity
    || (validation?.structure?.publicPaths?.length ?? 0) > 0
    || (validation?.structure?.internalPaths?.length ?? 0) > 0
    || validation?.structure?.validateManifestFiles
    || validation?.structure?.validateExports
    || validation?.structure?.validateInternalNotExported
    || validation?.documentation?.severity
    || validation?.documentation?.minSynopsisPercent !== undefined
    || validation?.tests?.enable
    || validation?.tests?.testPath
    || validation?.tests?.force
    || validation?.binary?.severity
    || validation?.binary?.validateAssembliesExist
    || validation?.csproj?.severity
    || validation?.csproj?.requireTargetFramework
  );
  const note = validation?.enable ? 'enabled' : validation?.structure?.severity ?? '';
  return `
    <details ${configured ? 'data-configured="true"' : ''}>
      <summary>${renderSectionSummary('Validation', configured, note)}</summary>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-validation-segment-${index}" ${config.validation?.segmentEnabled ? 'checked' : ''} />
        <label for="pf-validation-segment-${index}">Include validation segment</label>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-validation-enable-${index}" ${config.validation?.enable ? 'checked' : ''} />
        <label for="pf-validation-enable-${index}">Enable validation</label>
      </div>
      <div class="row">
        <div class="field">
          <label>Script Analyzer</label>
          <input type="checkbox" id="pf-validation-analyzer-${index}" ${config.validation?.scriptAnalyzerEnable ? 'checked' : ''} />
        </div>
        <div class="field">
          <label>Check Trailing Whitespace</label>
          <input type="checkbox" id="pf-validation-trailing-${index}" ${config.validation?.checkTrailingWhitespace ? 'checked' : ''} />
        </div>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-validation-syntax-${index}" ${config.validation?.checkSyntax ? 'checked' : ''} />
        <label for="pf-validation-syntax-${index}">Check Syntax</label>
      </div>
      <details>
        <summary>Structure</summary>
        <div class="row">
          <div class="field">
            <label>Severity</label>
            <select id="pf-validation-structure-severity-${index}">
              <option value=""></option>
              ${renderSelectOption('Off', config.validation?.structure?.severity)}
              ${renderSelectOption('Warning', config.validation?.structure?.severity)}
              ${renderSelectOption('Error', config.validation?.structure?.severity)}
            </select>
          </div>
          <div class="field">
            <label>Public Function Paths</label>
            <input id="pf-validation-structure-public-${index}" value="${escapeHtml((config.validation?.structure?.publicPaths ?? []).join(', '))}" />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Internal Function Paths</label>
            <input id="pf-validation-structure-internal-${index}" value="${escapeHtml((config.validation?.structure?.internalPaths ?? []).join(', '))}" />
          </div>
          <div class="field">
            <label>Validate Manifest Files</label>
            <input type="checkbox" id="pf-validation-structure-manifest-${index}" ${config.validation?.structure?.validateManifestFiles ? 'checked' : ''} />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Validate Exports</label>
            <input type="checkbox" id="pf-validation-structure-exports-${index}" ${config.validation?.structure?.validateExports ? 'checked' : ''} />
          </div>
          <div class="field">
            <label>Validate Internal Not Exported</label>
            <input type="checkbox" id="pf-validation-structure-internalexport-${index}" ${config.validation?.structure?.validateInternalNotExported ? 'checked' : ''} />
          </div>
        </div>
        <div class="checkbox-row">
          <input type="checkbox" id="pf-validation-structure-wildcard-${index}" ${config.validation?.structure?.allowWildcardExports ? 'checked' : ''} />
          <label for="pf-validation-structure-wildcard-${index}">Allow wildcard exports</label>
        </div>
      </details>
      <details>
        <summary>Documentation</summary>
        <div class="row">
          <div class="field">
            <label>Severity</label>
            <select id="pf-validation-docs-severity-${index}">
              <option value=""></option>
              ${renderSelectOption('Off', config.validation?.documentation?.severity)}
              ${renderSelectOption('Warning', config.validation?.documentation?.severity)}
              ${renderSelectOption('Error', config.validation?.documentation?.severity)}
            </select>
          </div>
          <div class="field">
            <label>Min Synopsis %</label>
            <input id="pf-validation-docs-synopsis-${index}" value="${escapeHtml(config.validation?.documentation?.minSynopsisPercent?.toString() ?? '')}" />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Min Description %</label>
            <input id="pf-validation-docs-description-${index}" value="${escapeHtml(config.validation?.documentation?.minDescriptionPercent?.toString() ?? '')}" />
          </div>
          <div class="field">
            <label>Min Examples per Cmd</label>
            <input id="pf-validation-docs-examples-${index}" value="${escapeHtml(config.validation?.documentation?.minExampleCountPerCommand?.toString() ?? '')}" />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Exclude Commands</label>
            <input id="pf-validation-docs-exclude-${index}" value="${escapeHtml((config.validation?.documentation?.excludeCommands ?? []).join(', '))}" />
          </div>
          <div class="field">
            <label>Timeout (seconds)</label>
            <input id="pf-validation-docs-timeout-${index}" value="${escapeHtml(config.validation?.documentation?.timeoutSeconds?.toString() ?? '')}" />
          </div>
        </div>
      </details>
      <details>
        <summary>Tests</summary>
        <div class="row">
          <div class="field">
            <label>Severity</label>
            <select id="pf-validation-tests-severity-${index}">
              <option value=""></option>
              ${renderSelectOption('Off', config.validation?.tests?.severity)}
              ${renderSelectOption('Warning', config.validation?.tests?.severity)}
              ${renderSelectOption('Error', config.validation?.tests?.severity)}
            </select>
          </div>
          <div class="field">
            <label>Enable Tests</label>
            <input type="checkbox" id="pf-validation-tests-enable-${index}" ${config.validation?.tests?.enable ? 'checked' : ''} />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Test Path</label>
            <input id="pf-validation-tests-path-${index}" value="${escapeHtml(config.validation?.tests?.testPath ?? '')}" />
          </div>
          <div class="field">
            <label>Additional Modules</label>
            <input id="pf-validation-tests-additional-${index}" value="${escapeHtml((config.validation?.tests?.additionalModules ?? []).join(', '))}" />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Skip Modules</label>
            <input id="pf-validation-tests-skip-${index}" value="${escapeHtml((config.validation?.tests?.skipModules ?? []).join(', '))}" />
          </div>
          <div class="field">
            <label>Timeout (seconds)</label>
            <input id="pf-validation-tests-timeout-${index}" value="${escapeHtml(config.validation?.tests?.timeoutSeconds?.toString() ?? '')}" />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Skip Dependencies</label>
            <input type="checkbox" id="pf-validation-tests-skipdeps-${index}" ${config.validation?.tests?.skipDependencies ? 'checked' : ''} />
          </div>
          <div class="field">
            <label>Skip Import</label>
            <input type="checkbox" id="pf-validation-tests-skipimport-${index}" ${config.validation?.tests?.skipImport ? 'checked' : ''} />
          </div>
        </div>
        <div class="checkbox-row">
          <input type="checkbox" id="pf-validation-tests-force-${index}" ${config.validation?.tests?.force ? 'checked' : ''} />
          <label for="pf-validation-tests-force-${index}">Force test run</label>
        </div>
      </details>
      <details>
        <summary>Binary</summary>
        <div class="row">
          <div class="field">
            <label>Severity</label>
            <select id="pf-validation-binary-severity-${index}">
              <option value=""></option>
              ${renderSelectOption('Off', config.validation?.binary?.severity)}
              ${renderSelectOption('Warning', config.validation?.binary?.severity)}
              ${renderSelectOption('Error', config.validation?.binary?.severity)}
            </select>
          </div>
          <div class="field">
            <label>Validate Assemblies Exist</label>
            <input type="checkbox" id="pf-validation-binary-assemblies-${index}" ${config.validation?.binary?.validateAssembliesExist ? 'checked' : ''} />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Validate Manifest Exports</label>
            <input type="checkbox" id="pf-validation-binary-exports-${index}" ${config.validation?.binary?.validateManifestExports ? 'checked' : ''} />
          </div>
          <div class="field">
            <label>Allow Wildcard Exports</label>
            <input type="checkbox" id="pf-validation-binary-wildcard-${index}" ${config.validation?.binary?.allowWildcardExports ? 'checked' : ''} />
          </div>
        </div>
      </details>
      <details>
        <summary>Csproj</summary>
        <div class="row">
          <div class="field">
            <label>Severity</label>
            <select id="pf-validation-csproj-severity-${index}">
              <option value=""></option>
              ${renderSelectOption('Off', config.validation?.csproj?.severity)}
              ${renderSelectOption('Warning', config.validation?.csproj?.severity)}
              ${renderSelectOption('Error', config.validation?.csproj?.severity)}
            </select>
          </div>
          <div class="field">
            <label>Require Target Framework</label>
            <input type="checkbox" id="pf-validation-csproj-framework-${index}" ${config.validation?.csproj?.requireTargetFramework ? 'checked' : ''} />
          </div>
        </div>
        <div class="checkbox-row">
          <input type="checkbox" id="pf-validation-csproj-output-${index}" ${config.validation?.csproj?.requireLibraryOutput ? 'checked' : ''} />
          <label for="pf-validation-csproj-output-${index}">Require library output</label>
        </div>
      </details>
    </details>
  `;
}

export function renderFileConsistencySection(config: PowerForgeConfigSummary, index: number): string {
  const fileConsistency = config.fileConsistency;
  const configured = Boolean(
    fileConsistency?.segmentEnabled
    || fileConsistency?.enable
    || fileConsistency?.requiredEncoding
    || fileConsistency?.requiredLineEnding
    || fileConsistency?.scope
    || (fileConsistency?.excludeDirectories?.length ?? 0) > 0
    || fileConsistency?.exportReport
    || fileConsistency?.checkMixedLineEndings
    || fileConsistency?.checkMissingFinalNewline
  );
  const note = fileConsistency?.requiredEncoding ?? fileConsistency?.requiredLineEnding ?? '';
  return `
    <details ${configured ? 'data-configured="true"' : ''}>
      <summary>${renderSectionSummary('File Consistency', configured, note)}</summary>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-consistency-segment-${index}" ${config.fileConsistency?.segmentEnabled ? 'checked' : ''} />
        <label for="pf-consistency-segment-${index}">Include file consistency segment</label>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-consistency-enable-${index}" ${config.fileConsistency?.enable ? 'checked' : ''} />
        <label for="pf-consistency-enable-${index}">Enable file consistency</label>
      </div>
      <div class="row">
        <div class="field">
          <label>Required Encoding</label>
          <select id="pf-consistency-encoding-${index}">
            <option value=""></option>
            ${renderSelectOption('ASCII', config.fileConsistency?.requiredEncoding)}
            ${renderSelectOption('UTF8', config.fileConsistency?.requiredEncoding)}
            ${renderSelectOption('UTF8BOM', config.fileConsistency?.requiredEncoding)}
            ${renderSelectOption('Unicode', config.fileConsistency?.requiredEncoding)}
            ${renderSelectOption('BigEndianUnicode', config.fileConsistency?.requiredEncoding)}
            ${renderSelectOption('UTF7', config.fileConsistency?.requiredEncoding)}
            ${renderSelectOption('UTF32', config.fileConsistency?.requiredEncoding)}
          </select>
        </div>
        <div class="field">
          <label>Required Line Ending</label>
          <select id="pf-consistency-lineending-${index}">
            <option value=""></option>
            ${renderSelectOption('CRLF', config.fileConsistency?.requiredLineEnding)}
            ${renderSelectOption('LF', config.fileConsistency?.requiredLineEnding)}
          </select>
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>Scope</label>
          <select id="pf-consistency-scope-${index}">
            <option value=""></option>
            ${renderSelectOption('StagingOnly', config.fileConsistency?.scope)}
            ${renderSelectOption('ProjectOnly', config.fileConsistency?.scope)}
            ${renderSelectOption('StagingAndProject', config.fileConsistency?.scope)}
          </select>
        </div>
        <div class="field">
          <label>Exclude Dirs (comma separated)</label>
          <input id="pf-consistency-exclude-${index}" value="${escapeHtml((config.fileConsistency?.excludeDirectories ?? []).join(', '))}" />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>Export Report</label>
          <input type="checkbox" id="pf-consistency-export-${index}" ${config.fileConsistency?.exportReport ? 'checked' : ''} />
        </div>
        <div class="field">
          <label>Check Mixed Line Endings</label>
          <input type="checkbox" id="pf-consistency-mixed-${index}" ${config.fileConsistency?.checkMixedLineEndings ? 'checked' : ''} />
        </div>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-consistency-newline-${index}" ${config.fileConsistency?.checkMissingFinalNewline ? 'checked' : ''} />
        <label for="pf-consistency-newline-${index}">Check Missing Final Newline</label>
      </div>
    </details>
  `;
}

export function renderCompatibilitySection(config: PowerForgeConfigSummary, index: number): string {
  const configured = Boolean(
    config.compatibility?.segmentEnabled
    || config.compatibility?.enable
    || config.compatibility?.requireCrossCompatibility
    || config.compatibility?.minimumCompatibilityPercentage !== undefined
  );
  const note = config.compatibility?.minimumCompatibilityPercentage !== undefined
    ? `${config.compatibility.minimumCompatibilityPercentage}%`
    : '';
  return `
    <details ${configured ? 'data-configured="true"' : ''}>
      <summary>${renderSectionSummary('Compatibility', configured, note)}</summary>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-compat-segment-${index}" ${config.compatibility?.segmentEnabled ? 'checked' : ''} />
        <label for="pf-compat-segment-${index}">Include compatibility segment</label>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-compat-enable-${index}" ${config.compatibility?.enable ? 'checked' : ''} />
        <label for="pf-compat-enable-${index}">Enable compatibility checks</label>
      </div>
      <div class="row">
        <div class="field">
          <label>Require Cross-Compatibility</label>
          <input type="checkbox" id="pf-compat-cross-${index}" ${config.compatibility?.requireCrossCompatibility ? 'checked' : ''} />
        </div>
        <div class="field">
          <label>Minimum Compatibility %</label>
          <input id="pf-compat-min-${index}" value="${escapeHtml(config.compatibility?.minimumCompatibilityPercentage?.toString() ?? '')}" />
        </div>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-compat-export-${index}" ${config.compatibility?.exportReport ? 'checked' : ''} />
        <label for="pf-compat-export-${index}">Export report</label>
      </div>
    </details>
  `;
}
