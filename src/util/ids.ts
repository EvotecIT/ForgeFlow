import { createHash } from 'crypto';
import * as path from 'path';

export function stableIdFromPath(value: string): string {
  const resolved = path.resolve(value);
  const normalized = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  return createHash('sha1').update(normalized).digest('hex');
}

export function treeId(prefix: string, id: string): string {
  return `${prefix}:${id}`;
}
