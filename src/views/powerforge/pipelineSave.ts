import * as vscode from 'vscode';
import { readFileText } from '../../util/fs';
import { applyStringField, parseCsv, parseInteger, parseLines, safeJsonParse, setRuleToggle } from './utils';
import { isModuleDependencySegment, updateArtefactSegment, updateSegment } from './segments';

export async function savePipelineConfig(filePath: string, data: Record<string, unknown>): Promise<void> {
  const text = await readFileText(filePath);
  const parsed = text ? safeJsonParse(text) : undefined;
  if (!parsed) {
    vscode.window.showWarningMessage('ForgeFlow: Failed to parse PowerForge pipeline JSON.');
    return;
  }
  const payload = data as Record<string, unknown>;
  parsed.Build = parsed.Build ?? {};
  parsed.Install = parsed.Install ?? {};
  const segments: any[] = Array.isArray(parsed.Segments) ? parsed.Segments : [];
  parsed.Segments = segments;
  parsed.Build.Name = String(payload['buildName'] ?? '').trim() || parsed.Build.Name;
  parsed.Build.SourcePath = String(payload['buildSourcePath'] ?? '').trim() || parsed.Build.SourcePath;
  parsed.Build.CsprojPath = String(payload['buildCsprojPath'] ?? '').trim() || parsed.Build.CsprojPath;
  parsed.Build.Version = String(payload['buildVersion'] ?? '').trim() || parsed.Build.Version;
  parsed.Build.Configuration = String(payload['buildConfiguration'] ?? '').trim() || parsed.Build.Configuration;
  const frameworks = String(payload['buildFrameworks'] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (frameworks.length > 0) {
    parsed.Build.Frameworks = frameworks;
  }
  if (typeof payload['installEnabled'] === 'boolean') {
    parsed.Install.Enabled = payload['installEnabled'];
  }
  const strategy = String(payload['installStrategy'] ?? '').trim();
  if (strategy) {
    parsed.Install.Strategy = strategy;
  }
  const keep = Number(String(payload['installKeepVersions'] ?? '').trim());
  if (!Number.isNaN(keep) && keep > 0) {
    parsed.Install.KeepVersions = keep;
  }
  const manifestEnabled = Boolean(payload['manifestSegmentEnabled']);
  updateSegment(segments, 'Manifest', manifestEnabled, (segment) => {
    segment.Configuration = segment.Configuration ?? {};
    const manifestConfig = segment.Configuration;
    applyStringField(manifestConfig, 'ModuleVersion', payload['manifestModuleVersion']);
    applyStringField(manifestConfig, 'Guid', payload['manifestGuid']);
    applyStringField(manifestConfig, 'Author', payload['manifestAuthor']);
    applyStringField(manifestConfig, 'CompanyName', payload['manifestCompanyName']);
    applyStringField(manifestConfig, 'Copyright', payload['manifestCopyright']);
    applyStringField(manifestConfig, 'Description', payload['manifestDescription']);
    applyStringField(manifestConfig, 'PowerShellVersion', payload['manifestPowerShellVersion']);
    applyStringField(manifestConfig, 'ProjectUri', payload['manifestProjectUri']);
    applyStringField(manifestConfig, 'LicenseUri', payload['manifestLicenseUri']);
    applyStringField(manifestConfig, 'IconUri', payload['manifestIconUri']);
    applyStringField(manifestConfig, 'Prerelease', payload['manifestPrerelease']);
    const editions = parseCsv(payload['manifestCompatiblePSEditions']);
    if (editions.length > 0) {
      manifestConfig.CompatiblePSEditions = editions;
    } else {
      delete manifestConfig.CompatiblePSEditions;
    }
    const tags = parseCsv(payload['manifestTags']);
    if (tags.length > 0) {
      manifestConfig.Tags = tags;
    } else {
      delete manifestConfig.Tags;
    }
    if (typeof payload['manifestRequireLicense'] === 'boolean') {
      manifestConfig.RequireLicenseAcceptance = payload['manifestRequireLicense'];
    }
  });

  const publishSegmentEnabled = Boolean(payload['publishSegmentEnabled']);
  updateSegment(segments, 'Publish', publishSegmentEnabled, (segment) => {
    segment.Configuration = segment.Configuration ?? {};
    const publishConfig = segment.Configuration;
    if (typeof payload['publishEnabled'] === 'boolean') {
      publishConfig.Enabled = payload['publishEnabled'];
    }
    applyStringField(publishConfig, 'Destination', payload['publishDestination']);
    applyStringField(publishConfig, 'Tool', payload['publishTool']);
    applyStringField(publishConfig, 'ApiKey', payload['publishApiKey']);
    applyStringField(publishConfig, 'ID', payload['publishId']);
    applyStringField(publishConfig, 'UserName', payload['publishUserName']);
    applyStringField(publishConfig, 'RepositoryName', payload['publishRepositoryName']);
    applyStringField(publishConfig, 'OverwriteTagName', payload['publishOverwriteTag']);
    if (typeof payload['publishForce'] === 'boolean') {
      publishConfig.Force = payload['publishForce'];
    }
    if (typeof payload['publishDoNotMarkPre'] === 'boolean') {
      publishConfig.DoNotMarkAsPreRelease = payload['publishDoNotMarkPre'];
    }
    if (typeof payload['publishGenerateReleaseNotes'] === 'boolean') {
      publishConfig.GenerateReleaseNotes = payload['publishGenerateReleaseNotes'];
    }
    if (typeof payload['publishVerbose'] === 'boolean') {
      publishConfig.Verbose = payload['publishVerbose'];
    }
    const repoEnabled = Boolean(payload['publishRepositoryEnabled']);
    if (repoEnabled) {
      publishConfig.Repository = publishConfig.Repository ?? {};
      const repoConfig = publishConfig.Repository;
      applyStringField(repoConfig, 'Name', payload['publishRepositoryName']);
      applyStringField(repoConfig, 'Uri', payload['publishRepositoryUri']);
      applyStringField(repoConfig, 'SourceUri', payload['publishRepositorySourceUri']);
      applyStringField(repoConfig, 'PublishUri', payload['publishRepositoryPublishUri']);
      applyStringField(repoConfig, 'ApiVersion', payload['publishRepositoryApiVersion']);
      const priority = parseInteger(payload['publishRepositoryPriority']);
      if (priority !== undefined) {
        repoConfig.Priority = priority;
      } else {
        delete repoConfig.Priority;
      }
      if (typeof payload['publishRepositoryTrusted'] === 'boolean') {
        repoConfig.Trusted = payload['publishRepositoryTrusted'];
      }
      if (typeof payload['publishRepositoryEnsureRegistered'] === 'boolean') {
        repoConfig.EnsureRegistered = payload['publishRepositoryEnsureRegistered'];
      }
      if (typeof payload['publishRepositoryUnregisterAfterUse'] === 'boolean') {
        repoConfig.UnregisterAfterUse = payload['publishRepositoryUnregisterAfterUse'];
      }
    } else {
      delete publishConfig.Repository;
    }
  });

  const documentationEnabled = Boolean(payload['documentationSegmentEnabled']);
  updateSegment(segments, 'Documentation', documentationEnabled, (segment) => {
    segment.Configuration = segment.Configuration ?? {};
    const config = segment.Configuration;
    applyStringField(config, 'Path', payload['documentationPath']);
    applyStringField(config, 'PathReadme', payload['documentationReadmePath']);
  });

  const buildDocsEnabled = Boolean(payload['buildDocsSegmentEnabled']);
  updateSegment(segments, 'BuildDocumentation', buildDocsEnabled, (segment) => {
    segment.Configuration = segment.Configuration ?? {};
    const config = segment.Configuration;
    if (typeof payload['buildDocsEnable'] === 'boolean') {
      config.Enable = payload['buildDocsEnable'];
    }
    applyStringField(config, 'Tool', payload['buildDocsTool']);
    applyStringField(config, 'ExternalHelpCulture', payload['buildDocsExternalHelpCulture']);
    if (typeof payload['buildDocsStartClean'] === 'boolean') {
      config.StartClean = payload['buildDocsStartClean'];
    }
    if (typeof payload['buildDocsUpdateWhenNew'] === 'boolean') {
      config.UpdateWhenNew = payload['buildDocsUpdateWhenNew'];
    }
    if (typeof payload['buildDocsSyncExternalHelp'] === 'boolean') {
      config.SyncExternalHelpToProjectRoot = payload['buildDocsSyncExternalHelp'];
    }
    if (typeof payload['buildDocsGenerateExternalHelp'] === 'boolean') {
      config.GenerateExternalHelp = payload['buildDocsGenerateExternalHelp'];
    }
  });

  const validationEnabled = Boolean(payload['validationSegmentEnabled']);
  updateSegment(segments, 'Validation', validationEnabled, (segment) => {
    segment.Settings = segment.Settings ?? {};
    const settings = segment.Settings;
    if (typeof payload['validationEnable'] === 'boolean') {
      settings.Enable = payload['validationEnable'];
    }
    settings.ScriptAnalyzer = settings.ScriptAnalyzer ?? {};
    if (typeof payload['validationScriptAnalyzer'] === 'boolean') {
      settings.ScriptAnalyzer.Enable = payload['validationScriptAnalyzer'];
    }
    settings.FileIntegrity = settings.FileIntegrity ?? {};
    if (typeof payload['validationCheckTrailingWhitespace'] === 'boolean') {
      settings.FileIntegrity.CheckTrailingWhitespace = payload['validationCheckTrailingWhitespace'];
    }
    if (typeof payload['validationCheckSyntax'] === 'boolean') {
      settings.FileIntegrity.CheckSyntax = payload['validationCheckSyntax'];
    }
    settings.Structure = settings.Structure ?? {};
    const structure = settings.Structure;
    applyStringField(structure, 'Severity', payload['validationStructureSeverity']);
    const publicPaths = parseCsv(payload['validationStructurePublicPaths']);
    if (publicPaths.length > 0) {
      structure.PublicFunctionPaths = publicPaths;
    } else {
      delete structure.PublicFunctionPaths;
    }
    const internalPaths = parseCsv(payload['validationStructureInternalPaths']);
    if (internalPaths.length > 0) {
      structure.InternalFunctionPaths = internalPaths;
    } else {
      delete structure.InternalFunctionPaths;
    }
    if (typeof payload['validationStructureValidateManifest'] === 'boolean') {
      structure.ValidateManifestFiles = payload['validationStructureValidateManifest'];
    }
    if (typeof payload['validationStructureValidateExports'] === 'boolean') {
      structure.ValidateExports = payload['validationStructureValidateExports'];
    }
    if (typeof payload['validationStructureValidateInternalNotExported'] === 'boolean') {
      structure.ValidateInternalNotExported = payload['validationStructureValidateInternalNotExported'];
    }
    if (typeof payload['validationStructureAllowWildcardExports'] === 'boolean') {
      structure.AllowWildcardExports = payload['validationStructureAllowWildcardExports'];
    }

    settings.Documentation = settings.Documentation ?? {};
    const docs = settings.Documentation;
    applyStringField(docs, 'Severity', payload['validationDocsSeverity']);
    const synopsis = parseInteger(payload['validationDocsMinSynopsis']);
    if (synopsis !== undefined) {
      docs.MinSynopsisPercent = synopsis;
    } else {
      delete docs.MinSynopsisPercent;
    }
    const description = parseInteger(payload['validationDocsMinDescription']);
    if (description !== undefined) {
      docs.MinDescriptionPercent = description;
    } else {
      delete docs.MinDescriptionPercent;
    }
    const minExamples = parseInteger(payload['validationDocsMinExamples']);
    if (minExamples !== undefined) {
      docs.MinExampleCountPerCommand = minExamples;
    } else {
      delete docs.MinExampleCountPerCommand;
    }
    const excludeCommands = parseCsv(payload['validationDocsExcludeCommands']);
    if (excludeCommands.length > 0) {
      docs.ExcludeCommands = excludeCommands;
    } else {
      delete docs.ExcludeCommands;
    }
    const docsTimeout = parseInteger(payload['validationDocsTimeout']);
    if (docsTimeout !== undefined) {
      docs.TimeoutSeconds = docsTimeout;
    } else {
      delete docs.TimeoutSeconds;
    }

    settings.Tests = settings.Tests ?? {};
    const tests = settings.Tests;
    applyStringField(tests, 'Severity', payload['validationTestsSeverity']);
    if (typeof payload['validationTestsEnable'] === 'boolean') {
      tests.Enable = payload['validationTestsEnable'];
    }
    applyStringField(tests, 'TestPath', payload['validationTestsPath']);
    const additionalModules = parseCsv(payload['validationTestsAdditional']);
    if (additionalModules.length > 0) {
      tests.AdditionalModules = additionalModules;
    } else {
      delete tests.AdditionalModules;
    }
    const skipModules = parseCsv(payload['validationTestsSkip']);
    if (skipModules.length > 0) {
      tests.SkipModules = skipModules;
    } else {
      delete tests.SkipModules;
    }
    if (typeof payload['validationTestsSkipDependencies'] === 'boolean') {
      tests.SkipDependencies = payload['validationTestsSkipDependencies'];
    }
    if (typeof payload['validationTestsSkipImport'] === 'boolean') {
      tests.SkipImport = payload['validationTestsSkipImport'];
    }
    if (typeof payload['validationTestsForce'] === 'boolean') {
      tests.Force = payload['validationTestsForce'];
    }
    const testsTimeout = parseInteger(payload['validationTestsTimeout']);
    if (testsTimeout !== undefined) {
      tests.TimeoutSeconds = testsTimeout;
    } else {
      delete tests.TimeoutSeconds;
    }

    settings.Binary = settings.Binary ?? {};
    const binary = settings.Binary;
    applyStringField(binary, 'Severity', payload['validationBinarySeverity']);
    if (typeof payload['validationBinaryValidateAssemblies'] === 'boolean') {
      binary.ValidateAssembliesExist = payload['validationBinaryValidateAssemblies'];
    }
    if (typeof payload['validationBinaryValidateManifestExports'] === 'boolean') {
      binary.ValidateManifestExports = payload['validationBinaryValidateManifestExports'];
    }
    if (typeof payload['validationBinaryAllowWildcardExports'] === 'boolean') {
      binary.AllowWildcardExports = payload['validationBinaryAllowWildcardExports'];
    }

    settings.Csproj = settings.Csproj ?? {};
    const csproj = settings.Csproj;
    applyStringField(csproj, 'Severity', payload['validationCsprojSeverity']);
    if (typeof payload['validationCsprojRequireTargetFramework'] === 'boolean') {
      csproj.RequireTargetFramework = payload['validationCsprojRequireTargetFramework'];
    }
    if (typeof payload['validationCsprojRequireLibraryOutput'] === 'boolean') {
      csproj.RequireLibraryOutput = payload['validationCsprojRequireLibraryOutput'];
    }
  });

  const fileConsistencyEnabled = Boolean(payload['fileConsistencySegmentEnabled']);
  updateSegment(segments, 'FileConsistency', fileConsistencyEnabled, (segment) => {
    segment.Settings = segment.Settings ?? {};
    const settings = segment.Settings;
    if (typeof payload['fileConsistencyEnable'] === 'boolean') {
      settings.Enable = payload['fileConsistencyEnable'];
    }
    applyStringField(settings, 'RequiredEncoding', payload['fileConsistencyRequiredEncoding']);
    applyStringField(settings, 'RequiredLineEnding', payload['fileConsistencyRequiredLineEnding']);
    applyStringField(settings, 'Scope', payload['fileConsistencyScope']);
    const excludes = parseCsv(payload['fileConsistencyExcludeDirectories']);
    if (excludes.length > 0) {
      settings.ExcludeDirectories = excludes;
    } else {
      delete settings.ExcludeDirectories;
    }
    if (typeof payload['fileConsistencyExportReport'] === 'boolean') {
      settings.ExportReport = payload['fileConsistencyExportReport'];
    }
    if (typeof payload['fileConsistencyCheckMixed'] === 'boolean') {
      settings.CheckMixedLineEndings = payload['fileConsistencyCheckMixed'];
    }
    if (typeof payload['fileConsistencyCheckMissingFinalNewline'] === 'boolean') {
      settings.CheckMissingFinalNewline = payload['fileConsistencyCheckMissingFinalNewline'];
    }
  });

  const compatibilityEnabled = Boolean(payload['compatibilitySegmentEnabled']);
  updateSegment(segments, 'Compatibility', compatibilityEnabled, (segment) => {
    segment.Settings = segment.Settings ?? {};
    const settings = segment.Settings;
    if (typeof payload['compatibilityEnable'] === 'boolean') {
      settings.Enable = payload['compatibilityEnable'];
    }
    if (typeof payload['compatibilityRequireCross'] === 'boolean') {
      settings.RequireCrossCompatibility = payload['compatibilityRequireCross'];
    }
    const min = parseInteger(payload['compatibilityMinimum']);
    if (min !== undefined) {
      settings.MinimumCompatibilityPercentage = min;
    } else {
      delete settings.MinimumCompatibilityPercentage;
    }
    if (typeof payload['compatibilityExportReport'] === 'boolean') {
      settings.ExportReport = payload['compatibilityExportReport'];
    }
  });

  const packedEnabled = Boolean(payload['packedSegmentEnabled']);
  updateArtefactSegment(segments, 'Packed', packedEnabled, (segment) => {
    segment.Configuration = segment.Configuration ?? {};
    const config = segment.Configuration;
    if (typeof payload['packedEnabled'] === 'boolean') {
      config.Enabled = payload['packedEnabled'];
    }
    applyStringField(config, 'Path', payload['packedPath']);
    if (typeof payload['packedIncludeTagName'] === 'boolean') {
      config.IncludeTagName = payload['packedIncludeTagName'];
    }
  });

  const unpackedEnabled = Boolean(payload['unpackedSegmentEnabled']);
  updateArtefactSegment(segments, 'Unpacked', unpackedEnabled, (segment) => {
    segment.Configuration = segment.Configuration ?? {};
    const config = segment.Configuration;
    if (typeof payload['unpackedEnabled'] === 'boolean') {
      config.Enabled = payload['unpackedEnabled'];
    }
    applyStringField(config, 'Path', payload['unpackedPath']);
    if (typeof payload['unpackedIncludeTagName'] === 'boolean') {
      config.IncludeTagName = payload['unpackedIncludeTagName'];
    }
  });

  const optionsEnabled = Boolean(payload['optionsSegmentEnabled']);
  updateSegment(segments, 'Options', optionsEnabled, (segment) => {
    segment.Options = segment.Options ?? {};
    const options = segment.Options;
    options.Signing = options.Signing ?? {};
    const signing = options.Signing;
    if (typeof payload['optionsSigningIncludeInternals'] === 'boolean') {
      signing.IncludeInternals = payload['optionsSigningIncludeInternals'];
    }
    if (typeof payload['optionsSigningIncludeBinaries'] === 'boolean') {
      signing.IncludeBinaries = payload['optionsSigningIncludeBinaries'];
    }
    applyStringField(signing, 'CertificateThumbprint', payload['optionsSigningThumbprint']);
    applyStringField(signing, 'CertificatePFXPath', payload['optionsSigningPfxPath']);
    applyStringField(signing, 'CertificatePFXPassword', payload['optionsSigningPfxPassword']);
    const includePaths = parseCsv(payload['optionsSigningInclude']);
    if (includePaths.length > 0) {
      signing.Include = includePaths;
    } else {
      delete signing.Include;
    }
    const excludePaths = parseCsv(payload['optionsSigningExcludePaths']);
    if (excludePaths.length > 0) {
      signing.ExcludePaths = excludePaths;
    } else {
      delete signing.ExcludePaths;
    }
    options.Delivery = options.Delivery ?? {};
    const delivery = options.Delivery;
    if (typeof payload['optionsDeliveryEnable'] === 'boolean') {
      delivery.Enable = payload['optionsDeliveryEnable'];
    }
    if (typeof payload['optionsDeliveryIncludeRootReadme'] === 'boolean') {
      delivery.IncludeRootReadme = payload['optionsDeliveryIncludeRootReadme'];
    }
    if (typeof payload['optionsDeliveryIncludeRootChangelog'] === 'boolean') {
      delivery.IncludeRootChangelog = payload['optionsDeliveryIncludeRootChangelog'];
    }
    if (typeof payload['optionsDeliveryIncludeRootLicense'] === 'boolean') {
      delivery.IncludeRootLicense = payload['optionsDeliveryIncludeRootLicense'];
    }
    applyStringField(delivery, 'Schema', payload['optionsDeliverySchema']);
    applyStringField(delivery, 'ReadmeDestination', payload['optionsDeliveryReadmeDestination']);
    applyStringField(delivery, 'ChangelogDestination', payload['optionsDeliveryChangelogDestination']);
    applyStringField(delivery, 'LicenseDestination', payload['optionsDeliveryLicenseDestination']);
    const repoPaths = parseCsv(payload['optionsDeliveryRepositoryPaths']);
    if (repoPaths.length > 0) {
      delivery.RepositoryPaths = repoPaths;
    } else {
      delete delivery.RepositoryPaths;
    }
    applyStringField(delivery, 'RepositoryBranch', payload['optionsDeliveryRepositoryBranch']);
    const docOrder = parseCsv(payload['optionsDeliveryDocumentationOrder']);
    if (docOrder.length > 0) {
      delivery.DocumentationOrder = docOrder;
    } else {
      delete delivery.DocumentationOrder;
    }
    const introText = parseLines(payload['optionsDeliveryIntroText']);
    if (introText.length > 0) {
      delivery.IntroText = introText;
    } else {
      delete delivery.IntroText;
    }
    const upgradeText = parseLines(payload['optionsDeliveryUpgradeText']);
    if (upgradeText.length > 0) {
      delivery.UpgradeText = upgradeText;
    } else {
      delete delivery.UpgradeText;
    }
    if (typeof payload['optionsDeliveryGenerateInstallCommand'] === 'boolean') {
      delivery.GenerateInstallCommand = payload['optionsDeliveryGenerateInstallCommand'];
    }
    if (typeof payload['optionsDeliveryGenerateUpdateCommand'] === 'boolean') {
      delivery.GenerateUpdateCommand = payload['optionsDeliveryGenerateUpdateCommand'];
    }
    applyStringField(delivery, 'InstallCommandName', payload['optionsDeliveryInstallCommandName']);
    applyStringField(delivery, 'UpdateCommandName', payload['optionsDeliveryUpdateCommandName']);
    const linksRaw = Array.isArray(payload['deliveryImportantLinks']) ? payload['deliveryImportantLinks'] : [];
    if (linksRaw.length > 0) {
      delivery.ImportantLinks = linksRaw
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => {
          const record = entry as Record<string, any>;
          return { Title: String(record['title'] ?? '').trim(), Url: String(record['url'] ?? '').trim() };
        })
        .filter((entry) => entry.Title && entry.Url);
      if (delivery.ImportantLinks.length === 0) {
        delete delivery.ImportantLinks;
      }
    } else {
      delete delivery.ImportantLinks;
    }
  });

  const formattingEnabled = Boolean(payload['formattingSegmentEnabled']);
  updateSegment(segments, 'Formatting', formattingEnabled, (segment) => {
    segment.Options = segment.Options ?? {};
    const options = segment.Options;
    if (typeof payload['formattingUpdateProjectRoot'] === 'boolean') {
      options.UpdateProjectRoot = payload['formattingUpdateProjectRoot'];
    }
    options.Standard = options.Standard ?? {};
    const standard = options.Standard;
    standard.FormatCodePS1 = standard.FormatCodePS1 ?? {};
    standard.FormatCodePSM1 = standard.FormatCodePSM1 ?? {};
    standard.FormatCodePSD1 = standard.FormatCodePSD1 ?? {};
    if (typeof payload['formattingPS1Enabled'] === 'boolean') {
      standard.FormatCodePS1.Enabled = payload['formattingPS1Enabled'];
    }
    if (typeof payload['formattingPS1RemoveComments'] === 'boolean') {
      standard.FormatCodePS1.RemoveComments = payload['formattingPS1RemoveComments'];
    }
    if (typeof payload['formattingRemoveEmptyLines'] === 'boolean') {
      standard.FormatCodePS1.RemoveEmptyLines = payload['formattingRemoveEmptyLines'];
    }
    if (typeof payload['formattingRemoveAllEmptyLines'] === 'boolean') {
      standard.FormatCodePS1.RemoveAllEmptyLines = payload['formattingRemoveAllEmptyLines'];
    }
    if (typeof payload['formattingRemoveCommentsInParamBlock'] === 'boolean') {
      standard.FormatCodePS1.RemoveCommentsInParamBlock = payload['formattingRemoveCommentsInParamBlock'];
    }
    if (typeof payload['formattingRemoveCommentsBeforeParamBlock'] === 'boolean') {
      standard.FormatCodePS1.RemoveCommentsBeforeParamBlock = payload['formattingRemoveCommentsBeforeParamBlock'];
    }
    applyStringField(standard.FormatCodePS1, 'Sort', payload['formattingSort']);
    const includeRules = parseCsv(payload['formattingIncludeRules']);
    standard.FormatCodePS1.FormatterSettings = standard.FormatCodePS1.FormatterSettings ?? {};
    if (includeRules.length > 0) {
      standard.FormatCodePS1.FormatterSettings.IncludeRules = includeRules;
    } else {
      delete standard.FormatCodePS1.FormatterSettings.IncludeRules;
    }
    standard.FormatCodePS1.FormatterSettings.Rules = standard.FormatCodePS1.FormatterSettings.Rules ?? {};
    const rules = standard.FormatCodePS1.FormatterSettings.Rules;
    setRuleToggle(rules, 'PSPlaceOpenBrace', payload['formattingRuleOpenBrace']);
    setRuleToggle(rules, 'PSPlaceCloseBrace', payload['formattingRuleCloseBrace']);
    setRuleToggle(rules, 'PSUseConsistentIndentation', payload['formattingRuleIndentation']);
    setRuleToggle(rules, 'PSUseConsistentWhitespace', payload['formattingRuleWhitespace']);
    setRuleToggle(rules, 'PSAlignAssignmentStatement', payload['formattingRuleAlignAssignment']);
    setRuleToggle(rules, 'PSUseCorrectCasing', payload['formattingRuleCorrectCasing']);
    if (typeof payload['formattingPSM1Enabled'] === 'boolean') {
      standard.FormatCodePSM1.Enabled = payload['formattingPSM1Enabled'];
    }
    if (typeof payload['formattingPSD1Enabled'] === 'boolean') {
      standard.FormatCodePSD1.Enabled = payload['formattingPSD1Enabled'];
    }
  });

  const buildLibrariesEnabled = Boolean(payload['buildLibrariesSegmentEnabled']);
  updateSegment(segments, 'BuildLibraries', buildLibrariesEnabled, (segment) => {
    segment.BuildLibraries = segment.BuildLibraries ?? {};
    const config = segment.BuildLibraries;
    if (typeof payload['buildLibrariesEnable'] === 'boolean') {
      config.Enable = payload['buildLibrariesEnable'];
    }
    applyStringField(config, 'Configuration', payload['buildLibrariesConfiguration']);
    applyStringField(config, 'ProjectName', payload['buildLibrariesProjectName']);
    applyStringField(config, 'NETProjectPath', payload['buildLibrariesNetProjectPath']);
    const librariesFrameworks = parseCsv(payload['buildLibrariesFrameworks']);
    if (librariesFrameworks.length > 0) {
      config.Framework = librariesFrameworks;
    } else {
      delete config.Framework;
    }
    if (typeof payload['buildLibrariesExcludeMainLibrary'] === 'boolean') {
      config.ExcludeMainLibrary = payload['buildLibrariesExcludeMainLibrary'];
    }
    if (typeof payload['buildLibrariesBinaryModuleCmdletScanDisabled'] === 'boolean') {
      config.BinaryModuleCmdletScanDisabled = payload['buildLibrariesBinaryModuleCmdletScanDisabled'];
    }
  });

  const importModulesEnabled = Boolean(payload['importModulesSegmentEnabled']);
  updateSegment(segments, 'ImportModules', importModulesEnabled, (segment) => {
    segment.ImportModules = segment.ImportModules ?? {};
    const config = segment.ImportModules;
    if (typeof payload['importModulesSelf'] === 'boolean') {
      config.Self = payload['importModulesSelf'];
    }
    if (typeof payload['importModulesRequiredModules'] === 'boolean') {
      config.RequiredModules = payload['importModulesRequiredModules'];
    }
    if (typeof payload['importModulesVerbose'] === 'boolean') {
      config.Verbose = payload['importModulesVerbose'];
    }
  });

  const depsEnabled = Boolean(payload['moduleDependenciesSegmentEnabled']);
  const dependencyKinds = new Set(['RequiredModule', 'ExternalModule', 'ApprovedModule']);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    if (isModuleDependencySegment(segments[i])) {
      segments.splice(i, 1);
    }
  }
  if (depsEnabled) {
    const depsRaw = Array.isArray(payload['moduleDependencies']) ? payload['moduleDependencies'] : [];
    for (const entry of depsRaw) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const record = entry as Record<string, any>;
      const moduleName = String(record['moduleName'] ?? '').trim();
      if (!moduleName) {
        continue;
      }
      const kind = dependencyKinds.has(String(record['kind'] ?? ''))
        ? String(record['kind'])
        : 'RequiredModule';
      const config: Record<string, any> = { ModuleName: moduleName };
      applyStringField(config, 'ModuleVersion', record['moduleVersion']);
      applyStringField(config, 'MinimumVersion', record['minimumVersion']);
      applyStringField(config, 'RequiredVersion', record['requiredVersion']);
      applyStringField(config, 'Guid', record['guid']);
      segments.push({ Type: kind, Configuration: config });
    }
  }

  const placeholderOptionEnabled = Boolean(payload['placeHolderOptionSegmentEnabled']);
  updateSegment(segments, 'PlaceHolderOption', placeholderOptionEnabled, (segment) => {
    segment.PlaceHolderOption = segment.PlaceHolderOption ?? {};
    if (typeof payload['placeHolderOptionSkipBuiltin'] === 'boolean') {
      segment.PlaceHolderOption.SkipBuiltinReplacements = payload['placeHolderOptionSkipBuiltin'];
    }
  });

  const placeholdersEnabled = Boolean(payload['placeHolderSegmentEnabled']);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    if (segments[i]?.Type === 'PlaceHolder') {
      segments.splice(i, 1);
    }
  }
  if (placeholdersEnabled) {
    const placeholdersRaw = Array.isArray(payload['placeHolders']) ? payload['placeHolders'] : [];
    for (const entry of placeholdersRaw) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const record = entry as Record<string, any>;
      const find = String(record['find'] ?? '').trim();
      if (!find) {
        continue;
      }
      const replace = String(record['replace'] ?? '').trim();
      segments.push({ Type: 'PlaceHolder', Configuration: { Find: find, Replace: replace } });
    }
  }

  const testsAfterMergeEnabled = Boolean(payload['testsAfterMergeSegmentEnabled']);
  updateSegment(segments, 'TestsAfterMerge', testsAfterMergeEnabled, (segment) => {
    segment.Configuration = segment.Configuration ?? {};
    const config = segment.Configuration;
    applyStringField(config, 'When', payload['testsAfterMergeWhen']);
    applyStringField(config, 'TestsPath', payload['testsAfterMergePath']);
    if (typeof payload['testsAfterMergeForce'] === 'boolean') {
      config.Force = payload['testsAfterMergeForce'];
    }
  });

  await writeJsonFile(filePath, parsed);
  vscode.window.setStatusBarMessage('ForgeFlow: PowerForge pipeline config saved.', 3000);
}

async function writeJsonFile(filePath: string, data: Record<string, any>): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(json, 'utf8'));
}
