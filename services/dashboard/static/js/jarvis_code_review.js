/**
 * Jarvis Code Review UI
 * Handles task loading, filtering, and approval workflow with WebSocket support
 */

let currentTasks = [];
let selectedTask = null;
let currentFilter = 'all';
let ws = null;
let wsReconnectAttempts = 0;
let maxReconnectAttempts = 5;
let pollingInterval = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadTasks();
    setupFilters();
    setupWebSocket();
});

/**
 * Load tasks from API
 */
async function loadTasks() {
    try {
        const params = new URLSearchParams();
        if (currentFilter && currentFilter !== 'all') {
            params.append('type', currentFilter);
        }
        params.append('status', 'pending');
        
        const response = await fetch(`/api/jarvis/tasks?${params.toString()}`);
        const data = await response.json();
        
        if (data.success) {
            currentTasks = data.tasks;
            renderTaskList(currentTasks);
            updateTaskCount(currentTasks.length);
        } else {
            showError('Failed to load tasks');
        }
    } catch (error) {
        console.error('Failed to load tasks:', error);
        showError('Failed to load tasks');
    }
}

/**
 * Render task list
 */
function renderTaskList(tasks) {
    const taskList = document.getElementById('task-list');
    
    if (!tasks || tasks.length === 0) {
        taskList.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-inbox"></i>
                <p>No pending tasks</p>
            </div>
        `;
        return;
    }
    
    taskList.innerHTML = tasks.map(task => `
        <div class="task-item ${selectedTask && selectedTask.id === task.id ? 'active' : ''}" 
             onclick="selectTask('${task.id}')" 
             data-task-id="${task.id}">
            <div class="task-title">${escapeHtml(task.title)}</div>
            <div class="task-meta">
                <span class="task-type-badge task-type-${task.task_type}">
                    ${task.task_type}
                </span>
                <span class="priority-badge priority-${task.priority}">
                    ${task.priority}
                </span>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 6px;">
                <i class="bi bi-clock"></i> ${formatTimeAgo(task.created_at)}
            </div>
        </div>
    `).join('');
}

/**
 * Select and display task
 */
async function selectTask(taskId) {
    try {
        const response = await fetch(`/api/jarvis/tasks/${taskId}`);
        const data = await response.json();
        
        if (data.success) {
            selectedTask = data.task;
            renderTaskDetail(selectedTask);
            
            // Update active state in list
            document.querySelectorAll('.task-item').forEach(item => {
                item.classList.remove('active');
            });
            const element = document.querySelector(`[data-task-id="${taskId}"]`);
            if (element) {
                element.classList.add('active');
            }
        }
    } catch (error) {
        console.error('Failed to load task:', error);
        showError('Failed to load task details');
    }
}

/**
 * Render task detail panel
 */
function renderTaskDetail(task) {
    const detailPanel = document.getElementById('task-detail');
    
    let content = `
        <div class="task-detail-header">
            <h3 class="task-detail-title">${escapeHtml(task.title)}</h3>
            <div class="task-detail-meta">
                <span class="task-type-badge task-type-${task.task_type}">${task.task_type}</span>
                <span class="priority-badge priority-${task.priority}">${task.priority}</span>
                <span><i class="bi bi-clock"></i> ${formatDateTime(task.created_at)}</span>
            </div>
        </div>
        
        <div class="task-description">
            ${escapeHtml(task.description)}
        </div>
    `;
    
    // Add diff viewer for code review tasks
    if (task.task_type === 'review' && task.code_changes) {
        content += renderDiffViewer(task.code_changes);
    }
    
    // Add context if available
    if (task.context && Object.keys(task.context).length > 0) {
        content += `
            <div style="margin-top: 20px;">
                <h5 style="color: var(--text-primary); margin-bottom: 12px;">
                    <i class="bi bi-info-circle"></i> Context
                </h5>
                <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px;">
                    <pre style="margin: 0; white-space: pre-wrap;">${JSON.stringify(task.context, null, 2)}</pre>
                </div>
            </div>
        `;
    }
    
    // Add comments section
    content += `
        <div class="comments-section">
            <h5 style="color: var(--text-primary); margin-bottom: 12px;">
                <i class="bi bi-chat-left-text"></i> Comments
            </h5>
            <textarea class="comments-textarea" id="task-comments" 
                      placeholder="Add your comments or feedback..."></textarea>
        </div>
    `;
    
    // Add action buttons
    content += renderActionButtons(task);
    
    detailPanel.innerHTML = content;
}

/**
 * Render diff viewer for code changes
 */
function renderDiffViewer(codeChanges) {
    return `
        <h5 style="color: var(--text-primary); margin-bottom: 12px;">
            <i class="bi bi-file-diff"></i> Code Changes
        </h5>
        <div class="diff-viewer">
            <div class="diff-side">
                <div class="diff-header">
                    <i class="bi bi-file-code"></i> Current Code
                </div>
                <div class="diff-content">
                    <pre>${escapeHtml(codeChanges.old || 'No content')}</pre>
                </div>
            </div>
            <div class="diff-side">
                <div class="diff-header">
                    <i class="bi bi-file-code-fill"></i> Proposed Changes
                </div>
                <div class="diff-content">
                    <pre>${escapeHtml(codeChanges.new || 'No content')}</pre>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render action buttons based on task type
 */
function renderActionButtons(task) {
    if (task.task_type === 'review') {
        return `
            <div class="task-actions">
                <button class="btn-action btn-approve" onclick="approveTask('${task.id}')">
                    <i class="bi bi-check-circle"></i> Approve
                </button>
                <button class="btn-action btn-changes" onclick="requestChanges('${task.id}')">
                    <i class="bi bi-pencil-square"></i> Request Changes
                </button>
                <button class="btn-action btn-reject" onclick="rejectTask('${task.id}')">
                    <i class="bi bi-x-circle"></i> Reject
                </button>
            </div>
        `;
    } else if (task.task_type === 'clarification') {
        return `
            <div class="task-actions">
                <button class="btn-action btn-approve" onclick="respondToTask('${task.id}')">
                    <i class="bi bi-send"></i> Provide Response
                </button>
            </div>
        `;
    } else {
        return `
            <div class="task-actions">
                <button class="btn-action btn-approve" onclick="completeTask('${task.id}')">
                    <i class="bi bi-check-circle"></i> Mark Complete
                </button>
            </div>
        `;
    }
}

/**
 * Approve a task
 */
async function approveTask(taskId) {
    const comments = document.getElementById('task-comments')?.value || '';
    
    if (!confirm('Are you sure you want to approve this task?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/jarvis/tasks/${taskId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comments })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Task approved successfully');
            await loadTasks();
            selectedTask = null;
            document.getElementById('task-detail').innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-check-circle" style="color: #34d399;"></i>
                    <h4>Task Approved</h4>
                    <p>Select another task to review</p>
                </div>
            `;
        } else {
            showError(data.error || 'Failed to approve task');
        }
    } catch (error) {
        console.error('Failed to approve task:', error);
        showError('Failed to approve task');
    }
}

/**
 * Reject a task
 */
async function rejectTask(taskId) {
    const comments = document.getElementById('task-comments')?.value;
    
    if (!comments) {
        showError('Please provide a reason for rejection');
        return;
    }
    
    if (!confirm('Are you sure you want to reject this task?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/jarvis/tasks/${taskId}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: comments })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Task rejected');
            await loadTasks();
            selectedTask = null;
            document.getElementById('task-detail').innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-x-circle" style="color: #f87171;"></i>
                    <h4>Task Rejected</h4>
                    <p>Select another task to review</p>
                </div>
            `;
        } else {
            showError(data.error || 'Failed to reject task');
        }
    } catch (error) {
        console.error('Failed to reject task:', error);
        showError('Failed to reject task');
    }
}

/**
 * Request changes to a task
 */
async function requestChanges(taskId) {
    const comments = document.getElementById('task-comments')?.value;
    
    if (!comments) {
        showError('Please describe the changes needed');
        return;
    }
    
    try {
        const response = await fetch(`/api/jarvis/tasks/${taskId}/request-changes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ changes_needed: comments })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Changes requested');
            await loadTasks();
            selectedTask = null;
            document.getElementById('task-detail').innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-pencil-square" style="color: #fbbf24;"></i>
                    <h4>Changes Requested</h4>
                    <p>Jarvis will work on the requested changes</p>
                </div>
            `;
        } else {
            showError(data.error || 'Failed to request changes');
        }
    } catch (error) {
        console.error('Failed to request changes:', error);
        showError('Failed to request changes');
    }
}

/**
 * Respond to a clarification task
 */
async function respondToTask(taskId) {
    const response = document.getElementById('task-comments')?.value;
    
    if (!response) {
        showError('Please provide a response');
        return;
    }
    
    try {
        const apiResponse = await fetch(`/api/jarvis/tasks/${taskId}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response })
        });
        
        const data = await apiResponse.json();
        
        if (data.success) {
            showSuccess('Response recorded');
            await loadTasks();
            selectedTask = null;
            document.getElementById('task-detail').innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-send-check" style="color: #34d399;"></i>
                    <h4>Response Sent</h4>
                    <p>Jarvis will continue working with your input</p>
                </div>
            `;
        } else {
            showError(data.error || 'Failed to send response');
        }
    } catch (error) {
        console.error('Failed to respond:', error);
        showError('Failed to send response');
    }
}

/**
 * Setup filter buttons
 */
function setupFilters() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.filter;
            loadTasks();
        });
    });
}

/**
 * Setup WebSocket connection for real-time updates
 */
function setupWebSocket() {
    try {
        // Determine WebSocket protocol (ws:// or wss://)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/jarvis/tasks`;
        
        console.log('Connecting to WebSocket:', wsUrl);
        ws = new WebSocket(wsUrl);
        
        ws.onopen = function() {
            console.log('WebSocket connected');
            wsReconnectAttempts = 0;
            
            // Stop polling if it was running
            if (pollingInterval) {
                clearInterval(pollingInterval);
                pollingInterval = null;
            }
            
            showToast('Real-time updates connected', 'success');
        };
        
        ws.onmessage = function(event) {
            try {
                const message = JSON.parse(event.data);
                
                if (message.type === 'status_update') {
                    // Update task list with new data
                    if (message.data && message.data.tasks) {
                        currentTasks = message.data.tasks;
                        renderTaskList(currentTasks);
                        updateTaskCount(currentTasks.length);
                    }
                } else if (message.type === 'new_task') {
                    // New task notification
                    showToast('New task: ' + message.data.title, 'info');
                    loadTasks(); // Reload to get the new task
                } else if (message.type === 'task_completed') {
                    // Task completed notification
                    showToast('Task completed: ' + message.data.title, 'success');
                    loadTasks(); // Reload to update the list
                } else if (message.type === 'error') {
                    console.error('WebSocket error message:', message.error);
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };
        
        ws.onerror = function(error) {
            console.error('WebSocket error:', error);
            showToast('Connection error - falling back to polling', 'warning');
            startPolling();
        };
        
        ws.onclose = function() {
            console.log('WebSocket disconnected');
            
            // Attempt to reconnect
            if (wsReconnectAttempts < maxReconnectAttempts) {
                wsReconnectAttempts++;
                const delay = Math.min(1000 * Math.pow(2, wsReconnectAttempts), 30000);
                console.log(`Reconnecting in ${delay}ms (attempt ${wsReconnectAttempts}/${maxReconnectAttempts})`);
                
                setTimeout(() => {
                    setupWebSocket();
                }, delay);
            } else {
                console.log('Max reconnection attempts reached, falling back to polling');
                showToast('Using periodic updates', 'info');
                startPolling();
            }
        };
    } catch (error) {
        console.error('Failed to setup WebSocket:', error);
        startPolling();
    }
}

/**
 * Fallback to HTTP polling when WebSocket is unavailable
 */
function startPolling() {
    // Don't start multiple polling intervals
    if (pollingInterval) {
        return;
    }
    
    console.log('Starting HTTP polling fallback');
    pollingInterval = setInterval(() => {
        loadTasks();
    }, 5000); // Poll every 5 seconds
}

/**
 * Setup auto-refresh (deprecated, now using WebSocket or polling)
 */
function setupAutoRefresh() {
    // This function is no longer used as WebSocket handles real-time updates
    // Keeping for backward compatibility
}

/**
 * Manual refresh
 */
function refreshTasks() {
    loadTasks();
    showSuccess('Tasks refreshed');
}

/**
 * Update task count badge
 */
function updateTaskCount(count) {
    document.getElementById('task-count').textContent = count;
}

/**
 * Utility functions
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDateTime(dateString) {
    return new Date(dateString).toLocaleString();
}

function showSuccess(message) {
    // Simple notification (can be enhanced with toast library)
    console.log('Success:', message);
    alert(message);
}

function showError(message) {
    console.error('Error:', message);
    alert('Error: ' + message);
}
