export interface ProfileInfo {
  id: string;
  label: string;
  executablePath: string;
  version?: string;
  isPreview?: boolean;
}

export interface ModuleInventoryItem {
  name: string;
  version: string;
  repository?: string;
  installedScope: 'currentUser' | 'allUsers';
  powerShellEdition: 'desktop' | 'core';
}

export interface ModuleInventory {
  generatedAt: string;
  items: ModuleInventoryItem[];
}

export interface EngineClient {
  connect(): Promise<void>;
  getProfiles(): Promise<ProfileInfo[]>;
  getModuleInventory(): Promise<ModuleInventory>;
  updateAllModules(): Promise<void>;
  cleanupModules(): Promise<void>;
}
