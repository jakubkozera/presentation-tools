# Presentation Tools - VS Code Extension

## Overview
Presentation Tools is a VS Code extension that enhances your coding demonstrations and presentations by allowing you to create pre-defined snapshots of your code that can be recalled with a typewriter-like animation effect. It also provides powerful code highlighting features to help draw attention to specific parts of your code during presentations.

## Features
- **Code Snapshots**: Save important states of your code to recall during presentations
- **Typewriter Animation**: Simulate live coding with realistic typing animations
- **Code Highlighting**: Create, save, and apply highlights to important sections of your code
- **Highlight Groups**: Organize your highlights into logical groups for better management
- **Sequential Navigation**: Move through highlights in sequence during presentations
- **Import/Export**: Share your highlights across different presentations or workspaces
- **Customizable Colors**: Choose from multiple highlight colors to differentiate code sections
- **Customizable Speed**: Adjust the typing speed to match your presentation pace
- **Cross-Platform**: Works on Windows, macOS, and Linux

## Installation
You can install this extension in one of two ways:

### From VS Code Marketplace
1. Open VS Code
2. Go to Extensions view (Ctrl+Shift+X or Cmd+Shift+X)
3. Search for "Presentation Tools"
4. Click Install

### Manual Installation (VSIX)
1. Download the `.vsix` file from the releases page
2. Open VS Code
3. Go to Extensions view
4. Click the "..." menu in the top-right corner
5. Select "Install from VSIX..."
6. Choose the downloaded `.vsix` file

## How to Use

### Creating Snapshots
1. Prepare your code in the editor
2. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
3. Type "Presentation Tools: Save Snapshot"
4. Enter a name for your snapshot

### Recalling Snapshots
1. Open the file you want to modify
2. Open the Command Palette
3. Type "Presentation Tools: Load Snapshot"
4. Select a previously saved snapshot
5. Watch as your code transforms with a realistic typing effect

### Using Code Highlights
1. Select the code you want to highlight
2. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
3. Type "Presentation Tools: Save Highlight"
4. Enter a name for your highlight
5. Optionally select a group and color for your highlight

### Managing Highlights
- **Apply Highlight**: Click on a saved highlight in the Highlights view or use the command palette
- **Clear Highlights**: Clear all active highlights or remove specific highlights
- **Group Highlights**: Organize highlights into logical groups for better management
- **Navigate Highlights**: Use "Load Next Highlight" to sequentially move through your highlights
- **Export/Import**: Share your highlights with colleagues or across different machines

### Highlight Groups
1. When saving a highlight, you can assign it to a new or existing group
2. Apply all highlights in a group at once using the "Apply Group Highlights" command
3. Clear all highlights from a group using the "Clear Group Highlights" command
4. Change a highlight's group or remove grouping as needed

### Adjusting Settings
You can customize the extension behavior:
1. Go to File > Preferences > Settings
2. Search for "Presentation Tools"
3. Adjust the typing speed and other available options

## Keyboard Shortcuts
The extension comes with the following default keyboard shortcuts:

| Feature | Windows/Linux | macOS |
|---------|--------------|-------|
| Save Code Snapshot | `Ctrl+Shift+S` | `Cmd+Shift+S` |
| Load Next Snapshot | `Ctrl+Shift+N` | `Cmd+Shift+N` |
| Save Code Highlight | `Ctrl+Shift+H` | `Cmd+Shift+H` |
| Load Next Highlight | `Ctrl+Shift+M` | `Cmd+Shift+M` |
| Clear All Highlights | `Ctrl+Shift+C` | `Cmd+Shift+C` |

You can customize these shortcuts in VS Code:
1. Go to File > Preferences > Keyboard Shortcuts
2. Search for "Presentation Tools"
3. Click on the shortcut you want to change and press your desired key combination

## Requirements
- VS Code 1.60.0 or higher

## Known Issues
- Auto-formatting features may interfere with the typing animation - the extension temporarily disables them during playback

## Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

## License
This extension is licensed under the MIT License.
