import * as vscode from 'vscode';

export class ForgeFlowLogger {
  private readonly channel: vscode.OutputChannel;

  public constructor() {
    this.channel = vscode.window.createOutputChannel('ForgeFlow');
  }

  public info(message: string): void {
    this.channel.appendLine(`[INFO] ${message}`);
  }

  public warn(message: string): void {
    this.channel.appendLine(`[WARN] ${message}`);
  }

  public error(message: string): void {
    this.channel.appendLine(`[ERROR] ${message}`);
  }

  public show(): void {
    this.channel.show(true);
  }
}
