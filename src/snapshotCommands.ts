import * as vscode from 'vscode';
import * as fs from 'fs';
import { Snapshot, fileSnapshots, showTemporaryMessage } from './utils';
import { applyDiffWithTyping } from './typingEffect';
import { SnapshotGroup, SnapshotProvider } from './snapshotProvider';

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

    // Get existing groups to offer as quick picks
    const existingGroups = new Set<string>();
    if (fileSnapshots[filePath]) {
      fileSnapshots[filePath].forEach(snapshot => {
        if (snapshot.group) {
          existingGroups.add(snapshot.group);
        }
      });
    }

    // Convert Set to array of quick pick items
    const groupQuickPicks = Array.from(existingGroups).map(group => ({
      label: group,
      description: 'Existing group'
    }));

    // Add options to create a new group or leave ungrouped
    const quickPickOptions = [
      { label: '$(plus) Create New Group', description: 'Add a new group name' },
      { label: '$(circle-slash) No Group', description: 'Leave snapshot ungrouped' },
      ...groupQuickPicks
    ];

    // Show quick pick for groups
    const selectedOption = await vscode.window.showQuickPick(quickPickOptions, {
      placeHolder: 'Select a group for this snapshot (optional)'
    });

    let group: string | undefined;
    
    if (selectedOption) {
      if (selectedOption.label === '$(plus) Create New Group') {
        // Ask for new group name
        group = await vscode.window.showInputBox({
          prompt: 'Enter a name for the new group',
          placeHolder: 'e.g. "Setup", "Final Implementation"'
        });
      } else if (selectedOption.label === '$(circle-slash) No Group') {
        group = undefined;
      } else {
        group = selectedOption.label;
      }
    }
    
    // Create snapshot
    const snapshot: Snapshot = {
      id: Date.now().toString(),
      content,
      description,
      timestamp: Date.now()
    };

    // Add group if selected
    if (group) {
      snapshot.group = group;
    }
    
    // Store snapshot
    if (!fileSnapshots[filePath]) {
      fileSnapshots[filePath] = [];
    }
    fileSnapshots[filePath].push(snapshot);
    
    vscode.window.showInformationMessage(`Snapshot "${description}" saved${group ? ` in group "${group}"` : ''}`);
    
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
    const typingSpeed = config.get('typingSpeed', 10); // Characters per second
    
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

  // Delete all snapshots command
  const deleteAllSnapshotsCmd = vscode.commands.registerCommand('presentationSnapshots.deleteAllSnapshots', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }
    
    const filePath = editor.document.uri.fsPath;
    if (!fileSnapshots[filePath] || fileSnapshots[filePath].length === 0) {
      vscode.window.showInformationMessage('No snapshots to delete');
      return;
    }
    
    const snapshotCount = fileSnapshots[filePath].length;
    
    // Show confirmation dialog with the number of snapshots that will be deleted
    const confirmMessage = `Are you sure you want to delete all ${snapshotCount} snapshots for this file? This action cannot be undone.`;
    const confirmOptions = ['Delete All Snapshots', 'Cancel'];
    
    const result = await vscode.window.showWarningMessage(confirmMessage, ...confirmOptions);
    
    if (result === confirmOptions[0]) {
      // User confirmed deletion
      fileSnapshots[filePath] = [];
      showTemporaryMessage(`Deleted all ${snapshotCount} snapshots`);
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

  // Change snapshot group command
  const changeSnapshotGroupCmd = vscode.commands.registerCommand('presentationSnapshots.changeSnapshotGroup', async (snapshot: Snapshot) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }

    const filePath = editor.document.uri.fsPath;
    if (!fileSnapshots[filePath]) {
      return;
    }

    // Get existing groups to offer as quick picks
    const existingGroups = new Set<string>();
    fileSnapshots[filePath].forEach(s => {
      if (s.group) {
        existingGroups.add(s.group);
      }
    });

    // Convert Set to array of quick pick items
    const groupQuickPicks = Array.from(existingGroups).map(group => ({
      label: group,
      description: snapshot.group === group ? '(Current)' : 'Existing group'
    }));

    // Add options to create a new group or leave ungrouped
    const quickPickOptions = [
      { label: '$(plus) Create New Group', description: 'Add a new group name' },
      { label: '$(circle-slash) No Group', description: 'Leave snapshot ungrouped' },
      ...groupQuickPicks
    ];

    // Show quick pick for groups
    const selectedOption = await vscode.window.showQuickPick(quickPickOptions, {
      placeHolder: `Change group for snapshot "${snapshot.description}"`
    });

    if (!selectedOption) {
      return; // User cancelled
    }

    let newGroup: string | undefined;
    
    if (selectedOption.label === '$(plus) Create New Group') {
      // Ask for new group name
      newGroup = await vscode.window.showInputBox({
        prompt: 'Enter a name for the new group',
        placeHolder: 'e.g. "Setup", "Final Implementation"'
      });
      
      if (newGroup === undefined) {
        return; // User cancelled
      }
    } else if (selectedOption.label === '$(circle-slash) No Group') {
      newGroup = undefined;
    } else {
      newGroup = selectedOption.label;
    }

    // Find snapshot in array and update its group
    const snapshotIndex = fileSnapshots[filePath].findIndex(s => s.id === snapshot.id);
    if (snapshotIndex !== -1) {
      if (newGroup) {
        fileSnapshots[filePath][snapshotIndex].group = newGroup;
        showTemporaryMessage(`Moved "${snapshot.description}" to group "${newGroup}"`);
      } else {
        delete fileSnapshots[filePath][snapshotIndex].group;
        showTemporaryMessage(`Removed "${snapshot.description}" from its group`);
      }
      
      snapshotProvider.refresh();
    }
  });

  // Delete group command
  const deleteGroupCmd = vscode.commands.registerCommand('presentationSnapshots.deleteGroup', async (group: SnapshotGroup) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }

    const filePath = editor.document.uri.fsPath;
    if (!fileSnapshots[filePath]) {
      return;
    }

    // Show confirmation dialog
    const confirmMessage = `Delete group "${group.label}"? This will delete all ${group.snapshots.length} snapshots in this group.`;
    const confirmOptions = ['Delete Group', 'Keep Group but Remove Grouping', 'Cancel'];
    
    const result = await vscode.window.showWarningMessage(confirmMessage, ...confirmOptions);
    
    if (result === confirmOptions[0]) {
      // Delete snapshots in group
      const idsToDelete = new Set(group.snapshots.map(s => s.id));
      fileSnapshots[filePath] = fileSnapshots[filePath].filter(s => !idsToDelete.has(s.id));
      
      showTemporaryMessage(`Deleted group "${group.label}" and all its snapshots`);
      snapshotProvider.refresh();
    } else if (result === confirmOptions[1]) {
      // Keep snapshots but remove them from the group
      fileSnapshots[filePath].forEach(s => {
        if (s.group === group.label) {
          delete s.group;
        }
      });
      
      showTemporaryMessage(`Removed grouping for snapshots in "${group.label}"`);
      snapshotProvider.refresh();
    }
  });

  // Register all commands
  context.subscriptions.push(
    saveSnapshotCmd,
    loadSnapshotCmd,
    loadSnapshotInstantlyCmd,
    deleteSnapshotCmd,
    deleteAllSnapshotsCmd,
    exportSnapshotsCmd,
    importSnapshotsCmd,
    changeSnapshotGroupCmd,
    deleteGroupCmd
  );
}