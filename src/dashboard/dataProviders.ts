import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface GitHubRepoInfo {
  repo: string;
  stars: number;
  issues: number;
  pushedAt?: string;
}

export interface GitHubPrInfo {
  openPrs: number;
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

export async function fetchGitHubRepo(repo: string, token?: string): Promise<GitHubRepoInfo | undefined> {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });

    if (!response.ok) {
      return undefined;
    }

    const data = (await response.json()) as {
      stargazers_count?: number;
      open_issues_count?: number;
      pushed_at?: string;
    };

    return {
      repo,
      stars: data.stargazers_count ?? 0,
      issues: data.open_issues_count ?? 0,
      pushedAt: data.pushed_at
    };
  } catch {
    return undefined;
  }
}

export async function fetchGitHubOpenPrs(repo: string, token?: string): Promise<GitHubPrInfo | undefined> {
  try {
    const query = encodeURIComponent(`repo:${repo} is:pr is:open`);
    const response = await fetch(`https://api.github.com/search/issues?q=${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });

    if (!response.ok) {
      return undefined;
    }

    const data = (await response.json()) as { total_count?: number };
    return { openPrs: data.total_count ?? 0 };
  } catch {
    return undefined;
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
  } catch {
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
  } catch {
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
  } catch {
    return undefined;
  }
}

async function execGit(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', ['-C', cwd, ...args]);
  return result.stdout;
}
