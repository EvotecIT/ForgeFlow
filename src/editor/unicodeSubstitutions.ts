import * as vscode from 'vscode';

export interface UnicodeSubstitutionRule {
  invalid: string;
  valid: string;
  message: string;
}

const DEFAULT_RULES: UnicodeSubstitutionRule[] = [
  { invalid: '\\u2013', valid: '\\u002D', message: 'En dash should be a hyphen.' },
  { invalid: '\\u2014', valid: '\\u002D', message: 'Em dash should be a hyphen' },
  { invalid: '\\u2015', valid: '\\u002D', message: 'Horizontal Bar should be a hyphen' },
  { invalid: '\\u2018', valid: '\\u0027', message: 'Start single quote should be straight single quote' },
  { invalid: '\\u2019', valid: '\\u0027', message: 'End single quote should be straight single quote' },
  { invalid: '\\u201C', valid: '\\u0022', message: 'Start double quotes should be straight double quotes' },
  { invalid: '\\u201D', valid: '\\u0022', message: 'End double quotes should be straight double quotes' },
  { invalid: '\\u201E', valid: '\\u0022', message: 'Low double quotes should be straight double quotes' },
  { invalid: '\\u201F', valid: '\\u0022', message: 'High double quotes should be straight double quotes' },
  { invalid: '\\uD83D\\uDE42', valid: '\\u003A\\u0029', message: 'Slightly smiling face should be a colon and parentheses' },
  { invalid: '\\uD83D\\uDE0A', valid: '\\u003A\\u0029', message: 'Smiling face with smiling eyes should be a colon and parentheses' },
  { invalid: '\\u00A0', valid: '\\u0020', message: 'Non breaking space should be a space.' }
];

const FIX_LINE_COMMAND = 'forgeflow.unicodeSubstitutions.fixLine';
const DIAGNOSTIC_SOURCE = 'Unicode Substitutions';

interface UnicodeConfigState {
  rules: UnicodeSubstitutionRule[];
  enableDefaultRules: boolean | Record<string, unknown>;
  enableFormatting: boolean | Record<string, unknown>;
  enabledLanguageIds: string[];
}

export function registerUnicodeSubstitutions(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  let activeEditor = vscode.window.activeTextEditor;
  let configState = readConfig();

  let fixLineDisposable: vscode.Disposable | undefined;
  try {
    fixLineDisposable = vscode.commands.registerCommand(FIX_LINE_COMMAND, (range: vscode.Range, ruleIndex: number) => {
      if (!activeEditor) {
        return;
      }
      void fixLine(activeEditor.document, range, ruleIndex, configState, activeEditor.document.languageId);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`ForgeFlow: Skipping unicode substitutions registration (${message}).`);
    diagnostics.dispose();
    return;
  }

  const updateFromConfig = (): void => {
    configState = readConfig();
    if (activeEditor) {
      updateLinting(activeEditor.document, diagnostics, configState);
    }
  };

  const selector: vscode.DocumentSelector = [{ scheme: '*' }];

  context.subscriptions.push(
    diagnostics,
    fixLineDisposable,
    vscode.languages.registerCodeActionsProvider(selector, {
      provideCodeActions: (document, _range, codeActionContext) => {
        if (!isLanguageEnabled(document, configState.enabledLanguageIds)) {
          return [];
        }
        const diagnosticsForSource = (codeActionContext.diagnostics ?? []).filter(
          (diagnostic) => diagnostic.source === DIAGNOSTIC_SOURCE
        );
        if (diagnosticsForSource.length === 0) {
          return [];
        }
        return provideCodeActions(diagnosticsForSource, configState, document.languageId);
      }
    }),
    vscode.languages.registerDocumentFormattingEditProvider(selector, {
      provideDocumentFormattingEdits(document) {
        return formatDocument(document, null, configState, document.languageId);
      }
    }),
    vscode.languages.registerDocumentRangeFormattingEditProvider(selector, {
      provideDocumentRangeFormattingEdits(document, range) {
        return formatDocument(document, range, configState, document.languageId);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      activeEditor = editor;
      if (editor) {
        updateLinting(editor.document, diagnostics, configState);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (activeEditor && event.document === activeEditor.document) {
        updateLinting(event.document, diagnostics, configState);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('forgeflow.unicodeSubstitutions')) {
        updateFromConfig();
      }
    })
  );

  if (activeEditor) {
    updateLinting(activeEditor.document, diagnostics, configState);
  }
}

function readConfig(): UnicodeConfigState {
  const forgeConfig = vscode.workspace.getConfiguration('forgeflow');
  const rules = forgeConfig.get<UnicodeSubstitutionRule[]>('unicodeSubstitutions.rules') ?? [];
  const enableDefaultRules = forgeConfig.get<boolean | Record<string, unknown>>(
    'unicodeSubstitutions.enableDefaultRules',
    true
  );
  const enableFormatting = forgeConfig.get<boolean | Record<string, unknown>>(
    'unicodeSubstitutions.enableFormatting',
    true
  );
  const enabledLanguageIds = forgeConfig.get<string[]>('unicodeSubstitutions.enabledLanguageIds', ['*']);
  return {
    rules: Array.isArray(rules) ? rules : [],
    enableDefaultRules,
    enableFormatting,
    enabledLanguageIds: Array.isArray(enabledLanguageIds) ? enabledLanguageIds : ['*']
  };
}

function isLanguageEnabled(document: vscode.TextDocument, enabledLanguageIds: string[]): boolean {
  if (enabledLanguageIds.length === 0) {
    return false;
  }
  if (enabledLanguageIds.includes('*')) {
    return true;
  }
  return enabledLanguageIds.includes(document.languageId);
}

function resolveBooleanSetting(setting: boolean | Record<string, unknown>, languageId: string): boolean {
  if (typeof setting === 'boolean') {
    return setting;
  }
  if (!setting || typeof setting !== 'object') {
    return true;
  }
  const record = setting as Record<string, unknown>;
  const direct = record[languageId];
  if (typeof direct === 'boolean') {
    return direct;
  }
  const wildcard = record['*'];
  if (typeof wildcard === 'boolean') {
    return wildcard;
  }
  return true;
}

function getLintingRules(config: UnicodeConfigState, languageId: string): UnicodeSubstitutionRule[] {
  const rules: UnicodeSubstitutionRule[] = [];
  const enableDefaults = resolveBooleanSetting(config.enableDefaultRules, languageId);
  if (enableDefaults) {
    rules.push(...DEFAULT_RULES);
  }
  if (Array.isArray(config.rules)) {
    for (const rule of config.rules) {
      if (isValidRule(rule)) {
        rules.push(rule);
      }
    }
  }
  return rules;
}

function isValidRule(rule: UnicodeSubstitutionRule): boolean {
  return Boolean(rule
    && typeof rule.invalid === 'string'
    && typeof rule.valid === 'string'
    && typeof rule.message === 'string');
}

function stringToRegex(pattern: string): RegExp {
  return new RegExp(pattern, 'g');
}

function unicodeToChar(text: string): string {
  return text.replace(/\\u[\dA-F]{4}/gi, (match) => {
    return String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16));
  });
}

function formatDocument(
  document: vscode.TextDocument,
  range: vscode.Range | null,
  config: UnicodeConfigState,
  languageId: string
): vscode.TextEdit[] {
  if (!resolveBooleanSetting(config.enableFormatting, languageId)) {
    return [];
  }
  if (!isLanguageEnabled(document, config.enabledLanguageIds)) {
    return [];
  }
  let effectiveRange = range;
  if (!effectiveRange) {
    const start = new vscode.Position(0, 0);
    const endLine = document.lineCount > 0 ? document.lineCount - 1 : 0;
    const end = new vscode.Position(endLine, document.lineAt(endLine).text.length);
    effectiveRange = new vscode.Range(start, end);
  }

  const rules = getLintingRules(config, languageId);
  const edits: vscode.TextEdit[] = [];
  const text = document.getText(effectiveRange);
  const offset = document.offsetAt(effectiveRange.start);

  for (const rule of rules) {
    const regEx = stringToRegex(rule.invalid);
    const replacement = unicodeToChar(rule.valid);
    let match: RegExpExecArray | null;

    while ((match = regEx.exec(text)) !== null) {
      const startPos = document.positionAt(offset + match.index);
      const endPos = document.positionAt(offset + match.index + match[0].length);
      edits.push(vscode.TextEdit.replace(new vscode.Range(startPos, endPos), replacement));
    }
  }

  return edits;
}

function updateLinting(
  document: vscode.TextDocument,
  diagnostics: vscode.DiagnosticCollection,
  config: UnicodeConfigState
): void {
  if (!isLanguageEnabled(document, config.enabledLanguageIds)) {
    diagnostics.delete(document.uri);
    return;
  }

  const rules = getLintingRules(config, document.languageId);
  if (rules.length === 0) {
    diagnostics.delete(document.uri);
    return;
  }

  const text = document.getText();
  const results: vscode.Diagnostic[] = [];

  rules.forEach((rule, index) => {
    const regEx = stringToRegex(rule.invalid);
    let match: RegExpExecArray | null;

    while ((match = regEx.exec(text)) !== null) {
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      const range = new vscode.Range(startPos, endPos);
      const diagnostic = new vscode.Diagnostic(range, rule.message, vscode.DiagnosticSeverity.Warning);
      diagnostic.code = index;
      diagnostic.source = DIAGNOSTIC_SOURCE;
      results.push(diagnostic);
    }
  });

  diagnostics.set(document.uri, results);
}

function provideCodeActions(
  diagnostics: vscode.Diagnostic[],
  config: UnicodeConfigState,
  languageId: string
): vscode.CodeAction[] {
  const rules = getLintingRules(config, languageId);
  return diagnostics.map((diagnostic) => {
    const codeIndex = typeof diagnostic.code === 'number' ? diagnostic.code : Number(diagnostic.code);
    const rule = rules[codeIndex];
    const title = rule ? rule.message : 'Apply unicode substitution';
    const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
    action.command = {
      title,
      command: FIX_LINE_COMMAND,
      arguments: [diagnostic.range, codeIndex]
    };
    action.diagnostics = [diagnostic];
    return action;
  });
}

async function fixLine(
  document: vscode.TextDocument,
  range: vscode.Range,
  ruleIndex: number,
  config: UnicodeConfigState,
  languageId: string
): Promise<void> {
  const rules = getLintingRules(config, languageId);
  const rule = rules[ruleIndex];
  if (!rule) {
    return;
  }

  const replacement = unicodeToChar(rule.valid);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, range, replacement);
  await vscode.workspace.applyEdit(edit);
}
