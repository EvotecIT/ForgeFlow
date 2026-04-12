import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detectEntryPointGroups } from '../../src/scan/entryPointDetector';

describe('detectEntryPointGroups', () => {
  it('detects slnx files as solution entry points', async () => {
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-entry-'));
    try {
      const solutionPath = path.join(tempRoot, 'DomainDetectiveNext.slnx');
      await fs.promises.writeFile(solutionPath, '<Solution />');

      const groups = await detectEntryPointGroups(tempRoot);

      assert.equal(groups.entryPoints.length, 1);
      assert.equal(groups.entryPoints[0]?.path, solutionPath);
      assert.equal(groups.entryPoints[0]?.kind, 'sln');
      assert.equal(groups.entryPoints[0]?.label, 'DomainDetectiveNext.slnx');
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
