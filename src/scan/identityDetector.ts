import * as path from 'path';
import * as vscode from 'vscode';
import type { ProjectIdentity } from '../models/project';
import { readDirectory, readFileText, statPath } from '../util/fs';

export interface DetectedIdentity {
  identity?: ProjectIdentity;
  moduleVersion?: string;
}

interface FileCandidate {
  path: string;
  depth: number;
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
  const [gitHubRepo, psInfo, csInfo, propsInfo] = await Promise.all([
    detectGitHubRepo(projectPath),
    detectPowerShellModule(projectPath),
    detectCsproj(projectPath),
    detectMsBuildProps(projectPath)
  ]);

  const identity: ProjectIdentity = {
    githubRepo: psInfo?.githubRepo ?? csInfo?.githubRepo ?? propsInfo?.githubRepo ?? gitHubRepo,
    powershellModule: psInfo?.moduleName,
    nugetPackage: csInfo?.packageId ?? propsInfo?.packageId
  };

  if (!identity.githubRepo && !identity.powershellModule && !identity.nugetPackage) {
    return {};
  }

  return {
    identity,
    moduleVersion: psInfo?.moduleVersion
  };
}

async function detectGitHubRepo(projectPath: string): Promise<string | undefined> {
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
  return parseGitHubRepo(remoteUrl);
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

function parseGitHubRepo(remoteUrl: string): string | undefined {
  const cleaned = remoteUrl.replace(/\.git$/, '').replace(/\/$/, '');
  const sshMatch = /^git@github\.com:(.+)$/i.exec(cleaned);
  if (sshMatch) {
    const repoPath = sshMatch[1];
    return repoPath ? trimRepoPath(repoPath) : undefined;
  }
  const sshUrlMatch = /^ssh:\/\/git@github\.com\/(.+)$/i.exec(cleaned);
  if (sshUrlMatch) {
    const repoPath = sshUrlMatch[1];
    return repoPath ? trimRepoPath(repoPath) : undefined;
  }
  const httpsMatch = /^https?:\/\/github\.com\/(.+)$/i.exec(cleaned);
  if (httpsMatch) {
    const repoPath = httpsMatch[1];
    return repoPath ? trimRepoPath(repoPath) : undefined;
  }
  return undefined;
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

async function detectPowerShellModule(projectPath: string): Promise<{ moduleName?: string; moduleVersion?: string; githubRepo?: string } | undefined> {
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
  const projectUriRepo = projectUriValue ? parseGitHubRepo(projectUriValue) : undefined;
  return {
    moduleName,
    moduleVersion: versionMatch?.[1],
    githubRepo: projectUriRepo ?? repoMatch?.[1]
  };
}

async function detectCsproj(projectPath: string): Promise<{ packageId?: string; githubRepo?: string } | undefined> {
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
  const githubRepo = repoUrl ? parseGitHubRepo(repoUrl) : undefined;
  return { packageId, githubRepo };
}

async function detectMsBuildProps(projectPath: string): Promise<{ packageId?: string; githubRepo?: string } | undefined> {
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
  const githubRepo = repoUrl ? parseGitHubRepo(repoUrl) : undefined;
  if (!packageId && !githubRepo) {
    return undefined;
  }
  return { packageId, githubRepo };
}

function readMsbuildValue(text: string, property: string): string | undefined {
  const regex = new RegExp(`<${property}>([^<]+)<\\/${property}>`, 'i');
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
  const normalized = candidate.path.toLowerCase();
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
