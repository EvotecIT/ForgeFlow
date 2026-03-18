import type { StateStore } from './stateStore';
import { getScopedValue, setScopedValue } from './filterScope';
import { createRevisionStamp } from '../util/revision';
import { normalizeTagList } from '../util/tags';

export interface TagPreset {
  name: string;
  tags: string[];
}

const FILTER_KEY = 'forgeflow.tags.filter.v1';
const PRESETS_KEY = 'forgeflow.tags.presets.v1';
const PRESETS_REVISION_KEY = 'forgeflow.tags.presets.revision.v1';

export class TagFilterStore {
  public constructor(private readonly state: StateStore) {}

  public getPresetsRevision(): string {
    return this.state.getGlobal<string>(PRESETS_REVISION_KEY, '0');
  }

  public getFilter(): string[] {
    return getScopedValue(this.state, FILTER_KEY, []);
  }

  public async setFilter(tags: string[]): Promise<void> {
    await setScopedValue(this.state, FILTER_KEY, normalizeTagList(tags));
  }

  public getPresets(): TagPreset[] {
    return this.state.getGlobal<TagPreset[]>(PRESETS_KEY, []);
  }

  public async savePreset(name: string, tags: string[]): Promise<void> {
    const presets = this.getPresets();
    const normalizedTags = normalizeTagList(tags);
    const existingIndex = presets.findIndex((preset) => preset.name.toLowerCase() === name.toLowerCase());
    if (existingIndex >= 0) {
      presets[existingIndex] = { name, tags: normalizedTags };
    } else {
      presets.push({ name, tags: normalizedTags });
    }
    await this.state.setGlobal(PRESETS_KEY, presets);
    await this.bumpPresetsRevision();
  }

  public async deletePreset(name: string): Promise<void> {
    const presets = this.getPresets().filter((preset) => preset.name.toLowerCase() !== name.toLowerCase());
    await this.state.setGlobal(PRESETS_KEY, presets);
    await this.bumpPresetsRevision();
  }

  private async bumpPresetsRevision(): Promise<void> {
    await this.state.setGlobal(PRESETS_REVISION_KEY, createRevisionStamp());
  }
}
