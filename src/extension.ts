import * as vscode from 'vscode';
import { SnapshotProvider, SnapshotGroup } from './snapshotProvider';
import { registerSnapshotCommands } from './snapshotCommands';
import { registerDiffViewerCommands } from './diffViewer';
import { initializeStatusBar } from './statusBar';

/**
 * This method is called when the extension is activated
 * @param context The extension context
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Presentation Snapshots extension is now active');
  
  // Create the snapshot tree view provider
  const snapshotProvider = new SnapshotProvider();
  
  // Create the tree view
  const treeView = vscode.window.createTreeView('presentationSnapshotsView', {
    treeDataProvider: snapshotProvider
  });
  
  // Register snapshot-related commands
  registerSnapshotCommands(context, snapshotProvider);
  
  // Register diff viewer commands
  registerDiffViewerCommands(context);
  
  // Initialize the status bar and related commands
  initializeStatusBar(context);
  
  // Add tree view to subscriptions
  context.subscriptions.push(treeView);
}

/**
 * This method is called when the extension is deactivated
 */
export function deactivate() {
  // Clean up any resources if needed
}