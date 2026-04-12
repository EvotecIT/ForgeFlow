export interface ReusableTerminalKeyOptions {
  reuseScope: 'profile' | 'shared';
  perProject: boolean;
  projectId?: string;
}

export function buildReusableTerminalKey(profileId: string, options: ReusableTerminalKeyOptions): string {
  if (options.reuseScope === 'shared') {
    if (options.perProject && options.projectId) {
      return `shared:${options.projectId}`;
    }
    return 'shared';
  }
  if (options.perProject && options.projectId) {
    return `${profileId}:${options.projectId}`;
  }
  return profileId;
}

