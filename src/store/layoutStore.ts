import type { StateStore } from './stateStore';

const LAYOUT_KEY = 'forgeflow.layout.mode.v1';

export type LayoutMode = 'compact' | 'expanded';

export class LayoutStore {
  public constructor(private readonly state: StateStore) {}

  public getMode(): LayoutMode {
    return this.state.getGlobal<LayoutMode>(LAYOUT_KEY, 'compact');
  }

  public async setMode(mode: LayoutMode): Promise<void> {
    await this.state.setGlobal(LAYOUT_KEY, mode);
  }
}
