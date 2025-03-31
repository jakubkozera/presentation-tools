import * as vscode from 'vscode';

// Status bar item for typing mode
let typingModeStatusBarItem: vscode.StatusBarItem;

/**
 * Updates the status bar based on current typing speed configuration
 */
function updateStatusBar(): void {
  const config = vscode.workspace.getConfiguration('presentationSnapshots');
  const typingSpeed = config.get('typingSpeed', 10);
  
  typingModeStatusBarItem.text = `$(keyboard) Typing: ${typingSpeed} cps`;
  typingModeStatusBarItem.tooltip = `Typing speed set to ${typingSpeed} characters per second`;
  typingModeStatusBarItem.show();
}

/**
 * Adjusts the typing speed
 */
async function adjustTypingSpeed(): Promise<void> {
  const config = vscode.workspace.getConfiguration('presentationSnapshots');
  const currentSpeed = config.get('typingSpeed', 10);
  
  const result = await vscode.window.showInputBox({
    prompt: 'Enter typing speed (characters per second)',
    value: currentSpeed.toString(),
    validateInput: (value) => {
      const num = parseInt(value);
      return (isNaN(num) || num <= 0) ? 'Please enter a positive number' : null;
    }
  });
  
  if (result) {
    const speed = parseInt(result);
    await config.update('typingSpeed', speed, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`Typing speed set to ${speed} characters per second`);
    updateStatusBar();
  }
}

/**
 * Initialize the status bar and register related commands
 * @param context The extension context
 */
export function initializeStatusBar(context: vscode.ExtensionContext): void {
  // Create status bar item
  typingModeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  // No command association - status bar item is now just informational
  
  // Initial status bar update
  updateStatusBar();
  
  // Register commands
  const adjustTypingSpeedCmd = vscode.commands.registerCommand('presentationSnapshots.adjustTypingSpeed', adjustTypingSpeed);
  
  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('presentationSnapshots')) {
        updateStatusBar();
      }
    }),
    adjustTypingSpeedCmd,
    typingModeStatusBarItem
  );
}