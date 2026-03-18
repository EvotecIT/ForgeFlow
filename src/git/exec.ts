import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function execGit(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', ['-C', cwd, ...args]);
  return result.stdout;
}

export async function tryExecGitTrimmed(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    return (await execGit(cwd, args)).trim();
  } catch {
    return undefined;
  }
}
