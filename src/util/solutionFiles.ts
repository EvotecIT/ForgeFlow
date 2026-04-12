import * as path from 'path';

const solutionFileExtensions = new Set(['.sln', '.slnx']);
const solutionFileExtensionRank = new Map([
  ['.sln', 2],
  ['.slnx', 1]
]);

export function isSolutionFileName(fileName: string): boolean {
  return solutionFileExtensions.has(path.extname(fileName).toLowerCase());
}

export function solutionFileKindLabel(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  return extension === '.slnx' ? 'slnx' : 'sln';
}

export function compareSolutionFileNames(a: string, b: string): number {
  const extensionDiff = solutionFileRank(b) - solutionFileRank(a);
  if (extensionDiff !== 0) {
    return extensionDiff;
  }
  return path.basename(a).localeCompare(path.basename(b), undefined, { sensitivity: 'base' });
}

export function isPreferredSolutionFileName(candidate: string, current: string | undefined): boolean {
  return !current || compareSolutionFileNames(candidate, current) < 0;
}

function solutionFileRank(fileName: string): number {
  return solutionFileExtensionRank.get(path.extname(fileName).toLowerCase()) ?? 0;
}
