export type PowerForgeConfigKind = 'pipeline' | 'dotnetpublish';
export type PowerForgeScope = 'workspace' | 'projects';

export interface PowerForgeConfigSummary {
  kind: PowerForgeConfigKind;
  path: string;
  projectRoot?: string;
  title: string;
  build?: {
    name?: string;
    sourcePath?: string;
    csprojPath?: string;
    version?: string;
    configuration?: string;
    frameworks?: string[];
  };
  install?: {
    enabled?: boolean;
    strategy?: string;
    keepVersions?: number;
  };
  manifest?: {
    segmentEnabled: boolean;
    moduleVersion?: string;
    compatiblePSEditions?: string[];
    guid?: string;
    author?: string;
    companyName?: string | null;
    copyright?: string | null;
    description?: string | null;
    powerShellVersion?: string;
    tags?: string[] | null;
    iconUri?: string | null;
    projectUri?: string | null;
    licenseUri?: string | null;
    requireLicenseAcceptance?: boolean;
    prerelease?: string | null;
  };
  publish?: {
    segmentEnabled: boolean;
    enabled?: boolean;
    destination?: string;
    tool?: string;
    apiKey?: string;
    id?: string | null;
    userName?: string | null;
    repositoryName?: string | null;
    force?: boolean;
    overwriteTagName?: string | null;
    doNotMarkAsPreRelease?: boolean;
    generateReleaseNotes?: boolean;
    verbose?: boolean;
    repositoryEnabled?: boolean;
    repository?: {
      name?: string | null;
      uri?: string | null;
      sourceUri?: string | null;
      publishUri?: string | null;
      trusted?: boolean;
      priority?: number | null;
      apiVersion?: string;
      ensureRegistered?: boolean;
      unregisterAfterUse?: boolean;
    };
  };
  documentation?: {
    segmentEnabled: boolean;
    path?: string;
    readmePath?: string;
  };
  buildDocumentation?: {
    segmentEnabled: boolean;
    enable?: boolean;
    tool?: string;
    startClean?: boolean;
    updateWhenNew?: boolean;
    syncExternalHelpToProjectRoot?: boolean;
    generateExternalHelp?: boolean;
    externalHelpCulture?: string;
  };
  validation?: {
    segmentEnabled: boolean;
    enable?: boolean;
    scriptAnalyzerEnable?: boolean;
    checkTrailingWhitespace?: boolean;
    checkSyntax?: boolean;
    structure?: {
      severity?: string;
      publicPaths?: string[];
      internalPaths?: string[];
      validateManifestFiles?: boolean;
      validateExports?: boolean;
      validateInternalNotExported?: boolean;
      allowWildcardExports?: boolean;
    };
    documentation?: {
      severity?: string;
      minSynopsisPercent?: number;
      minDescriptionPercent?: number;
      minExampleCountPerCommand?: number;
      excludeCommands?: string[];
      timeoutSeconds?: number;
    };
    tests?: {
      severity?: string;
      enable?: boolean;
      testPath?: string | null;
      additionalModules?: string[];
      skipModules?: string[];
      skipDependencies?: boolean;
      skipImport?: boolean;
      force?: boolean;
      timeoutSeconds?: number;
    };
    binary?: {
      severity?: string;
      validateAssembliesExist?: boolean;
      validateManifestExports?: boolean;
      allowWildcardExports?: boolean;
    };
    csproj?: {
      severity?: string;
      requireTargetFramework?: boolean;
      requireLibraryOutput?: boolean;
    };
  };
  fileConsistency?: {
    segmentEnabled: boolean;
    enable?: boolean;
    requiredEncoding?: string;
    requiredLineEnding?: string;
    scope?: string;
    excludeDirectories?: string[];
    exportReport?: boolean;
    checkMixedLineEndings?: boolean;
    checkMissingFinalNewline?: boolean;
  };
  compatibility?: {
    segmentEnabled: boolean;
    enable?: boolean;
    requireCrossCompatibility?: boolean;
    minimumCompatibilityPercentage?: number;
    exportReport?: boolean;
  };
  artefacts?: {
    packed?: {
      segmentEnabled: boolean;
      enabled?: boolean;
      path?: string | null;
      includeTagName?: boolean | null;
    };
    unpacked?: {
      segmentEnabled: boolean;
      enabled?: boolean;
      path?: string | null;
      includeTagName?: boolean | null;
    };
  };
  options?: {
    segmentEnabled: boolean;
    signingIncludeInternals?: boolean | null;
    signingIncludeBinaries?: boolean | null;
    signingThumbprint?: string | null;
    signingPfxPath?: string | null;
    signingPfxPassword?: string | null;
    signingInclude?: string[];
    signingExcludePaths?: string[];
    deliveryEnable?: boolean | null;
    deliveryIncludeRootReadme?: boolean | null;
    deliveryIncludeRootChangelog?: boolean | null;
    deliveryIncludeRootLicense?: boolean | null;
    deliverySchema?: string | null;
    deliveryReadmeDestination?: string | null;
    deliveryChangelogDestination?: string | null;
    deliveryLicenseDestination?: string | null;
    deliveryRepositoryPaths?: string[];
    deliveryRepositoryBranch?: string | null;
    deliveryDocumentationOrder?: string[];
    deliveryIntroText?: string[];
    deliveryUpgradeText?: string[];
    deliveryGenerateInstallCommand?: boolean | null;
    deliveryGenerateUpdateCommand?: boolean | null;
    deliveryInstallCommandName?: string | null;
    deliveryUpdateCommandName?: string | null;
    deliveryImportantLinks?: Array<{ title: string; url: string }>;
  };
  formatting?: {
    segmentEnabled: boolean;
    updateProjectRoot?: boolean;
    ps1Enabled?: boolean;
    ps1RemoveComments?: boolean;
    ps1RemoveEmptyLines?: boolean;
    ps1RemoveAllEmptyLines?: boolean;
    ps1RemoveCommentsInParamBlock?: boolean;
    ps1RemoveCommentsBeforeParamBlock?: boolean;
    sort?: string | null;
    includeRules?: string[];
    rulePlaceOpenBrace?: boolean;
    rulePlaceCloseBrace?: boolean;
    ruleConsistentIndentation?: boolean;
    ruleConsistentWhitespace?: boolean;
    ruleAlignAssignment?: boolean;
    ruleCorrectCasing?: boolean;
    psm1Enabled?: boolean;
    psd1Enabled?: boolean;
  };
  buildLibraries?: {
    segmentEnabled: boolean;
    enable?: boolean | null;
    configuration?: string | null;
    frameworks?: string[];
    projectName?: string | null;
    excludeMainLibrary?: boolean | null;
    netProjectPath?: string | null;
    binaryModuleCmdletScanDisabled?: boolean | null;
  };
  importModules?: {
    segmentEnabled: boolean;
    self?: boolean | null;
    requiredModules?: boolean | null;
    verbose?: boolean | null;
  };
  moduleDependencies?: Array<{
    kind: string;
    moduleName: string;
    moduleVersion?: string | null;
    minimumVersion?: string | null;
    requiredVersion?: string | null;
    guid?: string | null;
  }>;
  placeHolderOption?: {
    segmentEnabled: boolean;
    skipBuiltinReplacements?: boolean;
  };
  placeHolders?: Array<{
    find: string;
    replace: string;
  }>;
  testsAfterMerge?: {
    segmentEnabled: boolean;
    when?: string;
    testsPath?: string;
    force?: boolean;
  };
  dotnet?: {
    projectRoot?: string;
    solutionPath?: string;
    configuration?: string;
    runtimes?: string[];
  };
}

export interface PowerForgeViewState {
  configs: PowerForgeConfigSummary[];
  legacyBuildScripts: string[];
  scope: PowerForgeScope;
  workspaceRoots: string[];
  workspaceLabel: string;
  projectCount: number;
}
