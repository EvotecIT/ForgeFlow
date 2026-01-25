import type { PowerForgeConfigSummary } from '../../types';
import { escapeHtml, renderSectionSummary, renderSelectOption } from '../../utils';

export function renderBuildSection(config: PowerForgeConfigSummary, index: number): string {
  const configured = Boolean(
    config.build?.name
    || config.build?.sourcePath
    || config.build?.csprojPath
    || config.build?.version
    || config.build?.configuration
    || (config.build?.frameworks?.length ?? 0) > 0
  );
  const note = config.build?.name ?? '';
  return `
    <details open ${configured ? 'data-configured="true"' : ''}>
      <summary>${renderSectionSummary('Build', configured, note)}</summary>
      <div class="row">
        <div class="field">
          <label>Module Name</label>
          <input id="pf-build-name-${index}" value="${escapeHtml(config.build?.name ?? '')}" />
        </div>
        <div class="field">
          <label>Version</label>
          <input id="pf-build-version-${index}" value="${escapeHtml(config.build?.version ?? '')}" />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>Source Path</label>
          <input id="pf-build-source-${index}" value="${escapeHtml(config.build?.sourcePath ?? '')}" />
        </div>
        <div class="field">
          <label>Csproj Path</label>
          <input id="pf-build-csproj-${index}" value="${escapeHtml(config.build?.csprojPath ?? '')}" />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>Configuration</label>
          <input id="pf-build-config-${index}" list="pf-build-configs" value="${escapeHtml(config.build?.configuration ?? '')}" />
        </div>
        <div class="field">
          <label>Frameworks (comma separated)</label>
          <input id="pf-build-frameworks-${index}" value="${escapeHtml((config.build?.frameworks ?? []).join(', '))}" />
        </div>
      </div>
    </details>
  `;
}

export function renderInstallSection(config: PowerForgeConfigSummary, index: number): string {
  const configured = Boolean(
    config.install?.enabled
    || config.install?.strategy
    || config.install?.keepVersions !== undefined
  );
  const note = config.install?.strategy ?? (config.install?.enabled ? 'enabled' : '');
  return `
    <details open ${configured ? 'data-configured="true"' : ''}>
      <summary>${renderSectionSummary('Install', configured, note)}</summary>
      <div class="row">
        <div class="field">
          <label>Install Strategy</label>
          <select id="pf-install-strategy-${index}">
            <option value=""></option>
            ${renderSelectOption('Exact', config.install?.strategy)}
            ${renderSelectOption('AutoRevision', config.install?.strategy)}
          </select>
        </div>
        <div class="field">
          <label>Keep Versions</label>
          <input id="pf-install-keep-${index}" value="${escapeHtml(config.install?.keepVersions?.toString() ?? '')}" />
        </div>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-install-enabled-${index}" ${config.install?.enabled ? 'checked' : ''} />
        <label for="pf-install-enabled-${index}">Install enabled</label>
      </div>
    </details>
  `;
}

export function renderManifestSection(config: PowerForgeConfigSummary, index: number): string {
  const configured = Boolean(
    config.manifest?.segmentEnabled
    || config.manifest?.moduleVersion
    || config.manifest?.compatiblePSEditions?.length
    || config.manifest?.guid
    || config.manifest?.author
    || config.manifest?.companyName
    || config.manifest?.description
    || config.manifest?.powerShellVersion
    || config.manifest?.tags?.length
    || config.manifest?.iconUri
    || config.manifest?.projectUri
    || config.manifest?.licenseUri
    || config.manifest?.requireLicenseAcceptance
    || config.manifest?.prerelease
  );
  const note = config.manifest?.moduleVersion ?? config.manifest?.prerelease ?? '';
  return `
    <details ${configured ? 'data-configured="true"' : ''}>
      <summary>${renderSectionSummary('Manifest', configured, note)}</summary>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-manifest-segment-${index}" ${config.manifest?.segmentEnabled ? 'checked' : ''} />
        <label for="pf-manifest-segment-${index}">Include manifest segment</label>
      </div>
      <div class="row">
        <div class="field">
          <label>Module Version</label>
          <input id="pf-manifest-version-${index}" value="${escapeHtml(config.manifest?.moduleVersion ?? '')}" />
        </div>
        <div class="field">
          <label>Prerelease</label>
          <input id="pf-manifest-prerelease-${index}" value="${escapeHtml(config.manifest?.prerelease ?? '')}" />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>Author</label>
          <input id="pf-manifest-author-${index}" value="${escapeHtml(config.manifest?.author ?? '')}" />
        </div>
        <div class="field">
          <label>Company</label>
          <input id="pf-manifest-company-${index}" value="${escapeHtml(config.manifest?.companyName ?? '')}" />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>Description</label>
          <input id="pf-manifest-description-${index}" value="${escapeHtml(config.manifest?.description ?? '')}" />
        </div>
        <div class="field">
          <label>GUID</label>
          <input id="pf-manifest-guid-${index}" value="${escapeHtml(config.manifest?.guid ?? '')}" />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>PowerShell Version</label>
          <input id="pf-manifest-psversion-${index}" list="pf-ps-versions" value="${escapeHtml(config.manifest?.powerShellVersion ?? '')}" />
        </div>
        <div class="field">
          <label>Compatible Editions</label>
          <input id="pf-manifest-editions-${index}" value="${escapeHtml((config.manifest?.compatiblePSEditions ?? []).join(', '))}" />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>Tags</label>
          <input id="pf-manifest-tags-${index}" value="${escapeHtml((config.manifest?.tags ?? []).join(', '))}" />
        </div>
        <div class="field">
          <label>Icon URI</label>
          <input id="pf-manifest-iconuri-${index}" value="${escapeHtml(config.manifest?.iconUri ?? '')}" />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>Project URI</label>
          <input id="pf-manifest-projecturi-${index}" value="${escapeHtml(config.manifest?.projectUri ?? '')}" />
        </div>
        <div class="field">
          <label>License URI</label>
          <input id="pf-manifest-licenseuri-${index}" value="${escapeHtml(config.manifest?.licenseUri ?? '')}" />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>Copyright</label>
          <input id="pf-manifest-copyright-${index}" value="${escapeHtml(config.manifest?.copyright ?? '')}" />
        </div>
        <div class="field">
          <label>Require License Acceptance</label>
          <input type="checkbox" id="pf-manifest-requirelicense-${index}" ${config.manifest?.requireLicenseAcceptance ? 'checked' : ''} />
        </div>
      </div>
    </details>
  `;
}

export function renderPublishSection(config: PowerForgeConfigSummary, index: number): string {
  const configured = Boolean(
    config.publish?.segmentEnabled
    || config.publish?.enabled
    || config.publish?.destination
    || config.publish?.tool
    || config.publish?.apiKey
    || config.publish?.repositoryName
    || config.publish?.repositoryEnabled
    || config.publish?.repository?.uri
  );
  const note = config.publish?.destination ?? '';
  return `
    <details ${configured ? 'data-configured="true"' : ''}>
      <summary>${renderSectionSummary('Publish', configured, note)}</summary>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-publish-segment-${index}" ${config.publish?.segmentEnabled ? 'checked' : ''} />
        <label for="pf-publish-segment-${index}">Include publish segment</label>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-publish-enabled-${index}" ${config.publish?.enabled ? 'checked' : ''} />
        <label for="pf-publish-enabled-${index}">Publish enabled</label>
      </div>
      <div class="row">
        <div class="field">
          <label>Destination</label>
          <select id="pf-publish-destination-${index}">
            <option value=""></option>
            ${renderSelectOption('PowerShellGallery', config.publish?.destination)}
            ${renderSelectOption('GitHub', config.publish?.destination)}
          </select>
        </div>
        <div class="field">
          <label>Tool</label>
          <select id="pf-publish-tool-${index}">
            <option value=""></option>
            ${renderSelectOption('Auto', config.publish?.tool)}
            ${renderSelectOption('PSResourceGet', config.publish?.tool)}
            ${renderSelectOption('PowerShellGet', config.publish?.tool)}
          </select>
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>API Key</label>
          <input id="pf-publish-apikey-${index}" value="${escapeHtml(config.publish?.apiKey ?? '')}" />
        </div>
        <div class="field">
          <label>Repository Name</label>
          <input id="pf-publish-reponame-${index}" value="${escapeHtml(config.publish?.repositoryName ?? '')}" />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>User Name</label>
          <input id="pf-publish-username-${index}" value="${escapeHtml(config.publish?.userName ?? '')}" />
        </div>
        <div class="field">
          <label>Package ID</label>
          <input id="pf-publish-id-${index}" value="${escapeHtml(config.publish?.id ?? '')}" />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>Overwrite Tag Name</label>
          <input id="pf-publish-overwritetag-${index}" value="${escapeHtml(config.publish?.overwriteTagName ?? '')}" />
        </div>
        <div class="field">
          <label>Force</label>
          <input type="checkbox" id="pf-publish-force-${index}" ${config.publish?.force ? 'checked' : ''} />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>Generate Release Notes</label>
          <input type="checkbox" id="pf-publish-releasenotes-${index}" ${config.publish?.generateReleaseNotes ? 'checked' : ''} />
        </div>
        <div class="field">
          <label>Do Not Mark Pre-Release</label>
          <input type="checkbox" id="pf-publish-donotmark-${index}" ${config.publish?.doNotMarkAsPreRelease ? 'checked' : ''} />
        </div>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="pf-publish-verbose-${index}" ${config.publish?.verbose ? 'checked' : ''} />
        <label for="pf-publish-verbose-${index}">Verbose logging</label>
      </div>
      <div class="section">
        <div class="section-title">Repository Override</div>
        <div class="checkbox-row">
          <input type="checkbox" id="pf-publish-repo-enabled-${index}" ${config.publish?.repositoryEnabled ? 'checked' : ''} />
          <label for="pf-publish-repo-enabled-${index}">Use custom repository</label>
        </div>
        <div class="row">
          <div class="field">
            <label>Name</label>
            <input id="pf-publish-repo-name-${index}" value="${escapeHtml(config.publish?.repository?.name ?? '')}" />
          </div>
          <div class="field">
            <label>URI</label>
            <input id="pf-publish-repo-uri-${index}" value="${escapeHtml(config.publish?.repository?.uri ?? '')}" />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Source URI</label>
            <input id="pf-publish-repo-source-${index}" value="${escapeHtml(config.publish?.repository?.sourceUri ?? '')}" />
          </div>
          <div class="field">
            <label>Publish URI</label>
            <input id="pf-publish-repo-publish-${index}" value="${escapeHtml(config.publish?.repository?.publishUri ?? '')}" />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>API Version</label>
            <select id="pf-publish-repo-apiversion-${index}">
              <option value=""></option>
              ${renderSelectOption('Auto', config.publish?.repository?.apiVersion)}
              ${renderSelectOption('V2', config.publish?.repository?.apiVersion)}
              ${renderSelectOption('V3', config.publish?.repository?.apiVersion)}
            </select>
          </div>
          <div class="field">
            <label>Priority</label>
            <input id="pf-publish-repo-priority-${index}" value="${escapeHtml(config.publish?.repository?.priority?.toString() ?? '')}" />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Trusted</label>
            <input type="checkbox" id="pf-publish-repo-trusted-${index}" ${config.publish?.repository?.trusted ? 'checked' : ''} />
          </div>
          <div class="field">
            <label>Ensure Registered</label>
            <input type="checkbox" id="pf-publish-repo-ensure-${index}" ${config.publish?.repository?.ensureRegistered ? 'checked' : ''} />
          </div>
        </div>
        <div class="checkbox-row">
          <input type="checkbox" id="pf-publish-repo-unregister-${index}" ${config.publish?.repository?.unregisterAfterUse ? 'checked' : ''} />
          <label for="pf-publish-repo-unregister-${index}">Unregister after use</label>
        </div>
      </div>
    </details>
  `;
}
