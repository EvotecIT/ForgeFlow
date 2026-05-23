import * as vscode from 'vscode';

const FOLDING_COMMANDS: Array<{ command: string; vscodeCommand: string }> = [
  { command: 'forgeflow.folding.fold', vscodeCommand: 'editor.fold' },
  { command: 'forgeflow.folding.foldRecursively', vscodeCommand: 'editor.foldRecursively' },
  { command: 'forgeflow.folding.foldAllBlockComments', vscodeCommand: 'editor.foldAllBlockComments' },
  { command: 'forgeflow.folding.unfold', vscodeCommand: 'editor.unfold' },
  { command: 'forgeflow.folding.unfoldRecursively', vscodeCommand: 'editor.unfoldRecursively' },
  { command: 'forgeflow.folding.foldAll', vscodeCommand: 'editor.foldAll' },
  { command: 'forgeflow.folding.unfoldAll', vscodeCommand: 'editor.unfoldAll' },
  { command: 'forgeflow.folding.createRange', vscodeCommand: 'editor.createFoldingRangeFromSelection' },
  { command: 'forgeflow.folding.createRanges', vscodeCommand: 'editor.createFoldingRangeFromSelection' },
  { command: 'forgeflow.folding.removeRangesOfSelection', vscodeCommand: 'editor.removeManualFoldingRanges' },
  { command: 'forgeflow.folding.removeRangesOfSelections', vscodeCommand: 'editor.removeManualFoldingRanges' },
  { command: 'forgeflow.folding.removeRangesHere', vscodeCommand: 'editor.removeManualFoldingRanges' }
];

export function registerFoldingCommands(context: vscode.ExtensionContext): void {
  for (const entry of FOLDING_COMMANDS) {
    context.subscriptions.push(
      vscode.commands.registerCommand(entry.command, async () => {
        await vscode.commands.executeCommand(entry.vscodeCommand);
      })
    );
  }
}
