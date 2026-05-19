/**
 * Shared type definitions for StateFlow.
 * These types flow through the pipeline: Source → Normalizer → Sink.
 */

/** A single file entry discovered in the workspace. */
export interface FileEntry {
  /** Path relative to workspace root */
  relativePath: string;
  /** Language identifier (e.g., "typescript", "json") */
  languageId: string;
  /** File size in bytes */
  sizeBytes: number;
}

/** Information about the currently active editor file. */
export interface ActiveFileInfo {
  relativePath: string;
  languageId: string;
  lineCount: number;
  /** Full file content — only populated during deep sync */
  content?: string;
}

/** Diagnostic (error/warning) counts for a single file. */
export interface DiagnosticEntry {
  relativePath: string;
  errors: number;
  warnings: number;
}

/** A complete point-in-time snapshot of the workspace. */
export interface WorkspaceSnapshot {
  workspaceName: string;
  files: FileEntry[];
  activeFile: ActiveFileInfo | null;
  diagnostics: DiagnosticEntry[];
  timestamp: string;
}
