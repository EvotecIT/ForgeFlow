import * as path from 'path';

export function isWithin(parent: string, child: string): boolean {
  const compareParent = process.platform === 'win32' ? parent.toLowerCase() : parent;
  const compareChild = process.platform === 'win32' ? child.toLowerCase() : child;
  const relative = path.relative(compareParent, compareChild);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function normalizeFsPath(value: string): string {
  if (process.platform === 'win32') {
    const wslMatch = /^\/mnt\/([a-zA-Z])(?:\/(.*))?$/.exec(value);
    if (wslMatch) {
      const drive = (wslMatch[1] ?? '').toUpperCase();
      const tail = (wslMatch[2] ?? '').replace(/\//g, '\\');
      return `${drive}:\\${tail}`;
    }
    const posixDriveMatch = /^\/([a-zA-Z])(?:\/(.*))?$/.exec(value);
    if (posixDriveMatch) {
      const drive = (posixDriveMatch[1] ?? '').toUpperCase();
      const tail = (posixDriveMatch[2] ?? '').replace(/\//g, '\\');
      return `${drive}:\\${tail}`;
    }
    const resolvedWslMatch = /^[a-zA-Z]:\\mnt\\([a-zA-Z])(?:\\(.*))?$/.exec(value);
    if (resolvedWslMatch) {
      const drive = (resolvedWslMatch[1] ?? '').toUpperCase();
      const tail = resolvedWslMatch[2] ? `\\${resolvedWslMatch[2]}` : '\\';
      return `${drive}:${tail}`;
    }
    const match = /^\/([a-zA-Z]:)(\/.*)/.exec(value);
    if (match) {
      return `${match[1]}${match[2]}`.replace(/\//g, '\\');
    }
    return value.replace(/\//g, '\\');
  }
  return value;
}

export function resolveGitPathOutput(cwd: string, outputPath: string): string {
  const trimmed = outputPath.trim();
  const normalized = normalizeFsPath(trimmed);
  return path.isAbsolute(normalized) ? path.normalize(normalized) : path.resolve(cwd, normalized);
}

export function normalizePathKey(value: string): string {
  const normalized = normalizeFsPath(path.resolve(value));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function isPathInWorkspaceFolders(
  targetPath: string,
  folders: ReadonlyArray<{ uri: { fsPath: string } }> | undefined
): boolean {
  const normalizedTarget = normalizePathKey(targetPath);
  return (folders ?? []).some((folder) => normalizePathKey(folder.uri.fsPath) === normalizedTarget);
}

export function isPathCoveredByWorkspaceFolders(
  targetPath: string,
  folders: ReadonlyArray<{ uri: { fsPath: string } }> | undefined
): boolean {
  const normalizedTarget = normalizePathKey(targetPath);
  return (folders ?? []).some((folder) => {
    const normalizedFolder = normalizePathKey(folder.uri.fsPath);
    return normalizedFolder === normalizedTarget
      || isWithin(normalizedFolder, normalizedTarget)
      || isWithin(normalizedTarget, normalizedFolder);
  });
}
