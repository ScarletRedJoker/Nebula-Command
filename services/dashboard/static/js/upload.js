// File Upload Handler
let selectedFiles = [];
let uploadInProgress = false;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeUpload();
    loadArtifacts();
});

function initializeUpload() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');

    // Click to browse
    dropZone.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', handleFileSelect);

    // Drag and drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#0d6efd';
        dropZone.style.backgroundColor = '#f8f9fa';
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#dee2e6';
        dropZone.style.backgroundColor = 'transparent';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#dee2e6';
        dropZone.style.backgroundColor = 'transparent';
        
        const files = Array.from(e.dataTransfer.files);
        handleFiles(files);
    });

    // Upload button
    uploadBtn.addEventListener('click', uploadFiles);
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    handleFiles(files);
}

function handleFiles(files) {
    selectedFiles = files;
    
    if (files.length > 0) {
        displaySelectedFiles(files);
        document.getElementById('uploadBtn').disabled = false;
    } else {
        document.getElementById('uploadBtn').disabled = true;
    }
}

function displaySelectedFiles(files) {
    const fileList = document.getElementById('fileList');
    const selectedFilesDiv = document.getElementById('selectedFiles');
    
    fileList.innerHTML = '';
    
    files.forEach((file, index) => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        
        const fileInfo = document.createElement('div');
        fileInfo.innerHTML = `
            <strong>${file.name}</strong>
            <br><small class="text-muted">${formatFileSize(file.size)}</small>
        `;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-sm btn-danger';
        removeBtn.innerHTML = '<i class="bi bi-x"></i>';
        removeBtn.onclick = () => removeFile(index);
        
        li.appendChild(fileInfo);
        li.appendChild(removeBtn);
        fileList.appendChild(li);
    });
    
    selectedFilesDiv.style.display = 'block';
}

function removeFile(index) {
    const filesArray = Array.from(selectedFiles);
    filesArray.splice(index, 1);
    selectedFiles = filesArray;
    
    if (selectedFiles.length > 0) {
        displaySelectedFiles(selectedFiles);
    } else {
        document.getElementById('selectedFiles').style.display = 'none';
        document.getElementById('uploadBtn').disabled = true;
    }
}

async function uploadFiles() {
    if (uploadInProgress || selectedFiles.length === 0) return;
    
    uploadInProgress = true;
    const bucket = document.getElementById('bucketSelect').value;
    const extractZip = document.getElementById('extractZip').checked;
    const progressDiv = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('progressBar');
    const uploadStatus = document.getElementById('uploadStatus');
    const uploadBtn = document.getElementById('uploadBtn');
    
    uploadBtn.disabled = true;
    progressDiv.style.display = 'block';
    
    let uploaded = 0;
    const total = selectedFiles.length;
    
    for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const isZip = file.name.toLowerCase().endsWith('.zip');
        
        updateProgress((i / total) * 100, `Uploading ${file.name}...`);
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('bucket', bucket);
            
            if (isZip && extractZip) {
                formData.append('extract', 'true');
            }
            
            const endpoint = isZip ? '/api/upload/zip' : '/api/upload/file';
            
            const response = await fetch(endpoint, {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                uploaded++;
                showToast('success', `Uploaded: ${file.name}`);
            } else {
                showToast('error', `Failed to upload ${file.name}: ${result.error}`);
            }
        } catch (error) {
            console.error('Upload error:', error);
            showToast('error', `Error uploading ${file.name}: ${error.message}`);
        }
    }
    
    updateProgress(100, `Completed: ${uploaded}/${total} files uploaded`);
    
    setTimeout(() => {
        progressDiv.style.display = 'none';
        progressBar.style.width = '0%';
        uploadBtn.disabled = false;
        uploadInProgress = false;
        
        // Clear selected files
        selectedFiles = [];
        document.getElementById('selectedFiles').style.display = 'none';
        document.getElementById('fileInput').value = '';
        document.getElementById('uploadBtn').disabled = true;
        
        // Reload artifacts list
        loadArtifacts();
    }, 2000);
}

function updateProgress(percent, status) {
    const progressBar = document.getElementById('progressBar');
    const uploadStatus = document.getElementById('uploadStatus');
    
    progressBar.style.width = `${percent}%`;
    progressBar.textContent = `${Math.round(percent)}%`;
    uploadStatus.textContent = status;
}

async function loadArtifacts() {
    const loadingDiv = document.getElementById('artifactsLoading');
    const listDiv = document.getElementById('artifactsList');
    const tableBody = document.getElementById('artifactsTableBody');
    const noArtifacts = document.getElementById('noArtifacts');
    
    loadingDiv.style.display = 'block';
    listDiv.style.display = 'none';
    
    try {
        const response = await fetch('/api/artifacts?limit=50', {
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            const artifacts = result.artifacts;
            
            if (artifacts.length === 0) {
                noArtifacts.style.display = 'block';
                tableBody.innerHTML = '';
            } else {
                noArtifacts.style.display = 'none';
                displayArtifacts(artifacts);
            }
        } else {
            showToast('error', 'Failed to load artifacts: ' + result.error);
        }
    } catch (error) {
        console.error('Error loading artifacts:', error);
        showToast('error', 'Error loading artifacts: ' + error.message);
    } finally {
        loadingDiv.style.display = 'none';
        listDiv.style.display = 'block';
    }
}

function displayArtifacts(artifacts) {
    const tableBody = document.getElementById('artifactsTableBody');
    tableBody.innerHTML = '';
    
    artifacts.forEach(artifact => {
        const row = document.createElement('tr');
        
        const uploadedAt = artifact.uploaded_at ? 
            new Date(artifact.uploaded_at).toLocaleString() : 'Unknown';
        
        row.innerHTML = `
            <td>
                <i class="bi bi-file-earmark-zip text-primary"></i>
                ${artifact.original_filename || artifact.filename}
            </td>
            <td>${formatFileSize(artifact.file_size)}</td>
            <td><span class="badge bg-info">${artifact.file_type}</span></td>
            <td>${uploadedAt}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="downloadArtifact('${artifact.id}')">
                    <i class="bi bi-download"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteArtifact('${artifact.id}', '${artifact.filename}')">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
}

async function downloadArtifact(artifactId) {
    try {
        const response = await fetch(`/api/artifacts/${artifactId}/download`, {
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            window.open(result.download_url, '_blank');
            showToast('success', 'Download started');
        } else {
            showToast('error', 'Download failed: ' + result.error);
        }
    } catch (error) {
        console.error('Download error:', error);
        showToast('error', 'Download error: ' + error.message);
    }
}

async function deleteArtifact(artifactId, filename) {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/artifacts/${artifactId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showToast('success', 'Artifact deleted successfully');
            loadArtifacts();
        } else {
            showToast('error', 'Delete failed: ' + result.error);
        }
    } catch (error) {
        console.error('Delete error:', error);
        showToast('error', 'Delete error: ' + error.message);
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function showToast(type, message) {
    const toastId = type === 'success' ? 'successToast' : 'errorToast';
    const toastEl = document.getElementById(toastId);
    const toastBody = toastEl.querySelector('.toast-body');
    
    toastBody.textContent = message;
    
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
}
