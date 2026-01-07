export type ProjectType = 'git' | 'sln' | 'csproj' | 'powershell' | 'node' | 'unknown';
export type RepositoryProvider = 'github' | 'gitlab' | 'azure' | 'unknown';

export interface ProjectIdentity {
  repositoryUrl?: string;
  repositoryProvider?: RepositoryProvider;
  repositoryPath?: string;
  githubRepo?: string;
  powershellModule?: string;
  nugetPackage?: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  type: ProjectType;
  tags: string[];
  lastOpened?: number;
  lastActivity?: number;
  lastModified?: number;
  lastGitCommit?: number;
  pinnedItems: string[];
  preferredRunProfileId?: string;
  identity?: ProjectIdentity;
}

export interface ProjectEntryPoint {
  label: string;
  path: string;
  kind: 'sln' | 'csproj' | 'powershell' | 'node' | 'readme' | 'other';
}
