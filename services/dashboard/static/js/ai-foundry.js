async function loadModels() {
    const resp = await fetch('/api/ai-foundry/models');
    if (resp.ok) {
        const data = await resp.json();
        const grid = document.getElementById('modelGrid');
        grid.innerHTML = data.models.map(model => `
            <div class="model-card">
                <div class="model-header">
                    <i class="bi bi-robot"></i>
                    <h4>${model.name}</h4>
                </div>
                <div class="model-info">
                    <p><strong>Size:</strong> ${model.size}</p>
                    <p><strong>Status:</strong> <span class="status-${model.status}">${model.status}</span></p>
                    ${model.progress ? `<div class="progress"><div class="progress-bar" style="width: ${model.progress}%">${model.progress}%</div></div>` : ''}
                </div>
                <div class="model-actions">
                    ${model.status === 'downloaded' ? '<button class="btn btn-success" onclick="useModel(\'' + model.name + '\')">Use Model</button>' : ''}
                    ${model.status === 'available' ? '<button class="btn btn-primary" onclick="downloadModel(\'' + model.name + '\')">Download</button>' : ''}
                </div>
            </div>
        `).join('');
    }
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;
    
    const chatBox = document.getElementById('chatBox');
    chatBox.innerHTML += `
        <div class="chat-message user">
            <strong>You:</strong> ${message}
        </div>
    `;
    
    input.value = '';
    
    const model = document.getElementById('modelSelect').value;
    const resp = await fetch('/api/ai-foundry/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({message, model})
    });
    
    if (resp.ok) {
        const data = await resp.json();
        chatBox.innerHTML += `
            <div class="chat-message assistant">
                <strong>AI:</strong> ${data.response}
            </div>
        `;
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

function showDownloadModal() {
    alert('Model download would be triggered here (Demo Mode)');
}

function downloadModel(name) {
    alert('Downloading model: ' + name + ' (Demo Mode)');
}

function useModel(name) {
    document.getElementById('modelSelect').value = name;
    alert('Switched to model: ' + name);
}

document.getElementById('chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

document.addEventListener('DOMContentLoaded', () => {
    loadModels();
});
