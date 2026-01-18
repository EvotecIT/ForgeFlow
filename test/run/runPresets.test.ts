import { strict as assert } from 'assert';
import { buildPresetFromEntry } from '../../src/run/runPresets';
import type { RunHistoryEntry } from '../../src/models/run';

describe('run presets', () => {
  it('builds preset from history entry', () => {
    const entry: RunHistoryEntry = {
      id: 'hist-1',
      kind: 'powershell',
      label: 'Run build',
      timestamp: Date.now(),
      filePath: '/tmp/build.ps1',
      workingDirectory: '/tmp',
      profileId: 'pwsh',
      target: 'external'
    };

    const preset = buildPresetFromEntry(entry, 'Preset Build', 'preset-1');
    assert.equal(preset.id, 'preset-1');
    assert.equal(preset.label, 'Preset Build');
    assert.equal(preset.kind, 'powershell');
    assert.equal(preset.filePath, '/tmp/build.ps1');
    assert.equal(preset.workingDirectory, '/tmp');
    assert.equal(preset.profileId, 'pwsh');
    assert.equal(preset.target, 'external');
  });
});
