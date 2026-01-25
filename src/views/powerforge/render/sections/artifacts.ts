import type { PowerForgeConfigSummary } from '../../types';
import { escapeHtml, renderImportantLinkRows, renderSectionSummary, renderSelectOption } from '../../utils';

export function renderArtefactsSection(config: PowerForgeConfigSummary, index: number): string {
  const packed = config.artefacts?.packed;
  const unpacked = config.artefacts?.unpacked;
  const configured = Boolean(
    packed?.segmentEnabled
    || packed?.enabled
    || packed?.path
    || packed?.includeTagName
    || unpacked?.segmentEnabled
    || unpacked?.enabled
    || unpacked?.path
    || unpacked?.includeTagName
  );
  const note = packed?.enabled ? 'packed' : unpacked?.enabled ? 'unpacked' : '';
  return `
    <details ${configured ? 'data-configured="true"' : ''}>
      <summary>${renderSectionSummary('Artefacts', configured, note)}</summary>
      <div class="section">
        <div class="section-title">Packed</div>
        <div class="checkbox-row">
          <input type="checkbox" id="pf-packed-segment-${index}" ${config.artefacts?.packed?.segmentEnabled ? 'checked' : ''} />
          <label for="pf-packed-segment-${index}">Include packed artefact segment</label>
        </div>
        <div class="row">
          <div class="field">
            <label>Enabled</label>
            <input type="checkbox" id="pf-packed-enabled-${index}" ${config.artefacts?.packed?.enabled ? 'checked' : ''} />
          </div>
          <div class="field">
            <label>Path</label>
            <input id="pf-packed-path-${index}" value="${escapeHtml(config.artefacts?.packed?.path ?? '')}" />
          </div>
        </div>
        <div class="checkbox-row">
          <input type="checkbox" id="pf-packed-tag-${index}" ${config.artefacts?.packed?.includeTagName ? 'checked' : ''} />
          <label for="pf-packed-tag-${index}">Include tag name</label>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Unpacked</div>
        <div class="checkbox-row">
          <input type="checkbox" id="pf-unpacked-segment-${index}" ${config.artefacts?.unpacked?.segmentEnabled ? 'checked' : ''} />
          <label for="pf-unpacked-segment-${index}">Include unpacked artefact segment</label>
        </div>
        <div class="row">
          <div class="field">
            <label>Enabled</label>
            <input type="checkbox" id="pf-unpacked-enabled-${index}" ${config.artefacts?.unpacked?.enabled ? 'checked' : ''} />
          </div>
          <div class="field">
            <label>Path</label>
            <input id="pf-unpacked-path-${index}" value="${escapeHtml(config.artefacts?.unpacked?.path ?? '')}" />
          </div>
        </div>
        <div class="checkbox-row">
          <input type="checkbox" id="pf-unpacked-tag-${index}" ${config.artefacts?.unpacked?.includeTagName ? 'checked' : ''} />
          <label for="pf-unpacked-tag-${index}">Include tag name</label>
        </div>
      </div>
    </details>
  `;
}

export function renderOptionsSection(config: PowerForgeConfigSummary, index: number): string {
  const configured = Boolean(
    config.options?.segmentEnabled
    || config.options?.signingThumbprint
    || config.options?.signingPfxPath
    || config.options?.signingPfxPassword
    || (config.options?.signingInclude?.length ?? 0) > 0
    || (config.options?.signingExcludePaths?.length ?? 0) > 0
    || config.options?.signingIncludeInternals
    || config.options?.signingIncludeBinaries
    || config.options?.deliveryEnable
    || config.options?.deliverySchema
    || (config.options?.deliveryRepositoryPaths?.length ?? 0) > 0
    || (config.options?.deliveryImportantLinks?.length ?? 0) > 0
  );
  const note = config.options?.signingThumbprint ? 'signing' : config.options?.deliveryEnable ? 'delivery' : '';
  return `
    <details ${configured ? 'data-configured="true"' : ''}>
      <summary>${renderSectionSummary('Options', configured, note)}</summary>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-options-segment-${index}" ${config.options?.segmentEnabled ? 'checked' : ''} />
        <label for="pf-options-segment-${index}">Include options segment</label>
      </div>
      <div class="section">
        <div class="section-title">Signing</div>
        <div class="row">
          <div class="field">
            <label>Certificate Thumbprint</label>
            <input id="pf-options-sign-thumb-${index}" value="${escapeHtml(config.options?.signingThumbprint ?? '')}" />
          </div>
          <div class="field">
            <label>PFX Path</label>
            <input id="pf-options-sign-pfx-${index}" value="${escapeHtml(config.options?.signingPfxPath ?? '')}" />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Include Paths</label>
            <input id="pf-options-sign-include-${index}" value="${escapeHtml((config.options?.signingInclude ?? []).join(', '))}" />
          </div>
          <div class="field">
            <label>Exclude Paths</label>
            <input id="pf-options-sign-exclude-${index}" value="${escapeHtml((config.options?.signingExcludePaths ?? []).join(', '))}" />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>PFX Password</label>
            <input id="pf-options-sign-pass-${index}" value="${escapeHtml(config.options?.signingPfxPassword ?? '')}" />
          </div>
          <div class="field">
            <label>Include Internals</label>
            <input type="checkbox" id="pf-options-sign-internals-${index}" ${config.options?.signingIncludeInternals ? 'checked' : ''} />
          </div>
        </div>
        <div class="checkbox-row">
          <input type="checkbox" id="pf-options-sign-binaries-${index}" ${config.options?.signingIncludeBinaries ? 'checked' : ''} />
          <label for="pf-options-sign-binaries-${index}">Include binaries</label>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Delivery</div>
        <div class="checkbox-row">
          <input type="checkbox" id="pf-options-delivery-enable-${index}" ${config.options?.deliveryEnable ? 'checked' : ''} />
          <label for="pf-options-delivery-enable-${index}">Enable delivery bundle</label>
        </div>
        <div class="row">
          <div class="field">
            <label>Include Root Readme</label>
            <input type="checkbox" id="pf-options-delivery-readme-${index}" ${config.options?.deliveryIncludeRootReadme ? 'checked' : ''} />
          </div>
          <div class="field">
            <label>Include Root Changelog</label>
            <input type="checkbox" id="pf-options-delivery-changelog-${index}" ${config.options?.deliveryIncludeRootChangelog ? 'checked' : ''} />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Include Root License</label>
            <input type="checkbox" id="pf-options-delivery-license-${index}" ${config.options?.deliveryIncludeRootLicense ? 'checked' : ''} />
          </div>
          <div class="field">
            <label>Schema</label>
            <input id="pf-options-delivery-schema-${index}" value="${escapeHtml(config.options?.deliverySchema ?? '')}" />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Readme Destination</label>
            <select id="pf-options-delivery-readmedest-${index}">
              <option value=""></option>
              ${renderSelectOption('Internals', config.options?.deliveryReadmeDestination ?? undefined)}
              ${renderSelectOption('Root', config.options?.deliveryReadmeDestination ?? undefined)}
              ${renderSelectOption('Both', config.options?.deliveryReadmeDestination ?? undefined)}
              ${renderSelectOption('None', config.options?.deliveryReadmeDestination ?? undefined)}
            </select>
          </div>
          <div class="field">
            <label>Changelog Destination</label>
            <select id="pf-options-delivery-changelogdest-${index}">
              <option value=""></option>
              ${renderSelectOption('Internals', config.options?.deliveryChangelogDestination ?? undefined)}
              ${renderSelectOption('Root', config.options?.deliveryChangelogDestination ?? undefined)}
              ${renderSelectOption('Both', config.options?.deliveryChangelogDestination ?? undefined)}
              ${renderSelectOption('None', config.options?.deliveryChangelogDestination ?? undefined)}
            </select>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>License Destination</label>
            <select id="pf-options-delivery-licensedest-${index}">
              <option value=""></option>
              ${renderSelectOption('Internals', config.options?.deliveryLicenseDestination ?? undefined)}
              ${renderSelectOption('Root', config.options?.deliveryLicenseDestination ?? undefined)}
              ${renderSelectOption('Both', config.options?.deliveryLicenseDestination ?? undefined)}
              ${renderSelectOption('None', config.options?.deliveryLicenseDestination ?? undefined)}
            </select>
          </div>
          <div class="field">
            <label>Repository Branch</label>
            <input id="pf-options-delivery-repobranch-${index}" value="${escapeHtml(config.options?.deliveryRepositoryBranch ?? '')}" />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Repository Paths (comma separated)</label>
            <input id="pf-options-delivery-repopaths-${index}" value="${escapeHtml((config.options?.deliveryRepositoryPaths ?? []).join(', '))}" />
          </div>
          <div class="field">
            <label>Documentation Order (comma separated)</label>
            <input id="pf-options-delivery-docorder-${index}" value="${escapeHtml((config.options?.deliveryDocumentationOrder ?? []).join(', '))}" />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Intro Text (one per line)</label>
            <textarea id="pf-options-delivery-intro-${index}">${escapeHtml((config.options?.deliveryIntroText ?? []).join('\n'))}</textarea>
          </div>
          <div class="field">
            <label>Upgrade Text (one per line)</label>
            <textarea id="pf-options-delivery-upgrade-${index}">${escapeHtml((config.options?.deliveryUpgradeText ?? []).join('\n'))}</textarea>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Generate Install Command</label>
            <input type="checkbox" id="pf-options-delivery-geninstall-${index}" ${config.options?.deliveryGenerateInstallCommand ? 'checked' : ''} />
          </div>
          <div class="field">
            <label>Generate Update Command</label>
            <input type="checkbox" id="pf-options-delivery-genupdate-${index}" ${config.options?.deliveryGenerateUpdateCommand ? 'checked' : ''} />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Install Command Name</label>
            <input id="pf-options-delivery-installname-${index}" value="${escapeHtml(config.options?.deliveryInstallCommandName ?? '')}" />
          </div>
          <div class="field">
            <label>Update Command Name</label>
            <input id="pf-options-delivery-updatename-${index}" value="${escapeHtml(config.options?.deliveryUpdateCommandName ?? '')}" />
          </div>
        </div>
        <div class="section">
          <div class="section-title">Important Links</div>
          <div class="pf-link-list">
            ${renderImportantLinkRows(config.options?.deliveryImportantLinks)}
          </div>
          <div class="actions">
            <button class="secondary" data-action="addLink" type="button">Add link</button>
          </div>
        </div>
      </div>
    </details>
  `;
}

export function renderFormattingSection(config: PowerForgeConfigSummary, index: number): string {
  const configured = Boolean(
    config.formatting?.segmentEnabled
    || config.formatting?.updateProjectRoot
    || config.formatting?.ps1Enabled
    || config.formatting?.ps1RemoveComments
    || config.formatting?.psm1Enabled
    || config.formatting?.psd1Enabled
    || config.formatting?.sort
    || (config.formatting?.includeRules?.length ?? 0) > 0
  );
  const note = config.formatting?.ps1Enabled ? 'PS1' : config.formatting?.psm1Enabled ? 'PSM1' : '';
  return `
    <details ${configured ? 'data-configured="true"' : ''}>
      <summary>${renderSectionSummary('Formatting', configured, note)}</summary>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-formatting-segment-${index}" ${config.formatting?.segmentEnabled ? 'checked' : ''} />
        <label for="pf-formatting-segment-${index}">Include formatting segment</label>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-formatting-update-${index}" ${config.formatting?.updateProjectRoot ? 'checked' : ''} />
        <label for="pf-formatting-update-${index}">Update project root with formatted output</label>
      </div>
      <div class="row">
        <div class="field">
          <label>Format PS1</label>
          <input type="checkbox" id="pf-formatting-ps1-enabled-${index}" ${config.formatting?.ps1Enabled ? 'checked' : ''} />
        </div>
        <div class="field">
          <label>Remove PS1 Comments</label>
          <input type="checkbox" id="pf-formatting-ps1-comments-${index}" ${config.formatting?.ps1RemoveComments ? 'checked' : ''} />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>Format PSM1</label>
          <input type="checkbox" id="pf-formatting-psm1-enabled-${index}" ${config.formatting?.psm1Enabled ? 'checked' : ''} />
        </div>
        <div class="field">
          <label>Format PSD1</label>
          <input type="checkbox" id="pf-formatting-psd1-enabled-${index}" ${config.formatting?.psd1Enabled ? 'checked' : ''} />
        </div>
      </div>
      <details>
        <summary>Advanced Rules (Standard)</summary>
        <div class="row">
          <div class="field">
            <label>Sort</label>
            <input id="pf-formatting-sort-${index}" value="${escapeHtml(config.formatting?.sort ?? '')}" />
          </div>
          <div class="field">
            <label>Include Rules</label>
            <input id="pf-formatting-includerules-${index}" value="${escapeHtml((config.formatting?.includeRules ?? []).join(', '))}" />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Remove Empty Lines</label>
            <input type="checkbox" id="pf-formatting-remove-empty-${index}" ${config.formatting?.ps1RemoveEmptyLines ? 'checked' : ''} />
          </div>
          <div class="field">
            <label>Remove All Empty Lines</label>
            <input type="checkbox" id="pf-formatting-remove-all-${index}" ${config.formatting?.ps1RemoveAllEmptyLines ? 'checked' : ''} />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Remove Comments In Param Block</label>
            <input type="checkbox" id="pf-formatting-remove-param-${index}" ${config.formatting?.ps1RemoveCommentsInParamBlock ? 'checked' : ''} />
          </div>
          <div class="field">
            <label>Remove Comments Before Param Block</label>
            <input type="checkbox" id="pf-formatting-remove-before-${index}" ${config.formatting?.ps1RemoveCommentsBeforeParamBlock ? 'checked' : ''} />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Place Open Brace</label>
            <input type="checkbox" id="pf-formatting-rule-open-${index}" ${config.formatting?.rulePlaceOpenBrace ? 'checked' : ''} />
          </div>
          <div class="field">
            <label>Place Close Brace</label>
            <input type="checkbox" id="pf-formatting-rule-close-${index}" ${config.formatting?.rulePlaceCloseBrace ? 'checked' : ''} />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Consistent Indentation</label>
            <input type="checkbox" id="pf-formatting-rule-indent-${index}" ${config.formatting?.ruleConsistentIndentation ? 'checked' : ''} />
          </div>
          <div class="field">
            <label>Consistent Whitespace</label>
            <input type="checkbox" id="pf-formatting-rule-whitespace-${index}" ${config.formatting?.ruleConsistentWhitespace ? 'checked' : ''} />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Align Assignment</label>
            <input type="checkbox" id="pf-formatting-rule-align-${index}" ${config.formatting?.ruleAlignAssignment ? 'checked' : ''} />
          </div>
          <div class="field">
            <label>Correct Casing</label>
            <input type="checkbox" id="pf-formatting-rule-casing-${index}" ${config.formatting?.ruleCorrectCasing ? 'checked' : ''} />
          </div>
        </div>
      </details>
    </details>
  `;
}
