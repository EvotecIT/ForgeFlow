const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const pkg = require(path.join(repoRoot, 'package.json'));

const args = new Set(process.argv.slice(2));
const skipNpmCi = args.has('--skip-npm-ci');
const skipTests = args.has('--skip-tests');
const publishMarketplace = args.has('--publish-marketplace');
const preRelease = args.has('--pre-release');
const outputDirArg = process.argv.find((arg) => arg.startsWith('--output-directory='));
const outputDir = path.resolve(repoRoot, outputDirArg ? outputDirArg.split('=')[1] : 'dist');
const npmCmd = 'npm';
const npxCmd = 'npx';

function run(command, commandArgs, options = {}) {
  console.log(`\n> ${command} ${commandArgs.join(' ')}`);
  const executable = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : command;
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', [command, ...commandArgs].map(quoteWindowsArg).join(' ')]
    : commandArgs;

  const result = spawnSync(executable, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ...options.env }
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function quoteWindowsArg(value) {
  if (/^[A-Za-z0-9_/:.=\\-]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '\\"')}"`;
}

if (pkg.publisher !== 'EvotecServices') {
  throw new Error(`package.json publisher must be EvotecServices, found ${pkg.publisher || '<missing>'}.`);
}

if (!skipNpmCi) {
  run(npmCmd, ['ci']);
}

run(npmCmd, ['run', 'compile']);
run(npmCmd, ['run', 'lint']);
run(npmCmd, ['run', 'typecheck']);

if (!skipTests) {
  run(npmCmd, ['test']);
}

fs.mkdirSync(outputDir, { recursive: true });
for (const file of fs.readdirSync(outputDir)) {
  if (/^forgeflow-.*\.vsix$/i.test(file)) {
    fs.rmSync(path.join(outputDir, file), { force: true });
  }
}

const vsixPath = path.join(outputDir, `forgeflow-${pkg.version}.vsix`);
const packageArgs = ['vsce', 'package', '--out', vsixPath];
if (preRelease) {
  packageArgs.push('--pre-release');
}
run(npxCmd, packageArgs);

if (publishMarketplace) {
  if (!process.env.VSCE_PAT) {
    throw new Error('VSCE_PAT is required to publish to the Visual Studio Marketplace.');
  }

  const publishArgs = ['vsce', 'publish', '--packagePath', vsixPath];
  if (preRelease) {
    publishArgs.push('--pre-release');
  }
  run(npxCmd, publishArgs);
}

console.log(`\nVSIX ready: ${vsixPath}`);
