import * as path from 'path';

export function normalizePath(input: string): string {
  return path.normalize(input);
}

export function baseName(input: string): string {
  return path.basename(input);
}

export function dirName(input: string): string {
  return path.dirname(input);
}

export function isSubPath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
