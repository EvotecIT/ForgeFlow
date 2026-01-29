import * as vscode from 'vscode';
import { quoteShellArg } from '../../run/runByFile';

let runByFileTerminal: vscode.Terminal | undefined;

export function runShellCommand(
  command: string,
  workingDirectory: string | undefined,
  reuseTerminal: boolean
): void {
  const terminal = getRunByFileTerminal(reuseTerminal, workingDirectory);
  terminal.show(true);
  if (workingDirectory && reuseTerminal) {
    terminal.sendText(`cd ${quoteShellArg(workingDirectory)}`, true);
  }
  terminal.sendText(command, true);
}

export function handleRunTerminalClosed(terminal: vscode.Terminal): void {
  if (terminal === runByFileTerminal) {
    runByFileTerminal = undefined;
  }
}

function getRunByFileTerminal(reuse: boolean, cwd?: string): vscode.Terminal {
  if (reuse && runByFileTerminal) {
    return runByFileTerminal;
  }
  const terminal = vscode.window.createTerminal({
    name: 'ForgeFlow: Run',
    cwd
  });
  if (reuse) {
    runByFileTerminal = terminal;
  }
  return terminal;
}
