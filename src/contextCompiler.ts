import { WorkspaceSnapshot, FileEntry, DiagnosticEntry, ErrorContext, KeyFile } from './types';


export function compilePrimer(snapshot: WorkspaceSnapshot): string {
  const s: string[] = [];

  s.push(`=== StateFlow: Project Primer ===`);
  s.push(`Workspace: ${snapshot.workspaceName}`);
  s.push(`Synced at: ${snapshot.timestamp}`);
  s.push('');

  // Key files (package.json, README) — project identity
  if (snapshot.keyFiles.length > 0) {
    s.push('## Project Identity');
    for (const kf of snapshot.keyFiles) {
      s.push(`### ${kf.relativePath}`);
      s.push(kf.content);
      s.push('');
    }
  }

  // File tree with export signatures
  s.push('## Project Structure');
  s.push(formatFileListWithExports(snapshot.files));
  s.push('');

  s.push('## Language Summary');
  s.push(formatLanguageSummary(snapshot.files));
  s.push('');

  // Active file with full content
  if (snapshot.activeFile) {
    s.push('## Active File');
    s.push(`Path: ${snapshot.activeFile.relativePath}`);
    s.push(`Language: ${snapshot.activeFile.languageId}`);
    s.push(`Lines: ${snapshot.activeFile.lineCount}`);
    if (snapshot.activeFile.content) {
      s.push('');
      s.push('--- Content ---');
      s.push(snapshot.activeFile.content);
      s.push('--- End Content ---');
    }
    s.push('');
  }

  // Full diagnostic messages
  if (snapshot.diagnostics.length > 0) {
    s.push('## Diagnostics');
    s.push(formatDiagnosticsWithMessages(snapshot.diagnostics));
    s.push('');
  }

  s.push(`Total files: ${snapshot.files.length}`);
  s.push(`=== End StateFlow Sync ===`);

  return s.join('\n');
}


export function compileIncremental(
  current: WorkspaceSnapshot,
  previous: WorkspaceSnapshot
): string {
  const s: string[] = [];

  s.push(`=== StateFlow: Incremental Update ===`);
  s.push(`Workspace: ${current.workspaceName}`);
  s.push(`Synced at: ${current.timestamp}`);
  s.push(`Previous sync: ${previous.timestamp}`);
  s.push('');

  // Diff file lists: added, removed, and modified
  const prevFileMap = new Map(previous.files.map(f => [f.relativePath, f]));
  const currPaths = new Set(current.files.map(f => f.relativePath));

  const added = current.files.filter(f => !prevFileMap.has(f.relativePath));
  const removed = previous.files.filter(f => !currPaths.has(f.relativePath));
  const modified = current.files.filter(f => {
    const prev = prevFileMap.get(f.relativePath);
    if (!prev) return false; // new file, not modified
    // Detect modification by comparing mtime or size
    return f.lastModified !== prev.lastModified || f.sizeBytes !== prev.sizeBytes;
  });

  s.push('## File Changes');
  if (added.length === 0 && removed.length === 0 && modified.length === 0) {
    s.push('No file changes detected.');
  } else {
    if (added.length > 0) {
      s.push('Added:');
      for (const f of added) {
        s.push(`  + ${f.relativePath} (${f.languageId})`);
      }
    }
    if (removed.length > 0) {
      s.push('Removed:');
      for (const f of removed) {
        s.push(`  - ${f.relativePath} (${f.languageId})`);
      }
    }
    if (modified.length > 0) {
      s.push('Modified:');
      for (const f of modified) {
        const prev = prevFileMap.get(f.relativePath)!;
        const sizeChange = f.sizeBytes !== prev.sizeBytes
          ? ` (${formatSize(prev.sizeBytes)} → ${formatSize(f.sizeBytes)})`
          : '';
        s.push(`  ~ ${f.relativePath}${sizeChange}`);
      }
    }
  }
  s.push('');

  // Active file with full content
  if (current.activeFile) {
    s.push('## Active File');
    s.push(`Path: ${current.activeFile.relativePath}`);
    s.push(`Language: ${current.activeFile.languageId}`);
    s.push(`Lines: ${current.activeFile.lineCount}`);
    if (previous.activeFile && previous.activeFile.relativePath !== current.activeFile.relativePath) {
      s.push(`(Changed from: ${previous.activeFile.relativePath})`);
    }
    if (current.activeFile.content) {
      s.push('');
      s.push('--- Content ---');
      s.push(current.activeFile.content);
      s.push('--- End Content ---');
    }
    s.push('');
  }

  // Full diagnostic messages
  if (current.diagnostics.length > 0) {
    s.push('## Current Diagnostics');
    s.push(formatDiagnosticsWithMessages(current.diagnostics));
    s.push('');
  }

  s.push(`Total files: ${current.files.length}`);
  s.push(`=== End StateFlow Sync ===`);

  return s.join('\n');
}



export function compileErrorContext(ctx: ErrorContext): string {
  const s: string[] = [];

  s.push(`=== StateFlow: Error Context Sync ===`);
  s.push(`File: ${ctx.relativePath}`);
  s.push(`Language: ${ctx.languageId}`);
  s.push(`Synced at: ${new Date().toISOString()}`);
  s.push('');

  // User's question first — gives the browser LLM clear intent
  if (ctx.userQuestion) {
    s.push('## My Question');
    s.push(ctx.userQuestion);
    s.push('');
  }

  // The specific error at the cursor
  s.push('## Error');
  s.push(`  Line ${ctx.error.line} [${ctx.error.severity}]: ${ctx.error.message}`);
  s.push('');

  // Surrounding source code with a ► marker on the error line
  s.push(`## Code Context (around line ${ctx.errorLine})`);
  for (const { lineNumber, content } of ctx.surroundingLines) {
    const marker = lineNumber === ctx.errorLine ? '►' : ' ';
    // Pad line numbers so columns align
    const lineNum = String(lineNumber).padStart(4, ' ');
    s.push(`${marker} ${lineNum} | ${content}`);
  }
  s.push('');

  // Other diagnostics in the same file — useful but not the focus
  if (ctx.otherDiagnostics.length > 0) {
    s.push('## Other Diagnostics in This File');
    for (const d of ctx.otherDiagnostics) {
      s.push(`  Line ${d.line} [${d.severity}]: ${d.message}`);
    }
    s.push('');
  }

  s.push(`=== End StateFlow Sync ===`);
  return s.join('\n');
}


function formatFileListWithExports(files: FileEntry[]): string {
  const lines: string[] = [];
  for (const f of files) {
    lines.push(`  ${f.relativePath} (${f.languageId}, ${formatSize(f.sizeBytes)})`);
    // Show export signatures if available
    if (f.exports && f.exports.length > 0) {
      for (const exp of f.exports) {
        lines.push(`    → ${exp}`);
      }
    }
  }
  return lines.join('\n');
}

function formatLanguageSummary(files: FileEntry[]): string {
  const counts = new Map<string, number>();
  for (const f of files) {
    counts.set(f.languageId, (counts.get(f.languageId) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([lang, n]) => `  ${lang}: ${n} file${n > 1 ? 's' : ''}`)
    .join('\n');
}


function formatDiagnosticsWithMessages(diagnostics: DiagnosticEntry[]): string {
  return diagnostics
    .map(d => {
      const header = `  ${d.relativePath}: ${d.errors} error${d.errors !== 1 ? 's' : ''}, ${d.warnings} warning${d.warnings !== 1 ? 's' : ''}`;
      const details = d.details
        .map(det => `    Line ${det.line} [${det.severity}]: ${det.message}`)
        .join('\n');
      return `${header}\n${details}`;
    })
    .join('\n');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
