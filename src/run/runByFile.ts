export function renderCommandTemplate(
  template: string,
  values: { file: string; project: string; projectDir: string }
): string {
  return template
    .replace(/\{file\}/g, quoteShellArg(values.file))
    .replace(/\{project\}/g, quoteShellArg(values.project))
    .replace(/\{projectDir\}/g, quoteShellArg(values.projectDir));
}

export function quoteShellArg(value: string): string {
  if (!value) {
    return '""';
  }
  const escaped = value.replace(/\"/g, '\\"');
  return `"${escaped}"`;
}
