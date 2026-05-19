import * as vscode from 'vscode';

export async function copyToClipboard(content: string): Promise<void> {
  await vscode.env.clipboard.writeText(content);
}
