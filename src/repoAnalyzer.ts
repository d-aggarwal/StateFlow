import * as vscode from 'vscode';
import { FileEntry, ActiveFileInfo, DiagnosticEntry, DiagnosticDetail, ErrorContext, KeyFile, WorkspaceSnapshot } from './types';


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


export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error('No workspace folder is open.');
  }

  const workspaceName = workspaceFolders[0].name;

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

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  // Scan export signatures for code files (TS/JS only)
  await scanExports(files);

  // Read key project files (package.json, README.md)
  const keyFiles = await readKeyFiles();

  return {
    workspaceName,
    files,
    activeFile: getActiveFileInfo(true),
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


const SURROUNDING_LINE_COUNT = 20;


export function getErrorAtCursor(): ErrorContext | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;

  const doc = editor.document;
  const cursorLine = editor.selection.active.line; // 0-indexed
  const relativePath = vscode.workspace.asRelativePath(doc.uri, false);

  
  const fileDiagnostics = vscode.languages.getDiagnostics(doc.uri);
  if (fileDiagnostics.length === 0) return null;

  
  const relevant = fileDiagnostics
    .filter(d =>
      d.severity === vscode.DiagnosticSeverity.Error ||
      d.severity === vscode.DiagnosticSeverity.Warning
    )
    .sort((a, b) => {
      const distA = Math.abs(a.range.start.line - cursorLine);
      const distB = Math.abs(b.range.start.line - cursorLine);
      return distA - distB; 
    });

  if (relevant.length === 0) return null;

  
  const primary = relevant[0];
  const errorLine = primary.range.start.line + 1; // 1-indexed for output

  const primaryDetail: DiagnosticDetail = {
    line: errorLine,
    severity: primary.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning',
    message: primary.message,
  };

  // All other diagnostics in this file (for context awareness)
  const otherDiagnostics: DiagnosticDetail[] = relevant.slice(1).map(d => ({
    line: d.range.start.line + 1,
    severity: d.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning',
    message: d.message,
  }));


  const sourceLines = doc.getText().split('\n');
  const errorLineIdx = primary.range.start.line; // 0-indexed
  const fromIdx = Math.max(0, errorLineIdx - SURROUNDING_LINE_COUNT);
  const toIdx = Math.min(sourceLines.length - 1, errorLineIdx + SURROUNDING_LINE_COUNT);

  const surroundingLines = [];
  for (let i = fromIdx; i <= toIdx; i++) {
    surroundingLines.push({
      lineNumber: i + 1, // 1-indexed
      content: sourceLines[i],
    });
  }

  return {
    relativePath,
    languageId: doc.languageId,
    error: primaryDetail,
    otherDiagnostics,
    surroundingLines,
    errorLine,
  };
}


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

// ─── Export Signature Scanning 

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
