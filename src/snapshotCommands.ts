import * as vscode from 'vscode';
import * as fs from 'fs';
import { Snapshot, fileSnapshots, showTemporaryMessage } from './utils';
import { applyDiffWithTyping } from './typingEffect';
import { SnapshotProvider } from './snapshotProvider';

export function registerSnapshotCommands(
  context: vscode.ExtensionContext, 
  snapshotProvider: SnapshotProvider
): void {
  // Save snapshot command
  const saveSnapshotCmd = vscode.commands.registerCommand('presentationSnapshots.saveSnapshot', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }

    const filePath = editor.document.uri.fsPath;
    const content = editor.document.getText();
    
    // Get description from user
    const description = await vscode.window.showInputBox({
      prompt: 'Enter a description for this snapshot',
      placeHolder: 'e.g. "Step 1: Basic structure", "Final solution"'
    });
    
    if (description === undefined) {
      return; // User cancelled
    }
    
    // Create snapshot
    const snapshot: Snapshot = {
      id: Date.now().toString(),
      content,
      description,
      timestamp: Date.now()
    };
    
    // Store snapshot
    if (!fileSnapshots[filePath]) {
      fileSnapshots[filePath] = [];
    }
    fileSnapshots[filePath].push(snapshot);
    
    vscode.window.showInformationMessage(`Snapshot "${description}" saved`);
    
    // Refresh view
    snapshotProvider.refresh();
  });
  
  // Load snapshot command
  const loadSnapshotCmd = vscode.commands.registerCommand('presentationSnapshots.loadSnapshot', async (snapshot: Snapshot) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }
    
    const config = vscode.workspace.getConfiguration('presentationSnapshots');
    const useTypingMode = config.get('useTypingMode', false);
    const typingSpeed = config.get('typingSpeed', 10); // Characters per second
    
    if (useTypingMode) {
      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Loading snapshot: "${snapshot.description}"`,
        cancellable: true
      }, async (progress, token) => {
        token.onCancellationRequested(() => {
          vscode.window.showInformationMessage('Snapshot loading cancelled');
        });
        
        try {
          const currentContent = editor.document.getText();
          await applyDiffWithTyping(editor, currentContent, snapshot.content, typingSpeed);
          const edit = new vscode.WorkspaceEdit();
          const fullRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(editor.document.getText().length)
          );
          edit.replace(editor.document.uri, fullRange, snapshot.content);
          await vscode.workspace.applyEdit(edit);
          
          // Use temporary message for loading notification
          showTemporaryMessage(`Loaded snapshot: "${snapshot.description}"`);
        } catch (err) {
          vscode.window.showErrorMessage(`Error loading snapshot: ${err}`);
        }
      });
    } else {
      // Regular instant replace
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(editor.document.getText().length)
      );
      edit.replace(editor.document.uri, fullRange, snapshot.content);
      await vscode.workspace.applyEdit(edit);
      
      // Use temporary message for loading notification
      showTemporaryMessage(`Loaded snapshot: "${snapshot.description}"`);
    }
  });
  
  // Load snapshot instantly command (for direct clicks on tree items)
  const loadSnapshotInstantlyCmd = vscode.commands.registerCommand('presentationSnapshots.loadSnapshotInstantly', async (snapshot: Snapshot) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }
    
    // Always use instant replace regardless of typing mode setting
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(editor.document.getText().length)
    );
    edit.replace(editor.document.uri, fullRange, snapshot.content);
    await vscode.workspace.applyEdit(edit);
    
    // Use temporary message for loading notification
    showTemporaryMessage(`Loaded snapshot: "${snapshot.description}"`);
  });
  
  // Delete snapshot command
  const deleteSnapshotCmd = vscode.commands.registerCommand('presentationSnapshots.deleteSnapshot', (snapshot: Snapshot) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }
    
    const filePath = editor.document.uri.fsPath;
    if (fileSnapshots[filePath]) {
      fileSnapshots[filePath] = fileSnapshots[filePath].filter(s => s.id !== snapshot.id);
      
      // Use temporary message for deletion notification
      showTemporaryMessage(`Deleted snapshot: "${snapshot.description}"`);
      snapshotProvider.refresh();
    }
  });

  // Export snapshots command
  const exportSnapshotsCmd = vscode.commands.registerCommand('presentationSnapshots.exportSnapshots', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }
    
    const filePath = editor.document.uri.fsPath;
    if (!fileSnapshots[filePath] || fileSnapshots[filePath].length === 0) {
      vscode.window.showErrorMessage('No snapshots to export');
      return;
    }
    
    const folderUri = await vscode.window.showSaveDialog({
      saveLabel: 'Export Snapshots',
      filters: { 'JSON': ['json'] }
    });
    
    if (folderUri) {
      try {
        fs.writeFileSync(
          folderUri.fsPath,
          JSON.stringify(fileSnapshots[filePath], null, 2)
        );
        vscode.window.showInformationMessage(`Snapshots exported to ${folderUri.fsPath}`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to export snapshots: ${error}`);
      }
    }
  });
  
  // Import snapshots command
  const importSnapshotsCmd = vscode.commands.registerCommand('presentationSnapshots.importSnapshots', async () => {
    const fileUri = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'JSON': ['json'] }
    });
    
    if (fileUri && fileUri.length > 0) {
      try {
        const content = fs.readFileSync(fileUri[0].fsPath, 'utf8');
        const importedSnapshots = JSON.parse(content) as Snapshot[];
        
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showErrorMessage('No active editor found');
          return;
        }
        
        const filePath = editor.document.uri.fsPath;
        if (!fileSnapshots[filePath]) {
          fileSnapshots[filePath] = [];
        }
        
        fileSnapshots[filePath] = [...fileSnapshots[filePath], ...importedSnapshots];
        vscode.window.showInformationMessage(`Imported ${importedSnapshots.length} snapshots`);
        snapshotProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to import snapshots: ${error}`);
      }
    }
  });

  // Register all commands
  context.subscriptions.push(
    saveSnapshotCmd,
    loadSnapshotCmd,
    loadSnapshotInstantlyCmd,
    deleteSnapshotCmd,
    exportSnapshotsCmd,
    importSnapshotsCmd
  );
}