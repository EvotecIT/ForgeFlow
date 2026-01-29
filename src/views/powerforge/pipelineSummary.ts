import * as path from 'path';
import * as vscode from 'vscode';
import { readFileText } from '../../util/fs';
import type { PowerForgeConfigSummary } from './types';
import {
  asBoolean,
  asNumber,
  asString,
  asStringOrNull,
  ensureRecord,
  safeJsonParse,
  toRecordArray,
  toStringArray
} from './utils';
import type { JsonRecord } from './utils';
import { findArtefactSegment, isModuleDependencySegment, type PowerForgeSegment } from './segments';

export async function readPipelineSummary(filePath: string): Promise<PowerForgeConfigSummary> {
  const text = await readFileText(filePath);
  const parsed = text ? safeJsonParse(text) : undefined;
  const build = ensureRecord(parsed?.Build);
  const install = ensureRecord(parsed?.Install);
  const segments = Array.isArray(parsed?.Segments) ? (parsed.Segments as PowerForgeSegment[]) : [];
  const manifestSegment = segments.find((segment) => segment?.Type === 'Manifest');
  const manifestConfig = ensureRecord(manifestSegment?.Configuration);
  const publishSegment = segments.find((segment) => segment?.Type === 'Publish');
  const publishConfig = ensureRecord(publishSegment?.Configuration);
  const publishRepository = ensureRecord(publishConfig.Repository);
  const documentationSegment = segments.find((segment) => segment?.Type === 'Documentation');
  const documentationConfig = ensureRecord(documentationSegment?.Configuration);
  const buildDocumentationSegment = segments.find((segment) => segment?.Type === 'BuildDocumentation');
  const buildDocumentationConfig = ensureRecord(buildDocumentationSegment?.Configuration);
  const validationSegment = segments.find((segment) => segment?.Type === 'Validation');
  const validationSettings = ensureRecord(validationSegment?.Settings);
  const validationScriptAnalyzer = ensureRecord(validationSettings.ScriptAnalyzer);
  const validationFileIntegrity = ensureRecord(validationSettings.FileIntegrity);
  const validationStructure = ensureRecord(validationSettings.Structure);
  const validationDocumentation = ensureRecord(validationSettings.Documentation);
  const validationTests = ensureRecord(validationSettings.Tests);
  const validationBinary = ensureRecord(validationSettings.Binary);
  const validationCsproj = ensureRecord(validationSettings.Csproj);
  const fileConsistencySegment = segments.find((segment) => segment?.Type === 'FileConsistency');
  const fileConsistencySettings = ensureRecord(fileConsistencySegment?.Settings);
  const compatibilitySegment = segments.find((segment) => segment?.Type === 'Compatibility');
  const compatibilitySettings = ensureRecord(compatibilitySegment?.Settings);
  const packedSegment = findArtefactSegment(segments, 'Packed');
  const packedConfig = ensureRecord(packedSegment?.Configuration);
  const unpackedSegment = findArtefactSegment(segments, 'Unpacked');
  const unpackedConfig = ensureRecord(unpackedSegment?.Configuration);
  const optionsSegment = segments.find((segment) => segment?.Type === 'Options');
  const optionsConfig = ensureRecord(optionsSegment?.Options);
  const signingOptions = ensureRecord(optionsConfig.Signing);
  const deliveryOptions = ensureRecord(optionsConfig.Delivery);
  const formattingSegment = segments.find((segment) => segment?.Type === 'Formatting');
  const formattingOptions = ensureRecord(formattingSegment?.Options);
  const formattingStandard = ensureRecord(formattingOptions.Standard);
  const formatPS1 = ensureRecord(formattingStandard.FormatCodePS1);
  const formatPSM1 = ensureRecord(formattingStandard.FormatCodePSM1);
  const formatPSD1 = ensureRecord(formattingStandard.FormatCodePSD1);
  const formatSettings = ensureRecord(formatPS1.FormatterSettings);
  const formatRules = ensureRecord(formatSettings.Rules);
  const placeHolderOptionSegment = segments.find((segment) => segment?.Type === 'PlaceHolderOption');
  const placeHolderOptionConfig = ensureRecord(placeHolderOptionSegment?.PlaceHolderOption);
  const placeHolderSegments = segments.filter((segment) => segment?.Type === 'PlaceHolder');
  const testsAfterMergeSegment = segments.find((segment) => segment?.Type === 'TestsAfterMerge');
  const testsAfterMergeConfig = ensureRecord(testsAfterMergeSegment?.Configuration);
  const buildLibrariesSegment = segments.find((segment) => segment?.Type === 'BuildLibraries');
  const buildLibrariesConfig = ensureRecord(buildLibrariesSegment?.BuildLibraries);
  const importModulesSegment = segments.find((segment) => segment?.Type === 'ImportModules');
  const importModulesConfig = ensureRecord(importModulesSegment?.ImportModules);
  const projectRoot = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))?.uri.fsPath;
  return {
    kind: 'pipeline',
    path: filePath,
    projectRoot,
    title: `Pipeline: ${path.basename(filePath)}`,
    build: {
      name: asString(build.Name),
      sourcePath: asString(build.SourcePath),
      csprojPath: asString(build.CsprojPath),
      version: asString(build.Version),
      configuration: asString(build.Configuration),
      frameworks: toStringArray(build.Frameworks)
    },
    install: {
      enabled: Boolean(install.Enabled),
      strategy: asString(install.Strategy),
      keepVersions: asNumber(install.KeepVersions)
    },
    manifest: {
      segmentEnabled: Boolean(manifestSegment),
      moduleVersion: asString(manifestConfig.ModuleVersion),
      compatiblePSEditions: toStringArray(manifestConfig.CompatiblePSEditions),
      guid: asString(manifestConfig.Guid),
      author: asString(manifestConfig.Author),
      companyName: asStringOrNull(manifestConfig.CompanyName),
      copyright: asStringOrNull(manifestConfig.Copyright),
      description: asStringOrNull(manifestConfig.Description),
      powerShellVersion: asString(manifestConfig.PowerShellVersion),
      tags: toStringArray(manifestConfig.Tags),
      iconUri: asStringOrNull(manifestConfig.IconUri),
      projectUri: asStringOrNull(manifestConfig.ProjectUri),
      licenseUri: asStringOrNull(manifestConfig.LicenseUri),
      requireLicenseAcceptance: asBoolean(manifestConfig.RequireLicenseAcceptance),
      prerelease: asStringOrNull(manifestConfig.Prerelease)
    },
    publish: {
      segmentEnabled: Boolean(publishSegment),
      enabled: asBoolean(publishConfig.Enabled),
      destination: asString(publishConfig.Destination),
      tool: asString(publishConfig.Tool),
      apiKey: asString(publishConfig.ApiKey),
      id: asStringOrNull(publishConfig.ID),
      userName: asStringOrNull(publishConfig.UserName),
      repositoryName: asStringOrNull(publishConfig.RepositoryName),
      force: asBoolean(publishConfig.Force),
      overwriteTagName: asStringOrNull(publishConfig.OverwriteTagName),
      doNotMarkAsPreRelease: asBoolean(publishConfig.DoNotMarkAsPreRelease),
      generateReleaseNotes: asBoolean(publishConfig.GenerateReleaseNotes),
      verbose: asBoolean(publishConfig.Verbose),
      repositoryEnabled: Boolean(publishConfig.Repository),
      repository: {
        name: asStringOrNull(publishRepository.Name),
        uri: asStringOrNull(publishRepository.Uri),
        sourceUri: asStringOrNull(publishRepository.SourceUri),
        publishUri: asStringOrNull(publishRepository.PublishUri),
        trusted: asBoolean(publishRepository.Trusted),
        priority: asNumber(publishRepository.Priority) ?? null,
        apiVersion: asString(publishRepository.ApiVersion),
        ensureRegistered: asBoolean(publishRepository.EnsureRegistered),
        unregisterAfterUse: asBoolean(publishRepository.UnregisterAfterUse)
      }
    },
    documentation: {
      segmentEnabled: Boolean(documentationSegment),
      path: asString(documentationConfig.Path),
      readmePath: asString(documentationConfig.PathReadme)
    },
    buildDocumentation: {
      segmentEnabled: Boolean(buildDocumentationSegment),
      enable: asBoolean(buildDocumentationConfig.Enable),
      tool: asString(buildDocumentationConfig.Tool),
      startClean: asBoolean(buildDocumentationConfig.StartClean),
      updateWhenNew: asBoolean(buildDocumentationConfig.UpdateWhenNew),
      syncExternalHelpToProjectRoot: asBoolean(buildDocumentationConfig.SyncExternalHelpToProjectRoot),
      generateExternalHelp: asBoolean(buildDocumentationConfig.GenerateExternalHelp),
      externalHelpCulture: asString(buildDocumentationConfig.ExternalHelpCulture)
    },
    validation: {
      segmentEnabled: Boolean(validationSegment),
      enable: asBoolean(validationSettings.Enable),
      scriptAnalyzerEnable: asBoolean(validationScriptAnalyzer.Enable),
      checkTrailingWhitespace: asBoolean(validationFileIntegrity.CheckTrailingWhitespace),
      checkSyntax: asBoolean(validationFileIntegrity.CheckSyntax),
      structure: {
        severity: asString(validationStructure.Severity),
        publicPaths: toStringArray(validationStructure.PublicFunctionPaths),
        internalPaths: toStringArray(validationStructure.InternalFunctionPaths),
        validateManifestFiles: asBoolean(validationStructure.ValidateManifestFiles),
        validateExports: asBoolean(validationStructure.ValidateExports),
        validateInternalNotExported: asBoolean(validationStructure.ValidateInternalNotExported),
        allowWildcardExports: asBoolean(validationStructure.AllowWildcardExports)
      },
      documentation: {
        severity: asString(validationDocumentation.Severity),
        minSynopsisPercent: asNumber(validationDocumentation.MinSynopsisPercent),
        minDescriptionPercent: asNumber(validationDocumentation.MinDescriptionPercent),
        minExampleCountPerCommand: asNumber(validationDocumentation.MinExampleCountPerCommand),
        excludeCommands: toStringArray(validationDocumentation.ExcludeCommands),
        timeoutSeconds: asNumber(validationDocumentation.TimeoutSeconds)
      },
      tests: {
        severity: asString(validationTests.Severity),
        enable: asBoolean(validationTests.Enable),
        testPath: asStringOrNull(validationTests.TestPath),
        additionalModules: toStringArray(validationTests.AdditionalModules),
        skipModules: toStringArray(validationTests.SkipModules),
        skipDependencies: asBoolean(validationTests.SkipDependencies),
        skipImport: asBoolean(validationTests.SkipImport),
        force: asBoolean(validationTests.Force),
        timeoutSeconds: asNumber(validationTests.TimeoutSeconds)
      },
      binary: {
        severity: asString(validationBinary.Severity),
        validateAssembliesExist: asBoolean(validationBinary.ValidateAssembliesExist),
        validateManifestExports: asBoolean(validationBinary.ValidateManifestExports),
        allowWildcardExports: asBoolean(validationBinary.AllowWildcardExports)
      },
      csproj: {
        severity: asString(validationCsproj.Severity),
        requireTargetFramework: asBoolean(validationCsproj.RequireTargetFramework),
        requireLibraryOutput: asBoolean(validationCsproj.RequireLibraryOutput)
      }
    },
    fileConsistency: {
      segmentEnabled: Boolean(fileConsistencySegment),
      enable: asBoolean(fileConsistencySettings.Enable),
      requiredEncoding: asString(fileConsistencySettings.RequiredEncoding),
      requiredLineEnding: asString(fileConsistencySettings.RequiredLineEnding),
      scope: asString(fileConsistencySettings.Scope),
      excludeDirectories: toStringArray(fileConsistencySettings.ExcludeDirectories),
      exportReport: asBoolean(fileConsistencySettings.ExportReport),
      checkMixedLineEndings: asBoolean(fileConsistencySettings.CheckMixedLineEndings),
      checkMissingFinalNewline: asBoolean(fileConsistencySettings.CheckMissingFinalNewline)
    },
    compatibility: {
      segmentEnabled: Boolean(compatibilitySegment),
      enable: asBoolean(compatibilitySettings.Enable),
      requireCrossCompatibility: asBoolean(compatibilitySettings.RequireCrossCompatibility),
      minimumCompatibilityPercentage: asNumber(compatibilitySettings.MinimumCompatibilityPercentage),
      exportReport: asBoolean(compatibilitySettings.ExportReport)
    },
    artefacts: {
      packed: {
        segmentEnabled: Boolean(packedSegment),
        enabled: asBoolean(packedConfig.Enabled),
        path: asStringOrNull(packedConfig.Path),
        includeTagName: asBoolean(packedConfig.IncludeTagName) ?? null
      },
      unpacked: {
        segmentEnabled: Boolean(unpackedSegment),
        enabled: asBoolean(unpackedConfig.Enabled),
        path: asStringOrNull(unpackedConfig.Path),
        includeTagName: asBoolean(unpackedConfig.IncludeTagName) ?? null
      }
    },
    options: {
      segmentEnabled: Boolean(optionsSegment),
      signingIncludeInternals: asBoolean(signingOptions.IncludeInternals) ?? null,
      signingIncludeBinaries: asBoolean(signingOptions.IncludeBinaries) ?? null,
      signingThumbprint: asStringOrNull(signingOptions.CertificateThumbprint),
      signingPfxPath: asStringOrNull(signingOptions.CertificatePFXPath),
      signingPfxPassword: asStringOrNull(signingOptions.CertificatePFXPassword),
      signingInclude: toStringArray(signingOptions.Include),
      signingExcludePaths: toStringArray(signingOptions.ExcludePaths),
      deliveryEnable: asBoolean(deliveryOptions.Enable) ?? null,
      deliveryIncludeRootReadme: asBoolean(deliveryOptions.IncludeRootReadme) ?? null,
      deliveryIncludeRootChangelog: asBoolean(deliveryOptions.IncludeRootChangelog) ?? null,
      deliveryIncludeRootLicense: asBoolean(deliveryOptions.IncludeRootLicense) ?? null,
      deliverySchema: asStringOrNull(deliveryOptions.Schema),
      deliveryReadmeDestination: asStringOrNull(deliveryOptions.ReadmeDestination),
      deliveryChangelogDestination: asStringOrNull(deliveryOptions.ChangelogDestination),
      deliveryLicenseDestination: asStringOrNull(deliveryOptions.LicenseDestination),
      deliveryRepositoryPaths: toStringArray(deliveryOptions.RepositoryPaths),
      deliveryRepositoryBranch: asStringOrNull(deliveryOptions.RepositoryBranch),
      deliveryDocumentationOrder: toStringArray(deliveryOptions.DocumentationOrder),
      deliveryIntroText: toStringArray(deliveryOptions.IntroText),
      deliveryUpgradeText: toStringArray(deliveryOptions.UpgradeText),
      deliveryGenerateInstallCommand: asBoolean(deliveryOptions.GenerateInstallCommand) ?? null,
      deliveryGenerateUpdateCommand: asBoolean(deliveryOptions.GenerateUpdateCommand) ?? null,
      deliveryInstallCommandName: asStringOrNull(deliveryOptions.InstallCommandName),
      deliveryUpdateCommandName: asStringOrNull(deliveryOptions.UpdateCommandName),
      deliveryImportantLinks: toRecordArray(deliveryOptions.ImportantLinks)
        .map((link: JsonRecord) => ({ title: asString(link.Title) ?? '', url: asString(link.Url) ?? '' }))
        .filter((entry) => entry.title && entry.url)
    },
    formatting: {
      segmentEnabled: Boolean(formattingSegment),
      updateProjectRoot: asBoolean(formattingOptions.UpdateProjectRoot),
      ps1Enabled: asBoolean(formatPS1.Enabled),
      ps1RemoveComments: asBoolean(formatPS1.RemoveComments),
      ps1RemoveEmptyLines: asBoolean(formatPS1.RemoveEmptyLines),
      ps1RemoveAllEmptyLines: asBoolean(formatPS1.RemoveAllEmptyLines),
      ps1RemoveCommentsInParamBlock: asBoolean(formatPS1.RemoveCommentsInParamBlock),
      ps1RemoveCommentsBeforeParamBlock: asBoolean(formatPS1.RemoveCommentsBeforeParamBlock),
      sort: asStringOrNull(formatPS1.Sort),
      includeRules: toStringArray(formatSettings.IncludeRules),
      rulePlaceOpenBrace: asBoolean(ensureRecord(formatRules.PSPlaceOpenBrace).Enable),
      rulePlaceCloseBrace: asBoolean(ensureRecord(formatRules.PSPlaceCloseBrace).Enable),
      ruleConsistentIndentation: asBoolean(ensureRecord(formatRules.PSUseConsistentIndentation).Enable),
      ruleConsistentWhitespace: asBoolean(ensureRecord(formatRules.PSUseConsistentWhitespace).Enable),
      ruleAlignAssignment: asBoolean(ensureRecord(formatRules.PSAlignAssignmentStatement).Enable),
      ruleCorrectCasing: asBoolean(ensureRecord(formatRules.PSUseCorrectCasing).Enable),
      psm1Enabled: asBoolean(formatPSM1.Enabled),
      psd1Enabled: asBoolean(formatPSD1.Enabled)
    },
    buildLibraries: {
      segmentEnabled: Boolean(buildLibrariesSegment),
      enable: asBoolean(buildLibrariesConfig.Enable) ?? null,
      configuration: asStringOrNull(buildLibrariesConfig.Configuration),
      frameworks: toStringArray(buildLibrariesConfig.Framework),
      projectName: asStringOrNull(buildLibrariesConfig.ProjectName),
      excludeMainLibrary: asBoolean(buildLibrariesConfig.ExcludeMainLibrary) ?? null,
      netProjectPath: asStringOrNull(buildLibrariesConfig.NETProjectPath),
      binaryModuleCmdletScanDisabled: asBoolean(buildLibrariesConfig.BinaryModuleCmdletScanDisabled) ?? null
    },
    importModules: {
      segmentEnabled: Boolean(importModulesSegment),
      self: asBoolean(importModulesConfig.Self) ?? null,
      requiredModules: asBoolean(importModulesConfig.RequiredModules) ?? null,
      verbose: asBoolean(importModulesConfig.Verbose) ?? null
    },
    moduleDependencies: segments
      .filter((segment) => isModuleDependencySegment(segment))
      .map((segment) => {
        const kind = String(segment?.Type ?? segment?.Kind ?? '');
        const config = ensureRecord(segment?.Configuration);
        return {
          kind,
          moduleName: asString(config.ModuleName) ?? '',
          moduleVersion: asStringOrNull(config.ModuleVersion),
          minimumVersion: asStringOrNull(config.MinimumVersion),
          requiredVersion: asStringOrNull(config.RequiredVersion),
          guid: asStringOrNull(config.Guid)
        };
      })
      .filter((entry) => entry.moduleName),
    placeHolderOption: {
      segmentEnabled: Boolean(placeHolderOptionSegment),
      skipBuiltinReplacements: asBoolean(placeHolderOptionConfig.SkipBuiltinReplacements)
    },
    placeHolders: placeHolderSegments.map((segment) => {
      const config = ensureRecord(segment?.Configuration);
      return {
        find: asString(config.Find) ?? '',
        replace: asString(config.Replace) ?? ''
      };
    }).filter((entry) => entry.find),
    testsAfterMerge: {
      segmentEnabled: Boolean(testsAfterMergeSegment),
      when: asString(testsAfterMergeConfig.When),
      testsPath: asString(testsAfterMergeConfig.TestsPath),
      force: asBoolean(testsAfterMergeConfig.Force)
    }
  };
}
