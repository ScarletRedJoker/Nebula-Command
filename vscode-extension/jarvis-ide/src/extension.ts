import * as vscode from 'vscode';
import { JarvisPanel } from './JarvisPanel';
import { JarvisAPI } from './api';

let jarvisPanel: JarvisPanel | undefined;
let jarvisAPI: JarvisAPI;

export function activate(context: vscode.ExtensionContext) {
    console.log('Jarvis IDE extension is now active');

    // Initialize API client
    const config = vscode.workspace.getConfiguration('jarvis');
    jarvisAPI = new JarvisAPI(
        config.get('apiUrl', 'http://localhost:5000'),
        config.get('username', ''),
        config.get('password', '')
    );

    // Register chat panel provider
    const provider = new JarvisPanel(context.extensionUri, jarvisAPI);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(JarvisPanel.viewType, provider)
    );
    jarvisPanel = provider;

    // Command: Open Chat
    context.subscriptions.push(
        vscode.commands.registerCommand('jarvis.openChat', () => {
            vscode.commands.executeCommand('jarvis.chatView.focus');
        })
    );

    // Command: Generate Code
    context.subscriptions.push(
        vscode.commands.registerCommand('jarvis.generateCode', async () => {
            const description = await vscode.window.showInputBox({
                prompt: 'Describe the code you want to generate',
                placeHolder: 'e.g., function to validate email addresses'
            });

            if (!description) {
                return;
            }

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor');
                return;
            }

            const languageId = editor.document.languageId;
            
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Generating code...',
                cancellable: false
            }, async () => {
                try {
                    const result = await jarvisAPI.generateCode(description, languageId);
                    
                    if (result.success && result.code) {
                        const position = editor.selection.active;
                        await editor.edit(editBuilder => {
                            editBuilder.insert(position, result.code + '\n');
                        });
                        
                        vscode.window.showInformationMessage('Code generated successfully');
                    } else {
                        vscode.window.showErrorMessage(`Failed to generate code: ${result.message || 'Unknown error'}`);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Error: ${error}`);
                }
            });
        })
    );

    // Command: Explain Code
    context.subscriptions.push(
        vscode.commands.registerCommand('jarvis.explainCode', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor');
                return;
            }

            const selection = editor.document.getText(editor.selection);
            if (!selection) {
                vscode.window.showErrorMessage('Please select some code first');
                return;
            }

            const languageId = editor.document.languageId;

            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Analyzing code...',
                cancellable: false
            }, async () => {
                try {
                    const result = await jarvisAPI.analyzeCode(selection, languageId, 'explain');
                    
                    if (result.success && result.analysis) {
                        // Show in new document
                        const doc = await vscode.workspace.openTextDocument({
                            content: result.analysis,
                            language: 'markdown'
                        });
                        await vscode.window.showTextDocument(doc);
                    } else {
                        vscode.window.showErrorMessage(`Failed to explain code: ${result.message || 'Unknown error'}`);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Error: ${error}`);
                }
            });
        })
    );

    // Command: Analyze Code
    context.subscriptions.push(
        vscode.commands.registerCommand('jarvis.analyzeCode', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor');
                return;
            }

            const selection = editor.document.getText(editor.selection);
            if (!selection) {
                vscode.window.showErrorMessage('Please select some code first');
                return;
            }

            const languageId = editor.document.languageId;

            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Analyzing code...',
                cancellable: false
            }, async () => {
                try {
                    const result = await jarvisAPI.analyzeCode(selection, languageId, 'analyze');
                    
                    if (result.success && result.analysis) {
                        const doc = await vscode.workspace.openTextDocument({
                            content: result.analysis,
                            language: 'markdown'
                        });
                        await vscode.window.showTextDocument(doc);
                    } else {
                        vscode.window.showErrorMessage(`Failed to analyze code: ${result.message || 'Unknown error'}`);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Error: ${error}`);
                }
            });
        })
    );

    // Command: Optimize Code
    context.subscriptions.push(
        vscode.commands.registerCommand('jarvis.optimizeCode', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor');
                return;
            }

            const selection = editor.document.getText(editor.selection);
            if (!selection) {
                vscode.window.showErrorMessage('Please select some code first');
                return;
            }

            const languageId = editor.document.languageId;

            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Optimizing code...',
                cancellable: false
            }, async () => {
                try {
                    const result = await jarvisAPI.analyzeCode(selection, languageId, 'optimize');
                    
                    if (result.success && result.analysis) {
                        const doc = await vscode.workspace.openTextDocument({
                            content: result.analysis,
                            language: 'markdown'
                        });
                        await vscode.window.showTextDocument(doc);
                    } else {
                        vscode.window.showErrorMessage(`Failed to optimize code: ${result.message || 'Unknown error'}`);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Error: ${error}`);
                }
            });
        })
    );

    // Command: Multi-Model Collaborate
    context.subscriptions.push(
        vscode.commands.registerCommand('jarvis.collaborate', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor');
                return;
            }

            const selection = editor.document.getText(editor.selection);
            if (!selection) {
                vscode.window.showErrorMessage('Please select some code first');
                return;
            }

            const question = await vscode.window.showInputBox({
                prompt: 'What would you like the AI models to discuss about this code?',
                placeHolder: 'e.g., What are potential security issues?'
            });

            if (!question) {
                return;
            }

            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Consulting multiple AI models...',
                cancellable: false
            }, async () => {
                try {
                    const result = await jarvisAPI.collaborate(question, selection);
                    
                    if (result.success && result.conversation) {
                        let content = `# Multi-Model Code Review\n\n## Question: ${question}\n\n`;
                        
                        result.conversation.forEach((item: any, index: number) => {
                            content += `\n## ${item.model}\n\n${item.response}\n\n---\n`;
                        });
                        
                        if (result.consensus) {
                            content += `\n## Consensus\n\n${result.consensus}\n`;
                        }
                        
                        const doc = await vscode.workspace.openTextDocument({
                            content: content,
                            language: 'markdown'
                        });
                        await vscode.window.showTextDocument(doc);
                    } else {
                        vscode.window.showErrorMessage(`Failed to collaborate: ${result.message || 'Unknown error'}`);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Error: ${error}`);
                }
            });
        })
    );

    console.log('Jarvis IDE commands registered');
}

export function deactivate() {
    console.log('Jarvis IDE extension deactivated');
}
