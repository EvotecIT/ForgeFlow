import * as path from 'path';
import * as vscode from 'vscode';
import type { ProjectIdentity, RepositoryProvider } from '../models/project';
import { readDirectory, readFileText, statPath } from '../util/fs';

export interface DetectedIdentity {
  identity?: ProjectIdentity;
  moduleVersion?: string;
}

interface FileCandidate {
  path: string;
  depth: number;
}

interface RepoInfo {
  provider: RepositoryProvider;
  repoPath?: string;
  url?: string;
  githubRepo?: string;
}

const ignoredFolders = new Set([
  '.git',
  '.github',
  '.vscode',
  'node_modules',
  'bin',
  'obj',
  'dist',
  'out',
  'artifacts',
  'packages'
]);

const preferredSegments = ['module', 'modules', 'src', 'source', 'sources'];

export async function detectProjectIdentity(projectPath: string): Promise<DetectedIdentity> {
  const [gitInfo, psInfo, csInfo, propsInfo] = await Promise.all([
    detectRepositoryInfo(projectPath),
    detectPowerShellModule(projectPath),
    detectCsproj(projectPath),
    detectMsBuildProps(projectPath)
  ]);

  const repoInfo = psInfo?.repoInfo ?? csInfo?.repoInfo ?? propsInfo?.repoInfo ?? gitInfo;

  const identity: ProjectIdentity = {
    repositoryUrl: repoInfo?.url,
    repositoryProvider: repoInfo?.provider,
    repositoryPath: repoInfo?.repoPath,
    githubRepo: repoInfo?.githubRepo,
    powershellModule: psInfo?.moduleName,
    nugetPackage: csInfo?.packageId ?? propsInfo?.packageId
  };

  if (!identity.githubRepo && !identity.repositoryUrl && !identity.powershellModule && !identity.nugetPackage) {
    return {};
  }

  return {
    identity,
    moduleVersion: psInfo?.moduleVersion
  };
}

async function detectRepositoryInfo(projectPath: string): Promise<RepoInfo | undefined> {
  const configPath = await resolveGitConfigPath(projectPath);
  if (!configPath) {
    return undefined;
  }
  const text = await readFileText(configPath);
  if (!text) {
    return undefined;
  }
  const remoteUrl = parseOriginRemoteUrl(text);
  if (!remoteUrl) {
    return undefined;
  }
  return parseRepositoryInfo(remoteUrl);
}

async function resolveGitConfigPath(projectPath: string): Promise<string | undefined> {
  const dotGit = path.join(projectPath, '.git');
  const stat = await statPath(dotGit);
  if (!stat) {
    return undefined;
  }
  if (stat.type === vscode.FileType.Directory) {
    return path.join(dotGit, 'config');
  }
  const text = await readFileText(dotGit);
  if (!text) {
    return undefined;
  }
  const match = /gitdir:\s*(.+)/i.exec(text);
  if (!match) {
    return undefined;
  }
  const gitDir = match[1];
  if (!gitDir) {
    return undefined;
  }
  const gitDirValue = gitDir.trim();
  const resolved = path.isAbsolute(gitDirValue) ? gitDirValue : path.resolve(projectPath, gitDirValue);
  return path.join(resolved, 'config');
}

function parseOriginRemoteUrl(text: string): string | undefined {
  const lines = text.split(/\r?\n/);
  let inOrigin = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      inOrigin = /^\[remote\s+"origin"\]/i.test(trimmed);
      continue;
    }
    if (inOrigin) {
      const match = /^url\s*=\s*(.+)$/i.exec(trimmed);
      if (match) {
        const url = match[1];
        return url ? url.trim() : undefined;
      }
    }
  }
  return undefined;
}

function parseRepositoryInfo(remoteUrl: string): RepoInfo | undefined {
  const cleaned = remoteUrl.replace(/\.git$/, '').replace(/\/$/, '');

  const sshGithub = /^git@github\.com:(.+)$/i.exec(cleaned);
  if (sshGithub) {
    return toRepoInfo('github', sshGithub[1], 'https://github.com');
  }
  const sshGitlab = /^git@gitlab\.com:(.+)$/i.exec(cleaned);
  if (sshGitlab) {
    return toRepoInfo('gitlab', sshGitlab[1], 'https://gitlab.com');
  }
  const sshAzure = /^ssh:\/\/git@ssh\.dev\.azure\.com\/v3\/(.+)$/i.exec(cleaned);
  if (sshAzure) {
    return toAzureRepoInfo(sshAzure[1]);
  }

  const httpsGithub = /^https?:\/\/github\.com\/(.+)$/i.exec(cleaned);
  if (httpsGithub) {
    return toRepoInfo('github', httpsGithub[1], 'https://github.com');
  }
  const httpsGitlab = /^https?:\/\/gitlab\.com\/(.+)$/i.exec(cleaned);
  if (httpsGitlab) {
    return toRepoInfo('gitlab', httpsGitlab[1], 'https://gitlab.com');
  }
  const httpsAzure = /^https?:\/\/dev\.azure\.com\/(.+)$/i.exec(cleaned);
  if (httpsAzure) {
    return toAzureRepoInfo(httpsAzure[1]);
  }
  const httpsAzureLegacy = /^https?:\/\/([^.]+)\.visualstudio\.com\/(.+)$/i.exec(cleaned);
  if (httpsAzureLegacy) {
    const org = httpsAzureLegacy[1];
    const rest = httpsAzureLegacy[2];
    if (org && rest) {
      return toAzureRepoInfo(`${org}/${rest}`);
    }
  }

  return undefined;
}

function toRepoInfo(provider: RepositoryProvider, pathValue: string | undefined, baseUrl: string): RepoInfo | undefined {
  if (!pathValue) {
    return undefined;
  }
  const repoPath = trimRepoPath(pathValue);
  if (!repoPath) {
    return undefined;
  }
  const url = `${baseUrl}/${repoPath}`;
  return {
    provider,
    repoPath,
    url,
    githubRepo: provider === 'github' ? repoPath : undefined
  };
}

function toAzureRepoInfo(pathValue: string | undefined): RepoInfo | undefined {
  if (!pathValue) {
    return undefined;
  }
  const parts = pathValue.split('/').filter(Boolean);
  const org = parts[0];
  const project = parts[1];
  const repoIndex = parts.findIndex((segment) => segment.toLowerCase() === '_git');
  const repo = repoIndex >= 0 ? parts[repoIndex + 1] : parts[2];
  if (!org || !project || !repo) {
    return undefined;
  }
  const repoPath = `${org}/${project}/${repo}`;
  const url = `https://dev.azure.com/${org}/${project}/_git/${repo}`;
  return {
    provider: 'azure',
    repoPath,
    url
  };
}

function trimRepoPath(value: string): string | undefined {
  const parts = value.split('/').filter((part) => part.length > 0);
  const owner = parts[0];
  const repo = parts[1];
  if (!owner || !repo) {
    return undefined;
  }
  return `${owner}/${repo}`;
}

async function detectPowerShellModule(projectPath: string): Promise<{ moduleName?: string; moduleVersion?: string; repoInfo?: RepoInfo } | undefined> {
  const psd1Path = await findBestFile(projectPath, '.psd1', 4);
  if (!psd1Path) {
    return undefined;
  }
  const text = await readFileText(psd1Path);
  const moduleName = path.basename(psd1Path, '.psd1');
  if (!text) {
    return { moduleName };
  }
  const versionMatch = /ModuleVersion\s*=\s*['"]([^'"]+)['"]/i.exec(text);
  const projectUriMatch = /ProjectUri\s*=\s*['"]([^'"]+)['"]/i.exec(text);
  const repoMatch = /Repository\s*=\s*['"]([^'"]+)['"]/i.exec(text);
  const projectUriValue = projectUriMatch?.[1];
  const repoValue = repoMatch?.[1];
  const repoInfo = projectUriValue
    ? parseRepositoryInfo(projectUriValue)
    : (repoValue ? parseRepositoryInfo(repoValue) : undefined);
  return {
    moduleName,
    moduleVersion: versionMatch?.[1],
    repoInfo
  };
}

async function detectCsproj(projectPath: string): Promise<{ packageId?: string; repoInfo?: RepoInfo } | undefined> {
  const csprojPath = await findBestFile(projectPath, '.csproj', 4);
  if (!csprojPath) {
    return undefined;
  }
  const text = await readFileText(csprojPath);
  const fallbackName = path.basename(csprojPath, '.csproj');
  if (!text) {
    return { packageId: fallbackName };
  }
  const packageId = readMsbuildValue(text, 'PackageId')
    ?? readMsbuildValue(text, 'AssemblyName')
    ?? fallbackName;
  const repoUrl = readMsbuildValue(text, 'RepositoryUrl')
    ?? readMsbuildValue(text, 'PackageProjectUrl');
  const repoInfo = repoUrl ? parseRepositoryInfo(repoUrl) : undefined;
  return { packageId, repoInfo };
}

async function detectMsBuildProps(projectPath: string): Promise<{ packageId?: string; repoInfo?: RepoInfo } | undefined> {
  const propsPath = await findBestNamedFile(projectPath, 'Directory.Build.props', 4);
  if (!propsPath) {
    return undefined;
  }
  const text = await readFileText(propsPath);
  if (!text) {
    return undefined;
  }
  const packageId = readMsbuildValue(text, 'PackageId') ?? readMsbuildValue(text, 'AssemblyName');
  const repoUrl = readMsbuildValue(text, 'RepositoryUrl') ?? readMsbuildValue(text, 'PackageProjectUrl');
  const repoInfo = repoUrl ? parseRepositoryInfo(repoUrl) : undefined;
  if (!packageId && !repoInfo) {
    return undefined;
  }
  return { packageId, repoInfo };
}

function readMsbuildValue(text: string, property: string): string | undefined {
  const regex = new RegExp(`<${property}>([^<]+)<\/${property}>`, 'i');
  const match = regex.exec(text);
  const value = match?.[1]?.trim();
  if (!value || value.includes('$(')) {
    return undefined;
  }
  return value;
}

async function findBestFile(root: string, extension: string, maxDepth: number): Promise<string | undefined> {
  const candidates = await findFiles(root, extension, maxDepth);
  if (candidates.length === 0) {
    return undefined;
  }
  const rootName = path.basename(root).toLowerCase();
  const scored = candidates.map((candidate) => ({
    path: candidate.path,
    score: scoreCandidate(candidate, rootName)
  }));
  scored.sort((a, b) => a.score - b.score);
  return scored[0]?.path;
}

async function findBestNamedFile(root: string, fileName: string, maxDepth: number): Promise<string | undefined> {
  const candidates = await findNamedFiles(root, fileName, maxDepth);
  if (candidates.length === 0) {
    return undefined;
  }
  const rootName = path.basename(root).toLowerCase();
  const scored = candidates.map((candidate) => ({
    path: candidate.path,
    score: scoreCandidate(candidate, rootName)
  }));
  scored.sort((a, b) => a.score - b.score);
  return scored[0]?.path;
}

function scoreCandidate(candidate: FileCandidate, rootName: string): number {
  const normalized = candidate.path.toLowerCase().replace(/\\/g, '/');
  let score = candidate.depth * 10;
  if (normalized.includes(`/${rootName}.`)) {
    score -= 6;
  }
  for (const segment of preferredSegments) {
    if (normalized.includes(`/${segment}/`)) {
      score -= 3;
      break;
    }
  }
  return score;
}

async function findFiles(root: string, extension: string, maxDepth: number): Promise<FileCandidate[]> {
  const results: FileCandidate[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      continue;
    }
    const { dir, depth } = next;
    const entries = await readDirectory(dir);
    for (const [name, type] of entries) {
      if (type === vscode.FileType.Directory) {
        if (ignoredFolders.has(name)) {
          continue;
        }
        if (depth < maxDepth) {
          queue.push({ dir: path.join(dir, name), depth: depth + 1 });
        }
        continue;
      }
      if (type === vscode.FileType.File && name.toLowerCase().endsWith(extension)) {
        results.push({ path: path.join(dir, name), depth });
      }
    }
  }

  return results;
}

async function findNamedFiles(root: string, fileName: string, maxDepth: number): Promise<FileCandidate[]> {
  const results: FileCandidate[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      continue;
    }
    const { dir, depth } = next;
    const entries = await readDirectory(dir);
    for (const [name, type] of entries) {
      if (type === vscode.FileType.Directory) {
        if (ignoredFolders.has(name)) {
          continue;
        }
        if (depth < maxDepth) {
          queue.push({ dir: path.join(dir, name), depth: depth + 1 });
        }
        continue;
      }
      if (type === vscode.FileType.File && name.toLowerCase() === fileName.toLowerCase()) {
        results.push({ path: path.join(dir, name), depth });
      }
    }
  }
  return results;
}
