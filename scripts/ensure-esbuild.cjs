const { spawnSync } = require('child_process');

async function tryEsbuild() {
  try {
    const esbuild = require('esbuild');
    await esbuild.build({
      stdin: { contents: '/* esbuild probe */', loader: 'js' },
      write: false,
      logLevel: 'silent'
    });
    if (typeof esbuild.stop === 'function') {
      esbuild.stop();
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('You installed esbuild for another platform')) {
      return { ok: false, reason: 'platform-mismatch', message };
    }
    return { ok: false, reason: 'error', message };
  }
}

function rebuildEsbuild() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCmd, ['rebuild', 'esbuild'], { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

(async () => {
  const first = await tryEsbuild();
  if (first.ok) {
    return;
  }
  if (first.reason === 'platform-mismatch') {
    console.warn('ForgeFlow: esbuild platform mismatch detected. Rebuilding esbuild...');
    rebuildEsbuild();
    const second = await tryEsbuild();
    if (second.ok) {
      return;
    }
    console.error('ForgeFlow: esbuild still failing after rebuild.');
    console.error(second.message || 'Unknown error');
    process.exit(1);
  }
  console.error('ForgeFlow: esbuild check failed.');
  console.error(first.message || 'Unknown error');
  process.exit(1);
})();
