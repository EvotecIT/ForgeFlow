import * as path from 'path';
import * as vscode from 'vscode';
import { readFileText } from '../../util/fs';
import type { PowerForgeConfigSummary } from './types';
import { safeJsonParse } from './utils';
import { findArtefactSegment, isModuleDependencySegment } from './segments';

export async function readPipelineSummary(filePath: string): Promise<PowerForgeConfigSummary> {
  const text = await readFileText(filePath);
  const parsed = text ? safeJsonParse(text) : undefined;
  const build = parsed?.Build ?? {};
  const install = parsed?.Install ?? {};
  const segments = Array.isArray(parsed?.Segments) ? parsed.Segments : [];
  const manifestSegment = segments.find((segment: any) => segment?.Type === 'Manifest');
  const manifestConfig = manifestSegment?.Configuration ?? {};
  const publishSegment = segments.find((segment: any) => segment?.Type === 'Publish');
  const publishConfig = publishSegment?.Configuration ?? {};
  const publishRepository = publishConfig?.Repository ?? {};
  const documentationSegment = segments.find((segment: any) => segment?.Type === 'Documentation');
  const documentationConfig = documentationSegment?.Configuration ?? {};
  const buildDocumentationSegment = segments.find((segment: any) => segment?.Type === 'BuildDocumentation');
  const buildDocumentationConfig = buildDocumentationSegment?.Configuration ?? {};
  const validationSegment = segments.find((segment: any) => segment?.Type === 'Validation');
  const validationSettings = validationSegment?.Settings ?? {};
  const validationScriptAnalyzer = validationSettings?.ScriptAnalyzer ?? {};
  const validationFileIntegrity = validationSettings?.FileIntegrity ?? {};
  const validationStructure = validationSettings?.Structure ?? {};
  const validationDocumentation = validationSettings?.Documentation ?? {};
  const validationTests = validationSettings?.Tests ?? {};
  const validationBinary = validationSettings?.Binary ?? {};
  const validationCsproj = validationSettings?.Csproj ?? {};
  const fileConsistencySegment = segments.find((segment: any) => segment?.Type === 'FileConsistency');
  const fileConsistencySettings = fileConsistencySegment?.Settings ?? {};
  const compatibilitySegment = segments.find((segment: any) => segment?.Type === 'Compatibility');
  const compatibilitySettings = compatibilitySegment?.Settings ?? {};
  const packedSegment = findArtefactSegment(segments, 'Packed');
  const packedConfig = packedSegment?.Configuration ?? {};
  const unpackedSegment = findArtefactSegment(segments, 'Unpacked');
  const unpackedConfig = unpackedSegment?.Configuration ?? {};
  const optionsSegment = segments.find((segment: any) => segment?.Type === 'Options');
  const optionsConfig = optionsSegment?.Options ?? {};
  const signingOptions = optionsConfig?.Signing ?? {};
  const deliveryOptions = optionsConfig?.Delivery ?? {};
  const formattingSegment = segments.find((segment: any) => segment?.Type === 'Formatting');
  const formattingOptions = formattingSegment?.Options ?? {};
  const formattingStandard = formattingOptions?.Standard ?? {};
  const formatPS1 = formattingStandard?.FormatCodePS1 ?? {};
  const formatPSM1 = formattingStandard?.FormatCodePSM1 ?? {};
  const formatPSD1 = formattingStandard?.FormatCodePSD1 ?? {};
  const formatSettings = formatPS1?.FormatterSettings ?? {};
  const formatRules = formatSettings?.Rules ?? {};
  const placeHolderOptionSegment = segments.find((segment: any) => segment?.Type === 'PlaceHolderOption');
  const placeHolderOptionConfig = placeHolderOptionSegment?.PlaceHolderOption ?? {};
  const placeHolderSegments = segments.filter((segment: any) => segment?.Type === 'PlaceHolder');
  const testsAfterMergeSegment = segments.find((segment: any) => segment?.Type === 'TestsAfterMerge');
  const testsAfterMergeConfig = testsAfterMergeSegment?.Configuration ?? {};
  const buildLibrariesSegment = segments.find((segment: any) => segment?.Type === 'BuildLibraries');
  const buildLibrariesConfig = buildLibrariesSegment?.BuildLibraries ?? {};
  const importModulesSegment = segments.find((segment: any) => segment?.Type === 'ImportModules');
  const importModulesConfig = importModulesSegment?.ImportModules ?? {};
  const projectRoot = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))?.uri.fsPath;
  return {
    kind: 'pipeline',
    path: filePath,
    projectRoot,
    title: `Pipeline: ${path.basename(filePath)}`,
    build: {
      name: build.Name,
      sourcePath: build.SourcePath,
      csprojPath: build.CsprojPath,
      version: build.Version,
      configuration: build.Configuration,
      frameworks: Array.isArray(build.Frameworks) ? build.Frameworks : []
    },
    install: {
      enabled: Boolean(install.Enabled),
      strategy: install.Strategy,
      keepVersions: typeof install.KeepVersions === 'number' ? install.KeepVersions : undefined
    },
    manifest: {
      segmentEnabled: Boolean(manifestSegment),
      moduleVersion: manifestConfig.ModuleVersion,
      compatiblePSEditions: Array.isArray(manifestConfig.CompatiblePSEditions) ? manifestConfig.CompatiblePSEditions : [],
      guid: manifestConfig.Guid,
      author: manifestConfig.Author,
      companyName: manifestConfig.CompanyName ?? null,
      copyright: manifestConfig.Copyright ?? null,
      description: manifestConfig.Description ?? null,
      powerShellVersion: manifestConfig.PowerShellVersion,
      tags: Array.isArray(manifestConfig.Tags) ? manifestConfig.Tags : [],
      iconUri: manifestConfig.IconUri ?? null,
      projectUri: manifestConfig.ProjectUri ?? null,
      licenseUri: manifestConfig.LicenseUri ?? null,
      requireLicenseAcceptance: manifestConfig.RequireLicenseAcceptance,
      prerelease: manifestConfig.Prerelease ?? null
    },
    publish: {
      segmentEnabled: Boolean(publishSegment),
      enabled: publishConfig.Enabled,
      destination: publishConfig.Destination,
      tool: publishConfig.Tool,
      apiKey: publishConfig.ApiKey,
      id: publishConfig.ID ?? null,
      userName: publishConfig.UserName ?? null,
      repositoryName: publishConfig.RepositoryName ?? null,
      force: publishConfig.Force,
      overwriteTagName: publishConfig.OverwriteTagName ?? null,
      doNotMarkAsPreRelease: publishConfig.DoNotMarkAsPreRelease,
      generateReleaseNotes: publishConfig.GenerateReleaseNotes,
      verbose: publishConfig.Verbose,
      repositoryEnabled: Boolean(publishConfig.Repository),
      repository: {
        name: publishRepository?.Name ?? null,
        uri: publishRepository?.Uri ?? null,
        sourceUri: publishRepository?.SourceUri ?? null,
        publishUri: publishRepository?.PublishUri ?? null,
        trusted: publishRepository?.Trusted,
        priority: typeof publishRepository?.Priority === 'number' ? publishRepository.Priority : null,
        apiVersion: publishRepository?.ApiVersion,
        ensureRegistered: publishRepository?.EnsureRegistered,
        unregisterAfterUse: publishRepository?.UnregisterAfterUse
      }
    },
    documentation: {
      segmentEnabled: Boolean(documentationSegment),
      path: documentationConfig.Path,
      readmePath: documentationConfig.PathReadme
    },
    buildDocumentation: {
      segmentEnabled: Boolean(buildDocumentationSegment),
      enable: buildDocumentationConfig.Enable,
      tool: buildDocumentationConfig.Tool,
      startClean: buildDocumentationConfig.StartClean,
      updateWhenNew: buildDocumentationConfig.UpdateWhenNew,
      syncExternalHelpToProjectRoot: buildDocumentationConfig.SyncExternalHelpToProjectRoot,
      generateExternalHelp: buildDocumentationConfig.GenerateExternalHelp,
      externalHelpCulture: buildDocumentationConfig.ExternalHelpCulture
    },
    validation: {
      segmentEnabled: Boolean(validationSegment),
      enable: validationSettings.Enable,
      scriptAnalyzerEnable: validationScriptAnalyzer.Enable,
      checkTrailingWhitespace: validationFileIntegrity.CheckTrailingWhitespace,
      checkSyntax: validationFileIntegrity.CheckSyntax,
      structure: {
        severity: validationStructure.Severity,
        publicPaths: Array.isArray(validationStructure.PublicFunctionPaths) ? validationStructure.PublicFunctionPaths : [],
        internalPaths: Array.isArray(validationStructure.InternalFunctionPaths) ? validationStructure.InternalFunctionPaths : [],
        validateManifestFiles: validationStructure.ValidateManifestFiles,
        validateExports: validationStructure.ValidateExports,
        validateInternalNotExported: validationStructure.ValidateInternalNotExported,
        allowWildcardExports: validationStructure.AllowWildcardExports
      },
      documentation: {
        severity: validationDocumentation.Severity,
        minSynopsisPercent: validationDocumentation.MinSynopsisPercent,
        minDescriptionPercent: validationDocumentation.MinDescriptionPercent,
        minExampleCountPerCommand: validationDocumentation.MinExampleCountPerCommand,
        excludeCommands: Array.isArray(validationDocumentation.ExcludeCommands) ? validationDocumentation.ExcludeCommands : [],
        timeoutSeconds: validationDocumentation.TimeoutSeconds
      },
      tests: {
        severity: validationTests.Severity,
        enable: validationTests.Enable,
        testPath: validationTests.TestPath ?? null,
        additionalModules: Array.isArray(validationTests.AdditionalModules) ? validationTests.AdditionalModules : [],
        skipModules: Array.isArray(validationTests.SkipModules) ? validationTests.SkipModules : [],
        skipDependencies: validationTests.SkipDependencies,
        skipImport: validationTests.SkipImport,
        force: validationTests.Force,
        timeoutSeconds: validationTests.TimeoutSeconds
      },
      binary: {
        severity: validationBinary.Severity,
        validateAssembliesExist: validationBinary.ValidateAssembliesExist,
        validateManifestExports: validationBinary.ValidateManifestExports,
        allowWildcardExports: validationBinary.AllowWildcardExports
      },
      csproj: {
        severity: validationCsproj.Severity,
        requireTargetFramework: validationCsproj.RequireTargetFramework,
        requireLibraryOutput: validationCsproj.RequireLibraryOutput
      }
    },
    fileConsistency: {
      segmentEnabled: Boolean(fileConsistencySegment),
      enable: fileConsistencySettings.Enable,
      requiredEncoding: fileConsistencySettings.RequiredEncoding,
      requiredLineEnding: fileConsistencySettings.RequiredLineEnding,
      scope: fileConsistencySettings.Scope,
      excludeDirectories: Array.isArray(fileConsistencySettings.ExcludeDirectories) ? fileConsistencySettings.ExcludeDirectories : [],
      exportReport: fileConsistencySettings.ExportReport,
      checkMixedLineEndings: fileConsistencySettings.CheckMixedLineEndings,
      checkMissingFinalNewline: fileConsistencySettings.CheckMissingFinalNewline
    },
    compatibility: {
      segmentEnabled: Boolean(compatibilitySegment),
      enable: compatibilitySettings.Enable,
      requireCrossCompatibility: compatibilitySettings.RequireCrossCompatibility,
      minimumCompatibilityPercentage: compatibilitySettings.MinimumCompatibilityPercentage,
      exportReport: compatibilitySettings.ExportReport
    },
    artefacts: {
      packed: {
        segmentEnabled: Boolean(packedSegment),
        enabled: packedConfig.Enabled ?? undefined,
        path: packedConfig.Path ?? null,
        includeTagName: packedConfig.IncludeTagName ?? null
      },
      unpacked: {
        segmentEnabled: Boolean(unpackedSegment),
        enabled: unpackedConfig.Enabled ?? undefined,
        path: unpackedConfig.Path ?? null,
        includeTagName: unpackedConfig.IncludeTagName ?? null
      }
    },
    options: {
      segmentEnabled: Boolean(optionsSegment),
      signingIncludeInternals: signingOptions.IncludeInternals ?? null,
      signingIncludeBinaries: signingOptions.IncludeBinaries ?? null,
      signingThumbprint: signingOptions.CertificateThumbprint ?? null,
      signingPfxPath: signingOptions.CertificatePFXPath ?? null,
      signingPfxPassword: signingOptions.CertificatePFXPassword ?? null,
      signingInclude: Array.isArray(signingOptions.Include) ? signingOptions.Include : [],
      signingExcludePaths: Array.isArray(signingOptions.ExcludePaths) ? signingOptions.ExcludePaths : [],
      deliveryEnable: deliveryOptions.Enable ?? null,
      deliveryIncludeRootReadme: deliveryOptions.IncludeRootReadme ?? null,
      deliveryIncludeRootChangelog: deliveryOptions.IncludeRootChangelog ?? null,
      deliveryIncludeRootLicense: deliveryOptions.IncludeRootLicense ?? null,
      deliverySchema: deliveryOptions.Schema ?? null,
      deliveryReadmeDestination: deliveryOptions.ReadmeDestination ?? null,
      deliveryChangelogDestination: deliveryOptions.ChangelogDestination ?? null,
      deliveryLicenseDestination: deliveryOptions.LicenseDestination ?? null,
      deliveryRepositoryPaths: Array.isArray(deliveryOptions.RepositoryPaths) ? deliveryOptions.RepositoryPaths : [],
      deliveryRepositoryBranch: deliveryOptions.RepositoryBranch ?? null,
      deliveryDocumentationOrder: Array.isArray(deliveryOptions.DocumentationOrder) ? deliveryOptions.DocumentationOrder : [],
      deliveryIntroText: Array.isArray(deliveryOptions.IntroText) ? deliveryOptions.IntroText : [],
      deliveryUpgradeText: Array.isArray(deliveryOptions.UpgradeText) ? deliveryOptions.UpgradeText : [],
      deliveryGenerateInstallCommand: deliveryOptions.GenerateInstallCommand ?? null,
      deliveryGenerateUpdateCommand: deliveryOptions.GenerateUpdateCommand ?? null,
      deliveryInstallCommandName: deliveryOptions.InstallCommandName ?? null,
      deliveryUpdateCommandName: deliveryOptions.UpdateCommandName ?? null,
      deliveryImportantLinks: Array.isArray(deliveryOptions.ImportantLinks)
        ? deliveryOptions.ImportantLinks.map((link: any) => ({ title: link?.Title ?? '', url: link?.Url ?? '' }))
        : []
    },
    formatting: {
      segmentEnabled: Boolean(formattingSegment),
      updateProjectRoot: formattingOptions.UpdateProjectRoot,
      ps1Enabled: formatPS1.Enabled,
      ps1RemoveComments: formatPS1.RemoveComments,
      ps1RemoveEmptyLines: formatPS1.RemoveEmptyLines,
      ps1RemoveAllEmptyLines: formatPS1.RemoveAllEmptyLines,
      ps1RemoveCommentsInParamBlock: formatPS1.RemoveCommentsInParamBlock,
      ps1RemoveCommentsBeforeParamBlock: formatPS1.RemoveCommentsBeforeParamBlock,
      sort: formatPS1.Sort ?? null,
      includeRules: Array.isArray(formatSettings.IncludeRules) ? formatSettings.IncludeRules : [],
      rulePlaceOpenBrace: formatRules.PSPlaceOpenBrace?.Enable,
      rulePlaceCloseBrace: formatRules.PSPlaceCloseBrace?.Enable,
      ruleConsistentIndentation: formatRules.PSUseConsistentIndentation?.Enable,
      ruleConsistentWhitespace: formatRules.PSUseConsistentWhitespace?.Enable,
      ruleAlignAssignment: formatRules.PSAlignAssignmentStatement?.Enable,
      ruleCorrectCasing: formatRules.PSUseCorrectCasing?.Enable,
      psm1Enabled: formatPSM1.Enabled,
      psd1Enabled: formatPSD1.Enabled
    },
    buildLibraries: {
      segmentEnabled: Boolean(buildLibrariesSegment),
      enable: buildLibrariesConfig.Enable ?? null,
      configuration: buildLibrariesConfig.Configuration ?? null,
      frameworks: Array.isArray(buildLibrariesConfig.Framework) ? buildLibrariesConfig.Framework : [],
      projectName: buildLibrariesConfig.ProjectName ?? null,
      excludeMainLibrary: buildLibrariesConfig.ExcludeMainLibrary ?? null,
      netProjectPath: buildLibrariesConfig.NETProjectPath ?? null,
      binaryModuleCmdletScanDisabled: buildLibrariesConfig.BinaryModuleCmdletScanDisabled ?? null
    },
    importModules: {
      segmentEnabled: Boolean(importModulesSegment),
      self: importModulesConfig.Self ?? null,
      requiredModules: importModulesConfig.RequiredModules ?? null,
      verbose: importModulesConfig.Verbose ?? null
    },
    moduleDependencies: segments
      .filter((segment: any) => isModuleDependencySegment(segment))
      .map((segment: any) => {
        const kind = String(segment?.Type ?? segment?.Kind ?? '');
        const config = segment?.Configuration ?? {};
        return {
          kind,
          moduleName: config.ModuleName ?? '',
          moduleVersion: config.ModuleVersion ?? null,
          minimumVersion: config.MinimumVersion ?? null,
          requiredVersion: config.RequiredVersion ?? null,
          guid: config.Guid ?? null
        };
      })
      .filter((entry: any) => entry.moduleName),
    placeHolderOption: {
      segmentEnabled: Boolean(placeHolderOptionSegment),
      skipBuiltinReplacements: placeHolderOptionConfig.SkipBuiltinReplacements
    },
    placeHolders: placeHolderSegments.map((segment: any) => {
      const config = segment?.Configuration ?? {};
      return {
        find: config.Find ?? '',
        replace: config.Replace ?? ''
      };
    }).filter((entry: any) => entry.find),
    testsAfterMerge: {
      segmentEnabled: Boolean(testsAfterMergeSegment),
      when: testsAfterMergeConfig.When,
      testsPath: testsAfterMergeConfig.TestsPath,
      force: testsAfterMergeConfig.Force
    }
  };
}
