import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';

describe('package keybindings', () => {
  it('uses focusedView instead of view for keyboard shortcuts on custom views', async () => {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    const raw = await fs.promises.readFile(packageJsonPath, 'utf8');
    const manifest = JSON.parse(raw) as {
      contributes?: {
        keybindings?: Array<{ when?: string }>;
      };
    };
    const keybindings = manifest.contributes?.keybindings ?? [];
    const wrongWhenClauses = keybindings
      .map((binding) => binding.when)
      .filter((when): when is string => Boolean(when))
      .filter((when) => /(^|[ (&])view == forgeflow\./.test(when));

    assert.deepEqual(wrongWhenClauses, []);
  });
});
