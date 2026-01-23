import * as vscode from 'vscode';
import type { Project, ProjectIdentity } from '../models/project';
import type { ProjectsStore } from '../store/projectsStore';
import type { TagsStore } from '../store/tagsStore';
import type { ForgeFlowLogger } from '../util/log';
import { getForgeFlowSettings } from '../util/config';
import { readDirectory, statPath } from '../util/fs';
import * as path from 'path';
import {
  fetchAzureOpenPrs,
  fetchAzureRepo,
  fetchAzureLatestCommit,
  fetchGitHubOpenPrs,
  fetchGitHubLatestRelease,
  fetchGitHubRepo,
  fetchGitLabOpenMrs,
  fetchGitLabProject,
  fetchNuGetPackage,
  fetchPowerShellGallery,
  getLocalGitInfo
} from './dataProviders';
import type { DashboardTokenStore } from './tokenStore';
import { detectProjectIdentity } from '../scan/identityDetector';

export type ProviderStatus = 'ok' | 'limited' | 'unauthorized' | 'error' | 'unknown';

export interface DashboardRow {
  repoUrl?: string;
  projectPath?: string;
  localPath?: string;
  provider: string;
  providerStatus: ProviderStatus;
  visibility: string;
  repo: string;
  activity: string;
  activityTimestamp: number;
  issues: string;
  prs: string;
  stars: string;
  version: string;
  released: string;
  highlight: boolean;
  archived: boolean;
  favorite: boolean;
  tags: string[];
  healthScore?: number;
  healthIssues?: string[];
  healthStatus?: 'ok' | 'warn' | 'bad' | 'unknown';
}

export type DashboardProgress = (current: number, total: number, label?: string) => void;

export class DashboardService {
  public constructor(
    private readonly projectsStore: ProjectsStore,
    private readonly logger: ForgeFlowLogger,
    private readonly tokenStore: DashboardTokenStore,
    private readonly tagsStore: TagsStore
  ) {}

  public async buildRows(signal?: AbortSignal, onProgress?: DashboardProgress): Promise<DashboardRow[]> {
    const projects = this.projectsStore.list();
    const favorites = new Set(this.projectsStore.getFavoriteIds());
    const settings = getForgeFlowSettings();
    const token = await this.getGitHubToken();
    const gitLabToken = await this.tokenStore.getGitLabToken();
    const azureToken = await this.tokenStore.getAzureDevOpsToken();
    if (signal?.aborted) {
      throw new Error('AbortError');
    }
    const rows: DashboardRow[] = [];
    const total = projects.length;
    let completed = 0;
    const concurrency = Math.max(1, Math.min(6, total || 1));
    const report = (label?: string): void => {
      if (onProgress) {
        onProgress(completed, total, label);
      }
    };
    report();

    await runWithConcurrency(projects, concurrency, async (project) => {
      let didComplete = false;
      report(`${project.name} • identity`);
      if (signal?.aborted) {
        throw new Error('AbortError');
      }
      try {
        const needsRepo = needsRepositoryIdentity(project.identity);
        const detectedInfo = needsRepo ? await detectProjectIdentity(project.path) : undefined;
        const identity = detectedInfo?.identity ? mergeIdentity(project.identity, detectedInfo.identity) : project.identity;
        if (detectedInfo?.identity && identity) {
          await this.projectsStore.updateIdentity(project.id, identity);
        }
        if (!identity || (!identity.githubRepo && !identity.repositoryPath && !identity.powershellModule && !identity.nugetPackage)) {
          return;
        }

        report(`${project.name} • remote`);

        const provider = resolveProvider(identity);
        const repoPath = identity.repositoryPath ?? identity.githubRepo;
        const githubRepo = identity.githubRepo ?? (provider === 'github' ? identity.repositoryPath : undefined);
        const gitLabPath = provider === 'gitlab' ? repoPath : undefined;
        const azurePath = provider === 'azure' ? repoPath : undefined;

        const [gitHub, gitHubPrs, gitHubRelease, gitLab, gitLabMrs, azureRepo, psGallery, nuget, localGit] = await Promise.all([
          githubRepo ? fetchGitHubRepo(githubRepo, token, signal) : Promise.resolve(undefined),
          githubRepo ? fetchGitHubOpenPrs(githubRepo, token, signal) : Promise.resolve(undefined),
          githubRepo ? fetchGitHubLatestRelease(githubRepo, token, signal) : Promise.resolve(undefined),
          gitLabPath ? fetchGitLabProject(gitLabPath, gitLabToken, signal) : Promise.resolve(undefined),
          gitLabPath ? fetchGitLabOpenMrs(gitLabPath, gitLabToken, signal) : Promise.resolve(undefined),
          azurePath ? fetchAzureRepo(azurePath, azureToken, signal) : Promise.resolve(undefined),
          identity.powershellModule ? fetchPowerShellGallery(identity.powershellModule) : Promise.resolve(undefined),
          identity.nugetPackage ? fetchNuGetPackage(identity.nugetPackage) : Promise.resolve(undefined),
          getLocalGitInfo(project.path)
        ]);

        const [azurePrs, azureCommit] = azureRepo && azurePath
          ? await Promise.all([
            fetchAzureOpenPrs(azurePath, azureRepo.repoId, azureToken, signal),
            fetchAzureLatestCommit(azurePath, azureRepo.repoId, azureToken, signal)
          ])
          : [undefined, undefined];

        const githubStatus = resolveProviderStatus([gitHub]);
        const gitlabStatus = resolveProviderStatus([gitLab]);
        const azureStatus = resolveProviderStatus([azureRepo]);
        const providerStatus = provider === 'github'
          ? githubStatus
          : (provider === 'gitlab' ? gitlabStatus : (provider === 'azure' ? azureStatus : 'unknown'));
        const remoteOk = providerStatus === 'ok';
        const githubRepoOk = isProviderOk(gitHub);
        const gitLabOk = isProviderOk(gitLab);
        const gitHubPrsOk = isProviderOk(gitHubPrs);
        const gitLabMrsOk = isProviderOk(gitLabMrs);
        const azurePrsOk = isProviderOk(azurePrs);
        const gitHubReleaseOk = isProviderOk(gitHubRelease);
        const activitySource = (provider === 'github' && githubStatus === 'ok' ? gitHub?.pushedAt : undefined)
          ?? (provider === 'gitlab' && gitlabStatus === 'ok' ? gitLab?.lastActivity : undefined)
          ?? (provider === 'azure' && azureStatus === 'ok' ? azureCommit?.lastCommit : undefined)
          ?? localGit?.lastCommit;
        const activityTimestamp = activitySource ? Date.parse(activitySource) : 0;
        const activity = activitySource ? formatRelative(activitySource) : 'n/a';
        const issues = remoteOk
          ? (githubRepoOk ? String(gitHub?.issues ?? 0) : (gitLabOk ? String(gitLab?.issues ?? 0) : 'n/a'))
          : 'n/a';
        const prCount = remoteOk
          ? (gitHubPrsOk
            ? String(gitHubPrs?.openPrs ?? 0)
            : (gitLabMrsOk
              ? String(gitLabMrs?.openMrs ?? 0)
              : (azurePrsOk ? String(azurePrs?.openPrs ?? 0) : 'n/a')))
          : 'n/a';
        const stars = remoteOk
          ? (githubRepoOk ? String(gitHub?.stars ?? 0) : (gitLabOk ? String(gitLab?.stars ?? 0) : 'n/a'))
          : 'n/a';
        const version = psGallery?.version
          ?? nuget?.version
          ?? identity.vscodeExtensionVersion
          ?? (gitHubReleaseOk ? gitHubRelease?.tag : undefined)
          ?? detectedInfo?.moduleVersion
          ?? 'n/a';
        const released = psGallery?.released
          ?? nuget?.released
          ?? (gitHubReleaseOk ? gitHubRelease?.publishedAt : undefined)
          ?? 'n/a';
        const archived = (githubStatus === 'ok' ? gitHub?.archived : undefined)
          ?? (gitlabStatus === 'ok' ? gitLab?.archived : undefined)
          ?? (azureStatus === 'ok' ? azureRepo?.isDisabled : undefined)
          ?? false;
        const repoUrl = resolveRepoUrl(identity);
        let visibility = remoteOk
          ? (gitHub
            ? (gitHub.private ? 'private' : 'public')
            : (gitLab?.visibility ?? azureRepo?.visibility ?? 'unknown'))
          : 'unknown';
        if (!remoteOk && provider === 'github' && githubRepo) {
          if (githubStatus === 'unauthorized' || githubStatus === 'error') {
            visibility = 'private';
          }
        }
        const repoLabel = githubRepo
          ? (archived ? `${githubRepo} (archived)` : githubRepo)
          : (identity.repositoryPath ?? project.name);
        const tags = this.tagsStore.getTags(project.id);

        if (archived && settings.dashboardHideArchived) {
          return;
        }

        const issueCount = toCount(issues);
        const prResolved = prCount;
        const prCountValue = toCount(prResolved);

        const localPath = resolveLocalPath(project.path, settings.projectScanRoots);
        const health = settings.dashboardHealthEnabled
          ? await computeHealth(project.path, settings.dashboardHealthDepStaleDays)
          : undefined;

        rows.push({
          repoUrl,
          projectPath: project.path,
          localPath,
          provider,
          providerStatus,
          visibility,
          repo: repoLabel,
          activity,
          activityTimestamp: Number.isNaN(activityTimestamp) ? 0 : activityTimestamp,
          issues,
          prs: prResolved,
          stars,
          version,
          released,
          archived,
          highlight: !archived && ((issueCount ?? 0) > 0 || (prCountValue ?? 0) > 0),
          favorite: favorites.has(project.id),
          tags,
          healthScore: health?.score,
          healthIssues: health?.issues,
          healthStatus: health?.status ?? 'unknown'
        });
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Dashboard data failed for ${project.name}: ${message}`);
      } finally {
        if (!didComplete) {
          completed += 1;
          report(`${project.name} • done`);
          didComplete = true;
        }
      }
    });

    rows.sort((a, b) => {
      if (a.archived !== b.archived) {
        return a.archived ? 1 : -1;
      }
      return b.activityTimestamp - a.activityTimestamp;
    });
    return rows;
  }

  public getTrackedProjects(): Project[] {
    return this.projectsStore.list().filter((project) => project.identity);
  }

  private async getGitHubToken(): Promise<string | undefined> {
    try {
      const session = await vscode.authentication.getSession('github', ['repo', 'read:user'], {
        createIfNone: false
      });
      if (session?.accessToken) {
        return session.accessToken;
      }
    } catch {
      this.logger.warn('GitHub auth unavailable. Continuing without auth.');
    }
    return await this.tokenStore.getGitHubToken();
  }
}

function formatRelative(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return 'n/a';
  }
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) {
    return 'today';
  }
  if (diffDays === 1) {
    return '1 day ago';
  }
  if (diffDays < 30) {
    return `${diffDays} days ago`;
  }
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) {
    return '1 month ago';
  }
  if (diffMonths < 12) {
    return `${diffMonths} months ago`;
  }
  const diffYears = Math.floor(diffMonths / 12);
  return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`;
}

interface HealthResult {
  score: number;
  issues: string[];
  status: 'ok' | 'warn' | 'bad';
}

const README_NAMES = ['readme.md', 'readme.txt', 'readme'];
const LICENSE_NAMES = ['license', 'license.md', 'license.txt', 'copying'];
const TEST_DIRS = ['test', 'tests', '__tests__'];
const CI_FILES = ['azure-pipelines.yml', 'azure-pipelines.yaml', '.gitlab-ci.yml'];
const DEP_FILES = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'packages.lock.json',
  'packages.config',
  'directory.packages.props',
  'paket.lock',
  'requirements.txt',
  'poetry.lock',
  'cargo.lock'
];

async function computeHealth(projectPath: string, depStaleDays: number): Promise<HealthResult> {
  const entries = await readDirectory(projectPath);
  const names = new Map(entries.map(([name, type]) => [name.toLowerCase(), type]));
  const issues: string[] = [];
  let score = 0;

  const hasReadme = README_NAMES.some((name) => names.has(name));
  if (hasReadme) {
    score += 20;
  } else {
    issues.push('readme');
  }

  const hasLicense = LICENSE_NAMES.some((name) => names.has(name));
  if (hasLicense) {
    score += 20;
  } else {
    issues.push('license');
  }

  const hasTests = TEST_DIRS.some((name) => names.get(name) === vscode.FileType.Directory);
  if (hasTests) {
    score += 20;
  } else {
    issues.push('tests');
  }

  const hasCi = await detectCi(projectPath, names);
  if (hasCi) {
    score += 20;
  } else {
    issues.push('ci');
  }

  const depsStatus = await detectDependencyFreshness(projectPath, names, depStaleDays);
  if (depsStatus.ok) {
    score += 20;
  } else {
    issues.push(depsStatus.issue);
  }

  const status = score >= 80 ? 'ok' : (score >= 50 ? 'warn' : 'bad');
  return { score, issues, status };
}

async function detectCi(projectPath: string, names: Map<string, vscode.FileType>): Promise<boolean> {
  if (CI_FILES.some((name) => names.has(name))) {
    return true;
  }
  if (names.get('.github') === vscode.FileType.Directory) {
    const workflowsPath = path.join(projectPath, '.github', 'workflows');
    const workflows = await readDirectory(workflowsPath);
    return workflows.some(([name, type]) => type === vscode.FileType.File && /\.(ya?ml)$/i.test(name));
  }
  return false;
}

async function detectDependencyFreshness(
  projectPath: string,
  names: Map<string, vscode.FileType>,
  depStaleDays: number
): Promise<{ ok: boolean; issue: string }> {
  const candidates = DEP_FILES.filter((name) => names.has(name));
  if (candidates.length === 0) {
    return { ok: false, issue: 'deps' };
  }
  let newest: number | undefined;
  for (const candidate of candidates) {
    const stat = await statPath(path.join(projectPath, candidate));
    if (!stat) {
      continue;
    }
    const mtime = stat.mtime ?? 0;
    if (!newest || mtime > newest) {
      newest = mtime;
    }
  }
  if (!newest) {
    return { ok: false, issue: 'deps' };
  }
  if (depStaleDays > 0) {
    const ageDays = Math.floor((Date.now() - newest) / (1000 * 60 * 60 * 24));
    if (ageDays > depStaleDays) {
      return { ok: false, issue: 'deps stale' };
    }
  }
  return { ok: true, issue: '' };
}

function toCount(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveProvider(identity: { repositoryProvider?: string; githubRepo?: string; repositoryUrl?: string }): string {
  if (identity.repositoryProvider) {
    return identity.repositoryProvider;
  }
  if (identity.githubRepo) {
    return 'github';
  }
  if (identity.repositoryUrl) {
    if (identity.repositoryUrl.includes('gitlab')) {
      return 'gitlab';
    }
    if (identity.repositoryUrl.includes('dev.azure.com') || identity.repositoryUrl.includes('visualstudio.com')) {
      return 'azure';
    }
  }
  return 'unknown';
}

function resolveProviderStatus(sources: Array<{ rateLimited?: boolean; unauthorized?: boolean; requestFailed?: boolean } | undefined>): ProviderStatus {
  const available = sources.filter((value): value is { rateLimited?: boolean; unauthorized?: boolean; requestFailed?: boolean } => value !== undefined);
  if (available.length === 0) {
    return 'unknown';
  }
  if (available.some((value) => value.rateLimited)) {
    return 'limited';
  }
  if (available.some((value) => value.unauthorized)) {
    return 'unauthorized';
  }
  if (available.some((value) => value.requestFailed)) {
    return 'error';
  }
  return 'ok';
}

function isProviderOk(source: { rateLimited?: boolean; unauthorized?: boolean; requestFailed?: boolean } | undefined): boolean {
  if (!source) {
    return false;
  }
  return !source.rateLimited && !source.unauthorized && !source.requestFailed;
}

function resolveRepoUrl(identity: { repositoryUrl?: string; repositoryProvider?: string; repositoryPath?: string; githubRepo?: string }): string | undefined {
  if (identity.repositoryUrl) {
    return identity.repositoryUrl;
  }
  if (identity.githubRepo) {
    return `https://github.com/${identity.githubRepo}`;
  }
  if (identity.repositoryPath && identity.repositoryProvider) {
    if (identity.repositoryProvider === 'gitlab') {
      return `https://gitlab.com/${identity.repositoryPath}`;
    }
    if (identity.repositoryProvider === 'azure') {
      const parts = identity.repositoryPath.split('/');
      if (parts.length >= 3) {
        const [org, project, repo] = parts;
        if (org && project && repo) {
          return `https://dev.azure.com/${org}/${project}/_git/${repo}`;
        }
      }
    }
  }
  return undefined;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  handler: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) {
        return;
      }
      await handler(items[current] as T);
    }
  });
  await Promise.all(workers);
}

function resolveLocalPath(projectPath: string, scanRoots: string[]): string {
  const normalized = projectPath.replace(/\\/g, '/');
  const roots = (scanRoots.length > 0 ? scanRoots : (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath))
    .map((root) => root.replace(/\\/g, '/'));
  const match = roots.find((root) => normalized.startsWith(root.endsWith('/') ? root : `${root}/`));
  if (!match) {
    return normalized;
  }
  const base = match.endsWith('/') ? match : `${match}/`;
  const relative = normalized.slice(base.length);
  return relative || normalized;
}

function needsRepositoryIdentity(identity: ProjectIdentity | undefined): boolean {
  if (!identity) {
    return true;
  }
  return !identity.repositoryUrl && !identity.repositoryProvider && !identity.repositoryPath && !identity.githubRepo;
}

function mergeIdentity(existing: ProjectIdentity | undefined, detected: ProjectIdentity): ProjectIdentity {
  if (!existing) {
    return detected;
  }
  return {
    repositoryUrl: existing.repositoryUrl ?? detected.repositoryUrl,
    repositoryProvider: existing.repositoryProvider ?? detected.repositoryProvider,
    repositoryPath: existing.repositoryPath ?? detected.repositoryPath,
    githubRepo: existing.githubRepo ?? detected.githubRepo,
    powershellModule: existing.powershellModule ?? detected.powershellModule,
    nugetPackage: existing.nugetPackage ?? detected.nugetPackage,
    vscodeExtensionId: existing.vscodeExtensionId ?? detected.vscodeExtensionId,
    vscodeExtensionVersion: existing.vscodeExtensionVersion ?? detected.vscodeExtensionVersion
  };
}
