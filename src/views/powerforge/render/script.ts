export function renderWebviewScript(): string {
  return `
    const vscode = acquireVsCodeApi();

    function post(type, payload) {
      vscode.postMessage(Object.assign({ type }, payload || {}));
    }

    document.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'refresh') {
        post('refresh');
        return;
      }
      const card = button.closest('[data-config-path]');
      const configPath = card?.dataset.configPath;
      if (action === 'openConfig' && configPath) {
        post('openConfig', { path: configPath });
        return;
      }
      if (action === 'planPipeline' && configPath) {
        post('planPipeline', { path: configPath });
        return;
      }
      if (action === 'runPipeline' && configPath) {
        post('runPipeline', { path: configPath });
        return;
      }
      if (action === 'planDotnetPublish' && configPath) {
        post('planDotnetPublish', { path: configPath });
        return;
      }
      if (action === 'runDotnetPublish' && configPath) {
        post('runDotnetPublish', { path: configPath });
        return;
      }
      if (action === 'validateDotnetPublish' && configPath) {
        post('validateDotnetPublish', { path: configPath });
        return;
      }
      if (action === 'savePipeline' && configPath) {
        const id = card.dataset.configId;
        const dependencies = [];
        card?.querySelectorAll('.pf-dep-row').forEach((row) => {
          const getValue = (field) => row.querySelector('[data-field="' + field + '"]')?.value ?? '';
          const moduleName = getValue('moduleName').trim();
          if (!moduleName) return;
          dependencies.push({
            kind: getValue('kind').trim() || 'RequiredModule',
            moduleName,
            moduleVersion: getValue('moduleVersion').trim(),
            minimumVersion: getValue('minimumVersion').trim(),
            requiredVersion: getValue('requiredVersion').trim(),
            guid: getValue('guid').trim()
          });
        });
        const placeholders = [];
        card?.querySelectorAll('.pf-placeholder-row').forEach((row) => {
          const getValue = (field) => row.querySelector('[data-field="' + field + '"]')?.value ?? '';
          const find = getValue('find').trim();
          const replace = getValue('replace').trim();
          if (!find) return;
          placeholders.push({ find, replace });
        });
        const importantLinks = [];
        card?.querySelectorAll('.pf-link-row').forEach((row) => {
          const getValue = (field) => row.querySelector('[data-field="' + field + '"]')?.value ?? '';
          const title = getValue('title').trim();
          const url = getValue('url').trim();
          if (!title || !url) return;
          importantLinks.push({ title, url });
        });
        const data = {
          buildName: document.getElementById('pf-build-name-' + id)?.value ?? '',
          buildSourcePath: document.getElementById('pf-build-source-' + id)?.value ?? '',
          buildCsprojPath: document.getElementById('pf-build-csproj-' + id)?.value ?? '',
          buildVersion: document.getElementById('pf-build-version-' + id)?.value ?? '',
          buildConfiguration: document.getElementById('pf-build-config-' + id)?.value ?? '',
          buildFrameworks: document.getElementById('pf-build-frameworks-' + id)?.value ?? '',
          installEnabled: document.getElementById('pf-install-enabled-' + id)?.checked ?? false,
          installStrategy: document.getElementById('pf-install-strategy-' + id)?.value ?? '',
          installKeepVersions: document.getElementById('pf-install-keep-' + id)?.value ?? '',
          manifestSegmentEnabled: document.getElementById('pf-manifest-segment-' + id)?.checked ?? false,
          manifestModuleVersion: document.getElementById('pf-manifest-version-' + id)?.value ?? '',
          manifestGuid: document.getElementById('pf-manifest-guid-' + id)?.value ?? '',
          manifestAuthor: document.getElementById('pf-manifest-author-' + id)?.value ?? '',
          manifestCompanyName: document.getElementById('pf-manifest-company-' + id)?.value ?? '',
          manifestCopyright: document.getElementById('pf-manifest-copyright-' + id)?.value ?? '',
          manifestDescription: document.getElementById('pf-manifest-description-' + id)?.value ?? '',
          manifestPowerShellVersion: document.getElementById('pf-manifest-psversion-' + id)?.value ?? '',
          manifestCompatiblePSEditions: document.getElementById('pf-manifest-editions-' + id)?.value ?? '',
          manifestTags: document.getElementById('pf-manifest-tags-' + id)?.value ?? '',
          manifestProjectUri: document.getElementById('pf-manifest-projecturi-' + id)?.value ?? '',
          manifestLicenseUri: document.getElementById('pf-manifest-licenseuri-' + id)?.value ?? '',
          manifestIconUri: document.getElementById('pf-manifest-iconuri-' + id)?.value ?? '',
          manifestRequireLicense: document.getElementById('pf-manifest-requirelicense-' + id)?.checked ?? false,
          manifestPrerelease: document.getElementById('pf-manifest-prerelease-' + id)?.value ?? '',
          publishSegmentEnabled: document.getElementById('pf-publish-segment-' + id)?.checked ?? false,
          publishEnabled: document.getElementById('pf-publish-enabled-' + id)?.checked ?? false,
          publishDestination: document.getElementById('pf-publish-destination-' + id)?.value ?? '',
          publishTool: document.getElementById('pf-publish-tool-' + id)?.value ?? '',
          publishApiKey: document.getElementById('pf-publish-apikey-' + id)?.value ?? '',
          publishId: document.getElementById('pf-publish-id-' + id)?.value ?? '',
          publishUserName: document.getElementById('pf-publish-username-' + id)?.value ?? '',
          publishRepositoryName: document.getElementById('pf-publish-reponame-' + id)?.value ?? '',
          publishForce: document.getElementById('pf-publish-force-' + id)?.checked ?? false,
          publishOverwriteTag: document.getElementById('pf-publish-overwritetag-' + id)?.value ?? '',
          publishDoNotMarkPre: document.getElementById('pf-publish-donotmark-' + id)?.checked ?? false,
          publishGenerateReleaseNotes: document.getElementById('pf-publish-releasenotes-' + id)?.checked ?? false,
          publishVerbose: document.getElementById('pf-publish-verbose-' + id)?.checked ?? false,
          publishRepositoryEnabled: document.getElementById('pf-publish-repo-enabled-' + id)?.checked ?? false,
          publishRepositoryName: document.getElementById('pf-publish-repo-name-' + id)?.value ?? '',
          publishRepositoryUri: document.getElementById('pf-publish-repo-uri-' + id)?.value ?? '',
          publishRepositorySourceUri: document.getElementById('pf-publish-repo-source-' + id)?.value ?? '',
          publishRepositoryPublishUri: document.getElementById('pf-publish-repo-publish-' + id)?.value ?? '',
          publishRepositoryTrusted: document.getElementById('pf-publish-repo-trusted-' + id)?.checked ?? false,
          publishRepositoryEnsureRegistered: document.getElementById('pf-publish-repo-ensure-' + id)?.checked ?? false,
          publishRepositoryUnregisterAfterUse: document.getElementById('pf-publish-repo-unregister-' + id)?.checked ?? false,
          publishRepositoryPriority: document.getElementById('pf-publish-repo-priority-' + id)?.value ?? '',
          publishRepositoryApiVersion: document.getElementById('pf-publish-repo-apiversion-' + id)?.value ?? '',
          documentationSegmentEnabled: document.getElementById('pf-docs-segment-' + id)?.checked ?? false,
          documentationPath: document.getElementById('pf-docs-path-' + id)?.value ?? '',
          documentationReadmePath: document.getElementById('pf-docs-readme-' + id)?.value ?? '',
          buildDocsSegmentEnabled: document.getElementById('pf-build-docs-segment-' + id)?.checked ?? false,
          buildDocsEnable: document.getElementById('pf-build-docs-enable-' + id)?.checked ?? false,
          buildDocsTool: document.getElementById('pf-build-docs-tool-' + id)?.value ?? '',
          buildDocsStartClean: document.getElementById('pf-build-docs-startclean-' + id)?.checked ?? false,
          buildDocsUpdateWhenNew: document.getElementById('pf-build-docs-update-' + id)?.checked ?? false,
          buildDocsSyncExternalHelp: document.getElementById('pf-build-docs-sync-' + id)?.checked ?? false,
          buildDocsGenerateExternalHelp: document.getElementById('pf-build-docs-generate-' + id)?.checked ?? false,
          buildDocsExternalHelpCulture: document.getElementById('pf-build-docs-culture-' + id)?.value ?? '',
          validationSegmentEnabled: document.getElementById('pf-validation-segment-' + id)?.checked ?? false,
          validationEnable: document.getElementById('pf-validation-enable-' + id)?.checked ?? false,
          validationScriptAnalyzer: document.getElementById('pf-validation-analyzer-' + id)?.checked ?? false,
          validationCheckTrailingWhitespace: document.getElementById('pf-validation-trailing-' + id)?.checked ?? false,
          validationCheckSyntax: document.getElementById('pf-validation-syntax-' + id)?.checked ?? false,
          validationStructureSeverity: document.getElementById('pf-validation-structure-severity-' + id)?.value ?? '',
          validationStructurePublicPaths: document.getElementById('pf-validation-structure-public-' + id)?.value ?? '',
          validationStructureInternalPaths: document.getElementById('pf-validation-structure-internal-' + id)?.value ?? '',
          validationStructureValidateManifest: document.getElementById('pf-validation-structure-manifest-' + id)?.checked ?? false,
          validationStructureValidateExports: document.getElementById('pf-validation-structure-exports-' + id)?.checked ?? false,
          validationStructureValidateInternalNotExported: document.getElementById('pf-validation-structure-internalexport-' + id)?.checked ?? false,
          validationStructureAllowWildcardExports: document.getElementById('pf-validation-structure-wildcard-' + id)?.checked ?? false,
          validationDocsSeverity: document.getElementById('pf-validation-docs-severity-' + id)?.value ?? '',
          validationDocsMinSynopsis: document.getElementById('pf-validation-docs-synopsis-' + id)?.value ?? '',
          validationDocsMinDescription: document.getElementById('pf-validation-docs-description-' + id)?.value ?? '',
          validationDocsMinExamples: document.getElementById('pf-validation-docs-examples-' + id)?.value ?? '',
          validationDocsExcludeCommands: document.getElementById('pf-validation-docs-exclude-' + id)?.value ?? '',
          validationDocsTimeout: document.getElementById('pf-validation-docs-timeout-' + id)?.value ?? '',
          validationTestsSeverity: document.getElementById('pf-validation-tests-severity-' + id)?.value ?? '',
          validationTestsEnable: document.getElementById('pf-validation-tests-enable-' + id)?.checked ?? false,
          validationTestsPath: document.getElementById('pf-validation-tests-path-' + id)?.value ?? '',
          validationTestsAdditional: document.getElementById('pf-validation-tests-additional-' + id)?.value ?? '',
          validationTestsSkip: document.getElementById('pf-validation-tests-skip-' + id)?.value ?? '',
          validationTestsSkipDependencies: document.getElementById('pf-validation-tests-skipdeps-' + id)?.checked ?? false,
          validationTestsSkipImport: document.getElementById('pf-validation-tests-skipimport-' + id)?.checked ?? false,
          validationTestsForce: document.getElementById('pf-validation-tests-force-' + id)?.checked ?? false,
          validationTestsTimeout: document.getElementById('pf-validation-tests-timeout-' + id)?.value ?? '',
          validationBinarySeverity: document.getElementById('pf-validation-binary-severity-' + id)?.value ?? '',
          validationBinaryValidateAssemblies: document.getElementById('pf-validation-binary-assemblies-' + id)?.checked ?? false,
          validationBinaryValidateManifestExports: document.getElementById('pf-validation-binary-exports-' + id)?.checked ?? false,
          validationBinaryAllowWildcardExports: document.getElementById('pf-validation-binary-wildcard-' + id)?.checked ?? false,
          validationCsprojSeverity: document.getElementById('pf-validation-csproj-severity-' + id)?.value ?? '',
          validationCsprojRequireTargetFramework: document.getElementById('pf-validation-csproj-framework-' + id)?.checked ?? false,
          validationCsprojRequireLibraryOutput: document.getElementById('pf-validation-csproj-output-' + id)?.checked ?? false,
          fileConsistencySegmentEnabled: document.getElementById('pf-consistency-segment-' + id)?.checked ?? false,
          fileConsistencyEnable: document.getElementById('pf-consistency-enable-' + id)?.checked ?? false,
          fileConsistencyRequiredEncoding: document.getElementById('pf-consistency-encoding-' + id)?.value ?? '',
          fileConsistencyRequiredLineEnding: document.getElementById('pf-consistency-lineending-' + id)?.value ?? '',
          fileConsistencyScope: document.getElementById('pf-consistency-scope-' + id)?.value ?? '',
          fileConsistencyExcludeDirectories: document.getElementById('pf-consistency-exclude-' + id)?.value ?? '',
          fileConsistencyExportReport: document.getElementById('pf-consistency-export-' + id)?.checked ?? false,
          fileConsistencyCheckMixed: document.getElementById('pf-consistency-mixed-' + id)?.checked ?? false,
          fileConsistencyCheckMissingFinalNewline: document.getElementById('pf-consistency-newline-' + id)?.checked ?? false,
          compatibilitySegmentEnabled: document.getElementById('pf-compat-segment-' + id)?.checked ?? false,
          compatibilityEnable: document.getElementById('pf-compat-enable-' + id)?.checked ?? false,
          compatibilityRequireCross: document.getElementById('pf-compat-cross-' + id)?.checked ?? false,
          compatibilityMinimum: document.getElementById('pf-compat-min-' + id)?.value ?? '',
          compatibilityExportReport: document.getElementById('pf-compat-export-' + id)?.checked ?? false,
          packedSegmentEnabled: document.getElementById('pf-packed-segment-' + id)?.checked ?? false,
          packedEnabled: document.getElementById('pf-packed-enabled-' + id)?.checked ?? false,
          packedPath: document.getElementById('pf-packed-path-' + id)?.value ?? '',
          packedIncludeTagName: document.getElementById('pf-packed-tag-' + id)?.checked ?? false,
          unpackedSegmentEnabled: document.getElementById('pf-unpacked-segment-' + id)?.checked ?? false,
          unpackedEnabled: document.getElementById('pf-unpacked-enabled-' + id)?.checked ?? false,
          unpackedPath: document.getElementById('pf-unpacked-path-' + id)?.value ?? '',
          unpackedIncludeTagName: document.getElementById('pf-unpacked-tag-' + id)?.checked ?? false,
          optionsSegmentEnabled: document.getElementById('pf-options-segment-' + id)?.checked ?? false,
          optionsSigningThumbprint: document.getElementById('pf-options-sign-thumb-' + id)?.value ?? '',
          optionsSigningPfxPath: document.getElementById('pf-options-sign-pfx-' + id)?.value ?? '',
          optionsSigningPfxPassword: document.getElementById('pf-options-sign-pass-' + id)?.value ?? '',
          optionsSigningIncludeInternals: document.getElementById('pf-options-sign-internals-' + id)?.checked ?? false,
          optionsSigningIncludeBinaries: document.getElementById('pf-options-sign-binaries-' + id)?.checked ?? false,
          optionsDeliveryEnable: document.getElementById('pf-options-delivery-enable-' + id)?.checked ?? false,
          optionsDeliveryIncludeRootReadme: document.getElementById('pf-options-delivery-readme-' + id)?.checked ?? false,
          optionsDeliveryIncludeRootChangelog: document.getElementById('pf-options-delivery-changelog-' + id)?.checked ?? false,
          optionsDeliveryIncludeRootLicense: document.getElementById('pf-options-delivery-license-' + id)?.checked ?? false,
          optionsDeliverySchema: document.getElementById('pf-options-delivery-schema-' + id)?.value ?? '',
          formattingSegmentEnabled: document.getElementById('pf-formatting-segment-' + id)?.checked ?? false,
          formattingUpdateProjectRoot: document.getElementById('pf-formatting-update-' + id)?.checked ?? false,
          formattingPS1Enabled: document.getElementById('pf-formatting-ps1-enabled-' + id)?.checked ?? false,
          formattingPS1RemoveComments: document.getElementById('pf-formatting-ps1-comments-' + id)?.checked ?? false,
          formattingPSM1Enabled: document.getElementById('pf-formatting-psm1-enabled-' + id)?.checked ?? false,
          formattingPSD1Enabled: document.getElementById('pf-formatting-psd1-enabled-' + id)?.checked ?? false,
          buildLibrariesSegmentEnabled: document.getElementById('pf-buildlibs-segment-' + id)?.checked ?? false,
          buildLibrariesEnable: document.getElementById('pf-buildlibs-enable-' + id)?.checked ?? false,
          buildLibrariesConfiguration: document.getElementById('pf-buildlibs-config-' + id)?.value ?? '',
          buildLibrariesFrameworks: document.getElementById('pf-buildlibs-frameworks-' + id)?.value ?? '',
          buildLibrariesProjectName: document.getElementById('pf-buildlibs-project-' + id)?.value ?? '',
          buildLibrariesExcludeMainLibrary: document.getElementById('pf-buildlibs-exclude-main-' + id)?.checked ?? false,
          buildLibrariesNetProjectPath: document.getElementById('pf-buildlibs-netpath-' + id)?.value ?? '',
          buildLibrariesBinaryModuleCmdletScanDisabled: document.getElementById('pf-buildlibs-cmdletscan-' + id)?.checked ?? false,
          importModulesSegmentEnabled: document.getElementById('pf-import-segment-' + id)?.checked ?? false,
          importModulesSelf: document.getElementById('pf-import-self-' + id)?.checked ?? false,
          importModulesRequiredModules: document.getElementById('pf-import-required-' + id)?.checked ?? false,
          importModulesVerbose: document.getElementById('pf-import-verbose-' + id)?.checked ?? false,
          moduleDependenciesSegmentEnabled: document.getElementById('pf-deps-segment-' + id)?.checked ?? false,
          moduleDependencies: dependencies,
          placeHolderOptionSegmentEnabled: document.getElementById('pf-placeholder-option-segment-' + id)?.checked ?? false,
          placeHolderOptionSkipBuiltin: document.getElementById('pf-placeholder-option-skip-' + id)?.checked ?? false,
          placeHolderSegmentEnabled: document.getElementById('pf-placeholder-segment-' + id)?.checked ?? false,
          placeHolders: placeholders,
          deliveryImportantLinks: importantLinks,
          testsAfterMergeSegmentEnabled: document.getElementById('pf-tests-merge-segment-' + id)?.checked ?? false,
          testsAfterMergeWhen: document.getElementById('pf-tests-merge-when-' + id)?.value ?? '',
          testsAfterMergePath: document.getElementById('pf-tests-merge-path-' + id)?.value ?? '',
          testsAfterMergeForce: document.getElementById('pf-tests-merge-force-' + id)?.checked ?? false,
          formattingSort: document.getElementById('pf-formatting-sort-' + id)?.value ?? '',
          formattingIncludeRules: document.getElementById('pf-formatting-includerules-' + id)?.value ?? '',
          formattingRemoveEmptyLines: document.getElementById('pf-formatting-remove-empty-' + id)?.checked ?? false,
          formattingRemoveAllEmptyLines: document.getElementById('pf-formatting-remove-all-' + id)?.checked ?? false,
          formattingRemoveCommentsInParamBlock: document.getElementById('pf-formatting-remove-param-' + id)?.checked ?? false,
          formattingRemoveCommentsBeforeParamBlock: document.getElementById('pf-formatting-remove-before-' + id)?.checked ?? false,
          formattingRuleOpenBrace: document.getElementById('pf-formatting-rule-open-' + id)?.checked ?? false,
          formattingRuleCloseBrace: document.getElementById('pf-formatting-rule-close-' + id)?.checked ?? false,
          formattingRuleIndentation: document.getElementById('pf-formatting-rule-indent-' + id)?.checked ?? false,
          formattingRuleWhitespace: document.getElementById('pf-formatting-rule-whitespace-' + id)?.checked ?? false,
          formattingRuleAlignAssignment: document.getElementById('pf-formatting-rule-align-' + id)?.checked ?? false,
          formattingRuleCorrectCasing: document.getElementById('pf-formatting-rule-casing-' + id)?.checked ?? false,
          optionsSigningInclude: document.getElementById('pf-options-sign-include-' + id)?.value ?? '',
          optionsSigningExcludePaths: document.getElementById('pf-options-sign-exclude-' + id)?.value ?? '',
          optionsDeliveryReadmeDestination: document.getElementById('pf-options-delivery-readmedest-' + id)?.value ?? '',
          optionsDeliveryChangelogDestination: document.getElementById('pf-options-delivery-changelogdest-' + id)?.value ?? '',
          optionsDeliveryLicenseDestination: document.getElementById('pf-options-delivery-licensedest-' + id)?.value ?? '',
          optionsDeliveryRepositoryPaths: document.getElementById('pf-options-delivery-repopaths-' + id)?.value ?? '',
          optionsDeliveryRepositoryBranch: document.getElementById('pf-options-delivery-repobranch-' + id)?.value ?? '',
          optionsDeliveryDocumentationOrder: document.getElementById('pf-options-delivery-docorder-' + id)?.value ?? '',
          optionsDeliveryIntroText: document.getElementById('pf-options-delivery-intro-' + id)?.value ?? '',
          optionsDeliveryUpgradeText: document.getElementById('pf-options-delivery-upgrade-' + id)?.value ?? '',
          optionsDeliveryGenerateInstallCommand: document.getElementById('pf-options-delivery-geninstall-' + id)?.checked ?? false,
          optionsDeliveryGenerateUpdateCommand: document.getElementById('pf-options-delivery-genupdate-' + id)?.checked ?? false,
          optionsDeliveryInstallCommandName: document.getElementById('pf-options-delivery-installname-' + id)?.value ?? '',
          optionsDeliveryUpdateCommandName: document.getElementById('pf-options-delivery-updatename-' + id)?.value ?? ''
        };
        post('savePipeline', { path: configPath, data });
        return;
      }
      if (action === 'saveDotnetPublish' && configPath) {
        const id = card.dataset.configId;
        const data = {
          dotnetProjectRoot: document.getElementById('pf-dotnet-root-' + id)?.value ?? '',
          dotnetSolutionPath: document.getElementById('pf-dotnet-sln-' + id)?.value ?? '',
          dotnetConfiguration: document.getElementById('pf-dotnet-config-' + id)?.value ?? '',
          dotnetRuntimes: document.getElementById('pf-dotnet-runtimes-' + id)?.value ?? ''
        };
        post('saveDotnetPublish', { path: configPath, data });
        return;
      }
    });

    document.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-template-path]');
      if (!button) return;
      const targetPath = button.dataset.templatePath;
      if (targetPath) {
        post('createPipelineTemplate', { path: targetPath });
      }
    });

    document.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'addDependency') {
        const card = button.closest('[data-config-path]');
        const list = card?.querySelector('.pf-deps-list');
        const template = document.getElementById('pf-dep-template');
        if (list && template?.content) {
          list.appendChild(template.content.cloneNode(true));
        }
        return;
      }
      if (action === 'removeDependency') {
        const row = button.closest('.pf-dep-row');
        if (row) {
          row.remove();
        }
      }
      if (action === 'addPlaceholder') {
        const card = button.closest('[data-config-path]');
        const list = card?.querySelector('.pf-placeholder-list');
        const template = document.getElementById('pf-placeholder-template');
        if (list && template?.content) {
          list.appendChild(template.content.cloneNode(true));
        }
        return;
      }
      if (action === 'removePlaceholder') {
        const row = button.closest('.pf-placeholder-row');
        if (row) {
          row.remove();
        }
      }
      if (action === 'addLink') {
        const card = button.closest('[data-config-path]');
        const list = card?.querySelector('.pf-link-list');
        const template = document.getElementById('pf-link-template');
        if (list && template?.content) {
          list.appendChild(template.content.cloneNode(true));
        }
        return;
      }
      if (action === 'removeLink') {
        const row = button.closest('.pf-link-row');
        if (row) {
          row.remove();
        }
      }
    });
  `;
}
