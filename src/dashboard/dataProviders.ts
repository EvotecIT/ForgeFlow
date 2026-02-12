import { execGit } from '../git/exec';

export interface GitHubRepoInfo {
  repo: string;
  stars: number;
  issues: number;
  pushedAt?: string;
  archived?: boolean;
  private?: boolean;
  rateLimited?: boolean;
  unauthorized?: boolean;
  requestFailed?: boolean;
}

export interface GitHubPrInfo {
  openPrs: number;
  rateLimited?: boolean;
  unauthorized?: boolean;
  requestFailed?: boolean;
}

export interface GitHubReleaseInfo {
  tag?: string;
  publishedAt?: string;
  rateLimited?: boolean;
  unauthorized?: boolean;
  requestFailed?: boolean;
}

export interface GitLabRepoInfo {
  repoPath: string;
  stars: number;
  issues: number;
  lastActivity?: string;
  archived?: boolean;
  visibility?: string;
  rateLimited?: boolean;
  unauthorized?: boolean;
  requestFailed?: boolean;
}

export interface GitLabMrInfo {
  openMrs: number;
  rateLimited?: boolean;
  unauthorized?: boolean;
  requestFailed?: boolean;
}

export interface AzureRepoInfo {
  repoPath: string;
  repoId: string;
  visibility?: string;
  isDisabled?: boolean;
  rateLimited?: boolean;
  unauthorized?: boolean;
  requestFailed?: boolean;
}

export interface AzurePrInfo {
  openPrs: number;
  rateLimited?: boolean;
  unauthorized?: boolean;
  requestFailed?: boolean;
}

export interface AzureCommitInfo {
  lastCommit?: string;
  rateLimited?: boolean;
  unauthorized?: boolean;
  requestFailed?: boolean;
}

export interface PowerShellGalleryInfo {
  version?: string;
  released?: string;
}

export interface NuGetInfo {
  version?: string;
  released?: string;
}

export interface LocalGitInfo {
  branch?: string;
  isDirty: boolean;
  lastCommit?: string;
}

function logProviderError(label: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  // Use console to avoid a logger dependency in this data module.
  console.warn(`[ForgeFlow] ${label} failed: ${message}`);
}

export async function fetchGitHubRepo(repo: string, token?: string, signal?: AbortSignal): Promise<GitHubRepoInfo | undefined> {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal
    });

    if (!response.ok) {
      const rateLimited = response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0');
      const unauthorized = response.status === 401 || response.status === 403;
      return {
        repo,
        stars: 0,
        issues: 0,
        rateLimited,
        unauthorized,
        requestFailed: true
      };
    }

    const data = (await response.json()) as {
      stargazers_count?: number;
      open_issues_count?: number;
      pushed_at?: string;
      archived?: boolean;
      private?: boolean;
    };

    return {
      repo,
      stars: data.stargazers_count ?? 0,
      issues: data.open_issues_count ?? 0,
      pushedAt: data.pushed_at,
      archived: data.archived ?? false,
      private: data.private ?? false
    };
  } catch (error) {
    if (signal?.aborted) {
      return undefined;
    }
    logProviderError(`GitHub repo (${repo})`, error);
    return {
      repo,
      stars: 0,
      issues: 0,
      requestFailed: true
    };
  }
}

export async function fetchGitHubOpenPrs(repo: string, token?: string, signal?: AbortSignal): Promise<GitHubPrInfo | undefined> {
  try {
    const query = encodeURIComponent(`repo:${repo} is:pr is:open`);
    const response = await fetch(`https://api.github.com/search/issues?q=${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal
    });

    if (!response.ok) {
      const rateLimited = response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0');
      const unauthorized = response.status === 401 || response.status === 403;
      return { openPrs: 0, rateLimited, unauthorized, requestFailed: true };
    }

    const data = (await response.json()) as { total_count?: number };
    return { openPrs: data.total_count ?? 0 };
  } catch (error) {
    if (signal?.aborted) {
      return undefined;
    }
    logProviderError(`GitHub PRs (${repo})`, error);
    return { openPrs: 0, requestFailed: true };
  }
}

export async function fetchGitHubLatestRelease(repo: string, token?: string, signal?: AbortSignal): Promise<GitHubReleaseInfo | undefined> {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal
    });

    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      const rateLimited = response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0');
      const unauthorized = response.status === 401 || response.status === 403;
      return { rateLimited, unauthorized, requestFailed: true };
    }

    const data = (await response.json()) as {
      tag_name?: string;
      published_at?: string;
    };

    return {
      tag: data.tag_name,
      publishedAt: data.published_at
    };
  } catch (error) {
    if (signal?.aborted) {
      return undefined;
    }
    logProviderError(`GitHub releases (${repo})`, error);
    return { requestFailed: true };
  }
}

export async function fetchGitLabProject(repoPath: string, token?: string, signal?: AbortSignal): Promise<GitLabRepoInfo | undefined> {
  try {
    const encoded = encodeURIComponent(repoPath);
    const response = await fetch(`https://gitlab.com/api/v4/projects/${encoded}`, {
      headers: token ? { 'PRIVATE-TOKEN': token } : undefined,
      signal
    });
    if (!response.ok) {
      const rateLimited = response.status === 429;
      const unauthorized = response.status === 401 || response.status === 403;
      return {
        repoPath,
        stars: 0,
        issues: 0,
        rateLimited,
        unauthorized,
        requestFailed: true
      };
    }
    const data = (await response.json()) as {
      star_count?: number;
      open_issues_count?: number;
      last_activity_at?: string;
      archived?: boolean;
      visibility?: string;
    };
    return {
      repoPath,
      stars: data.star_count ?? 0,
      issues: data.open_issues_count ?? 0,
      lastActivity: data.last_activity_at,
      archived: data.archived ?? false,
      visibility: data.visibility
    };
  } catch (error) {
    if (signal?.aborted) {
      return undefined;
    }
    logProviderError(`GitLab repo (${repoPath})`, error);
    return {
      repoPath,
      stars: 0,
      issues: 0,
      requestFailed: true
    };
  }
}

export async function fetchGitLabOpenMrs(repoPath: string, token?: string, signal?: AbortSignal): Promise<GitLabMrInfo | undefined> {
  try {
    const encoded = encodeURIComponent(repoPath);
    const response = await fetch(`https://gitlab.com/api/v4/projects/${encoded}/merge_requests?state=opened&per_page=1`, {
      headers: token ? { 'PRIVATE-TOKEN': token } : undefined,
      signal
    });
    if (!response.ok) {
      const rateLimited = response.status === 429;
      const unauthorized = response.status === 401 || response.status === 403;
      return { openMrs: 0, rateLimited, unauthorized, requestFailed: true };
    }
    const totalHeader = response.headers.get('x-total');
    const total = totalHeader ? Number(totalHeader) : undefined;
    if (Number.isFinite(total)) {
      return { openMrs: total as number };
    }
    const data = (await response.json()) as unknown[];
    return { openMrs: Array.isArray(data) ? data.length : 0 };
  } catch (error) {
    if (signal?.aborted) {
      return undefined;
    }
    logProviderError(`GitLab MRs (${repoPath})`, error);
    return { openMrs: 0, requestFailed: true };
  }
}

export async function fetchAzureRepo(repoPath: string, token?: string, signal?: AbortSignal): Promise<AzureRepoInfo | undefined> {
  try {
    const parts = repoPath.split('/').filter(Boolean);
    const org = parts[0];
    const project = parts[1];
    const repo = parts[2];
    if (!org || !project || !repo) {
      return undefined;
    }
    const response = await fetch(`https://dev.azure.com/${org}/${project}/_apis/git/repositories/${repo}?api-version=7.1-preview.1`, {
      headers: token ? { Authorization: `Basic ${Buffer.from(`:${token}`).toString('base64')}` } : undefined,
      signal
    });
    if (!response.ok) {
      const rateLimited = response.status === 429;
      const unauthorized = response.status === 401 || response.status === 403;
      return {
        repoPath,
        repoId: '',
        rateLimited,
        unauthorized,
        requestFailed: true
      };
    }
    const data = (await response.json()) as {
      id?: string;
      isDisabled?: boolean;
      project?: { visibility?: string };
    };
    const repoId = data.id ?? '';
    if (!repoId) {
      return undefined;
    }
    return {
      repoPath,
      repoId,
      isDisabled: data.isDisabled ?? false,
      visibility: data.project?.visibility
    };
  } catch (error) {
    if (signal?.aborted) {
      return undefined;
    }
    logProviderError(`Azure repo (${repoPath})`, error);
    return {
      repoPath,
      repoId: '',
      requestFailed: true
    };
  }
}

export async function fetchAzureOpenPrs(repoPath: string, repoId: string, token?: string, signal?: AbortSignal): Promise<AzurePrInfo | undefined> {
  try {
    const parts = repoPath.split('/').filter(Boolean);
    const org = parts[0];
    const project = parts[1];
    if (!org || !project) {
      return undefined;
    }
    const url = `https://dev.azure.com/${org}/${project}/_apis/git/repositories/${repoId}/pullrequests?searchCriteria.status=active&$top=1&api-version=7.1-preview.1`;
    const response = await fetch(url, {
      headers: token ? { Authorization: `Basic ${Buffer.from(`:${token}`).toString('base64')}` } : undefined,
      signal
    });
    if (!response.ok) {
      const rateLimited = response.status === 429;
      const unauthorized = response.status === 401 || response.status === 403;
      return { openPrs: 0, rateLimited, unauthorized, requestFailed: true };
    }
    const data = (await response.json()) as { count?: number };
    return { openPrs: data.count ?? 0 };
  } catch (error) {
    if (signal?.aborted) {
      return undefined;
    }
    logProviderError(`Azure PRs (${repoPath})`, error);
    return { openPrs: 0, requestFailed: true };
  }
}

export async function fetchAzureLatestCommit(repoPath: string, repoId: string, token?: string, signal?: AbortSignal): Promise<AzureCommitInfo | undefined> {
  try {
    const parts = repoPath.split('/').filter(Boolean);
    const org = parts[0];
    const project = parts[1];
    if (!org || !project) {
      return undefined;
    }
    const url = `https://dev.azure.com/${org}/${project}/_apis/git/repositories/${repoId}/commits?searchCriteria.$top=1&api-version=7.1-preview.1`;
    const response = await fetch(url, {
      headers: token ? { Authorization: `Basic ${Buffer.from(`:${token}`).toString('base64')}` } : undefined,
      signal
    });
    if (!response.ok) {
      const rateLimited = response.status === 429;
      const unauthorized = response.status === 401 || response.status === 403;
      return { rateLimited, unauthorized, requestFailed: true };
    }
    const data = (await response.json()) as { value?: Array<{ committer?: { date?: string }; author?: { date?: string } }> };
    const commit = data.value?.[0];
    const date = commit?.committer?.date ?? commit?.author?.date;
    return date ? { lastCommit: date } : undefined;
  } catch (error) {
    if (signal?.aborted) {
      return undefined;
    }
    logProviderError(`Azure commits (${repoPath})`, error);
    return { requestFailed: true };
  }
}

export async function fetchPowerShellGallery(moduleName: string): Promise<PowerShellGalleryInfo | undefined> {
  try {
    const url = `https://www.powershellgallery.com/api/v2/FindPackagesById()?id='${encodeURIComponent(moduleName)}'&$top=1`;
    const response = await fetch(url);
    if (!response.ok) {
      return undefined;
    }
    const text = await response.text();
    const versionMatch = /<d:Version>([^<]+)<\/d:Version>/i.exec(text);
    const releasedMatch = /<d:Published>([^<]+)<\/d:Published>/i.exec(text);
    return {
      version: versionMatch?.[1],
      released: releasedMatch?.[1]
    };
  } catch (error) {
    logProviderError(`PowerShell Gallery (${moduleName})`, error);
    return undefined;
  }
}

export async function fetchNuGetPackage(packageName: string): Promise<NuGetInfo | undefined> {
  try {
    const url = `https://api.nuget.org/v3-flatcontainer/${packageName.toLowerCase()}/index.json`;
    const response = await fetch(url);
    if (!response.ok) {
      return undefined;
    }
    const data = (await response.json()) as { versions?: string[] };
    const versions = data.versions ?? [];
    return {
      version: versions.at(-1)
    };
  } catch (error) {
    logProviderError(`NuGet (${packageName})`, error);
    return undefined;
  }
}

export async function getLocalGitInfo(projectPath: string): Promise<LocalGitInfo | undefined> {
  try {
    const branch = await execGit(projectPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const status = await execGit(projectPath, ['status', '--porcelain']);
    const lastCommit = await execGit(projectPath, ['log', '-1', '--format=%cI']);
    return {
      branch: branch.trim(),
      isDirty: status.trim().length > 0,
      lastCommit: lastCommit.trim()
    };
  } catch (error) {
    logProviderError(`Local git (${projectPath})`, error);
    return undefined;
  }
}
