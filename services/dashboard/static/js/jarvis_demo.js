/**
 * Jarvis Investor Demo Dashboard
 * Real-time visualization of Jarvis autonomous capabilities
 */

let demoData = {
    currentTask: null,
    taskQueue: [],
    statistics: {},
    activities: []
};

/**
 * Check if response indicates authentication failure
 */
function isAuthError(response) {
    return response.redirected || response.url.includes('/login') || response.status === 401;
}

/**
 * Show authentication error
 */
function showAuthError() {
    const container = document.querySelector('.container-fluid');
    if (container) {
        container.innerHTML = `
            <div class="alert alert-warning mt-4" role="alert">
                <h4 class="alert-heading"><i class="bi bi-exclamation-triangle"></i> Authentication Required</h4>
                <p>⚠️ Your session has expired. Please log in again to continue.</p>
                <hr>
                <a href="/login" class="btn btn-primary">
                    <i class="bi bi-box-arrow-in-right"></i> Login Now
                </a>
            </div>
        `;
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadDemoData();
    setupAutoRefresh();
});

/**
 * Load all demo data
 */
async function loadDemoData() {
    await Promise.all([
        loadJarvisStatus(),
        loadTaskStatistics(),
        loadActivityFeed()
    ]);
    
    renderAllData();
}

/**
 * Load Jarvis current status
 */
async function loadJarvisStatus() {
    try {
        const response = await fetch('/api/jarvis/status');
        
        if (isAuthError(response)) {
            showAuthError();
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            demoData.currentTask = data.current_task;
            demoData.statistics = data.statistics;
            updateStatusIndicator(data.status);
        }
    } catch (error) {
        console.error('Failed to load Jarvis status:', error);
    }
}

/**
 * Load task statistics
 */
async function loadTaskStatistics() {
    try {
        const response = await fetch('/api/jarvis/tasks?limit=20');
        const data = await response.json();
        
        if (data.success) {
            processTasks(data.tasks);
        }
    } catch (error) {
        console.error('Failed to load task statistics:', error);
    }
}

/**
 * Load activity feed (simulated from tasks)
 */
async function loadActivityFeed() {
    try {
        const response = await fetch('/api/jarvis/tasks?status=completed&limit=10');
        const data = await response.json();
        
        if (data.success) {
            demoData.activities = data.tasks;
        }
    } catch (error) {
        console.error('Failed to load activity feed:', error);
    }
}

/**
 * Process tasks for statistics
 */
function processTasks(tasks) {
    const pendingTasks = tasks.filter(t => t.status === 'pending');
    const blockedTasks = tasks.filter(t => t.status === 'blocked_waiting_user');
    
    demoData.taskQueue = tasks.filter(t => 
        t.status === 'pending' && t.task_type !== 'review'
    ).slice(0, 3);
    
    demoData.delegatedTasks = tasks.filter(t => 
        t.status === 'pending' && (t.task_type === 'review' || t.task_type === 'clarification')
    ).slice(0, 5);
}

/**
 * Render all data to UI
 */
function renderAllData() {
    renderCurrentTask();
    renderTaskQueue();
    renderDelegation();
    renderStatistics();
    renderActivityFeed();
    renderGanttChart();
}

/**
 * Render current task
 */
function renderCurrentTask() {
    const titleEl = document.getElementById('current-task-title');
    const descEl = document.getElementById('current-task-desc');
    const progressEl = document.getElementById('task-progress');
    
    if (demoData.currentTask) {
        titleEl.textContent = demoData.currentTask.title || 'Working on task...';
        descEl.textContent = demoData.currentTask.description || 'Processing...';
        
        // Simulate progress (in real implementation, this would be actual progress)
        const progress = Math.random() * 40 + 30; // 30-70%
        progressEl.style.width = `${progress}%`;
    } else {
        titleEl.textContent = 'Idle - Waiting for tasks';
        descEl.textContent = 'Jarvis is ready to work on new tasks';
        progressEl.style.width = '0%';
    }
}

/**
 * Render task queue
 */
function renderTaskQueue() {
    const queueEl = document.getElementById('task-queue');
    
    if (!demoData.taskQueue || demoData.taskQueue.length === 0) {
        queueEl.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); padding: 20px;">
                No tasks in queue
            </div>
        `;
        return;
    }
    
    queueEl.innerHTML = demoData.taskQueue.map((task, index) => `
        <div class="queue-item">
            <div style="font-weight: 600; color: var(--text-primary);">
                ${index + 1}. ${escapeHtml(task.title)}
            </div>
            <div style="font-size: 0.8rem; margin-top: 4px;">
                ${escapeHtml(task.task_type)} · ${task.priority}
            </div>
        </div>
    `).join('');
}

/**
 * Render delegation panel
 */
function renderDelegation() {
    document.getElementById('pending-count').textContent = 
        demoData.statistics?.by_status?.pending || 0;
    document.getElementById('blocked-count').textContent = 
        demoData.statistics?.by_status?.blocked || 0;
    
    const delegationEl = document.getElementById('delegation-list');
    
    if (!demoData.delegatedTasks || demoData.delegatedTasks.length === 0) {
        delegationEl.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); padding: 12px;">
                No delegated tasks
            </div>
        `;
        return;
    }
    
    delegationEl.innerHTML = demoData.delegatedTasks.map(task => `
        <div class="delegation-item">
            <div>
                <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">
                    ${escapeHtml(task.title)}
                </div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">
                    ${task.task_type} · ${formatTimeAgo(task.created_at)}
                </div>
            </div>
            <a href="/jarvis_code_review" class="btn btn-sm btn-primary">
                Review
            </a>
        </div>
    `).join('');
}

/**
 * Render statistics
 */
function renderStatistics() {
    const stats = demoData.statistics;
    
    if (!stats || !stats.by_status) {
        return;
    }
    
    const completed = stats.by_status.completed || 0;
    const total = stats.total || 1;
    const pending = stats.by_status.pending || 0;
    
    document.getElementById('auto-completed').textContent = completed;
    document.getElementById('needs-review').textContent = pending;
    
    // Calculate success rate
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    document.getElementById('success-rate').textContent = `${successRate}%`;
    
    // Simulated average time (in real implementation, calculate from actual data)
    const avgTime = Math.floor(Math.random() * 45) + 15; // 15-60s
    document.getElementById('avg-time').textContent = `${avgTime}s`;
}

/**
 * Render activity feed
 */
function renderActivityFeed() {
    const feedEl = document.getElementById('activity-feed');
    
    if (!demoData.activities || demoData.activities.length === 0) {
        feedEl.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); padding: 40px;">
                No recent activity
            </div>
        `;
        return;
    }
    
    feedEl.innerHTML = demoData.activities.map(activity => {
        const iconClass = activity.approval_status === 'approved' ? 'success' : 
                         activity.approval_status === 'rejected' ? 'error' : 'pending';
        const icon = iconClass === 'success' ? 'check-circle' : 
                    iconClass === 'error' ? 'x-circle' : 'clock';
        
        return `
            <div class="activity-item">
                <div class="activity-icon ${iconClass}">
                    <i class="bi bi-${icon}"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-title">${escapeHtml(activity.title)}</div>
                    <div class="activity-time">
                        ${formatTimeAgo(activity.completed_at || activity.created_at)}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Render Gantt chart visualization
 */
function renderGanttChart() {
    const ganttEl = document.getElementById('gantt-chart');
    
    // Simulated multi-tasking visualization
    const tasks = [
        { name: 'Code Generation', status: 'active', progress: 65 },
        { name: 'Database Migration', status: 'waiting', progress: 30 },
        { name: 'API Documentation', status: 'completed', progress: 100 },
        { name: 'Security Audit', status: 'waiting', progress: 20 }
    ];
    
    ganttEl.innerHTML = tasks.map(task => {
        const statusClass = task.status;
        return `
            <div class="timeline-row">
                <div class="timeline-label">${task.name}</div>
                <div class="timeline-bar-container">
                    <div class="timeline-bar ${statusClass}" style="width: ${task.progress}%;">
                        ${task.progress}%
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Update status indicator
 */
function updateStatusIndicator(status) {
    const indicator = document.getElementById('jarvis-status');
    
    indicator.className = 'status-indicator';
    
    if (status === 'active') {
        indicator.classList.add('status-active');
    } else if (status === 'idle') {
        indicator.classList.add('status-idle');
    } else {
        indicator.classList.add('status-waiting');
    }
}

/**
 * Setup auto-refresh
 */
function setupAutoRefresh() {
    setInterval(function() {
        if (document.visibilityState === 'visible') {
            loadDemoData();
        }
    }, 5000); // Refresh every 5 seconds for demo
}

/**
 * Manual refresh
 */
function refreshDemo() {
    loadDemoData();
    showToast('Demo data refreshed', 'success');
}

/**
 * Utility functions
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTimeAgo(dateString) {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}
