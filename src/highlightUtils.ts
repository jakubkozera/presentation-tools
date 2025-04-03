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

// Track active decorations
const activeDecorations = new Map<string, vscode.TextEditorDecorationType[]>();

// Track which highlights are currently applied (by id)
const appliedHighlights = new Map<string, Set<string>>();

// Track the last applied highlight for navigation
export let lastAppliedHighlight: { filePath: string, highlightId: string } | null = null;

/**
 * Set the last applied highlight for navigation
 * @param filePath The file path of the highlight
 * @param highlightId The ID of the highlight
 */
export function setLastAppliedHighlight(filePath: string, highlightId: string): void {
  lastAppliedHighlight = { filePath, highlightId };
}

// Function to clear a single highlight from an editor
export function clearSingleHighlightFromEditor(highlight: Highlight, editor: vscode.TextEditor): void {
  // We need to track the active decorations for this file
  const filePath = editor.document.uri.fsPath;
  
  // Mark this highlight as no longer applied
  const appliedSet = appliedHighlights.get(filePath);
  if (appliedSet) {
    appliedSet.delete(highlight.id);
  }
  
  // We don't have a direct way to know which decoration belongs to which highlight
  // So we'll need to clear all decorations and re-apply the ones that should remain visible
  
  // Store which highlights were applied before clearing
  const appliedIds = new Set<string>(appliedSet || []);
  
  // Remove the current highlight from the set of applied highlights
  appliedIds.delete(highlight.id);
  
  // Clear all decorations
  const decorations = activeDecorations.get(filePath) || [];
  decorations.forEach(decoration => decoration.dispose());
  activeDecorations.set(filePath, []);
  
  // Re-apply only the highlights that should remain visible
  const fileHighlightsList = fileHighlights[filePath] || [];
  for (const h of fileHighlightsList) {
    if (appliedIds.has(h.id)) {
      // We don't want to wait for this to complete, so don't use await
      applyHighlightWithoutTracking(h, editor);
    }
  }
  
  // Make sure our tracking reflects what's actually shown
  appliedHighlights.set(filePath, appliedIds);
  
  // Show message
  showTemporaryMessage(`Cleared highlight: "${highlight.name}"`);
}

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
  
  // Clear the tracking for applied highlights
  appliedHighlights.set(filePath, new Set<string>());
  
  // Show message
  showTemporaryMessage('Highlights cleared');
}

/**
 * Check if a highlight is currently applied
 * @param highlight The highlight to check
 * @returns true if the highlight is currently applied
 */
export function isHighlightApplied(highlight: Highlight): boolean {
  const filePath = highlight.filePath;
  const appliedSet = appliedHighlights.get(filePath);
  return appliedSet ? appliedSet.has(highlight.id) : false;
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
  const config = vscode.workspace.getConfiguration('presentationTools');
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
  
  // Track that this highlight is now applied
  if (!appliedHighlights.has(filePath)) {
    appliedHighlights.set(filePath, new Set<string>());
  }
  appliedHighlights.get(filePath)?.add(highlight.id);
  
  // Set the last applied highlight for navigation
  setLastAppliedHighlight(filePath, highlight.id);
  
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
 * Apply a highlight to an editor without updating tracking
 * Used internally for re-applying highlights after clearing one
 * @param highlight The highlight to apply
 * @param editor The editor to apply the highlight to
 */
function applyHighlightWithoutTracking(highlight: Highlight, editor: vscode.TextEditor): void {
  // Get configuration
  const config = vscode.workspace.getConfiguration('presentationTools');
  const defaultColor = config.get('defaultHighlightColor', 'rgba(255, 255, 0, 0.3)');
  
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
  
  // Note: We don't update the appliedHighlights tracking data here
  // because we assume the calling function handles that
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