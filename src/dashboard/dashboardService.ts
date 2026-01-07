import * as vscode from 'vscode';
import type { Project } from '../models/project';
import type { ProjectsStore } from '../store/projectsStore';
import { ForgeFlowLogger } from '../util/log';
import { getForgeFlowSettings } from '../util/config';
import {
  fetchGitHubOpenPrs,
  fetchGitHubRepo,
  fetchNuGetPackage,
  fetchPowerShellGallery,
  getLocalGitInfo
} from './dataProviders';
import { detectProjectIdentity } from '../scan/identityDetector';

export interface DashboardRow {
  repoUrl?: string;
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
    private readonly logger: ForgeFlowLogger
  ) {}

  public async buildRows(): Promise<DashboardRow[]> {
    const projects = this.projectsStore.list();
    const settings = getForgeFlowSettings();
    const token = await this.getGitHubToken();
    const rows: DashboardRow[] = [];

    for (const project of projects) {
      const detectedInfo = await detectProjectIdentity(project.path);
      const identity = project.identity ?? detectedInfo.identity;
      if (!identity || (!identity.githubRepo && !identity.powershellModule && !identity.nugetPackage)) {
        continue;
      }

      const [gitHub, prs, psGallery, nuget, localGit] = await Promise.all([
        identity.githubRepo ? fetchGitHubRepo(identity.githubRepo, token) : Promise.resolve(undefined),
        identity.githubRepo ? fetchGitHubOpenPrs(identity.githubRepo, token) : Promise.resolve(undefined),
        identity.powershellModule ? fetchPowerShellGallery(identity.powershellModule) : Promise.resolve(undefined),
        identity.nugetPackage ? fetchNuGetPackage(identity.nugetPackage) : Promise.resolve(undefined),
        getLocalGitInfo(project.path)
      ]);

      const activitySource = localGit?.lastCommit ?? gitHub?.pushedAt;
      const activityTimestamp = activitySource ? Date.parse(activitySource) : 0;
      const activity = activitySource ? formatRelative(activitySource) : 'n/a';
      const issues = gitHub ? String(gitHub.issues) : 'n/a';
      const prCount = prs ? String(prs.openPrs) : 'n/a';
      const stars = gitHub ? String(gitHub.stars) : 'n/a';
      const version = psGallery?.version ?? nuget?.version ?? detectedInfo.moduleVersion ?? 'n/a';
      const released = psGallery?.released ?? nuget?.released ?? 'n/a';
      const archived = gitHub?.archived ?? false;
      const repoUrl = resolveRepoUrl(identity);
      const provider = resolveProvider(identity);
      const visibility = gitHub ? (gitHub.private ? 'private' : 'public') : 'unknown';
      const repoLabel = identity.githubRepo
        ? (archived ? `${identity.githubRepo} (archived)` : identity.githubRepo)
        : (identity.repositoryPath ?? project.name);

      if (archived && settings.dashboardHideArchived) {
        continue;
      }

      rows.push({
        repoUrl,
        provider,
        visibility,
        repo: repoLabel,
        activity,
        activityTimestamp: Number.isNaN(activityTimestamp) ? 0 : activityTimestamp,
        issues,
        prs: prCount,
        stars,
        version,
        released,
        archived,
        highlight: !archived && (issues !== '0' || prCount !== '0')
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
      return session?.accessToken;
    } catch {
      this.logger.warn('GitHub auth unavailable. Continuing without auth.');
      return undefined;
    }
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
    if (identity.repositoryUrl.includes('azure')) {
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
