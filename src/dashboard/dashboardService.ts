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
  repo: string;
  activity: string;
  issues: string;
  prs: string;
  stars: string;
  version: string;
  released: string;
  highlight: boolean;
  archived: boolean;
}

interface DashboardRowWithSort extends DashboardRow {
  activityTimestamp: number;
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
    const rows: DashboardRowWithSort[] = [];

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
      const repoLabel = identity.githubRepo ? (archived ? `${identity.githubRepo} (archived)` : identity.githubRepo) : project.name;

      if (archived && settings.dashboardHideArchived) {
        continue;
      }

      rows.push({
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
    return rows.map(({ activityTimestamp, ...rest }) => rest);
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
