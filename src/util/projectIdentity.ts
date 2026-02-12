import type { Project } from '../models/project';

export function buildProjectDuplicateKey(project: Project): string | undefined {
  const identity = project.identity;
  if (identity?.repositoryUrl) {
    return `url:${identity.repositoryUrl.toLowerCase()}`;
  }
  if (identity?.githubRepo) {
    return `gh:${identity.githubRepo.toLowerCase()}`;
  }
  if (identity?.repositoryProvider && identity?.repositoryPath) {
    return `${identity.repositoryProvider}:${identity.repositoryPath.toLowerCase()}`;
  }
  return undefined;
}

