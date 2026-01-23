import * as vscode from 'vscode';

type QuotePair = { begin: string; end: string };

type QuoteConfigEntry =
  | string
  | [string, string]
  | {
    begin: string;
    end: string;
  };

export function registerToggleQuotes(context: vscode.ExtensionContext): void {
  try {
    const disposable = vscode.commands.registerCommand('forgeflow.toggleQuotes', () => {
      toggleQuotes();
    });
    context.subscriptions.push(disposable);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`ForgeFlow: Skipping toggle quotes registration (${message}).`);
  }
}

function toggleQuotes(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  let chars: QuotePair[] = [];
  try {
    chars = getChars(editor);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid forgeflow.toggleQuotes.chars configuration.';
    void vscode.window.showErrorMessage(message);
    return;
  }

  if (chars.length === 0) {
    return;
  }

  const document = editor.document;
  const changes: Array<{ char: string; range: vscode.Range }> = [];

  for (const selection of editor.selections) {
    const line = document.lineAt(selection.start.line);
    const charInfo = findChar(chars, line.text, selection);
    if (!charInfo) {
      continue;
    }

    const foundIndex = chars.indexOf(charInfo.foundQuotes);
    if (foundIndex === -1) {
      continue;
    }

    const nextChar = chars[(foundIndex + 1) % chars.length];
    if (!nextChar) {
      continue;
    }
    const startPos = new vscode.Position(selection.start.line, charInfo.start);
    const endPos = new vscode.Position(selection.start.line, charInfo.end);

    changes.push({
      char: nextChar.begin,
      range: new vscode.Range(startPos, startPos.translate(0, 1))
    });
    changes.push({
      char: nextChar.end,
      range: new vscode.Range(endPos, endPos.translate(0, 1))
    });
  }

  if (changes.length === 0) {
    return;
  }

  void editor.edit((editBuilder) => {
    for (const change of changes) {
      editBuilder.replace(change.range, change.char);
    }
  });
}

function findChar(
  chars: QuotePair[],
  text: string,
  selection: vscode.Selection
): { start: number; end: number; foundQuotes: QuotePair } | null {
  let start = -1;
  let end = -1;
  let foundQuotes: QuotePair | null = null;

  const endIndex = Math.min(selection.end.character, text.length);
  for (let i = endIndex; i < text.length; i += 1) {
    const current = text[i];
    const previous = i > 0 ? text[i - 1] : undefined;
    if (previous === '\\') {
      continue;
    }
    const match = chars.find((quotes) => quotes.end === current);
    if (match) {
      foundQuotes = match;
      end = i;
      break;
    }
  }

  if (!foundQuotes) {
    return null;
  }

  const startIndex = Math.min(selection.start.character, text.length);
  for (let i = startIndex - 1; i >= 0; i -= 1) {
    const current = text[i];
    const previous = i > 0 ? text[i - 1] : undefined;
    if (previous === '\\') {
      continue;
    }
    if (foundQuotes.begin === current) {
      start = i;
      break;
    }
  }

  if (start > -1 && end > -1) {
    return { start, end, foundQuotes };
  }

  return null;
}

function getChars(editor: vscode.TextEditor): QuotePair[] {
  const config = vscode.workspace.getConfiguration('forgeflow', editor.document);
  const maybeChars = config.get<unknown>('toggleQuotes.chars');
  return resolveChars(maybeChars);
}

function resolveChars(value: unknown): QuotePair[] {
  const maybeChars = value;
  if (!Array.isArray(maybeChars)) {
    return [];
  }

  return maybeChars.map((char) => normalizeChars(char as QuoteConfigEntry));
}

function normalizeChars(char: QuoteConfigEntry): QuotePair {
  if (typeof char === 'string') {
    return { begin: char, end: char };
  }

  if (Array.isArray(char)) {
    if (char.length !== 2 || !char.every((entry) => typeof entry === 'string')) {
      throw new Error('Wrong forgeflow.toggleQuotes.chars array quotes pair format. Use ["<", ">"]');
    }
    return { begin: char[0], end: char[1] };
  }

  if (typeof char === 'object' && char !== null) {
    const value = char as { begin?: unknown; end?: unknown };
    if (typeof value.begin !== 'string' || typeof value.end !== 'string') {
      throw new Error('Wrong forgeflow.toggleQuotes.chars object quotes pair format. Use { "begin": "<", "end": ">" } ');
    }
    return { begin: value.begin, end: value.end };
  }

  throw new Error('Wrong forgeflow.toggleQuotes.chars value type. Use string or [string, string] or { "begin": string, "end": string }');
}
