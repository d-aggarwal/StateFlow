import * as vscode from 'vscode';
import { FileEntry, ActiveFileInfo, DiagnosticEntry, DiagnosticDetail, KeyFile, WorkspaceSnapshot } from './types';

/**
 * ContextSource: Reads workspace state using VS Code APIs.
 *
 * This module is the only place that touches VS Code workspace/editor APIs
 * for data gathering. Everything it produces is a plain data object (no VS Code types leak out).
 */

/** Files/folders excluded from workspace scanning. */
const EXCLUDE_PATTERN = '{**/node_modules/**,**/.git/**,**/out/**,**/dist/**,**/.next/**,**/build/**,**/.vscode/**,**/*.map}';

/** Cap on files to prevent performance issues in large repos. */
const MAX_FILES = 500;

/** File extensions eligible for export signature scanning. */
const EXPORT_SCAN_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx']);

/** Max file size (bytes) to scan for exports — skip large files. */
const EXPORT_SCAN_MAX_SIZE = 20 * 1024;

/** Max number of files to scan for exports — keep sync fast. */
const EXPORT_SCAN_MAX_FILES = 100;

/** Key files to include content of in the primer (checked in order). */
const KEY_FILE_NAMES = ['package.json', 'README.md', 'readme.md'];

/**
 * Scans the workspace and produces a complete snapshot.
 *
 * Uses vscode.workspace.findFiles() which respects the user's files.exclude setting
 * and our additional EXCLUDE_PATTERN.
 */
export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error('No workspace folder is open.');
  }

  const workspaceName = workspaceFolders[0].name;

  // findFiles(include, exclude, maxResults) — returns matching file URIs
  const fileUris = await vscode.workspace.findFiles('**/*', EXCLUDE_PATTERN, MAX_FILES);

  const files: FileEntry[] = [];
  for (const uri of fileUris) {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      const relativePath = vscode.workspace.asRelativePath(uri, false);
      files.push({
        relativePath,
        languageId: guessLanguage(relativePath),
        sizeBytes: stat.size,
        lastModified: stat.mtime,
      });
    } catch {
      // Skip files we can't stat (permissions, symlink issues, etc.)
    }
  }

  // Alphabetical sort for deterministic output
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  // Scan export signatures for code files (TS/JS only)
  await scanExports(files);

  // Read key project files (package.json, README.md)
  const keyFiles = await readKeyFiles();

  return {
    workspaceName,
    files,
    activeFile: getActiveFileInfo(true), // include content for primer/incremental
    diagnostics: getDiagnosticsSummary(),
    keyFiles,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Gets information about the currently active editor.
 * @param includeContent If true, includes full file text and any selection.
 */
export function getActiveFileInfo(includeContent: boolean): ActiveFileInfo | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return null;
  }

  const doc = editor.document;
  const info: ActiveFileInfo = {
    relativePath: vscode.workspace.asRelativePath(doc.uri, false),
    languageId: doc.languageId,
    lineCount: doc.lineCount,
  };

  if (includeContent) {
    info.content = doc.getText();

    // Capture selected text if the user has a selection
    const selection = editor.selection;
    if (!selection.isEmpty) {
      info.selectedText = doc.getText(selection);
    }
  }

  return info;
}

/**
 * Summarizes all workspace diagnostics (errors + warnings) per file.
 * Now includes the actual diagnostic messages, not just counts.
 *
 * vscode.languages.getDiagnostics() returns Array<[Uri, Diagnostic[]]>.
 */
export function getDiagnosticsSummary(): DiagnosticEntry[] {
  const allDiagnostics = vscode.languages.getDiagnostics();
  const entries: DiagnosticEntry[] = [];

  for (const [uri, diagnostics] of allDiagnostics) {
    if (diagnostics.length === 0) continue;

    let errors = 0;
    let warnings = 0;
    const details: DiagnosticDetail[] = [];

    for (const d of diagnostics) {
      if (d.severity === vscode.DiagnosticSeverity.Error) {
        errors++;
        details.push({
          line: d.range.start.line + 1, // VS Code is 0-indexed, output is 1-indexed
          severity: 'error',
          message: d.message,
        });
      } else if (d.severity === vscode.DiagnosticSeverity.Warning) {
        warnings++;
        details.push({
          line: d.range.start.line + 1,
          severity: 'warning',
          message: d.message,
        });
      }
    }

    if (errors > 0 || warnings > 0) {
      entries.push({
        relativePath: vscode.workspace.asRelativePath(uri, false),
        errors,
        warnings,
        details,
      });
    }
  }

  // Worst files first
  entries.sort((a, b) => b.errors - a.errors || b.warnings - a.warnings);
  return entries;
}

// ─── Key File Reading ─────────────────────────────────────────────────────

/**
 * Reads the content of key project files (package.json, README.md).
 * These give the browser LLM project identity — what this project IS.
 */
async function readKeyFiles(): Promise<KeyFile[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return [];

  const root = workspaceFolders[0].uri;
  const keyFiles: KeyFile[] = [];
  const seen = new Set<string>(); // deduplicate (readme.md vs README.md)

  for (const filename of KEY_FILE_NAMES) {
    const lower = filename.toLowerCase();
    if (seen.has(lower)) continue;

    try {
      const fileUri = vscode.Uri.joinPath(root, filename);
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      const text = new TextDecoder('utf-8').decode(bytes);
      keyFiles.push({ relativePath: filename, content: text });
      seen.add(lower);
    } catch {
      // File doesn't exist, skip
    }
  }

  return keyFiles;
}

// ─── Export Signature Scanning ──────────────────────────────────────────────

/**
 * Scans code files for export signatures (TS/JS only for now).
 * This is deterministic — just regex matching lines starting with `export`.
 * Gives the browser LLM each file's API surface without the full implementation.
 */
async function scanExports(files: FileEntry[]): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return;

  const root = workspaceFolders[0].uri;
  let scanned = 0;

  for (const file of files) {
    if (scanned >= EXPORT_SCAN_MAX_FILES) break;

    const ext = file.relativePath.split('.').pop()?.toLowerCase() || '';
    if (!EXPORT_SCAN_EXTENSIONS.has(ext)) continue;
    if (file.sizeBytes > EXPORT_SCAN_MAX_SIZE) continue;

    try {
      const fileUri = vscode.Uri.joinPath(root, file.relativePath);
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      const content = new TextDecoder('utf-8').decode(bytes);
      file.exports = extractExportSignatures(content);
      scanned++;
    } catch {
      // Skip files we can't read
    }
  }
}

/**
 * Extracts export signatures from file content.
 * Looks for lines starting with `export` and cleans them up.
 */
function extractExportSignatures(content: string): string[] {
  return content
    .split('\n')
    .filter(line => /^\s*export\s/.test(line))
    .map(line => {
      let s = line.trim();
      // Remove function/class body opening brace (but not `export { named }`)
      if (!s.startsWith('export {') && !s.startsWith('export default {')) {
        const braceIdx = s.indexOf('{');
        if (braceIdx > 0) {
          s = s.substring(0, braceIdx).trim();
        }
      }
      // Truncate very long lines
      if (s.length > 120) s = s.substring(0, 120) + '...';
      return s;
    })
    .filter(line => line.length > 0);
}

// ─── Language Detection ─────────────────────────────────────────────────────

/**
 * Maps file extension → language identifier.
 * Intentionally simple — covers common cases, falls back to the extension itself.
 */
function guessLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact',
    js: 'javascript', jsx: 'javascriptreact',
    py: 'python', rs: 'rust', go: 'go',
    java: 'java', kt: 'kotlin', rb: 'ruby',
    php: 'php', cs: 'csharp', cpp: 'cpp',
    c: 'c', h: 'c', swift: 'swift', dart: 'dart',
    json: 'json', yaml: 'yaml', yml: 'yaml',
    toml: 'toml', xml: 'xml', html: 'html',
    css: 'css', scss: 'scss', md: 'markdown',
    sh: 'shellscript', sql: 'sql', vue: 'vue',
    svelte: 'svelte', dockerfile: 'dockerfile',
  };
  return map[ext] || ext;
}
