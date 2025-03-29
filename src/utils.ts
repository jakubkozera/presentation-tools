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
  // Create and show message using the VS Code API's built-in hide functionality
  const messageController = new TemporaryMessageController();
  messageController.showMessage(message);
}

/**
 * Class to handle auto-dismissing messages
 * Uses the VS Code message controller pattern to create messages that auto-dismiss
 */
class TemporaryMessageController {
  private readonly DISMISS_TIMEOUT = 2000; // 2 seconds
  private messageDisposable: vscode.Disposable | null = null;
  
  /**
   * Shows a temporary message that auto-dismisses
   */
  public showMessage(text: string): void {
    // Clear any existing message
    this.hideMessage();
    
    // Show the message without any actions
    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: text,
      cancellable: false
    }, async (progress) => {
      // Return a promise that resolves after DISMISS_TIMEOUT
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, this.DISMISS_TIMEOUT);
      });
    });
  }
  
  /**
   * Hides any currently displayed message
   */
  private hideMessage(): void {
    if (this.messageDisposable) {
      this.messageDisposable.dispose();
      this.messageDisposable = null;
    }
  }
}