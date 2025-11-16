import * as vscode from 'vscode';
import { JarvisAPI } from './api';
import * as path from 'path';

export class JarvisPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'jarvis.chatView';
    
    private _view?: vscode.WebviewView;
    private _conversationHistory: Array<{role: string, content: string}> = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _api: JarvisAPI
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'webview')
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'chat':
                    await this._handleChatMessage(data.message);
                    break;
                case 'clearHistory':
                    this._conversationHistory = [];
                    this._view?.webview.postMessage({ type: 'historyCleared' });
                    break;
                case 'getContext':
                    await this._handleGetContext();
                    break;
            }
        });
    }

    private async _handleChatMessage(message: string) {
        if (!this._view) {
            return;
        }

        // Get current editor context
        const editor = vscode.window.activeTextEditor;
        let context = undefined;

        if (editor) {
            const selection = editor.document.getText(editor.selection);
            if (selection) {
                context = {
                    file: editor.document.fileName,
                    selection: selection,
                    language: editor.document.languageId
                };
            }
        }

        // Add user message to history
        this._conversationHistory.push({
            role: 'user',
            content: message
        });

        // Show loading state
        this._view.webview.postMessage({ 
            type: 'loading',
            message: 'Jarvis is thinking...'
        });

        try {
            const result = await this._api.chat(
                message,
                context,
                this._conversationHistory
            );

            if (result.success && result.response) {
                // Add assistant response to history
                this._conversationHistory.push({
                    role: 'assistant',
                    content: result.response
                });

                // Send response to webview
                this._view.webview.postMessage({
                    type: 'response',
                    message: result.response,
                    model: result.model,
                    tokens: result.tokens
                });
            } else {
                this._view.webview.postMessage({
                    type: 'error',
                    message: result.message || 'Failed to get response from Jarvis'
                });
            }
        } catch (error) {
            this._view.webview.postMessage({
                type: 'error',
                message: `Error: ${error}`
            });
        }
    }

    private async _handleGetContext() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !this._view) {
            this._view?.webview.postMessage({
                type: 'context',
                hasContext: false
            });
            return;
        }

        const selection = editor.document.getText(editor.selection);
        
        this._view.webview.postMessage({
            type: 'context',
            hasContext: !!selection,
            file: editor.document.fileName,
            language: editor.document.languageId,
            selection: selection
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'webview', 'main.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'webview', 'styles.css')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource};">
    <link href="${styleUri}" rel="stylesheet">
    <title>Jarvis Chat</title>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            <h3>Jarvis AI Assistant</h3>
            <button id="clearBtn" class="btn-clear">Clear</button>
        </div>
        <div id="messages" class="messages"></div>
        <div class="context-indicator" id="contextIndicator" style="display: none;">
            <span id="contextText"></span>
        </div>
        <div class="input-container">
            <textarea id="messageInput" placeholder="Ask Jarvis anything..." rows="3"></textarea>
            <button id="sendBtn" class="btn-send">Send</button>
        </div>
    </div>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }
}
