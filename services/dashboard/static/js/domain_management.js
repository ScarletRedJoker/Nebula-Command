let currentDomains = [];
let filteredDomains = [];
let selectedDomain = null;
let currentPage = 1;
const itemsPerPage = 10;
let sortField = 'domain';
let sortDirection = 'asc';
let refreshInterval = null;

const addDomainModal = new bootstrap.Modal(document.getElementById('addDomainModal'));
const deleteDomainModal = new bootstrap.Modal(document.getElementById('deleteDomainModal'));

document.addEventListener('DOMContentLoaded', function() {
    loadDomains();
    setupEventListeners();
    startAutoRefresh();
});

function setupEventListeners() {
    document.getElementById('domain-search').addEventListener('input', filterDomains);
    document.getElementById('service-type-filter').addEventListener('change', filterDomains);
    document.getElementById('status-filter').addEventListener('change', filterDomains);
    
    document.getElementById('delete-confirmation').addEventListener('input', function(e) {
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        confirmBtn.disabled = e.target.value !== 'DELETE';
    });
}

function startAutoRefresh() {
    refreshInterval = setInterval(() => {
        loadDomains(true);
    }, 30000);
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
}

async function loadDomains(silent = false) {
    try {
        if (!silent) {
            document.getElementById('domains-tbody').innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-5">
                        <div class="spinner-border text-primary" role="status"></div>
                        <p class="mt-2 text-muted">Loading domains...</p>
                    </td>
                </tr>
            `;
        }

        const response = await fetch('/api/domains/');
        const result = await response.json();

        if (result.success) {
            currentDomains = result.data.domains || [];
            updateStats();
            filterDomains();
            
            if (!silent && currentDomains.length === 0) {
                showToast('No domains found', 'Create your first domain to get started!', 'info');
            }
        } else {
            throw new Error(result.message || 'Failed to load domains');
        }
    } catch (error) {
        console.error('Error loading domains:', error);
        showToast('Error', error.message, 'danger');
        document.getElementById('domains-tbody').innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-5 text-danger">
                    <i class="bi bi-exclamation-triangle"></i> Failed to load domains
                </td>
            </tr>
        `;
    }
}

function updateStats() {
    const total = currentDomains.length;
    const active = currentDomains.filter(d => d.provisioning_status === 'active').length;
    const provisioning = currentDomains.filter(d => d.provisioning_status === 'provisioning').length;
    const errors = currentDomains.filter(d => d.provisioning_status === 'error').length;

    document.getElementById('total-domains').textContent = total;
    document.getElementById('active-domains').textContent = active;
    document.getElementById('provisioning-domains').textContent = provisioning;
    document.getElementById('error-domains').textContent = errors;
}

function filterDomains() {
    const searchTerm = document.getElementById('domain-search').value.toLowerCase();
    const serviceType = document.getElementById('service-type-filter').value;
    const status = document.getElementById('status-filter').value;

    filteredDomains = currentDomains.filter(domain => {
        const matchesSearch = domain.full_domain.toLowerCase().includes(searchTerm) ||
                             domain.service_name.toLowerCase().includes(searchTerm);
        const matchesType = !serviceType || domain.service_type === serviceType;
        const matchesStatus = !status || domain.provisioning_status === status;
        
        return matchesSearch && matchesType && matchesStatus;
    });

    currentPage = 1;
    renderDomains();
}

function sortTable(field) {
    if (sortField === field) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortField = field;
        sortDirection = 'asc';
    }

    filteredDomains.sort((a, b) => {
        let aVal, bVal;

        switch(field) {
            case 'status':
                aVal = a.provisioning_status;
                bVal = b.provisioning_status;
                break;
            case 'domain':
                aVal = a.full_domain;
                bVal = b.full_domain;
                break;
            case 'service_type':
                aVal = a.service_type;
                bVal = b.service_type;
                break;
            case 'ip':
                aVal = a.record_value || '';
                bVal = b.record_value || '';
                break;
            case 'ssl':
                aVal = a.ssl_enabled ? 1 : 0;
                bVal = b.ssl_enabled ? 1 : 0;
                break;
            case 'last_checked':
                aVal = new Date(a.last_health_check_at || 0);
                bVal = new Date(b.last_health_check_at || 0);
                break;
            default:
                return 0;
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    renderDomains();
}

function renderDomains() {
    const tbody = document.getElementById('domains-tbody');
    
    if (filteredDomains.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-5 text-muted">
                    <i class="bi bi-inbox"></i><br>
                    No domains found
                </td>
            </tr>
        `;
        updatePagination();
        return;
    }

    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const paginatedDomains = filteredDomains.slice(startIdx, endIdx);

    tbody.innerHTML = paginatedDomains.map(domain => {
        const statusClass = `status-${domain.provisioning_status}`;
        const sslIcon = domain.ssl_enabled 
            ? '<i class="bi bi-shield-check ssl-valid"></i>' 
            : '<i class="bi bi-shield-slash text-muted"></i>';
        
        const lastChecked = domain.last_health_check_at 
            ? formatTimeAgo(new Date(domain.last_health_check_at))
            : 'Never';

        return `
            <tr onclick="showDomainDetails('${domain.id}')" style="cursor: pointer;">
                <td><span class="status-badge ${statusClass}">${domain.provisioning_status}</span></td>
                <td><strong>${domain.full_domain}</strong><br><small class="text-muted">${domain.service_name}</small></td>
                <td>${domain.service_type}</td>
                <td>${domain.record_value || '-'}</td>
                <td>${sslIcon}</td>
                <td>${lastChecked}</td>
                <td onclick="event.stopPropagation()">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="showDomainDetails('${domain.id}')">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button class="btn btn-outline-warning" onclick="editDomain('${domain.id}')">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-outline-danger" onclick="confirmDeleteDomain('${domain.id}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    updatePagination();
}

function updatePagination() {
    const totalPages = Math.ceil(filteredDomains.length / itemsPerPage);
    
    document.getElementById('page-info').textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById('prev-page').disabled = currentPage <= 1;
    document.getElementById('next-page').disabled = currentPage >= totalPages;
}

function changePage(direction) {
    currentPage += direction;
    renderDomains();
}

function showAddDomainModal() {
    document.getElementById('domainForm').reset();
    document.getElementById('domain-id').value = '';
    document.getElementById('modalTitle').innerHTML = '<i class="bi bi-plus-circle"></i> Add New Domain';
    document.getElementById('submitDomainBtn').querySelector('.btn-text').textContent = 'Add Domain';
    addDomainModal.show();
}

function editDomain(domainId) {
    const domain = currentDomains.find(d => d.id === domainId);
    if (!domain) return;

    document.getElementById('domain-id').value = domain.id;
    document.getElementById('domain-base').value = domain.domain;
    document.getElementById('domain-subdomain').value = domain.subdomain;
    document.getElementById('service-name').value = domain.service_name;
    document.getElementById('service-type-input').value = domain.service_type;
    document.getElementById('internal-port').value = domain.port || 80;
    document.getElementById('container-name').value = domain.container_name || '';
    document.getElementById('ssl-enabled').checked = domain.ssl_enabled;
    document.getElementById('auto-provision').checked = domain.auto_managed;
    document.getElementById('custom-caddy-config').value = domain.custom_caddy_config || '';
    document.getElementById('domain-notes').value = domain.notes || '';

    document.getElementById('modalTitle').innerHTML = '<i class="bi bi-pencil"></i> Edit Domain';
    document.getElementById('submitDomainBtn').querySelector('.btn-text').textContent = 'Save Changes';
    
    addDomainModal.show();
}

async function submitDomain() {
    const domainId = document.getElementById('domain-id').value;
    const isEdit = domainId !== '';

    const data = {
        domain: document.getElementById('domain-base').value,
        subdomain: document.getElementById('domain-subdomain').value,
        service_name: document.getElementById('service-name').value,
        service_type: document.getElementById('service-type-input').value,
        port: parseInt(document.getElementById('internal-port').value) || 80,
        container_name: document.getElementById('container-name').value || null,
        ssl_enabled: document.getElementById('ssl-enabled').checked,
        auto_managed: document.getElementById('auto-provision').checked,
        custom_caddy_config: document.getElementById('custom-caddy-config').value || null,
        notes: document.getElementById('domain-notes').value || null
    };

    if (!validateDomainForm(data)) {
        return;
    }

    const submitBtn = document.getElementById('submitDomainBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.spinner-border');
    
    submitBtn.disabled = true;
    btnText.classList.add('d-none');
    spinner.classList.remove('d-none');

    try {
        const url = isEdit ? `/api/domains/${domainId}` : '/api/domains/';
        const method = isEdit ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            showToast('Success', 
                isEdit ? 'Domain updated successfully!' : 'Domain created successfully!', 
                'success');
            addDomainModal.hide();
            loadDomains();
        } else {
            throw new Error(result.message || 'Failed to save domain');
        }
    } catch (error) {
        console.error('Error submitting domain:', error);
        showToast('Error', error.message, 'danger');
    } finally {
        submitBtn.disabled = false;
        btnText.classList.remove('d-none');
        spinner.classList.add('d-none');
    }
}

function validateDomainForm(data) {
    if (!data.domain || !data.subdomain || !data.service_name || !data.service_type) {
        showToast('Validation Error', 'Please fill in all required fields', 'warning');
        return false;
    }

    const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;
    if (!domainRegex.test(data.domain)) {
        showToast('Validation Error', 'Invalid domain format', 'warning');
        return false;
    }

    const subdomainRegex = /^(@|[a-z0-9]+([\-]{1}[a-z0-9]+)*)$/i;
    if (!subdomainRegex.test(data.subdomain)) {
        showToast('Validation Error', 'Invalid subdomain format (use @ for root)', 'warning');
        return false;
    }

    return true;
}

async function showDomainDetails(domainId) {
    selectedDomain = currentDomains.find(d => d.id === domainId);
    if (!selectedDomain) return;

    document.getElementById('domain-detail-panel').style.display = 'block';

    document.getElementById('detail-domain').textContent = selectedDomain.full_domain;
    document.getElementById('detail-status').innerHTML = `<span class="status-badge status-${selectedDomain.provisioning_status}">${selectedDomain.provisioning_status}</span>`;
    document.getElementById('detail-service-type').textContent = selectedDomain.service_type;
    document.getElementById('detail-ip').textContent = selectedDomain.record_value || '-';
    document.getElementById('detail-container').textContent = selectedDomain.container_name || '-';
    document.getElementById('detail-port').textContent = selectedDomain.port || '-';
    document.getElementById('detail-created').textContent = formatDate(selectedDomain.created_at);
    document.getElementById('detail-updated').textContent = formatDate(selectedDomain.updated_at);

    loadDomainEvents(domainId);
    loadDNSRecords(domainId);
    loadSSLInfo(domainId);
    loadHealthStatus(domainId);
}

function closeDetailPanel() {
    document.getElementById('domain-detail-panel').style.display = 'none';
    selectedDomain = null;
}

async function loadDomainEvents(domainId) {
    const eventsList = document.getElementById('events-list');
    eventsList.innerHTML = '<div class="text-center py-3"><i class="bi bi-hourglass-split"></i> Loading events...</div>';

    try {
        const response = await fetch(`/api/domains/${domainId}/events`);
        const result = await response.json();

        if (result.success && result.data.events.length > 0) {
            eventsList.innerHTML = result.data.events.map(event => {
                const statusClass = event.success ? 'event-item-success' : 
                                   event.event_type.includes('error') ? 'event-item-error' : 
                                   'event-item-warning';
                return `
                    <div class="event-item ${statusClass}">
                        <div class="d-flex justify-content-between">
                            <strong>${event.event_type}</strong>
                            <small class="text-muted">${formatTimeAgo(new Date(event.occurred_at))}</small>
                        </div>
                        <div class="mt-1"><small>${event.details || ''}</small></div>
                    </div>
                `;
            }).join('');
        } else {
            eventsList.innerHTML = '<div class="text-center py-3 text-muted">No events recorded</div>';
        }
    } catch (error) {
        eventsList.innerHTML = '<div class="text-center py-3 text-danger">Failed to load events</div>';
    }
}

async function loadDNSRecords(domainId) {
    const dnsRecordsList = document.getElementById('dns-records-list');
    dnsRecordsList.innerHTML = '<div class="text-center py-3"><i class="bi bi-hourglass-split"></i> Loading DNS records...</div>';

    try {
        const response = await fetch(`/api/domains/${domainId}`);
        const result = await response.json();

        if (result.success) {
            const domain = result.data;
            dnsRecordsList.innerHTML = `
                <div class="mb-2">
                    <strong>Type:</strong> ${domain.record_type || 'A'}<br>
                    <strong>Value:</strong> ${domain.record_value || '-'}<br>
                    <strong>TTL:</strong> ${domain.ttl || 300}
                </div>
            `;
        } else {
            dnsRecordsList.innerHTML = '<div class="text-center py-3 text-muted">No DNS records found</div>';
        }
    } catch (error) {
        dnsRecordsList.innerHTML = '<div class="text-center py-3 text-danger">Failed to load DNS records</div>';
    }
}

function loadSSLInfo(domainId) {
    if (selectedDomain && selectedDomain.ssl_enabled) {
        document.getElementById('ssl-issuer').textContent = 'Let\'s Encrypt';
        document.getElementById('ssl-expiry').textContent = '-';
        document.getElementById('ssl-days-remaining').textContent = '-';
        document.getElementById('ssl-status').innerHTML = '<span class="text-muted">Checking...</span>';
    } else {
        document.getElementById('ssl-status').innerHTML = '<span class="text-muted">SSL Disabled</span>';
    }
}

function loadHealthStatus(domainId) {
    if (selectedDomain) {
        document.getElementById('health-http-status').textContent = selectedDomain.http_status_code || '-';
        document.getElementById('health-response-time').textContent = selectedDomain.response_time_ms ? `${selectedDomain.response_time_ms}ms` : '-';
        document.getElementById('health-dns-status').textContent = selectedDomain.dns_propagation_status || '-';
        document.getElementById('health-last-check').textContent = selectedDomain.last_health_check_at 
            ? formatTimeAgo(new Date(selectedDomain.last_health_check_at)) 
            : 'Never';
    }
}

async function runHealthCheck() {
    if (!selectedDomain) return;

    showToast('Info', 'Running health check...', 'info');

    try {
        const response = await fetch(`/api/domains/${selectedDomain.id}/health`, {
            method: 'POST'
        });
        const result = await response.json();

        if (result.success) {
            showToast('Success', 'Health check completed', 'success');
            loadDomains(true);
            setTimeout(() => showDomainDetails(selectedDomain.id), 500);
        } else {
            throw new Error(result.message || 'Health check failed');
        }
    } catch (error) {
        showToast('Error', error.message, 'danger');
    }
}

async function verifyDNS() {
    if (!selectedDomain) return;
    
    showToast('Info', 'Verifying DNS propagation...', 'info');
    
    try {
        const response = await fetch(`/api/domains/${selectedDomain.id}/verify-dns`, {
            method: 'POST'
        });
        const result = await response.json();
        
        if (result.success) {
            showToast('Success', 'DNS verification completed', 'success');
            loadDNSRecords(selectedDomain.id);
        } else {
            throw new Error(result.message || 'DNS verification failed');
        }
    } catch (error) {
        showToast('Error', error.message, 'danger');
    }
}

function forceSSLRenewal() {
    showToast('Info', 'SSL renewal feature coming soon', 'info');
}

function confirmDeleteDomain(domainId) {
    const domain = currentDomains.find(d => d.id === domainId);
    if (!domain) return;

    selectedDomain = domain;
    document.getElementById('delete-domain-name').textContent = domain.full_domain;
    document.getElementById('delete-confirmation').value = '';
    document.getElementById('confirmDeleteBtn').disabled = true;
    
    deleteDomainModal.show();
}

async function deleteDomain() {
    if (!selectedDomain) return;

    try {
        const response = await fetch(`/api/domains/${selectedDomain.id}`, {
            method: 'DELETE'
        });
        const result = await response.json();

        if (result.success) {
            showToast('Success', 'Domain deleted successfully', 'success');
            deleteDomainModal.hide();
            closeDetailPanel();
            loadDomains();
        } else {
            throw new Error(result.message || 'Failed to delete domain');
        }
    } catch (error) {
        console.error('Error deleting domain:', error);
        showToast('Error', error.message, 'danger');
    }
}

function refreshDomains() {
    loadDomains();
}

function showToast(title, message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toast-icon');
    const toastTitle = document.getElementById('toast-title');
    const toastBody = document.getElementById('toast-body');

    const iconMap = {
        success: 'bi-check-circle-fill text-success',
        danger: 'bi-exclamation-circle-fill text-danger',
        warning: 'bi-exclamation-triangle-fill text-warning',
        info: 'bi-info-circle-fill text-info'
    };

    toastIcon.className = `bi me-2 ${iconMap[type] || iconMap.info}`;
    toastTitle.textContent = title;
    toastBody.textContent = message;

    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    };

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
        }
    }

    return 'Just now';
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString();
}
