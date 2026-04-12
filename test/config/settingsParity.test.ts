import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';

interface PackageJsonShape {
  contributes?: {
    commands?: Array<{ command?: string }>;
    configuration?: {
      properties?: Record<string, { description?: string; markdownDescription?: string; deprecationMessage?: string }>;
    };
  };
}

function loadPackageJson(): PackageJsonShape {
  const packagePath = path.resolve(process.cwd(), 'package.json');
  const raw = fs.readFileSync(packagePath, 'utf8');
  return JSON.parse(raw) as PackageJsonShape;
}

function collectSettingsUsedByConfigFacade(): string[] {
  const configTsPath = path.resolve(process.cwd(), 'src', 'util', 'config.ts');
  const source = fs.readFileSync(configTsPath, 'utf8');
  const matches = source.matchAll(/config\.get<[^>]+>\(\s*'([^']+)'/gs);
  const keys = new Set<string>();
  for (const match of matches) {
    const key = match[1];
    if (key) {
      keys.add(`forgeflow.${key}`);
    }
  }
  return [...keys];
}

describe('settings parity', () => {
  it('declares all forgeflow settings consumed by getForgeFlowSettings', () => {
    const pkg = loadPackageJson();
    const declared = new Set(Object.keys(pkg.contributes?.configuration?.properties ?? {}));
    const used = collectSettingsUsedByConfigFacade();
    const missing = used.filter((key) => !declared.has(key));
    assert.deepEqual(
      missing,
      [],
      `Missing settings in package.json contributes.configuration.properties:\n${missing.join('\n')}`
    );
  });

  it('keeps periodic refresh controls discoverable in settings (not commands)', () => {
    const pkg = loadPackageJson();
    const props = pkg.contributes?.configuration?.properties ?? {};
    const commands = new Set((pkg.contributes?.commands ?? []).map((item) => item.command).filter((item): item is string => Boolean(item)));

    const projectRefresh = props['forgeflow.projects.periodicProjectRefreshMinutes'];
    const worktreeRefresh = props['forgeflow.projects.periodicWorktreeRefreshMinutes'];
    const fallback = props['forgeflow.projects.periodicForceRefreshMinutes'];

    assert.ok(projectRefresh, 'Missing forgeflow.projects.periodicProjectRefreshMinutes setting.');
    assert.ok(worktreeRefresh, 'Missing forgeflow.projects.periodicWorktreeRefreshMinutes setting.');
    assert.ok(fallback, 'Missing forgeflow.projects.periodicForceRefreshMinutes fallback setting.');
    assert.ok(
      Boolean(projectRefresh?.description || projectRefresh?.markdownDescription),
      'periodicProjectRefreshMinutes should have a discoverable description.'
    );
    assert.ok(
      Boolean(worktreeRefresh?.description || worktreeRefresh?.markdownDescription),
      'periodicWorktreeRefreshMinutes should have a discoverable description.'
    );
    assert.ok(
      Boolean(fallback?.deprecationMessage),
      'periodicForceRefreshMinutes should guide users to the new settings.'
    );
    assert.equal(
      [...commands].some((command) => command.includes('periodicRefresh') || command.includes('periodicForceRefresh')),
      false,
      'Periodic refresh tuning should be exposed via settings, not commands.'
    );
  });
});
