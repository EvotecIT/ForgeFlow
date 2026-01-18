import type { StateStore } from './stateStore';

export type FilterPresetScope = 'files' | 'projects' | 'git' | 'dashboard';

export interface FilterPreset {
  name: string;
  value: string;
}

const PRESETS_KEY = 'forgeflow.filters.presets.v1';

type PresetMap = Record<FilterPresetScope, FilterPreset[]>;

export class FilterPresetStore {
  public constructor(private readonly state: StateStore) {}

  public getPresets(scope: FilterPresetScope): FilterPreset[] {
    const map = this.state.getGlobal<PresetMap>(PRESETS_KEY, {
      files: [],
      projects: [],
      git: [],
      dashboard: []
    });
    return map[scope] ?? [];
  }

  public async savePreset(scope: FilterPresetScope, name: string, value: string): Promise<void> {
    const map = this.state.getGlobal<PresetMap>(PRESETS_KEY, {
      files: [],
      projects: [],
      git: [],
      dashboard: []
    });
    const presets = map[scope] ?? [];
    const index = presets.findIndex((preset) => preset.name.toLowerCase() === name.toLowerCase());
    if (index >= 0) {
      presets[index] = { name, value };
    } else {
      presets.push({ name, value });
    }
    map[scope] = presets;
    await this.state.setGlobal(PRESETS_KEY, map);
  }

  public async deletePreset(scope: FilterPresetScope, name: string): Promise<void> {
    const map = this.state.getGlobal<PresetMap>(PRESETS_KEY, {
      files: [],
      projects: [],
      git: [],
      dashboard: []
    });
    map[scope] = (map[scope] ?? []).filter((preset) => preset.name.toLowerCase() !== name.toLowerCase());
    await this.state.setGlobal(PRESETS_KEY, map);
  }
}
