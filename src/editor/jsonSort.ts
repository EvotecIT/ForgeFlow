import * as vscode from 'vscode';
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';

type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
type JsonObject = { [key: string]: JsonValue };

export type JsonSortMode = 'alpha' | 'keyLength' | 'alphaNumeric' | 'value' | 'type';
export type JsonSortDirection = 'asc' | 'desc';

export interface JsonSortOptions {
  mode: JsonSortMode;
  direction: JsonSortDirection;
  orderOverride?: string[];
  orderUnderride?: string[];
  indent?: number;
  finalNewline?: boolean;
}

interface JsonSortConfig {
  orderOverride: string[];
  orderUnderride: string[];
  excludedFiles: string[];
  excludedPaths: string[];
}

const COMMANDS: Array<{ command: string; mode: JsonSortMode; direction: JsonSortDirection }> = [
  { command: 'forgeflow.json.sortKeys', mode: 'alpha', direction: 'asc' },
  { command: 'forgeflow.json.sortKeysReverse', mode: 'alpha', direction: 'desc' },
  { command: 'forgeflow.json.sortKeysByLength', mode: 'keyLength', direction: 'asc' },
  { command: 'forgeflow.json.sortKeysByLengthReverse', mode: 'keyLength', direction: 'desc' },
  { command: 'forgeflow.json.sortKeysAlphaNumeric', mode: 'alphaNumeric', direction: 'asc' },
  { command: 'forgeflow.json.sortKeysAlphaNumericReverse', mode: 'alphaNumeric', direction: 'desc' },
  { command: 'forgeflow.json.sortKeysByValue', mode: 'value', direction: 'asc' },
  { command: 'forgeflow.json.sortKeysByValueReverse', mode: 'value', direction: 'desc' },
  { command: 'forgeflow.json.sortKeysByType', mode: 'type', direction: 'asc' },
  { command: 'forgeflow.json.sortKeysByTypeReverse', mode: 'type', direction: 'desc' }
];

export function registerJsonSort(context: vscode.ExtensionContext): void {
  for (const entry of COMMANDS) {
    context.subscriptions.push(
      vscode.commands.registerCommand(entry.command, async () => {
        await sortActiveJson(entry.mode, entry.direction);
      })
    );
  }
}

export function sortJsonText(text: string, options: JsonSortOptions): string {
  const errors: ParseError[] = [];
  const parsed = parse(text, errors, { allowTrailingComma: true, disallowComments: false }) as JsonValue;
  if (errors.length > 0) {
    const error = errors[0];
    if (!error) {
      throw new Error('Invalid JSON.');
    }
    throw new Error(`Invalid JSON: ${printParseErrorCode(error.error)} at offset ${error.offset}.`);
  }

  const sorted = sortJsonValue(parsed, options);
  const indent = options.indent ?? detectIndent(text);
  const rendered = JSON.stringify(sorted, null, indent);
  return options.finalNewline ? `${rendered}\n` : rendered;
}

export function sortJsonValue(value: JsonValue, options: JsonSortOptions): JsonValue {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJsonValue(entry, options));
  }

  if (!isJsonObject(value)) {
    return value;
  }

  const keys = orderKeys(Object.keys(value), value, options);
  const sorted: JsonObject = {};
  for (const key of keys) {
    const entry = value[key];
    if (entry !== undefined) {
      sorted[key] = sortJsonValue(entry, options);
    }
  }
  return sorted;
}

export function orderKeys(keys: string[], object: JsonObject, options: JsonSortOptions): string[] {
  const directionFactor = options.direction === 'asc' ? 1 : -1;
  const ordered = [...keys].sort((left, right) => {
    const comparison = compareKeys(left, right, object, options.mode);
    return comparison * directionFactor;
  });

  moveConfiguredKeys(ordered, options.orderOverride ?? [], 'front');
  moveConfiguredKeys(ordered, options.orderUnderride ?? [], 'back');
  return ordered;
}

function compareKeys(left: string, right: string, object: JsonObject, mode: JsonSortMode): number {
  switch (mode) {
    case 'keyLength': {
      const byLength = left.length - right.length;
      return byLength !== 0 ? byLength : compareAlpha(left, right, false);
    }
    case 'alphaNumeric':
      return compareAlpha(left, right, true);
    case 'value':
      return compareValues(object[left], object[right]) || compareAlpha(left, right, true);
    case 'type':
      return valueRank(object[left]) - valueRank(object[right]) || compareAlpha(left, right, true);
    case 'alpha':
    default:
      return compareAlpha(left, right, false);
  }
}

function compareAlpha(left: string, right: string, numeric: boolean): number {
  return left.localeCompare(right, 'en', { numeric, sensitivity: 'base' });
}

function compareValues(left: JsonValue | undefined, right: JsonValue | undefined): number {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  if (typeof left === 'string' && typeof right === 'string') {
    return left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' });
  }
  if (typeof left === 'number' && typeof right === 'string') {
    return -1;
  }
  if (typeof left === 'string' && typeof right === 'number') {
    return 1;
  }
  return valueRank(left) - valueRank(right);
}

function valueRank(value: JsonValue | undefined): number {
  if (typeof value === 'number') {
    return 1;
  }
  if (typeof value === 'string') {
    return 2;
  }
  if (Array.isArray(value)) {
    return 3;
  }
  if (isJsonObject(value)) {
    return 4;
  }
  if (typeof value === 'boolean') {
    return 5;
  }
  if (value === null) {
    return 6;
  }
  return 7;
}

function moveConfiguredKeys(keys: string[], configuredKeys: string[], target: 'front' | 'back'): void {
  const orderedConfig = target === 'front' ? [...configuredKeys].reverse() : configuredKeys;
  for (const configuredKey of orderedConfig) {
    const index = keys.indexOf(configuredKey);
    if (index < 0) {
      continue;
    }
    const [key] = keys.splice(index, 1);
    if (!key) {
      continue;
    }
    if (target === 'front') {
      keys.unshift(key);
    } else {
      keys.push(key);
    }
  }
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function detectIndent(text: string): number {
  const line = text.split(/\r?\n/).find((entry) => /^ +"/.test(entry));
  return line?.match(/^ +/)?.[0].length ?? 2;
}

async function sortActiveJson(mode: JsonSortMode, direction: JsonSortDirection): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  const selection = editor.selection;
  const range = selection.isEmpty ? fullDocumentRange(document) : selection;
  if (selection.isEmpty && isExcludedDocument(document, readConfig())) {
    void vscode.window.showWarningMessage('ForgeFlow: This JSON file is excluded from sorting.');
    return;
  }

  try {
    const text = document.getText(range);
    let sorted = sortJsonText(text, {
      mode,
      direction,
      ...readConfig(),
      indent: detectIndent(document.getText()),
      finalNewline: selection.isEmpty && document.getText().endsWith('\n')
    });
    if (!selection.isEmpty) {
      sorted = applySelectionBaseIndent(sorted, range.start.character);
    }
    await editor.edit((editBuilder) => {
      editBuilder.replace(range, sorted);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown JSON sort error.';
    void vscode.window.showErrorMessage(`ForgeFlow: ${message}`);
  }
}

function fullDocumentRange(document: vscode.TextDocument): vscode.Range {
  const lastLineIndex = Math.max(0, document.lineCount - 1);
  const lastLine = document.lineAt(lastLineIndex);
  return new vscode.Range(0, 0, lastLineIndex, lastLine.text.length);
}

function readConfig(): JsonSortConfig {
  const config = vscode.workspace.getConfiguration('forgeflow');
  return {
    orderOverride: toStringArray(config.get<unknown>('jsonSort.orderOverride')),
    orderUnderride: toStringArray(config.get<unknown>('jsonSort.orderUnderride')),
    excludedFiles: toStringArray(config.get<unknown>('jsonSort.excludedFiles')),
    excludedPaths: toStringArray(config.get<unknown>('jsonSort.excludedPaths'))
  };
}

function isExcludedDocument(document: vscode.TextDocument, config: JsonSortConfig): boolean {
  const filePath = document.uri.fsPath.replace(/\\/g, '/');
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const relativePath = workspaceFolder
    ? filePath.slice(workspaceFolder.uri.fsPath.replace(/\\/g, '/').length + 1)
    : filePath.split('/').pop() ?? filePath;

  return config.excludedFiles.includes(relativePath)
    || config.excludedFiles.includes(filePath.split('/').pop() ?? '')
    || config.excludedPaths.some((excludedPath) => relativePath.startsWith(excludedPath.replace(/\\/g, '/')));
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

export function applySelectionBaseIndent(text: string, baseColumn: number): string {
  if (baseColumn <= 0 || !text.includes('\n')) {
    return text;
  }
  const baseIndent = ' '.repeat(baseColumn);
  return text.split('\n').map((line, index) => index === 0 ? line : `${baseIndent}${line}`).join('\n');
}
