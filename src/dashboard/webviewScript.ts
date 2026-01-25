import { dashboardWebviewScriptPartA } from './webviewScriptPartA';
import { dashboardWebviewScriptPartB } from './webviewScriptPartB';
import { dashboardWebviewScriptPartC } from './webviewScriptPartC';

export function renderDashboardScript(initialStateJson: string): string {
  return `
${dashboardWebviewScriptPartA}${initialStateJson}${dashboardWebviewScriptPartB}${dashboardWebviewScriptPartC}
  `;
}
