export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#039;';
      default:
        return char;
    }
  });
}

export function renderSelectOption(value: string, current?: string): string {
  return `<option value="${escapeHtml(value)}" ${current === value ? 'selected' : ''}>${escapeHtml(value)}</option>`;
}

export function renderSectionSummary(label: string, configured: boolean, note?: string): string {
  const noteValue = note ? note.trim() : '';
  const noteHtml = noteValue ? `<span class="summary-meta">${escapeHtml(noteValue)}</span>` : '';
  const badge = configured ? '<span class="badge">configured</span>' : '';
  return `<span class="summary-row"><span class="summary-left"><span class="summary-label">${escapeHtml(label)}</span>${noteHtml}</span>${badge}</span>`;
}

export function renderDependencyRows(
  deps?: Array<{
    kind: string;
    moduleName: string;
    moduleVersion?: string | null;
    minimumVersion?: string | null;
    requiredVersion?: string | null;
    guid?: string | null;
  }>
): string {
  if (!deps || deps.length === 0) {
    return '';
  }
  return deps.map((dep) => {
    const kind = dep.kind || 'RequiredModule';
    return `
      <div class="dep-row pf-dep-row" data-dependency-row>
        <select data-field="kind">
          ${renderSelectOption('RequiredModule', kind)}
          ${renderSelectOption('ExternalModule', kind)}
          ${renderSelectOption('ApprovedModule', kind)}
        </select>
        <input data-field="moduleName" value="${escapeHtml(dep.moduleName ?? '')}" placeholder="Module name" />
        <input data-field="moduleVersion" value="${escapeHtml(dep.moduleVersion ?? '')}" placeholder="Module version" />
        <input data-field="minimumVersion" value="${escapeHtml(dep.minimumVersion ?? '')}" placeholder="Minimum version" />
        <input data-field="requiredVersion" value="${escapeHtml(dep.requiredVersion ?? '')}" placeholder="Required version" />
        <input data-field="guid" value="${escapeHtml(dep.guid ?? '')}" placeholder="Guid" />
        <button class="secondary" data-action="removeDependency" type="button">Remove</button>
      </div>
    `;
  }).join('\n');
}

export function renderPlaceholderRows(entries?: Array<{ find: string; replace: string }>): string {
  if (!entries || entries.length === 0) {
    return '';
  }
  return entries.map((entry) => `
      <div class="placeholder-row pf-placeholder-row" data-placeholder-row>
        <input data-field="find" value="${escapeHtml(entry.find ?? '')}" placeholder="Find" />
        <input data-field="replace" value="${escapeHtml(entry.replace ?? '')}" placeholder="Replace" />
        <button class="secondary" data-action="removePlaceholder" type="button">Remove</button>
      </div>
    `).join('\n');
}

export function renderImportantLinkRows(entries?: Array<{ title: string; url: string }>): string {
  if (!entries || entries.length === 0) {
    return '';
  }
  return entries.map((entry) => `
      <div class="link-row pf-link-row" data-link-row>
        <input data-field="title" value="${escapeHtml(entry.title ?? '')}" placeholder="Title" />
        <input data-field="url" value="${escapeHtml(entry.url ?? '')}" placeholder="URL" />
        <button class="secondary" data-action="removeLink" type="button">Remove</button>
      </div>
    `).join('\n');
}

export function applyStringField(target: Record<string, any>, key: string, value: unknown): void {
  const next = String(value ?? '').trim();
  if (next) {
    target[key] = next;
  } else {
    delete target[key];
  }
}

export function parseCsv(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseLines(value: unknown): string[] {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseInteger(value: unknown): number | undefined {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  return parsed;
}

export function safeJsonParse(text: string): any | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function setRuleToggle(target: Record<string, any>, ruleName: string, enabled: unknown): void {
  if (typeof enabled !== 'boolean') {
    return;
  }
  target[ruleName] = target[ruleName] ?? {};
  target[ruleName].Enable = enabled;
}
