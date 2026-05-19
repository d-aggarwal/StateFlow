export interface FileEntry {
  
  relativePath: string;

  languageId: string;
 
  sizeBytes: number;

  lastModified: number;

  exports?: string[];
}


export interface ActiveFileInfo {
  relativePath: string;
  languageId: string;
  lineCount: number;
  content?: string;
  selectedText?: string;
}


export interface DiagnosticDetail {
  line: number;
  severity: 'error' | 'warning';
  message: string;
}


export interface DiagnosticEntry {
  relativePath: string;
  errors: number;
  warnings: number;
  details: DiagnosticDetail[];
}


export interface KeyFile {
  relativePath: string;
  content: string;
}


export interface ErrorContext {
  relativePath: string;
  languageId: string;
  error: DiagnosticDetail;
  otherDiagnostics: DiagnosticDetail[];
  surroundingLines: { lineNumber: number; content: string }[];
  errorLine: number;
  userQuestion?: string;
}


export interface WorkspaceSnapshot {
  workspaceName: string;
  files: FileEntry[];
  activeFile: ActiveFileInfo | null;
  diagnostics: DiagnosticEntry[];
  /** Content of key project files (package.json, README, etc.) */
  keyFiles: KeyFile[];
  timestamp: string;
}
