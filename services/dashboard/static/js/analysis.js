async function triggerAnalysis(artifactId) {
    try {
        const response = await fetch(`/api/analyze/artifact/${artifactId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('success', 'Analysis started successfully!');
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            showAlert('danger', data.error || 'Failed to start analysis');
        }
    } catch (error) {
        console.error('Error triggering analysis:', error);
        showAlert('danger', 'Failed to trigger analysis');
    }
}

async function checkAnalysisStatus(artifactId) {
    try {
        const response = await fetch(`/api/analyze/artifact/${artifactId}/status`);
        const data = await response.json();
        
        if (data.status === 'complete' || data.status === 'failed') {
            window.location.reload();
        }
    } catch (error) {
        console.error('Error checking analysis status:', error);
    }
}

async function getAnalysisResult(artifactId) {
    try {
        const response = await fetch(`/api/analyze/artifact/${artifactId}/result`);
        const data = await response.json();
        
        if (data.success) {
            return data.analysis_result;
        } else {
            throw new Error(data.error || 'Failed to get analysis result');
        }
    } catch (error) {
        console.error('Error getting analysis result:', error);
        showAlert('danger', 'Failed to get analysis result');
        return null;
    }
}

async function analyzePreview(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/analyze/preview', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            return data.result.analysis;
        } else {
            throw new Error(data.error || 'Failed to analyze file');
        }
    } catch (error) {
        console.error('Error analyzing preview:', error);
        showAlert('danger', 'Failed to analyze file preview');
        return null;
    }
}

function deployArtifact(artifactId) {
    showAlert('info', 'Deployment feature coming soon!');
}

function showAlert(type, message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 end-0 m-3`;
    alertDiv.style.zIndex = '9999';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

function renderProjectTypeIcon(projectType) {
    const icons = {
        'nodejs': 'code-square',
        'python': 'code-slash',
        'static': 'file-earmark-code',
        'docker': 'box',
        'php': 'code',
        'java': 'cup-hot',
        'go': 'code-square',
        'rust': 'gear',
        'unknown': 'question-circle'
    };
    
    const icon = icons[projectType] || 'question-circle';
    return `<i class="bi bi-${icon}"></i>`;
}

function renderConfidenceBadge(confidence) {
    let badgeClass = 'success';
    if (confidence < 0.5) {
        badgeClass = 'danger';
    } else if (confidence < 0.7) {
        badgeClass = 'warning';
    }
    
    return `<span class="badge bg-${badgeClass}">${Math.round(confidence * 100)}%</span>`;
}

function displayAnalysisResult(result, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    let html = `
        <div class="card mb-3">
            <div class="card-header">
                <h5>${renderProjectTypeIcon(result.project_type)} ${result.project_type.toUpperCase()}</h5>
            </div>
            <div class="card-body">
                <div class="row">
                    <div class="col-md-6">
                        <p><strong>Framework:</strong> ${result.framework || 'N/A'}</p>
                        <p><strong>Runtime Version:</strong> ${result.runtime_version || 'N/A'}</p>
                        <p><strong>Port:</strong> ${result.port}</p>
                        <p><strong>Confidence:</strong> ${renderConfidenceBadge(result.confidence)}</p>
                    </div>
                    <div class="col-md-6">
                        <p><strong>Build Command:</strong> <code>${result.build_command || 'None'}</code></p>
                        <p><strong>Start Command:</strong> <code>${result.start_command}</code></p>
                        <p><strong>Dependencies:</strong> ${result.dependencies_file || 'N/A'}</p>
                    </div>
                </div>
    `;
    
    if (result.requires_database) {
        html += `
                <div class="alert alert-warning mt-3">
                    <strong><i class="bi bi-database"></i> Database Required:</strong> ${result.database_type || 'Unknown'}
                </div>
        `;
    }
    
    if (result.recommendations && result.recommendations.length > 0) {
        html += `
                <div class="mt-3">
                    <h6>Recommendations:</h6>
                    <ul>
                        ${result.recommendations.map(r => `<li>${r}</li>`).join('')}
                    </ul>
                </div>
        `;
    }
    
    html += `
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

// WebSocket support for real-time updates
let analysisWebSocket = null;

function connectAnalysisWebSocket(artifactId) {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    
    analysisWebSocket = new WebSocket(wsUrl);
    
    analysisWebSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.topic === 'analysis_update' && data.data.artifact_id === artifactId) {
                if (data.data.type === 'analysis_completed' || data.data.type === 'analysis_failed') {
                    window.location.reload();
                } else if (data.data.type === 'analysis_started') {
                    showAlert('info', 'Analysis has started...');
                }
            }
        } catch (error) {
            console.error('Error processing WebSocket message:', error);
        }
    };
    
    analysisWebSocket.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    analysisWebSocket.onclose = () => {
        console.log('WebSocket connection closed');
        setTimeout(() => connectAnalysisWebSocket(artifactId), 5000);
    };
}

// Export functions for use in other scripts
window.analysisHelper = {
    triggerAnalysis,
    checkAnalysisStatus,
    getAnalysisResult,
    analyzePreview,
    deployArtifact,
    displayAnalysisResult,
    connectAnalysisWebSocket
};
