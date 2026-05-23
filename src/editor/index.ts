import type * as vscode from 'vscode';
import { registerExcelMarkdown } from './excelMarkdown';
import { registerFoldingCommands } from './folding';
import { registerJsonSort } from './jsonSort';
import { registerToggleQuotes } from './toggleQuotes';
import { registerUnicodeSubstitutions } from './unicodeSubstitutions';

export function registerEditorTools(context: vscode.ExtensionContext): void {
  registerExcelMarkdown(context);
  registerFoldingCommands(context);
  registerJsonSort(context);
  registerToggleQuotes(context);
  registerUnicodeSubstitutions(context);
}
