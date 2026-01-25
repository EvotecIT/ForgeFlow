import * as vscode from 'vscode';
import { spawnSync } from 'child_process';
import type { StateStore } from '../store/stateStore';
import { LayoutStore } from '../store/layoutStore';

const ONBOARDING_KEY = 'forgeflow.onboarding.completed.v1';

export async function maybeRunOnboarding(stateStore: StateStore, context: vscode.ExtensionContext): Promise<void> {
  const completed = stateStore.getGlobal<boolean>(ONBOARDING_KEY, false);
  if (completed) {
    return;
  }
  await runOnboarding(stateStore, context);
}

export async function runOnboarding(
  stateStore: StateStore,
  context: vscode.ExtensionContext
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'forgeflow.onboarding',
    'ForgeFlow: Welcome',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  const status = readOnboardingStatus();
  const env = detectEnvironment();
  panel.webview.html = renderOnboardingHtml(panel.webview, status, env);

  let completed = false;

  panel.webview.onDidReceiveMessage(async (message: { type?: string }) => {
    try {
      switch (message.type) {
        case 'scanRoots':
          await vscode.commands.executeCommand('forgeflow.projects.configureScanRoots');
          break;
        case 'openViews':
          await openDefaultViews(stateStore);
          break;
        case 'applyViews': {
          const payload = message as { views?: ViewSelection; open?: boolean };
          await applyViewSelection(payload.views);
          if (payload.open) {
            await openSelectedViews(stateStore, payload.views);
          }
          break;
        }
        case 'openDashboard':
          await vscode.commands.executeCommand('forgeflow.dashboard.open');
          break;
        case 'configureTokens':
          await vscode.commands.executeCommand('forgeflow.dashboard.configureTokens');
          break;
        case 'openDocs': {
          const docUri = vscode.Uri.joinPath(context.extensionUri, 'docs', 'onboarding.md');
          const doc = await vscode.workspace.openTextDocument(docUri);
          await vscode.window.showTextDocument(doc, { preview: false });
          break;
        }
        case 'openSettings':
          await vscode.commands.executeCommand('workbench.action.openSettings', 'forgeflow');
          break;
        case 'enableRunByFile': {
          const config = vscode.workspace.getConfiguration('forgeflow');
          await config.update('run.byFile.enabled', true, vscode.ConfigurationTarget.Global);
          break;
        }
        case 'enableCsScript': {
          const config = vscode.workspace.getConfiguration('forgeflow');
          await config.update('run.byFile.csScriptEnabled', true, vscode.ConfigurationTarget.Global);
          break;
        }
        case 'finish':
        case 'skip':
          completed = true;
          await stateStore.setGlobal(ONBOARDING_KEY, true);
          panel.dispose();
          break;
        case 'later':
        case 'cancel':
          panel.dispose();
          break;
        default:
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[ForgeFlow] Onboarding action failed: ${message}`);
      void vscode.window.showErrorMessage(`ForgeFlow onboarding failed: ${message}`);
    }
  });

  panel.onDidDispose(() => {
    if (!completed) {
      // Panel closed without completing onboarding.
      return;
    }
  });
}

export async function openForgeFlowSelectedViews(stateStore: StateStore): Promise<void> {
  await openSelectedViews(stateStore, readOnboardingStatus().views);
}

interface ViewSelection {
  files: boolean;
  projects: boolean;
  projectsWeb: boolean;
  git: boolean;
  dashboard: boolean;
  powerforge: boolean;
}

interface OnboardingStatus {
  scanRootsConfigured: boolean;
  runByFileEnabled: boolean;
  views: ViewSelection;
}

interface EnvironmentStatus {
  git: boolean;
  pwsh: boolean;
  powershell: boolean;
  dotnet: boolean;
}

function renderOnboardingHtml(
  webview: vscode.Webview,
  status: OnboardingStatus,
  env: EnvironmentStatus
): string {
  const nonce = randomNonce();
  const scanBadge = status.scanRootsConfigured ? 'Done' : 'Pending';
  const runBadge = status.runByFileEnabled ? 'Enabled' : 'Disabled';
  const viewChecks = status.views;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ForgeFlow Onboarding</title>
  <style>
    :root {
      color-scheme: light dark;
      --ff-bg: var(--vscode-editor-background);
      --ff-fg: var(--vscode-editor-foreground);
      --ff-border: var(--vscode-panel-border);
      --ff-muted: color-mix(in srgb, var(--ff-fg) 65%, transparent);
      --ff-accent: var(--vscode-textLink-foreground);
    }
    html, body {
      height: 100%;
    }
    body {
      margin: 0;
      font-family: var(--vscode-font-family);
      background: var(--ff-bg);
      color: var(--ff-fg);
    }
    .page {
      min-height: 100vh;
      padding: 32px 24px 48px;
      max-width: 1100px;
      margin: 0 auto;
      display: grid;
      gap: 20px;
    }
    h1 {
      font-size: 26px;
      margin: 0;
    }
    p {
      margin: 0;
      color: var(--ff-muted);
    }
    .card {
      border: 1px solid var(--ff-border);
      border-radius: 16px;
      padding: 18px;
      display: grid;
      gap: 12px;
      background: color-mix(in srgb, var(--ff-fg) 3%, transparent);
    }
    .checklist {
      display: grid;
      gap: 8px;
    }
    .check {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid var(--ff-border);
      background: color-mix(in srgb, var(--ff-fg) 4%, transparent);
      font-size: 12px;
    }
    .badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid var(--ff-border);
      color: var(--ff-muted);
    }
    .badge.ok {
      border-color: color-mix(in srgb, var(--ff-accent) 60%, transparent);
      color: var(--ff-accent);
    }
    .badge.warn {
      border-color: var(--vscode-inputValidation-warningBorder, var(--ff-border));
      color: var(--vscode-inputValidation-warningForeground, var(--ff-muted));
    }
    .steps {
      display: grid;
      gap: 14px;
    }
    .step {
      display: grid;
      gap: 8px;
      padding: 14px;
      border-radius: 12px;
      border: 1px solid var(--ff-border);
      background: color-mix(in srgb, var(--ff-fg) 5%, transparent);
    }
    .step h3 {
      margin: 0;
      font-size: 14px;
    }
    .view-grid {
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    .view-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid var(--ff-border);
      background: color-mix(in srgb, var(--ff-fg) 4%, transparent);
      font-size: 12px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    button {
      background: transparent;
      color: var(--ff-fg);
      border: 1px solid var(--ff-border);
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
    }
    button.primary {
      border-color: var(--ff-accent);
      color: var(--ff-accent);
    }
    .footer {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .footer .left,
    .footer .right {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    @media (min-width: 900px) {
      .steps {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .step.wide {
        grid-column: span 2;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="card">
      <h1>Welcome to ForgeFlow</h1>
      <p>Let’s get your workspace ready. Everything is opt-in and configurable.</p>
    </div>
    <div class="card">
      <h2>Environment checks</h2>
      <div class="checklist">
        <div class="check">
          <span>Git</span>
          <span class="badge ${env.git ? 'ok' : 'warn'}">${env.git ? 'Detected' : 'Missing'}</span>
        </div>
        <div class="check">
          <span>PowerShell 7 (pwsh)</span>
          <span class="badge ${env.pwsh ? 'ok' : 'warn'}">${env.pwsh ? 'Detected' : 'Missing'}</span>
        </div>
        <div class="check">
          <span>Windows PowerShell</span>
          <span class="badge ${env.powershell ? 'ok' : 'warn'}">${env.powershell ? 'Detected' : 'Missing'}</span>
        </div>
        <div class="check">
          <span>.NET SDK</span>
          <span class="badge ${env.dotnet ? 'ok' : 'warn'}">${env.dotnet ? 'Detected' : 'Missing'}</span>
        </div>
      </div>
    </div>
    <div class="steps">
      <div class="step">
        <h3>1) Configure project scan roots <span class="badge ${status.scanRootsConfigured ? 'ok' : 'warn'}">${scanBadge}</span></h3>
        <p>Tell ForgeFlow where your repositories live.</p>
        <div class="actions">
          <button class="primary" data-action="scanRoots">Configure scan roots</button>
        </div>
      </div>
      <div class="step">
        <h3>2) Choose your views</h3>
        <p>Pick which ForgeFlow views you want to show in this window.</p>
        <div class="view-grid">
          <label class="view-item">
            <input type="checkbox" data-view="files" ${viewChecks.files ? 'checked' : ''} />
            <span>Explorer (Files)</span>
          </label>
          <label class="view-item">
            <input type="checkbox" data-view="projects" ${viewChecks.projects ? 'checked' : ''} />
            <span>Projects</span>
          </label>
          <label class="view-item">
            <input type="checkbox" data-view="projectsWeb" ${viewChecks.projectsWeb ? 'checked' : ''} />
            <span>Projects Web</span>
          </label>
          <label class="view-item">
            <input type="checkbox" data-view="git" ${viewChecks.git ? 'checked' : ''} />
            <span>Git</span>
          </label>
          <label class="view-item">
            <input type="checkbox" data-view="dashboard" ${viewChecks.dashboard ? 'checked' : ''} />
            <span>Dashboard</span>
          </label>
          <label class="view-item">
            <input type="checkbox" data-view="powerforge" ${viewChecks.powerforge ? 'checked' : ''} />
            <span>PowerForge Manager</span>
          </label>
        </div>
        <div class="actions">
          <button data-action="applyViews">Save selection</button>
          <button class="primary" data-action="applyViews" data-open="true">Save + Open views</button>
        </div>
      </div>
      <div class="step">
        <h3>3) Configure dashboard tokens (optional)</h3>
        <p>Enable GitHub/GitLab/Azure stats for the dashboard.</p>
        <div class="actions">
          <button data-action="configureTokens">Configure tokens</button>
        </div>
      </div>
      <div class="step">
        <h3>4) Enable run-by-file (optional) <span class="badge ${status.runByFileEnabled ? 'ok' : 'warn'}">${runBadge}</span></h3>
        <p>Run files based on extension (opt-in). Enable .cs script runs if desired.</p>
        <div class="actions">
          <button data-action="enableRunByFile">Enable run-by-file</button>
          <button data-action="enableCsScript">Enable .cs script runs</button>
          <button data-action="openSettings">Open settings</button>
        </div>
      </div>
      <div class="step wide">
        <h3>5) Read the getting started guide</h3>
        <p>Short tips and usage notes for ForgeFlow.</p>
        <div class="actions">
          <button data-action="openDocs">Open guide</button>
        </div>
      </div>
    </div>
    <div class="footer">
      <div class="left">
        <button data-action="cancel">Cancel</button>
        <button data-action="later">Remind me later</button>
      </div>
      <div class="right">
        <button data-action="skip">Don’t show again</button>
        <button class="primary" data-action="finish">Finish</button>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    function getSelectedViews() {
      const views = {};
      document.querySelectorAll('[data-view]').forEach((input) => {
        const checkbox = input;
        const key = checkbox.getAttribute('data-view');
        if (key) {
          views[key] = checkbox.checked;
        }
      });
      return views;
    }
    document.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.getAttribute('data-action');
        if (action) {
          if (action === 'applyViews') {
            const open = button.getAttribute('data-open') === 'true';
            vscode.postMessage({ type: action, views: getSelectedViews(), open });
          } else {
            vscode.postMessage({ type: action });
          }
        }
      });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        vscode.postMessage({ type: 'cancel' });
      }
    });
  </script>
</body>
</html>`;
}

function readOnboardingStatus(): OnboardingStatus {
  const config = vscode.workspace.getConfiguration('forgeflow');
  const scanRoots = config.get<string[]>('projects.scanRoots', []);
  return {
    scanRootsConfigured: Array.isArray(scanRoots) && scanRoots.length > 0,
    runByFileEnabled: config.get<boolean>('run.byFile.enabled', false),
    views: {
      files: config.get<boolean>('views.files.enabled', true),
      projects: config.get<boolean>('views.projects.enabled', true),
      projectsWeb: config.get<boolean>('views.projectsWeb.enabled', true),
      git: config.get<boolean>('views.git.enabled', true),
      dashboard: config.get<boolean>('views.dashboard.enabled', true),
      powerforge: config.get<boolean>('views.powerforge.enabled', true)
    }
  };
}

async function applyViewSelection(views?: ViewSelection): Promise<void> {
  if (!views) {
    return;
  }
  const config = vscode.workspace.getConfiguration('forgeflow');
  await config.update('views.files.enabled', !!views.files, vscode.ConfigurationTarget.Global);
  await config.update('views.projects.enabled', !!views.projects, vscode.ConfigurationTarget.Global);
  await config.update('views.projectsWeb.enabled', !!views.projectsWeb, vscode.ConfigurationTarget.Global);
  await config.update('views.git.enabled', !!views.git, vscode.ConfigurationTarget.Global);
  await config.update('views.dashboard.enabled', !!views.dashboard, vscode.ConfigurationTarget.Global);
  await config.update('views.powerforge.enabled', !!views.powerforge, vscode.ConfigurationTarget.Global);
}

async function openDefaultViews(stateStore: StateStore): Promise<void> {
  await openSelectedViews(stateStore, readOnboardingStatus().views);
}

async function openSelectedViews(stateStore: StateStore, views?: ViewSelection): Promise<void> {
  const layoutStore = new LayoutStore(stateStore);
  const mode = layoutStore.getMode();
  const usePanel = mode === 'expanded';

  if (usePanel) {
    await vscode.commands.executeCommand('workbench.view.extension.forgeflow-panel');
  } else {
    await vscode.commands.executeCommand('workbench.view.extension.forgeflow');
  }

  const selected = views ?? {
    files: true,
    projects: true,
    projectsWeb: true,
    git: true,
    dashboard: true,
    powerforge: true
  };
  const viewIds: string[] = [];
  if (selected.files) {
    viewIds.push(usePanel ? 'forgeflow.files.panel' : 'forgeflow.files');
  }
  if (selected.projects) {
    viewIds.push(usePanel ? 'forgeflow.projects.panel' : 'forgeflow.projects');
  }
  if (selected.projectsWeb) {
    viewIds.push(usePanel ? 'forgeflow.projects.web.panel' : 'forgeflow.projects.web');
  }
  if (selected.git) {
    viewIds.push(usePanel ? 'forgeflow.git.panel' : 'forgeflow.git');
  }
  if (selected.powerforge) {
    const panelView = usePanel ? 'forgeflow.powerforge.panel' : 'forgeflow.powerforge';
    const container = usePanel ? 'workbench.view.extension.forgeflow-powerforge-panel' : undefined;
    if (container) {
      await vscode.commands.executeCommand(container);
    }
    viewIds.push(panelView);
  }
  if (selected.dashboard) {
    await vscode.commands.executeCommand('forgeflow.dashboard.open');
  }

  for (const id of viewIds) {
    await vscode.commands.executeCommand('workbench.action.openView', id);
  }
}

function detectEnvironment(): EnvironmentStatus {
  return {
    git: commandExists('git'),
    pwsh: commandExists('pwsh'),
    powershell: commandExists('powershell'),
    dotnet: commandExists('dotnet')
  };
}

function commandExists(command: string): boolean {
  const locator = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(locator, [command], { stdio: 'ignore' });
  if (result.error) {
    return false;
  }
  return result.status === 0;
}

function randomNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 16; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
