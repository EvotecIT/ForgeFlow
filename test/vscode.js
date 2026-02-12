class EventEmitter {
  constructor() {
    this.listeners = [];
    this.event = (listener) => {
      this.listeners.push(listener);
      return { dispose: () => this.remove(listener) };
    };
  }

  fire(data) {
    for (const listener of this.listeners.slice()) {
      listener(data);
    }
  }

  dispose() {
    this.listeners = [];
  }

  remove(listener) {
    this.listeners = this.listeners.filter((item) => item !== listener);
  }
}

class ThemeIcon {
  constructor(id) {
    this.id = id;
  }
}

class TreeItem {
  constructor(label, collapsibleState) {
    this.label = label;
    this.collapsibleState = collapsibleState;
    this.contextValue = undefined;
    this.description = undefined;
    this.iconPath = undefined;
    this.command = undefined;
    this.tooltip = undefined;
    this.resourceUri = undefined;
  }
}

const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2
};

const FileType = {
  Unknown: 0,
  File: 1,
  Directory: 2,
  SymbolicLink: 64
};

class Uri {
  constructor(fsPath) {
    this.fsPath = fsPath;
    this.scheme = 'file';
  }

  static file(fsPath) {
    return new Uri(fsPath);
  }

  toString() {
    return this.fsPath;
  }
}

const fs = require('fs');
const path = require('path');
const fsp = fs.promises;

async function stat(uri) {
  const stats = await fsp.stat(uri.fsPath);
  return {
    type: stats.isDirectory() ? FileType.Directory : FileType.File,
    ctime: stats.ctimeMs,
    mtime: stats.mtimeMs,
    size: stats.size
  };
}

async function readDirectory(uri) {
  const entries = await fsp.readdir(uri.fsPath, { withFileTypes: true });
  return entries.map((entry) => [
    entry.name,
    entry.isDirectory() ? FileType.Directory : FileType.File
  ]);
}

async function readFile(uri) {
  return await fsp.readFile(uri.fsPath);
}

async function writeFile(uri, data) {
  await fsp.writeFile(uri.fsPath, data);
}

async function createDirectory(uri) {
  await fsp.mkdir(uri.fsPath, { recursive: true });
}

async function deleteFile(uri, options) {
  const recursive = options?.recursive ?? false;
  if (recursive) {
    await fsp.rm(uri.fsPath, { recursive: true, force: true });
    return;
  }
  await fsp.unlink(uri.fsPath);
}

async function rename(uri, target, options) {
  if (options?.overwrite === false && fs.existsSync(target.fsPath)) {
    const err = new Error('EEXIST');
    err.code = 'EEXIST';
    throw err;
  }
  await fsp.rename(uri.fsPath, target.fsPath);
}

async function copy(uri, target, options) {
  if (options?.overwrite === false && fs.existsSync(target.fsPath)) {
    const err = new Error('EEXIST');
    err.code = 'EEXIST';
    throw err;
  }
  if (fsp.cp) {
    await fsp.cp(uri.fsPath, target.fsPath, { recursive: true, force: options?.overwrite !== false });
    return;
  }
  const stats = await fsp.stat(uri.fsPath);
  if (stats.isDirectory()) {
    await fsp.mkdir(target.fsPath, { recursive: true });
    const entries = await fsp.readdir(uri.fsPath);
    for (const entry of entries) {
      await copy(
        Uri.file(path.join(uri.fsPath, entry)),
        Uri.file(path.join(target.fsPath, entry)),
        options
      );
    }
    return;
  }
  await fsp.copyFile(uri.fsPath, target.fsPath);
}

const workspace = {
  fs: {
    stat,
    readFile,
    readDirectory,
    writeFile,
    createDirectory,
    delete: deleteFile,
    rename,
    copy
  },
  workspaceFolders: undefined,
  getWorkspaceFolder: () => undefined
};

const window = {
  showWarningMessage: async () => undefined,
  showInformationMessage: async () => undefined,
  setStatusBarMessage: () => undefined,
  activeTextEditor: undefined
};

const env = {
  clipboard: {
    writeText: async () => undefined
  }
};

const commands = {
  executeCommand: async () => undefined
};

module.exports = {
  EventEmitter,
  ThemeIcon,
  TreeItem,
  TreeItemCollapsibleState,
  FileType,
  Uri,
  workspace,
  window,
  env,
  commands
};
