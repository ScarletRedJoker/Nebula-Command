async function loadModels() {
    const tbody = document.getElementById('modelsList');
    const response = await fetch('/api/ollama/models');
    const data = await response.json();
    
    if (data.success && data.models.length > 0) {
        tbody.innerHTML = data.models.map(model => `
            <tr>
                <td>${model.name}</td>
                <td>${formatBytes(model.size)}</td>
                <td>${new Date(model.modified_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="deleteModel('${model.name}')">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No models installed</td></tr>';
    }
}

async function pullModel() {
    const select = document.getElementById('modelSelect');
    let modelName = select.value;
    
    if (modelName === 'custom') {
        modelName = document.getElementById('customModel').value.trim();
        if (!modelName) {
            alert('Please enter a model name');
            return;
        }
    }
    
    const progressDiv = document.getElementById('pullProgress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    progressDiv.style.display = 'block';
    progressBar.style.width = '0%';
    
    try {
        const response = await fetch('/api/ollama/models/pull', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ model: modelName })
        });
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    
                    if (data === '[DONE]') {
                        progressBar.style.width = '100%';
                        progressText.textContent = 'Download complete!';
                        setTimeout(() => {
                            progressDiv.style.display = 'none';
                            loadModels();
                        }, 2000);
                        return;
                    }
                    
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.status) {
                            progressText.textContent = parsed.status;
                        }
                        if (parsed.completed && parsed.total) {
                            const percent = (parsed.completed / parsed.total * 100).toFixed(0);
                            progressBar.style.width = `${percent}%`;
                        }
                    } catch (e) {
                        console.error('Error parsing progress:', e);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error pulling model:', error);
        progressText.textContent = 'Error downloading model';
    }
}

async function deleteModel(modelName) {
    if (!confirm(`Delete model ${modelName}?`)) return;
    
    const response = await fetch(`/api/ollama/models/${encodeURIComponent(modelName)}`, {
        method: 'DELETE'
    });
    
    if (response.ok) {
        loadModels();
    }
}

function formatBytes(bytes) {
    const gb = bytes / 1024 / 1024 / 1024;
    return `${gb.toFixed(2)} GB`;
}

document.getElementById('modelSelect').addEventListener('change', (e) => {
    document.getElementById('customModelInput').style.display = 
        e.target.value === 'custom' ? 'block' : 'none';
});

loadModels();
setInterval(loadModels, 30000);
