import * as vscode from 'vscode';

// Store snapshots in memory
export interface Snapshot {
  id: string;
  content: string;
  description: string;
  timestamp: number;
}

export interface FileSnapshots {
  [filePath: string]: Snapshot[];
}

// In-memory storage for snapshots - shared across the extension
export const fileSnapshots: FileSnapshots = {};