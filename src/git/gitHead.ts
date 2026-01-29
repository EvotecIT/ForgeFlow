import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

export interface GitHeadPaths {
  gitDir: string;
  headPath: string;
  logPath: string;
}

export async function getGitHeadMtime(repoPath: string): Promise<number | undefined> {
  const paths = await getGitHeadPaths(repoPath);
  if (!paths) {
    return undefined;
  }

  let latest = 0;
  try {
    const headStat = await fs.stat(paths.headPath);
    latest = Math.max(latest, headStat.mtimeMs);
  } catch {
    // ignore
  }

  try {
    const logStat = await fs.stat(paths.logPath);
    latest = Math.max(latest, logStat.mtimeMs);
  } catch {
    // ignore
  }

  return latest > 0 ? latest : undefined;
}

export async function getGitHeadHash(repoPath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoPath, 'rev-parse', 'HEAD']);
    const hash = stdout.trim();
    return hash.length > 0 ? hash : undefined;
  } catch {
    return undefined;
  }
}

export async function getGitHeadPaths(repoPath: string): Promise<GitHeadPaths | undefined> {
  const gitDir = await resolveGitDir(repoPath);
  if (!gitDir) {
    return undefined;
  }

  return {
    gitDir,
    headPath: path.join(gitDir, 'HEAD'),
    logPath: path.join(gitDir, 'logs', 'HEAD')
  };
}

async function resolveGitDir(repoPath: string): Promise<string | undefined> {
  const gitPath = path.join(repoPath, '.git');
  try {
    const stat = await fs.stat(gitPath);
    if (stat.isDirectory()) {
      return gitPath;
    }
    if (!stat.isFile()) {
      return undefined;
    }
    const content = await fs.readFile(gitPath, 'utf8');
    const match = /^gitdir:\s*(.+)$/im.exec(content);
    const ref = match?.[1]?.trim();
    if (!ref) {
      return undefined;
    }
    return path.isAbsolute(ref) ? ref : path.resolve(repoPath, ref);
  } catch {
    return undefined;
  }
}

const execFileAsync = promisify(execFile);
