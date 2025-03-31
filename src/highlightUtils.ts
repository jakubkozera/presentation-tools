import * as vscode from 'vscode';
import { showTemporaryMessage } from './utils';

// Define the range of text that will be highlighted
export interface HighlightRange {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

// Store highlights in memory
export interface Highlight {
  id: string;
  name: string;
  ranges: HighlightRange[];
  timestamp: number;
  group?: string; // Optional group name to organize highlights
  color?: string; // Optional color for highlighting (default will be used if not specified)
  filePath: string; // Store the full file path to ensure highlights are applied to the correct file
  fileName: string; // Friendly file name for display
}

export interface FileHighlights {
  [filePath: string]: Highlight[];
}

// In-memory storage for highlights - shared across the extension
export const fileHighlights: FileHighlights = {};

/**
 * Groups highlights by their group property while preserving their original order
 * @param highlights Array of highlights to group
 * @returns A map of group names to highlight arrays
 */
export function groupHighlights(highlights: Highlight[]): Map<string, Highlight[]> {
  const groups = new Map<string, Highlight[]>();
  
  // Add ungrouped highlights to a default group
  const ungrouped: Highlight[] = [];
  
  // First pass: initialize groups
  for (const highlight of highlights) {
    if (highlight.group) {
      if (!groups.has(highlight.group)) {
        groups.set(highlight.group, []);
      }
    }
  }
  
  // Second pass: add highlights to groups in their original order
  for (const highlight of highlights) {
    if (highlight.group) {
      groups.get(highlight.group)!.push(highlight);
    } else {
      ungrouped.push(highlight);
    }
  }
  
  // Add ungrouped highlights if there are any
  if (ungrouped.length > 0) {
    groups.set('Ungrouped', ungrouped);
  }
  
  return groups;
}

// Store active decorations
const activeDecorations = new Map<string, vscode.TextEditorDecorationType[]>();

/**
 * Clear all highlight decorations in the editor
 * @param editor The text editor to clear decorations from
 */
export function clearHighlights(editor?: vscode.TextEditor): void {
  if (!editor) {
    editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
  }
  
  const filePath = editor.document.uri.fsPath;
  const decorations = activeDecorations.get(filePath) || [];
  
  // Dispose all decorations for the file
  decorations.forEach(decoration => decoration.dispose());
  
  // Clear the stored decorations for this file
  activeDecorations.set(filePath, []);
  
  // Show message
  showTemporaryMessage('Highlights cleared');
}

/**
 * Apply a highlight to the active editor
 * @param highlight The highlight to apply
 * @param editor Optional editor to apply the highlight to (defaults to active editor)
 */
export async function applyHighlight(highlight: Highlight, editor?: vscode.TextEditor): Promise<void> {
  // Check if the highlight is for a different file than the active editor
  if (!editor) {
    editor = vscode.window.activeTextEditor;
  }
  
  // If no editor is open or the file doesn't match the highlight's file, open the correct file
  if (!editor || editor.document.uri.fsPath !== highlight.filePath) {
    try {
      // Open the file associated with the highlight
      const document = await vscode.workspace.openTextDocument(highlight.filePath);
      editor = await vscode.window.showTextDocument(document);
    } catch (error) {
      vscode.window.showErrorMessage(`Could not open file for highlight: ${error}`);
      return;
    }
  }
  
  // Get configuration
  const config = vscode.workspace.getConfiguration('presentationHighlights');
  const defaultColor = config.get('defaultHighlightColor', 'rgba(255, 255, 0, 0.3)'); // Yellow with 30% opacity by default
  
  // Create decoration type
  const decorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: highlight.color || defaultColor,
    isWholeLine: false
  });
  
  // Convert highlight ranges to VS Code ranges
  const decorationOptions: vscode.DecorationOptions[] = highlight.ranges.map(range => {
    return {
      range: new vscode.Range(
        new vscode.Position(range.startLine, range.startCharacter),
        new vscode.Position(range.endLine, range.endCharacter)
      ),
      hoverMessage: highlight.name
    };
  });
  
  // Apply the decoration
  editor.setDecorations(decorationType, decorationOptions);
  
  // Store the decoration so we can clear it later
  const filePath = editor.document.uri.fsPath;
  if (!activeDecorations.has(filePath)) {
    activeDecorations.set(filePath, []);
  }
  activeDecorations.get(filePath)?.push(decorationType);
  
  // Calculate the range to reveal - use the first range in the highlight
  if (highlight.ranges.length > 0) {
    const firstRange = highlight.ranges[0];
    const revealRange = new vscode.Range(
      new vscode.Position(firstRange.startLine, firstRange.startCharacter),
      new vscode.Position(firstRange.endLine, firstRange.endCharacter)
    );
    
    // Scroll to make the highlighted region visible
    editor.revealRange(
      revealRange, 
      vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
  }
  
  // Show message
  showTemporaryMessage(`Applied highlight: "${highlight.name}"`);
}

/**
 * Create a highlight from the currently selected text
 * @param name Name for the highlight
 * @param group Optional group for the highlight
 * @param color Optional color for the highlight
 * @returns The created highlight or undefined if no selection
 */
export function createHighlightFromSelection(name: string, group?: string, color?: string): Highlight | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }
  
  // Get all selections
  const selections = editor.selections;
  if (selections.length === 0 || selections.every(s => s.isEmpty)) {
    return undefined;
  }
  
  // Get file information
  const filePath = editor.document.uri.fsPath;
  const fileName = filePath.split(/[\\/]/).pop() || 'Untitled'; // Extract file name from path
  
  // Convert selections to highlight ranges
  const ranges: HighlightRange[] = selections.map(selection => {
    return {
      startLine: selection.start.line,
      startCharacter: selection.start.character,
      endLine: selection.end.line,
      endCharacter: selection.end.character
    };
  });
  
  // Create highlight
  const highlight: Highlight = {
    id: Date.now().toString(),
    name: name,
    ranges: ranges,
    timestamp: Date.now(),
    filePath: filePath,
    fileName: fileName
  };
  
  // Add optional properties if provided
  if (group) {
    highlight.group = group;
  }
  
  if (color) {
    highlight.color = color;
  }
  
  return highlight;
}