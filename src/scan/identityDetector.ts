import * as path from 'path';
import * as vscode from 'vscode';
import type { ProjectIdentity, RepositoryProvider } from '../models/project';
import { readDirectory, readFileText, statPath } from '../util/fs';
import { getForgeFlowSettings } from '../util/config';

export interface DetectedIdentity {
  identity?: ProjectIdentity;
  moduleVersion?: string;
}

export interface IdentityScanOptions {
  maxDepth: number;
  preferredFolders: string[];
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

export async function detectProjectIdentity(projectPath: string, options?: IdentityScanOptions): Promise<DetectedIdentity> {
  const scanOptions = options ?? getIdentityScanOptions();
  const [gitInfo, psInfo, csInfo, propsInfo, vscodeInfo] = await Promise.all([
    detectRepositoryInfo(projectPath, scanOptions.maxDepth),
    detectPowerShellModule(projectPath, scanOptions),
    detectCsproj(projectPath, scanOptions),
    detectMsBuildProps(projectPath, scanOptions),
    detectVsCodeExtension(projectPath, scanOptions)
  ]);

  const repoInfo = psInfo?.repoInfo ?? csInfo?.repoInfo ?? propsInfo?.repoInfo ?? gitInfo;

  const identity: ProjectIdentity = {
    repositoryUrl: repoInfo?.url,
    repositoryProvider: repoInfo?.provider,
    repositoryPath: repoInfo?.repoPath,
    githubRepo: repoInfo?.githubRepo,
    powershellModule: psInfo?.moduleName,
    nugetPackage: csInfo?.packageId ?? propsInfo?.packageId,
    vscodeExtensionId: vscodeInfo?.extensionId,
    vscodeExtensionVersion: vscodeInfo?.version
  };

  if (!identity.githubRepo && !identity.repositoryUrl && !identity.powershellModule && !identity.nugetPackage && !identity.vscodeExtensionId) {
    return {};
  }

  return {
    identity,
    moduleVersion: psInfo?.moduleVersion
  };
}

async function detectRepositoryInfo(projectPath: string, maxDepth: number): Promise<RepoInfo | undefined> {
  const configPath = await resolveGitConfigPath(projectPath, maxDepth);
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

async function resolveGitConfigPath(projectPath: string, maxDepth: number): Promise<string | undefined> {
  let current = projectPath;
  const depthLimit = Math.max(0, maxDepth);
  const resolveMode = getForgeFlowSettings().projectGitResolveMode;
  let fallback: string | undefined;
  for (let depth = 0; depth <= depthLimit; depth += 1) {
    const config = await resolveGitConfigAt(current);
    if (config) {
      if (resolveMode === 'closest') {
        return config;
      }
      fallback = config;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return fallback;
}

async function resolveGitConfigAt(projectPath: string): Promise<string | undefined> {
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
  const gitDirValue = match?.[1]?.trim();
  if (!gitDirValue) {
    return undefined;
  }
  const resolved = path.isAbsolute(gitDirValue) ? gitDirValue : path.resolve(projectPath, gitDirValue);
  return path.join(resolved, 'config');
}

function parseOriginRemoteUrl(text: string): string | undefined {
  const remotes = parseRemoteUrls(text);
  if (remotes['origin'] && remotes['origin'].length > 0) {
    return remotes['origin'][0];
  }
  const firstRemote = Object.values(remotes).find((urls) => urls.length > 0);
  return firstRemote ? firstRemote[0] : undefined;
}

function parseRemoteUrls(text: string): Record<string, string[]> {
  const lines = text.split(/\r?\n/);
  let currentRemote: string | undefined;
  const remotes: Record<string, string[]> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      const match = /^\[remote\s+"([^"]+)"\]/i.exec(trimmed);
      currentRemote = match?.[1];
      continue;
    }
    if (!currentRemote) {
      continue;
    }
    const match = /^url\s*=\s*(.+)$/i.exec(trimmed);
    if (match) {
      const url = match[1]?.trim();
      if (url) {
        const bucket = remotes[currentRemote] ?? (remotes[currentRemote] = []);
        bucket.push(url);
      }
    }
  }
  return remotes;
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
  const sshAzureScp = /^git@ssh\.dev\.azure\.com:(.+)$/i.exec(cleaned);
  if (sshAzureScp) {
    return toAzureRepoInfo(sshAzureScp[1]);
  }
  const sshVisualStudio = /^git@vs-ssh\.visualstudio\.com:v3\/(.+)$/i.exec(cleaned);
  if (sshVisualStudio) {
    return toAzureRepoInfo(sshVisualStudio[1]);
  }
  const sshGeneric = /^git@([^:]+):(.+)$/i.exec(cleaned);
  if (sshGeneric) {
    return toHostedRepoInfo(sshGeneric[1] ?? '', sshGeneric[2] ?? '');
  }

  if (cleaned.includes('://')) {
    const urlInfo = parseUrlRepository(cleaned);
    if (urlInfo) {
      return urlInfo;
    }
  }

  return undefined;
}

function parseUrlRepository(remoteUrl: string): RepoInfo | undefined {
  try {
    const url = new URL(remoteUrl);
    const host = url.hostname.toLowerCase();
    const hostWithPort = url.host.toLowerCase();
    const pathParts = url.pathname.split('/').filter(Boolean);

    if (host === 'github.com') {
      return toRepoInfo('github', toGitHubRepoPath(pathParts), 'https://github.com');
    }
    if (host === 'gitlab.com') {
      return toRepoInfo('gitlab', toGitLabRepoPath(pathParts), 'https://gitlab.com');
    }
    if (host === 'dev.azure.com' || host === 'ssh.dev.azure.com' || host.endsWith('.visualstudio.com') || host === 'vs-ssh.visualstudio.com') {
      const orgFromHost = host.endsWith('.visualstudio.com') && host !== 'vs-ssh.visualstudio.com'
        ? host.split('.')[0]
        : undefined;
      return toAzureRepoInfoFromParts(orgFromHost, pathParts);
    }
    if (host.includes('github')) {
      return toRepoInfo('github', toGitHubRepoPath(pathParts), `https://${hostWithPort}`);
    }
    if (host.includes('gitlab')) {
      return toRepoInfo('gitlab', toGitLabRepoPath(pathParts), `https://${hostWithPort}`);
    }
    return toHostedRepoInfo(hostWithPort, pathParts.join('/'));
  } catch {
    return undefined;
  }
}

function toRepoInfo(provider: RepositoryProvider, pathValue: string | undefined, baseUrl: string): RepoInfo | undefined {
  if (!pathValue) {
    return undefined;
  }
  const repoPath = trimRepoPath(pathValue, provider);
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
  return toAzureRepoInfoFromParts(undefined, parts);
}

function toAzureRepoInfoFromParts(orgFromHost: string | undefined, parts: string[]): RepoInfo | undefined {
  let normalized = [...parts];
  if (normalized[0]?.toLowerCase() === 'v3') {
    normalized = normalized.slice(1);
  }
  if (normalized[0]?.toLowerCase() === 'defaultcollection') {
    normalized = normalized.slice(1);
  }

  const repoIndex = normalized.findIndex((segment) => segment.toLowerCase() === '_git');
  const org = orgFromHost ?? normalized[0];
  const project = repoIndex >= 0 ? normalized[repoIndex - 1] : normalized[1];
  const repo = repoIndex >= 0 ? normalized[repoIndex + 1] : normalized[2];

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

function trimRepoPath(value: string, provider: RepositoryProvider): string | undefined {
  const parts = value.split('/').filter((part) => part.length > 0);
  if (provider === 'gitlab') {
    return parts.length >= 2 ? parts.join('/') : undefined;
  }
  const owner = parts[0];
  const repo = parts[1];
  if (!owner || !repo) {
    return undefined;
  }
  return `${owner}/${repo}`;
}

function toHostedRepoInfo(host: string, pathValue: string): RepoInfo | undefined {
  const cleanedPath = pathValue.replace(/^\//, '').replace(/\.git$/, '');
  const pathParts = cleanedPath.split('/').filter(Boolean);
  if (pathParts.length < 2) {
    return undefined;
  }
  if (host.includes('github')) {
    const repoPath = toGitHubRepoPath(pathParts);
    return repoPath ? { provider: 'github', repoPath, url: `https://${host}/${repoPath}`, githubRepo: repoPath } : undefined;
  }
  if (host.includes('gitlab')) {
    const repoPath = toGitLabRepoPath(pathParts);
    return repoPath ? { provider: 'gitlab', repoPath, url: `https://${host}/${repoPath}` } : undefined;
  }
  const repoPath = pathParts.join('/');
  return {
    provider: 'unknown',
    repoPath,
    url: `https://${host}/${repoPath}`
  };
}

function toGitHubRepoPath(parts: string[]): string | undefined {
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : undefined;
}

function toGitLabRepoPath(parts: string[]): string | undefined {
  return parts.length >= 2 ? parts.join('/') : undefined;
}

async function detectPowerShellModule(projectPath: string, options: IdentityScanOptions): Promise<{ moduleName?: string; moduleVersion?: string; repoInfo?: RepoInfo } | undefined> {
  const psd1Path = await findBestFile(projectPath, '.psd1', options);
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

async function detectCsproj(projectPath: string, options: IdentityScanOptions): Promise<{ packageId?: string; repoInfo?: RepoInfo } | undefined> {
  const csprojPath = await findBestFile(projectPath, '.csproj', options);
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

async function detectMsBuildProps(projectPath: string, options: IdentityScanOptions): Promise<{ packageId?: string; repoInfo?: RepoInfo } | undefined> {
  const propsPath = await findBestNamedFile(projectPath, 'Directory.Build.props', options);
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

async function detectVsCodeExtension(projectPath: string, options: IdentityScanOptions): Promise<{ extensionId?: string; version?: string } | undefined> {
  const candidates = await findNamedFiles(projectPath, 'package.json', options.maxDepth);
  if (candidates.length === 0) {
    return undefined;
  }
  const rootName = path.basename(projectPath).toLowerCase();
  const preferredFolders = normalizePreferredFolders(options.preferredFolders);
  const scored = candidates.map((candidate) => ({
    path: candidate.path,
    score: scoreCandidate(candidate, rootName, preferredFolders)
  }));
  scored.sort((a, b) => a.score - b.score);

  for (const candidate of scored) {
    const info = await readVsCodeManifest(candidate.path);
    if (info) {
      return info;
    }
  }

  return undefined;
}

async function readVsCodeManifest(manifestPath: string): Promise<{ extensionId?: string; version?: string } | undefined> {
  const text = await readFileText(manifestPath);
  if (!text) {
    return undefined;
  }
  try {
    const data = JSON.parse(text) as unknown;
    if (!isRecord(data)) {
      return undefined;
    }
    const publisher = readString(data, 'publisher');
    const name = readString(data, 'name');
    const version = readString(data, 'version');
    const engines = readRecord(data, 'engines');
    const vscodeEngine = engines ? readString(engines, 'vscode') : undefined;
    const contributes = readRecord(data, 'contributes');
    if (!publisher || !name || !version) {
      return undefined;
    }
    if (!vscodeEngine && !contributes) {
      return undefined;
    }
    return { extensionId: `${publisher}.${name}`, version };
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
  const raw = value[key];
  return typeof raw === 'string' ? raw : undefined;
}

function readRecord(value: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const raw = value[key];
  return isRecord(raw) ? raw : undefined;
}

function readMsbuildValue(text: string, property: string): string | undefined {
  const regex = new RegExp(`<${property}>([^<]+)</${property}>`, 'i');
  const match = regex.exec(text);
  const value = match?.[1]?.trim();
  if (!value || value.includes('$(')) {
    return undefined;
  }
  return value;
}

async function findBestFile(root: string, extension: string, options: IdentityScanOptions): Promise<string | undefined> {
  const candidates = await findFiles(root, extension, options.maxDepth);
  if (candidates.length === 0) {
    return undefined;
  }
  const rootName = path.basename(root).toLowerCase();
  const preferredFolders = normalizePreferredFolders(options.preferredFolders);
  const scored = candidates.map((candidate) => ({
    path: candidate.path,
    score: scoreCandidate(candidate, rootName, preferredFolders)
  }));
  scored.sort((a, b) => a.score - b.score);
  return scored[0]?.path;
}

async function findBestNamedFile(root: string, fileName: string, options: IdentityScanOptions): Promise<string | undefined> {
  const candidates = await findNamedFiles(root, fileName, options.maxDepth);
  if (candidates.length === 0) {
    return undefined;
  }
  const rootName = path.basename(root).toLowerCase();
  const preferredFolders = normalizePreferredFolders(options.preferredFolders);
  const scored = candidates.map((candidate) => ({
    path: candidate.path,
    score: scoreCandidate(candidate, rootName, preferredFolders)
  }));
  scored.sort((a, b) => a.score - b.score);
  return scored[0]?.path;
}

function scoreCandidate(candidate: FileCandidate, rootName: string, preferredFolders: string[]): number {
  const normalized = candidate.path.toLowerCase().replace(/\\/g, '/');
  let score = candidate.depth * 10;
  if (normalized.includes(`/${rootName}.`)) {
    score -= 6;
  }
  for (const segment of preferredFolders) {
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

function getIdentityScanOptions(): IdentityScanOptions {
  const settings = getForgeFlowSettings();
  return {
    maxDepth: settings.identityScanDepth,
    preferredFolders: settings.identityPreferredFolders
  };
}

function normalizePreferredFolders(folders: string[]): string[] {
  return folders
    .map((folder) => folder.trim().toLowerCase())
    .filter((folder) => folder.length > 0);
}
