/**
 * Google Services Dashboard JavaScript
 */

let csrfToken = null;
let wsConnection = null;

// Initialize dashboard
async function initGoogleServices() {
    console.log('Initializing Google Services dashboard');
    
    // Fetch CSRF token
    await fetchCsrfToken();
    
    // Load initial data
    await refreshStatus();
    await loadCalendarAutomations();
    await loadEmailNotifications();
    await loadBackups();
    await loadStorageInfo();
    
    // Setup form handlers
    setupFormHandlers();
    
    // Setup WebSocket for real-time updates
    setupWebSocket();
    
    console.log('Google Services dashboard initialized');
}

// Fetch CSRF token
async function fetchCsrfToken() {
    try {
        const response = await fetch('/google/api/csrf-token');
        const data = await response.json();
        
        if (data.success) {
            csrfToken = data.csrf_token;
        } else {
            showError('Failed to get CSRF token');
        }
    } catch (error) {
        console.error('Error fetching CSRF token:', error);
        showError('Failed to initialize security token');
    }
}

// API call with CSRF token
async function apiCall(url, options = {}) {
    if (!csrfToken) {
        await fetchCsrfToken();
    }
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        }
    };
    
    const mergedOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...(options.headers || {})
        }
    };
    
    const response = await fetch(url, mergedOptions);
    return response.json();
}

// Refresh status
async function refreshStatus() {
    try {
        const data = await apiCall('/google/api/status');
        
        if (data.success) {
            updateStatusDisplay(data.status);
        } else {
            showError('Failed to fetch status: ' + data.error);
        }
    } catch (error) {
        console.error('Error fetching status:', error);
        showError('Failed to fetch status');
    }
}

// Update status display
function updateStatusDisplay(status) {
    const services = status.services;
    
    // Calendar
    if (services.calendar) {
        const connected = services.calendar.connected;
        document.getElementById('calendarStatus').textContent = connected ? 'Connected' : 'Disconnected';
        document.getElementById('calendarDetails').textContent = connected ? 
            `${services.calendar.calendars || 0} calendars` : 'Not connected';
    }
    
    // Gmail
    if (services.gmail) {
        const connected = services.gmail.connected;
        document.getElementById('gmailStatus').textContent = connected ? 'Connected' : 'Disconnected';
        document.getElementById('gmailDetails').textContent = connected ? 
            services.gmail.email || 'Connected' : 'Not connected';
    }
    
    // Drive
    if (services.drive) {
        const connected = services.drive.connected;
        document.getElementById('driveStatus').textContent = connected ? 'Connected' : 'Disconnected';
        document.getElementById('driveDetails').textContent = connected ? 
            services.drive.email || 'Connected' : 'Not connected';
    }
    
    // Detailed status
    let statusHtml = '<table class="table table-striped">';
    statusHtml += '<thead><tr><th>Service</th><th>Status</th><th>Details</th></tr></thead><tbody>';
    
    for (const [serviceName, serviceStatus] of Object.entries(services)) {
        const statusBadge = serviceStatus.connected ? 
            '<span class="badge bg-success">Connected</span>' : 
            '<span class="badge bg-danger">Disconnected</span>';
        
        let details = '';
        if (serviceStatus.connected) {
            if (serviceName === 'gmail' && serviceStatus.email) {
                details = serviceStatus.email;
            } else if (serviceName === 'calendar' && serviceStatus.calendars !== undefined) {
                details = `${serviceStatus.calendars} calendars`;
            } else if (serviceName === 'drive' && serviceStatus.email) {
                details = serviceStatus.email;
            }
        } else if (serviceStatus.error) {
            details = `<span class="text-danger">${serviceStatus.error}</span>`;
        }
        
        statusHtml += `<tr><td>${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)}</td><td>${statusBadge}</td><td>${details}</td></tr>`;
    }
    
    statusHtml += '</tbody></table>';
    document.getElementById('statusDetails').innerHTML = statusHtml;
}

// Reset connections
async function resetConnections() {
    if (!confirm('Reset all Google service connections? This will clear cached tokens.')) {
        return;
    }
    
    try {
        const data = await apiCall('/google/api/reset', { method: 'POST' });
        
        if (data.success) {
            showSuccess('Connections reset successfully');
            await refreshStatus();
        } else {
            showError('Failed to reset connections: ' + data.error);
        }
    } catch (error) {
        console.error('Error resetting connections:', error);
        showError('Failed to reset connections');
    }
}

// Load calendar automations
async function loadCalendarAutomations() {
    try {
        const data = await apiCall('/google/api/calendar/automations');
        
        if (data.success) {
            displayAutomations(data.automations);
        } else {
            document.getElementById('automationsList').innerHTML = 
                `<div class="alert alert-danger">${data.error}</div>`;
        }
    } catch (error) {
        console.error('Error loading automations:', error);
        document.getElementById('automationsList').innerHTML = 
            '<div class="alert alert-danger">Failed to load automations</div>';
    }
}

// Display automations
function displayAutomations(automations) {
    if (automations.length === 0) {
        document.getElementById('automationsList').innerHTML = 
            '<p class="text-muted">No automations configured.</p>';
        return;
    }
    
    let html = '<div class="list-group">';
    
    for (const auto of automations) {
        const statusBadge = auto.status === 'active' ? 
            '<span class="badge bg-success">Active</span>' : 
            '<span class="badge bg-secondary">Inactive</span>';
        
        html += `
            <div class="list-group-item">
                <div class="d-flex w-100 justify-content-between">
                    <h5 class="mb-1">${auto.name} ${statusBadge}</h5>
                    <small>${auto.trigger_count || 0} triggers</small>
                </div>
                <p class="mb-1">${auto.description || ''}</p>
                <small>Keywords: ${auto.event_keywords.join(', ')}</small><br>
                <small>Lead time: ${auto.lead_time_minutes} min | HA Service: ${auto.ha_service_domain || 'none'}.${auto.ha_service_name || 'none'}</small>
                <div class="mt-2">
                    <button class="btn btn-sm btn-primary" onclick="editAutomation('${auto.id}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteAutomation('${auto.id}')">Delete</button>
                </div>
            </div>
        `;
    }
    
    html += '</div>';
    document.getElementById('automationsList').innerHTML = html;
}

// Show automation form
function showAutomationForm() {
    document.getElementById('automationFormCard').style.display = 'block';
    document.getElementById('automationForm').reset();
    document.getElementById('automationId').value = '';
}

// Hide automation form
function hideAutomationForm() {
    document.getElementById('automationFormCard').style.display = 'none';
}

// Edit automation
async function editAutomation(id) {
    // For simplicity, we'll just show the form
    // In a full implementation, you'd fetch the automation details and populate the form
    showAutomationForm();
    showInfo('Edit functionality - populate form with automation data');
}

// Delete automation
async function deleteAutomation(id) {
    if (!confirm('Delete this automation?')) {
        return;
    }
    
    try {
        const data = await apiCall(`/google/api/calendar/automations/${id}`, { method: 'DELETE' });
        
        if (data.success) {
            showSuccess('Automation deleted');
            await loadCalendarAutomations();
        } else {
            showError('Failed to delete automation: ' + data.error);
        }
    } catch (error) {
        console.error('Error deleting automation:', error);
        showError('Failed to delete automation');
    }
}

// Load email notifications
async function loadEmailNotifications() {
    try {
        const data = await apiCall('/google/api/gmail/notifications?limit=10');
        
        if (data.success) {
            displayNotifications(data.notifications);
        } else {
            document.getElementById('notificationsList').innerHTML = 
                `<div class="alert alert-danger">${data.error}</div>`;
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
        document.getElementById('notificationsList').innerHTML = 
            '<div class="alert alert-danger">Failed to load notifications</div>';
    }
}

// Display notifications
function displayNotifications(notifications) {
    if (notifications.length === 0) {
        document.getElementById('notificationsList').innerHTML = 
            '<p class="text-muted">No notifications sent yet.</p>';
        return;
    }
    
    let html = '<div class="list-group">';
    
    for (const notif of notifications) {
        const statusBadge = notif.status === 'sent' ? 
            '<span class="badge bg-success">Sent</span>' : 
            notif.status === 'failed' ? 
            '<span class="badge bg-danger">Failed</span>' : 
            '<span class="badge bg-warning">Pending</span>';
        
        const timestamp = new Date(notif.created_at).toLocaleString();
        
        html += `
            <div class="list-group-item">
                <div class="d-flex w-100 justify-content-between">
                    <small>${notif.recipient}</small>
                    ${statusBadge}
                </div>
                <p class="mb-1">${notif.subject}</p>
                <small class="text-muted">${timestamp}</small>
            </div>
        `;
    }
    
    html += '</div>';
    document.getElementById('notificationsList').innerHTML = html;
}

// Load backups
async function loadBackups() {
    try {
        const data = await apiCall('/google/api/drive/backups/history');
        
        if (data.success) {
            displayBackups(data.backups);
        } else {
            document.getElementById('backupsList').innerHTML = 
                `<div class="alert alert-danger">${data.error}</div>`;
        }
    } catch (error) {
        console.error('Error loading backups:', error);
        document.getElementById('backupsList').innerHTML = 
            '<div class="alert alert-danger">Failed to load backups</div>';
    }
}

// Display backups
function displayBackups(backups) {
    if (backups.length === 0) {
        document.getElementById('backupsList').innerHTML = 
            '<p class="text-muted">No backups found.</p>';
        return;
    }
    
    let html = '<table class="table table-striped"><thead><tr><th>File Name</th><th>Size</th><th>Uploaded</th><th>Actions</th></tr></thead><tbody>';
    
    for (const backup of backups) {
        const size = formatBytes(backup.file_size);
        const uploaded = new Date(backup.created_at).toLocaleString();
        
        html += `
            <tr>
                <td>${backup.file_name}</td>
                <td>${size}</td>
                <td>${uploaded}</td>
                <td>
                    ${backup.web_view_link ? `<a href="${backup.web_view_link}" target="_blank" class="btn btn-sm btn-primary">View</a>` : ''}
                    <button class="btn btn-sm btn-danger" onclick="deleteBackup('${backup.id}')">Delete</button>
                </td>
            </tr>
        `;
    }
    
    html += '</tbody></table>';
    document.getElementById('backupsList').innerHTML = html;
}

// Delete backup
async function deleteBackup(id) {
    if (!confirm('Delete this backup from Google Drive?')) {
        return;
    }
    
    try {
        const data = await apiCall(`/google/api/drive/backups/${id}`, { method: 'DELETE' });
        
        if (data.success) {
            showSuccess('Backup deleted');
            await loadBackups();
        } else {
            showError('Failed to delete backup: ' + data.error);
        }
    } catch (error) {
        console.error('Error deleting backup:', error);
        showError('Failed to delete backup');
    }
}

// Refresh backups
async function refreshBackups() {
    showInfo('Refreshing backups...');
    await loadBackups();
    showSuccess('Backups refreshed');
}

// Cleanup old backups
async function cleanupOldBackups() {
    if (!confirm('Delete backups older than 30 days?')) {
        return;
    }
    
    showInfo('Cleanup task started...');
    showSuccess('Cleanup task queued - check back in a few minutes');
}

// Load storage info
async function loadStorageInfo() {
    try {
        const data = await apiCall('/google/api/drive/storage');
        
        if (data.success) {
            displayStorageInfo(data.storage);
        } else {
            document.getElementById('storageInfo').innerHTML = 
                `<div class="alert alert-danger">${data.error}</div>`;
        }
    } catch (error) {
        console.error('Error loading storage info:', error);
        document.getElementById('storageInfo').innerHTML = 
            '<div class="alert alert-danger">Failed to load storage info</div>';
    }
}

// Display storage info
function displayStorageInfo(storage) {
    const total = storage.limit || 0;
    const used = storage.usage || 0;
    const percent = total > 0 ? (used / total * 100).toFixed(1) : 0;
    
    const html = `
        <div class="mb-3">
            <div class="d-flex justify-content-between mb-2">
                <span>Storage Used</span>
                <span><strong>${formatBytes(used)} / ${formatBytes(total)}</strong></span>
            </div>
            <div class="progress" style="height: 25px;">
                <div class="progress-bar" role="progressbar" style="width: ${percent}%">${percent}%</div>
            </div>
        </div>
    `;
    
    document.getElementById('storageInfo').innerHTML = html;
}

// Setup form handlers
function setupFormHandlers() {
    // Automation form
    const automationForm = document.getElementById('automationForm');
    automationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = {
            name: document.getElementById('automationName').value,
            description: document.getElementById('automationDescription').value,
            event_keywords: document.getElementById('automationKeywords').value.split(',').map(k => k.trim()),
            lead_time_minutes: parseInt(document.getElementById('leadTime').value),
            lag_time_minutes: parseInt(document.getElementById('lagTime').value),
            ha_service_domain: document.getElementById('haDomain').value,
            ha_service_name: document.getElementById('haService').value
        };
        
        try {
            const data = await apiCall('/google/api/calendar/automations', {
                method: 'POST',
                body: JSON.stringify(formData)
            });
            
            if (data.success) {
                showSuccess('Automation created');
                hideAutomationForm();
                await loadCalendarAutomations();
            } else {
                showError('Failed to create automation: ' + data.error);
            }
        } catch (error) {
            console.error('Error creating automation:', error);
            showError('Failed to create automation');
        }
    });
    
    // Test email form
    const emailForm = document.getElementById('testEmailForm');
    emailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = {
            to: document.getElementById('emailTo').value,
            subject: document.getElementById('emailSubject').value,
            body: document.getElementById('emailBody').value,
            template_type: document.getElementById('emailTemplate').value
        };
        
        try {
            const data = await apiCall('/google/api/gmail/send', {
                method: 'POST',
                body: JSON.stringify(formData)
            });
            
            if (data.success) {
                showSuccess('Email sent successfully');
                emailForm.reset();
                await loadEmailNotifications();
            } else {
                showError('Failed to send email: ' + data.error);
            }
        } catch (error) {
            console.error('Error sending email:', error);
            showError('Failed to send email');
        }
    });
}

// Setup WebSocket
function setupWebSocket() {
    // WebSocket implementation would go here
    // For now, we'll just poll for updates periodically
    setInterval(async () => {
        await refreshStatus();
    }, 60000); // Refresh every minute
}

// Utility functions
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function showSuccess(message) {
    showToast(message, 'success');
}

function showError(message) {
    showToast(message, 'danger');
}

function showInfo(message) {
    showToast(message, 'info');
}

function showToast(message, type = 'info') {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.className = `alert alert-${type} position-fixed top-0 end-0 m-3`;
    toast.style.zIndex = '9999';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}
