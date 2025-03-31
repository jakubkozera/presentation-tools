import * as vscode from 'vscode';
import { SnapshotProvider, SnapshotGroup } from './snapshotProvider';
import { registerSnapshotCommands } from './snapshotCommands';
import { registerDiffViewerCommands } from './diffViewer';
import { initializeStatusBar } from './statusBar';
// Import new highlight-related modules
import { HighlightProvider, HighlightGroup } from './highlightProvider';
import { registerHighlightCommands } from './highlightCommands';

/**
 * This method is called when the extension is activated
 * @param context The extension context
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Presentation Snapshots extension is now active');
  
  // Create the snapshot tree view provider
  const snapshotProvider = new SnapshotProvider();
  
  // Create the tree view with drag and drop support
  const snapshotTreeView = vscode.window.createTreeView('presentationSnapshotsView', {
    treeDataProvider: snapshotProvider,
    dragAndDropController: snapshotProvider
  });
  
  // Register snapshot-related commands
  registerSnapshotCommands(context, snapshotProvider);
  
  // Register diff viewer commands
  registerDiffViewerCommands(context);
  
  // Initialize the status bar and related commands
  initializeStatusBar(context);
  
  // Create the highlight tree view provider
  const highlightProvider = new HighlightProvider();
  
  // Create the highlight tree view with drag and drop support
  const highlightTreeView = vscode.window.createTreeView('presentationHighlightsView', {
    treeDataProvider: highlightProvider,
    dragAndDropController: highlightProvider
  });
  
  // Register highlight-related commands
  registerHighlightCommands(context, highlightProvider);
  
  // Add tree views to subscriptions
  context.subscriptions.push(snapshotTreeView, highlightTreeView);
}

/**
 * This method is called when the extension is deactivated
 */
export function deactivate() {
  // Clean up any resources if needed
}