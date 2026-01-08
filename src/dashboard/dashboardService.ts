import * as vscode from 'vscode';
import type { Project } from '../models/project';
import type { ProjectsStore } from '../store/projectsStore';
import { ForgeFlowLogger } from '../util/log';
import { getForgeFlowSettings } from '../util/config';
import {
  fetchAzureOpenPrs,
  fetchAzureRepo,
  fetchAzureLatestCommit,
  fetchGitHubOpenPrs,
  fetchGitHubRepo,
  fetchGitLabOpenMrs,
  fetchGitLabProject,
  fetchNuGetPackage,
  fetchPowerShellGallery,
  getLocalGitInfo
} from './dataProviders';
import type { DashboardTokenStore } from './tokenStore';
import { detectProjectIdentity } from '../scan/identityDetector';

export interface DashboardRow {
  repoUrl?: string;
  projectPath?: string;
  provider: string;
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
}

export class DashboardService {
  public constructor(
    private readonly projectsStore: ProjectsStore,
    private readonly logger: ForgeFlowLogger,
    private readonly tokenStore: DashboardTokenStore
  ) {}

  public async buildRows(): Promise<DashboardRow[]> {
    const projects = this.projectsStore.list();
    const settings = getForgeFlowSettings();
    const token = await this.getGitHubToken();
    const gitLabToken = await this.tokenStore.getGitLabToken();
    const azureToken = await this.tokenStore.getAzureDevOpsToken();
    const rows: DashboardRow[] = [];

    for (const project of projects) {
      const needsRepo = needsRepositoryIdentity(project.identity);
      const detectedInfo = needsRepo ? await detectProjectIdentity(project.path) : undefined;
      const identity = detectedInfo?.identity ? mergeIdentity(project.identity, detectedInfo.identity) : project.identity;
      if (!identity || (!identity.githubRepo && !identity.repositoryPath && !identity.powershellModule && !identity.nugetPackage)) {
        continue;
      }

      const provider = resolveProvider(identity);
      const repoPath = identity.repositoryPath ?? identity.githubRepo;
      const githubRepo = identity.githubRepo ?? (provider === 'github' ? identity.repositoryPath : undefined);
      const gitLabPath = provider === 'gitlab' ? repoPath : undefined;
      const azurePath = provider === 'azure' ? repoPath : undefined;

      const [gitHub, gitHubPrs, gitLab, gitLabMrs, azureRepo, psGallery, nuget, localGit] = await Promise.all([
        githubRepo ? fetchGitHubRepo(githubRepo, token) : Promise.resolve(undefined),
        githubRepo ? fetchGitHubOpenPrs(githubRepo, token) : Promise.resolve(undefined),
        gitLabPath ? fetchGitLabProject(gitLabPath, gitLabToken) : Promise.resolve(undefined),
        gitLabPath ? fetchGitLabOpenMrs(gitLabPath, gitLabToken) : Promise.resolve(undefined),
        azurePath ? fetchAzureRepo(azurePath, azureToken) : Promise.resolve(undefined),
        identity.powershellModule ? fetchPowerShellGallery(identity.powershellModule) : Promise.resolve(undefined),
        identity.nugetPackage ? fetchNuGetPackage(identity.nugetPackage) : Promise.resolve(undefined),
        getLocalGitInfo(project.path)
      ]);

      const [azurePrs, azureCommit] = azureRepo && azurePath
        ? await Promise.all([
          fetchAzureOpenPrs(azurePath, azureRepo.repoId, azureToken),
          fetchAzureLatestCommit(azurePath, azureRepo.repoId, azureToken)
        ])
        : [undefined, undefined];

      const activitySource = gitHub?.pushedAt ?? gitLab?.lastActivity ?? azureCommit?.lastCommit ?? localGit?.lastCommit;
      const activityTimestamp = activitySource ? Date.parse(activitySource) : 0;
      const activity = activitySource ? formatRelative(activitySource) : 'n/a';
      const issues = gitHub ? String(gitHub.issues) : (gitLab ? String(gitLab.issues) : 'n/a');
      const prCount = gitHubPrs
        ? String(gitHubPrs.openPrs)
        : (gitLabMrs ? String(gitLabMrs.openMrs) : (azurePrs ? String(azurePrs.openPrs) : 'n/a'));
      const stars = gitHub ? String(gitHub.stars) : (gitLab ? String(gitLab.stars) : 'n/a');
      const version = psGallery?.version ?? nuget?.version ?? detectedInfo?.moduleVersion ?? 'n/a';
      const released = psGallery?.released ?? nuget?.released ?? 'n/a';
      const archived = gitHub?.archived ?? gitLab?.archived ?? azureRepo?.isDisabled ?? false;
      const repoUrl = resolveRepoUrl(identity);
      const visibility = gitHub
        ? (gitHub.private ? 'private' : 'public')
        : (gitLab?.visibility ?? azureRepo?.visibility ?? 'unknown');
      const repoLabel = githubRepo
        ? (archived ? `${githubRepo} (archived)` : githubRepo)
        : (identity.repositoryPath ?? project.name);

      if (archived && settings.dashboardHideArchived) {
        continue;
      }

      const issueCount = toCount(issues);
      const prResolved = prCount;
      const prCountValue = toCount(prResolved);

      rows.push({
        repoUrl,
        projectPath: project.path,
        provider,
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
        highlight: !archived && ((issueCount ?? 0) > 0 || (prCountValue ?? 0) > 0)
      });
    }

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

function needsRepositoryIdentity(identity: { repositoryUrl?: string; repositoryProvider?: string; repositoryPath?: string; githubRepo?: string } | undefined): boolean {
  if (!identity) {
    return true;
  }
  return !identity.repositoryUrl && !identity.repositoryProvider && !identity.repositoryPath && !identity.githubRepo;
}

function mergeIdentity(existing: {
  repositoryUrl?: string;
  repositoryProvider?: string;
  repositoryPath?: string;
  githubRepo?: string;
  powershellModule?: string;
  nugetPackage?: string;
} | undefined, detected: {
  repositoryUrl?: string;
  repositoryProvider?: string;
  repositoryPath?: string;
  githubRepo?: string;
  powershellModule?: string;
  nugetPackage?: string;
}): {
  repositoryUrl?: string;
  repositoryProvider?: string;
  repositoryPath?: string;
  githubRepo?: string;
  powershellModule?: string;
  nugetPackage?: string;
} {
  if (!existing) {
    return detected;
  }
  return {
    repositoryUrl: existing.repositoryUrl ?? detected.repositoryUrl,
    repositoryProvider: existing.repositoryProvider ?? detected.repositoryProvider,
    repositoryPath: existing.repositoryPath ?? detected.repositoryPath,
    githubRepo: existing.githubRepo ?? detected.githubRepo,
    powershellModule: existing.powershellModule ?? detected.powershellModule,
    nugetPackage: existing.nugetPackage ?? detected.nugetPackage
  };
}
