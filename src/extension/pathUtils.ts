import * as path from 'path';

export function isWithin(parent: string, child: string): boolean {
  const compareParent = process.platform === 'win32' ? parent.toLowerCase() : parent;
  const compareChild = process.platform === 'win32' ? child.toLowerCase() : child;
  const relative = path.relative(compareParent, compareChild);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function normalizeFsPath(value: string): string {
  if (process.platform === 'win32') {
    const match = /^\/([a-zA-Z]:)(\/.*)/.exec(value);
    if (match) {
      return `${match[1]}${match[2]}`.replace(/\//g, '\\');
    }
    return value.replace(/\//g, '\\');
  }
  return value;
}
