const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const errors = [];

const activationEvents = Array.isArray(pkg.activationEvents) ? pkg.activationEvents : [];
if (activationEvents.length > 0) {
  const contributedCommands = new Set((pkg.contributes?.commands ?? []).map((item) => item.command));
  const contributedViews = new Set();
  const views = pkg.contributes?.views ?? {};
  for (const viewList of Object.values(views)) {
    if (!Array.isArray(viewList)) {
      continue;
    }
    for (const view of viewList) {
      if (view?.id) {
        contributedViews.add(view.id);
      }
    }
  }

  const redundant = [];
  for (const activationEvent of activationEvents) {
    if (typeof activationEvent !== 'string') {
      continue;
    }
    const [kind, value] = activationEvent.split(':');
    if (kind === 'onCommand' && contributedCommands.has(value)) {
      redundant.push(activationEvent);
    }
    if (kind === 'onView' && contributedViews.has(value)) {
      redundant.push(activationEvent);
    }
  }

  if (redundant.length > 0) {
    errors.push('Redundant activationEvents detected (VS Code generates these automatically):');
    for (const event of redundant) {
      errors.push(`- ${event}`);
    }
  }
}

const validCategories = new Set([
  'AI',
  'Azure',
  'Chat',
  'Data Science',
  'Debuggers',
  'Extension Packs',
  'Education',
  'Formatters',
  'Keymaps',
  'Language Packs',
  'Linters',
  'Machine Learning',
  'Notebooks',
  'Programming Languages',
  'SCM Providers',
  'Snippets',
  'Testing',
  'Themes',
  'Visualization',
  'Other',
  'Languages'
]);
const categories = Array.isArray(pkg.categories) ? pkg.categories : [];
const invalidCategories = categories.filter((category) => !validCategories.has(category));
if (invalidCategories.length > 0) {
  errors.push(`Invalid categories in package.json: ${invalidCategories.join(', ')}`);
}

const viewEntries = [];
const views = pkg.contributes?.views ?? {};
for (const viewList of Object.values(views)) {
  if (!Array.isArray(viewList)) {
    continue;
  }
  for (const view of viewList) {
    if (view?.id) {
      viewEntries.push(view);
    }
  }
}

const missingViewIcons = viewEntries.filter((view) => !view.icon);
if (missingViewIcons.length > 0) {
  errors.push('Views missing icon property:');
  for (const view of missingViewIcons) {
    errors.push(`- ${view.id}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
