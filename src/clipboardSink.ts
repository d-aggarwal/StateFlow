import * as vscode from 'vscode';

/**
 * ContextSink: Writes compiled context to the system clipboard.
 *
 * Uses vscode.env.clipboard — the official VS Code clipboard API.
 * This is the only output channel in the MVP.
 */
export async function copyToClipboard(content: string): Promise<void> {
  await vscode.env.clipboard.writeText(content);
}
