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

/**
 * Shows an information message that automatically disappears after 2 seconds
 * @param message The message to display
 */
export function showTemporaryMessage(message: string): void {
  const notification = vscode.window.showInformationMessage(message);
  
  // Set a timeout to hide the notification after 2 seconds
  setTimeout(() => {
    notification.then(item => {
      // The `item` will be undefined if the notification is still visible and hasn't been clicked.
      // In this case, we want to dismiss it. If it's already gone (clicked), we don't need to do anything.
      if (item === undefined) {
        // Use the internal dispose method to close the notification
        (notification as any).dispose?.();
      }
    });
  }, 2000);
}