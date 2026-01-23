const path = require('path');
const esbuild = require('esbuild');

const args = new Set(process.argv.slice(2));
const watch = args.has('--watch');

const entry = path.join(__dirname, '..', 'src', 'extension.ts');
const outFile = path.join(__dirname, '..', 'out', 'extension.js');

const buildOptions = {
  entryPoints: [entry],
  outfile: outFile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  external: ['vscode'],
  logLevel: 'info'
};

async function run() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    return;
  }
  await esbuild.build(buildOptions);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
