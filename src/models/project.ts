export type ProjectType = 'git' | 'sln' | 'csproj' | 'powershell' | 'node' | 'unknown';

export interface ProjectIdentity {
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
  lastModified?: number;
  pinnedItems: string[];
  preferredRunProfileId?: string;
  identity?: ProjectIdentity;
}

export interface ProjectEntryPoint {
  label: string;
  path: string;
  kind: 'sln' | 'csproj' | 'powershell' | 'node' | 'readme' | 'other';
}
