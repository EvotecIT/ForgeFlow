const fs = require('fs');
const path = require('path');

const MAX_LINES = Number(process.env.MAX_LINES || 700);
const ROOTS = [path.join(__dirname, '..', 'src')];
const EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'coverage', 'dist', 'build']);

const violations = [];

function countLines(text) {
  if (!text) return 0;
  return text
    .split(/\r\n|\r|\n/)
    .filter((line) => line.trim().length > 0)
    .length;
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      if (entry.isDirectory()) continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(fullPath);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!EXTENSIONS.has(ext)) continue;
    const text = fs.readFileSync(fullPath, 'utf8');
    const lines = countLines(text);
    if (lines > MAX_LINES) {
      violations.push({ file: fullPath, lines });
    }
  }
}

for (const root of ROOTS) {
  if (fs.existsSync(root)) {
    walk(root);
  }
}

if (violations.length > 0) {
  console.error(`Line limit exceeded (max ${MAX_LINES} lines):`);
  for (const { file, lines } of violations.sort((a, b) => b.lines - a.lines)) {
    console.error(`- ${path.relative(process.cwd(), file)}: ${lines}`);
  }
  process.exit(1);
}

console.log(`Line count check passed (max ${MAX_LINES} lines).`);
