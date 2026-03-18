import * as vscode from 'vscode';
import type { JsonRecord } from './utils';

export async function writeJsonFile(filePath: string, data: JsonRecord): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(json, 'utf8'));
}

