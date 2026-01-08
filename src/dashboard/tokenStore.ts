import type * as vscode from 'vscode';

const GITHUB_TOKEN_KEY = 'forgeflow.dashboard.github.token';
const GITLAB_TOKEN_KEY = 'forgeflow.dashboard.gitlab.token';
const AZURE_TOKEN_KEY = 'forgeflow.dashboard.azure.token';

export class DashboardTokenStore {
  public constructor(private readonly context: vscode.ExtensionContext) {}

  public async getGitLabToken(): Promise<string | undefined> {
    return await this.context.secrets.get(GITLAB_TOKEN_KEY);
  }

  public async getAzureDevOpsToken(): Promise<string | undefined> {
    return await this.context.secrets.get(AZURE_TOKEN_KEY);
  }

  public async getGitHubToken(): Promise<string | undefined> {
    return await this.context.secrets.get(GITHUB_TOKEN_KEY);
  }

  public async setGitHubToken(token?: string): Promise<void> {
    if (!token) {
      await this.context.secrets.delete(GITHUB_TOKEN_KEY);
      return;
    }
    await this.context.secrets.store(GITHUB_TOKEN_KEY, token);
  }

  public async setGitLabToken(token?: string): Promise<void> {
    if (!token) {
      await this.context.secrets.delete(GITLAB_TOKEN_KEY);
      return;
    }
    await this.context.secrets.store(GITLAB_TOKEN_KEY, token);
  }

  public async setAzureDevOpsToken(token?: string): Promise<void> {
    if (!token) {
      await this.context.secrets.delete(AZURE_TOKEN_KEY);
      return;
    }
    await this.context.secrets.store(AZURE_TOKEN_KEY, token);
  }
}
