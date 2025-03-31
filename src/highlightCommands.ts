import * as vscode from 'vscode';
import * as fs from 'fs';
import { Highlight, fileHighlights, clearHighlights, applyHighlight, createHighlightFromSelection } from './highlightUtils';
import { showTemporaryMessage } from './utils';
import { HighlightGroup, HighlightProvider } from './highlightProvider';

export function registerHighlightCommands(
  context: vscode.ExtensionContext, 
  highlightProvider: HighlightProvider
): void {
  // Save highlight command
  const saveHighlightCmd = vscode.commands.registerCommand('presentationHighlights.saveHighlight', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }

    // Check if there's a text selection
    if (editor.selections.length === 0 || editor.selections.every(s => s.isEmpty)) {
      vscode.window.showErrorMessage('Please select text to highlight');
      return;
    }

    const filePath = editor.document.uri.fsPath;
    
    // Get name from user
    const name = await vscode.window.showInputBox({
      prompt: 'Enter a name for this highlight',
      placeHolder: 'e.g. "Important method", "Key algorithm"'
    });
    
    if (name === undefined) {
      return; // User cancelled
    }

    // Get existing groups to offer as quick picks
    const existingGroups = new Set<string>();
    if (fileHighlights[filePath]) {
      fileHighlights[filePath].forEach(highlight => {
        if (highlight.group) {
          existingGroups.add(highlight.group);
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
      { label: '$(circle-slash) No Group', description: 'Leave highlight ungrouped' },
      ...groupQuickPicks
    ];

    // Show quick pick for groups
    const selectedOption = await vscode.window.showQuickPick(quickPickOptions, {
      placeHolder: 'Select a group for this highlight (optional)'
    });

    let group: string | undefined;
    
    if (selectedOption) {
      if (selectedOption.label === '$(plus) Create New Group') {
        // Ask for new group name
        group = await vscode.window.showInputBox({
          prompt: 'Enter a name for the new group',
          placeHolder: 'e.g. "UI Components", "Core Functions"'
        });
      } else if (selectedOption.label === '$(circle-slash) No Group') {
        group = undefined;
      } else {
        group = selectedOption.label;
      }
    }
    
    // Show color options
    const colorOptions = [
      { label: 'Yellow (Default)', value: 'rgba(255, 255, 0, 0.3)' },
      { label: 'Green', value: 'rgba(0, 255, 0, 0.3)' },
      { label: 'Blue', value: 'rgba(0, 191, 255, 0.3)' },
      { label: 'Red', value: 'rgba(255, 0, 0, 0.3)' },
      { label: 'Purple', value: 'rgba(180, 0, 255, 0.3)' },
      { label: 'Orange', value: 'rgba(255, 165, 0, 0.3)' }
    ];

    const colorPick = await vscode.window.showQuickPick(
      colorOptions.map(option => ({ label: option.label, description: option.value })),
      { placeHolder: 'Select highlight color (optional)' }
    );

    const color = colorPick ? colorOptions.find(c => c.label === colorPick.label)?.value : undefined;

    // Create highlight from selection
    const highlight = createHighlightFromSelection(name, group, color);
    
    if (!highlight) {
      vscode.window.showErrorMessage('Failed to create highlight from selection');
      return;
    }
    
    // Store highlight
    if (!fileHighlights[filePath]) {
      fileHighlights[filePath] = [];
    }
    fileHighlights[filePath].push(highlight);
    
    vscode.window.showInformationMessage(`Highlight "${name}" saved${group ? ` in group "${group}"` : ''}`);
    
    // Refresh view
    highlightProvider.refresh();
  });
  
  // Apply highlight command
  const applyHighlightCmd = vscode.commands.registerCommand('presentationHighlights.applyHighlight', (highlight: Highlight) => {
    applyHighlight(highlight);
  });
  
  // Clear highlights command
  const clearHighlightsCmd = vscode.commands.registerCommand('presentationHighlights.clearHighlights', () => {
    clearHighlights();
  });
  
  // Delete highlight command
  const deleteHighlightCmd = vscode.commands.registerCommand('presentationHighlights.deleteHighlight', (highlight: Highlight) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }
    
    const filePath = editor.document.uri.fsPath;
    if (fileHighlights[filePath]) {
      fileHighlights[filePath] = fileHighlights[filePath].filter(h => h.id !== highlight.id);
      
      // Use temporary message for deletion notification
      showTemporaryMessage(`Deleted highlight: "${highlight.name}"`);
      highlightProvider.refresh();
    }
  });

  // Delete all highlights command
  const deleteAllHighlightsCmd = vscode.commands.registerCommand('presentationHighlights.deleteAllHighlights', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }
    
    const filePath = editor.document.uri.fsPath;
    if (!fileHighlights[filePath] || fileHighlights[filePath].length === 0) {
      vscode.window.showInformationMessage('No highlights to delete');
      return;
    }
    
    const highlightCount = fileHighlights[filePath].length;
    
    // Show confirmation dialog with the number of highlights that will be deleted
    const confirmMessage = `Are you sure you want to delete all ${highlightCount} highlights for this file? This action cannot be undone.`;
    const confirmOptions = ['Delete All Highlights', 'Cancel'];
    
    const result = await vscode.window.showWarningMessage(confirmMessage, ...confirmOptions);
    
    if (result === confirmOptions[0]) {
      // User confirmed deletion
      fileHighlights[filePath] = [];
      showTemporaryMessage(`Deleted all ${highlightCount} highlights`);
      highlightProvider.refresh();
      
      // Also clear active highlights from editor
      clearHighlights(editor);
    }
  });

  // Export highlights command
  const exportHighlightsCmd = vscode.commands.registerCommand('presentationHighlights.exportHighlights', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }
    
    const filePath = editor.document.uri.fsPath;
    if (!fileHighlights[filePath] || fileHighlights[filePath].length === 0) {
      vscode.window.showErrorMessage('No highlights to export');
      return;
    }
    
    const folderUri = await vscode.window.showSaveDialog({
      saveLabel: 'Export Highlights',
      filters: { 'JSON': ['json'] }
    });
    
    if (folderUri) {
      try {
        fs.writeFileSync(
          folderUri.fsPath,
          JSON.stringify(fileHighlights[filePath], null, 2)
        );
        vscode.window.showInformationMessage(`Highlights exported to ${folderUri.fsPath}`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to export highlights: ${error}`);
      }
    }
  });
  
  // Import highlights command
  const importHighlightsCmd = vscode.commands.registerCommand('presentationHighlights.importHighlights', async () => {
    const fileUri = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'JSON': ['json'] }
    });
    
    if (fileUri && fileUri.length > 0) {
      try {
        const content = fs.readFileSync(fileUri[0].fsPath, 'utf8');
        const importedHighlights = JSON.parse(content) as Highlight[];
        
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showErrorMessage('No active editor found');
          return;
        }
        
        const filePath = editor.document.uri.fsPath;
        if (!fileHighlights[filePath]) {
          fileHighlights[filePath] = [];
        }
        
        fileHighlights[filePath] = [...fileHighlights[filePath], ...importedHighlights];
        vscode.window.showInformationMessage(`Imported ${importedHighlights.length} highlights`);
        highlightProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to import highlights: ${error}`);
      }
    }
  });

  // Change highlight group command
  const changeHighlightGroupCmd = vscode.commands.registerCommand('presentationHighlights.changeHighlightGroup', async (highlight: Highlight) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }

    const filePath = editor.document.uri.fsPath;
    if (!fileHighlights[filePath]) {
      return;
    }

    // Get existing groups to offer as quick picks
    const existingGroups = new Set<string>();
    fileHighlights[filePath].forEach(h => {
      if (h.group) {
        existingGroups.add(h.group);
      }
    });

    // Convert Set to array of quick pick items
    const groupQuickPicks = Array.from(existingGroups).map(group => ({
      label: group,
      description: highlight.group === group ? '(Current)' : 'Existing group'
    }));

    // Add options to create a new group or leave ungrouped
    const quickPickOptions = [
      { label: '$(plus) Create New Group', description: 'Add a new group name' },
      { label: '$(circle-slash) No Group', description: 'Leave highlight ungrouped' },
      ...groupQuickPicks
    ];

    // Show quick pick for groups
    const selectedOption = await vscode.window.showQuickPick(quickPickOptions, {
      placeHolder: `Change group for highlight "${highlight.name}"`
    });

    if (!selectedOption) {
      return; // User cancelled
    }

    let newGroup: string | undefined;
    
    if (selectedOption.label === '$(plus) Create New Group') {
      // Ask for new group name
      newGroup = await vscode.window.showInputBox({
        prompt: 'Enter a name for the new group',
        placeHolder: 'e.g. "UI Components", "Core Functions"'
      });
      
      if (newGroup === undefined) {
        return; // User cancelled
      }
    } else if (selectedOption.label === '$(circle-slash) No Group') {
      newGroup = undefined;
    } else {
      newGroup = selectedOption.label;
    }

    // Find highlight in array and update its group
    const highlightIndex = fileHighlights[filePath].findIndex(h => h.id === highlight.id);
    if (highlightIndex !== -1) {
      if (newGroup) {
        fileHighlights[filePath][highlightIndex].group = newGroup;
        showTemporaryMessage(`Moved "${highlight.name}" to group "${newGroup}"`);
      } else {
        delete fileHighlights[filePath][highlightIndex].group;
        showTemporaryMessage(`Removed "${highlight.name}" from its group`);
      }
      
      highlightProvider.refresh();
    }
  });

  // Delete group command
  const deleteGroupCmd = vscode.commands.registerCommand('presentationHighlights.deleteGroup', async (group: HighlightGroup) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }

    const filePath = editor.document.uri.fsPath;
    if (!fileHighlights[filePath]) {
      return;
    }

    // Show confirmation dialog
    const confirmMessage = `Delete group "${group.label}"? This will delete all ${group.highlights.length} highlights in this group.`;
    const confirmOptions = ['Delete Group', 'Keep Highlights but Remove Grouping', 'Cancel'];
    
    const result = await vscode.window.showWarningMessage(confirmMessage, ...confirmOptions);
    
    if (result === confirmOptions[0]) {
      // Delete highlights in group
      const idsToDelete = new Set(group.highlights.map(h => h.id));
      fileHighlights[filePath] = fileHighlights[filePath].filter(h => !idsToDelete.has(h.id));
      
      showTemporaryMessage(`Deleted group "${group.label}" and all its highlights`);
      highlightProvider.refresh();
    } else if (result === confirmOptions[1]) {
      // Keep highlights but remove them from the group
      fileHighlights[filePath].forEach(h => {
        if (h.group === group.label) {
          delete h.group;
        }
      });
      
      showTemporaryMessage(`Removed grouping for highlights in "${group.label}"`);
      highlightProvider.refresh();
    }
  });
  
  // Apply group highlights command
  const applyGroupHighlightsCmd = vscode.commands.registerCommand('presentationHighlights.applyGroupHighlights', async (group: HighlightGroup) => {
    if (!group.highlights || group.highlights.length === 0) {
      vscode.window.showErrorMessage(`No highlights found in group "${group.label}"`);
      return;
    }
    
    // First clear all highlights from all files
    // Get a list of unique file paths in this group
    const filePaths = new Set<string>();
    group.highlights.forEach(h => filePaths.add(h.filePath));
    
    // Clear highlights from each file
    for (const filePath of filePaths) {
      try {
        // Try to open the file if it's not already open
        const document = await vscode.workspace.openTextDocument(filePath);
        const editor = await vscode.window.showTextDocument(document);
        clearHighlights(editor);
      } catch (error) {
        vscode.window.showWarningMessage(`Could not clear highlights in file ${filePath}: ${error}`);
      }
    }
    
    // Apply all highlights in the group
    for (const highlight of group.highlights) {
      await applyHighlight(highlight);
    }
    
    showTemporaryMessage(`Applied all highlights from group "${group.label}"`);
  });

  // Register all commands
  context.subscriptions.push(
    saveHighlightCmd,
    applyHighlightCmd,
    clearHighlightsCmd,
    deleteHighlightCmd,
    deleteAllHighlightsCmd,
    exportHighlightsCmd,
    importHighlightsCmd,
    changeHighlightGroupCmd,
    deleteGroupCmd,
    applyGroupHighlightsCmd
  );
}