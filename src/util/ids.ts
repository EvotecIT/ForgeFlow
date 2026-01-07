import { createHash } from 'crypto';
import * as path from 'path';

export function stableIdFromPath(value: string): string {
  const normalized = path.resolve(value).toLowerCase();
  return createHash('sha1').update(normalized).digest('hex');
}

export function treeId(prefix: string, id: string): string {
  return `${prefix}:${id}`;
}
