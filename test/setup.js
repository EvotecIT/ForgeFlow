const path = require('path');
const Module = require('module');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request === 'vscode') {
    return path.resolve(__dirname, 'vscode.js');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};
