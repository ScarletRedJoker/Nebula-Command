/**
 * Marketplace Manager - Container App Store Client
 * Handles template browsing, deployment, and management
 */

class MarketplaceManager {
    constructor() {
        this.baseUrl = '/api/marketplace';
        this.templates = [];
        this.deployments = [];
        this.currentCategory = 'all';
        this.currentTemplate = null;
        this.deployInterval = null;
    }

    async getTemplates(category = null, search = null) {
        let url = `${this.baseUrl}/templates`;
        const params = new URLSearchParams();
        
        if (category && category !== 'all') {
            params.append('category', category);
        }
        if (search) {
            params.append('search', search);
        }
        
        if (params.toString()) {
            url += `?${params.toString()}`;
        }

        const response = await fetch(url);
        return await response.json();
    }

    async getFeatured() {
        const response = await fetch(`${this.baseUrl}/templates/featured`);
        return await response.json();
    }

    async getTemplateDetails(templateId) {
        const response = await fetch(`${this.baseUrl}/templates/${templateId}`);
        return await response.json();
    }

    async deploy(templateId, subdomain, customConfig = {}) {
        const response = await fetch(`${this.baseUrl}/deploy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                template_id: templateId,
                subdomain: subdomain,
                custom_config: customConfig
            })
        });
        return await response.json();
    }

    async getDeployments() {
        const response = await fetch(`${this.baseUrl}/deployments`, {
            credentials: 'same-origin'
        });
        return await response.json();
    }

    async getDeploymentStatus(deploymentId) {
        const response = await fetch(`${this.baseUrl}/deployments/${deploymentId}`, {
            credentials: 'same-origin'
        });
        return await response.json();
    }

    async stopDeployment(deploymentId) {
        const response = await fetch(`${this.baseUrl}/deployments/${deploymentId}/stop`, {
            method: 'POST',
            credentials: 'same-origin'
        });
        return await response.json();
    }

    async removeDeployment(deploymentId) {
        const response = await fetch(`${this.baseUrl}/deployments/${deploymentId}`, {
            method: 'DELETE',
            credentials: 'same-origin'
        });
        return await response.json();
    }
}

// Global instance
const marketplace = new MarketplaceManager();
let deployModalInstance, appDetailModalInstance, deploymentToastInstance;

// Initialize marketplace
async function initializeMarketplace() {
    // Initialize modals
    deployModalInstance = new bootstrap.Modal(document.getElementById('deployModal'));
    appDetailModalInstance = new bootstrap.Modal(document.getElementById('appDetailModal'));
    deploymentToastInstance = new bootstrap.Toast(document.getElementById('deployment-toast'));

    // Load featured apps
    loadFeaturedApps();

    // Load all apps
    loadApps();

    // Load deployments
    loadDeployments();

    // Set up category filters
    setupCategoryFilters();

    // Set up search
    setupSearch();

    // Auto-refresh deployments every 30s
    marketplace.deployInterval = setInterval(loadDeployments, 30000);
}

// Load featured apps
async function loadFeaturedApps() {
    try {
        const result = await marketplace.getFeatured();
        
        if (result.success) {
            renderFeaturedApps(result.templates);
        } else {
            showToast('Error', 'Failed to load featured apps', 'danger');
        }
    } catch (error) {
        console.error('Error loading featured apps:', error);
        document.getElementById('featured-carousel').innerHTML = `
            <div class="text-center py-5 text-danger">
                <i class="bi bi-exclamation-triangle"></i> Failed to load featured apps
            </div>
        `;
    }
}

// Load all apps
async function loadApps(category = 'all', search = null) {
    try {
        const result = await marketplace.getTemplates(category, search);
        
        if (result.success) {
            marketplace.templates = result.templates;
            renderAppsGrid(result.templates);
        } else {
            showToast('Error', 'Failed to load apps', 'danger');
        }
    } catch (error) {
        console.error('Error loading apps:', error);
        document.getElementById('apps-grid').innerHTML = `
            <div class="text-center py-5 text-danger">
                <i class="bi bi-exclamation-triangle"></i> Failed to load applications
            </div>
        `;
    }
}

// Render featured apps
function renderFeaturedApps(templates) {
    const container = document.getElementById('featured-carousel');
    
    if (templates.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="bi bi-inbox"></i><br>No featured apps available
            </div>
        `;
        return;
    }

    container.innerHTML = templates.slice(0, 4).map(template => `
        <div class="featured-app-card cosmic-glass-card cosmic-shimmer" onclick="showAppDetail('${template.id}')">
            <div class="featured-app-icon">
                <img src="${template.icon_url || '/static/favicons/dashboard.png'}" alt="${template.display_name}">
            </div>
            <div class="featured-app-content">
                <h5>${template.display_name}</h5>
                <p class="text-muted">${truncateText(template.description || '', 100)}</p>
                <div class="featured-app-meta">
                    <span class="badge badge-category badge-${template.category}">${template.category}</span>
                    <div class="star-rating-small">
                        ${renderStars(template.rating)}
                    </div>
                </div>
                <button class="btn btn-primary btn-sm mt-2" onclick="event.stopPropagation(); showDeployModal('${template.id}')">
                    <i class="bi bi-rocket-takeoff"></i> Deploy
                </button>
            </div>
        </div>
    `).join('');
}

// Render apps grid
function renderAppsGrid(templates) {
    const grid = document.getElementById('apps-grid');
    
    if (templates.length === 0) {
        grid.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="bi bi-inbox"></i><br>
                No applications found. Try a different search or category.
            </div>
        `;
        return;
    }

    grid.innerHTML = templates.map(template => renderAppCard(template)).join('');
}

// Render single app card
function renderAppCard(template) {
    return `
        <div class="app-card cosmic-glass-card" onclick="showAppDetail('${template.id}')">
            <div class="app-card-icon">
                <img src="${template.icon_url || '/static/favicons/dashboard.png'}" alt="${template.display_name}">
            </div>
            <div class="app-card-content">
                <h6 class="app-card-title">${template.display_name}</h6>
                <p class="app-card-description">${truncateText(template.description || '', 80)}</p>
                <div class="app-card-meta">
                    <span class="badge badge-category badge-${template.category}">${template.category}</span>
                    <div class="star-rating-small">
                        ${renderStars(template.rating)}
                    </div>
                </div>
            </div>
            <div class="app-card-footer">
                <button class="btn btn-primary btn-sm w-100" onclick="event.stopPropagation(); showDeployModal('${template.id}')">
                    <i class="bi bi-rocket-takeoff"></i> Deploy
                </button>
            </div>
        </div>
    `;
}

// Render star rating
function renderStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    
    let stars = '';
    for (let i = 0; i < fullStars; i++) {
        stars += '<i class="bi bi-star-fill text-warning"></i>';
    }
    if (hasHalfStar) {
        stars += '<i class="bi bi-star-half text-warning"></i>';
    }
    for (let i = 0; i < emptyStars; i++) {
        stars += '<i class="bi bi-star text-muted"></i>';
    }
    
    return stars;
}

// Show app detail modal
async function showAppDetail(templateId) {
    try {
        const result = await marketplace.getTemplateDetails(templateId);
        
        if (result.success) {
            const template = result.template;
            marketplace.currentTemplate = template;
            
            // Populate modal
            document.getElementById('detail-app-icon').src = template.icon_url || '/static/favicons/dashboard.png';
            document.getElementById('detail-app-name').textContent = template.display_name;
            document.getElementById('detail-app-description').textContent = template.description || 'No description available';
            document.getElementById('detail-app-rating').innerHTML = renderStars(template.rating);
            document.getElementById('detail-app-category').textContent = template.category;
            document.getElementById('detail-app-version').textContent = template.version || 'latest';
            document.getElementById('detail-app-author').textContent = template.author || 'Unknown';
            document.getElementById('detail-app-downloads').textContent = template.downloads || 0;
            
            // Dependencies
            if (template.depends_on && template.depends_on.length > 0) {
                document.getElementById('detail-app-dependencies').style.display = 'block';
                document.getElementById('detail-dependencies-list').textContent = template.depends_on.join(', ');
            } else {
                document.getElementById('detail-app-dependencies').style.display = 'none';
            }
            
            // Links
            if (template.homepage_url) {
                document.getElementById('detail-app-homepage').href = template.homepage_url;
                document.getElementById('detail-app-homepage').style.display = 'inline-block';
            } else {
                document.getElementById('detail-app-homepage').style.display = 'none';
            }
            
            if (template.documentation_url) {
                document.getElementById('detail-app-docs').href = template.documentation_url;
                document.getElementById('detail-app-docs').style.display = 'inline-block';
            } else {
                document.getElementById('detail-app-docs').style.display = 'none';
            }
            
            appDetailModalInstance.show();
        }
    } catch (error) {
        console.error('Error loading app details:', error);
        showToast('Error', 'Failed to load app details', 'danger');
    }
}

// Show deploy modal from detail modal
function showDeployModalFromDetail() {
    appDetailModalInstance.hide();
    if (marketplace.currentTemplate) {
        showDeployModal(marketplace.currentTemplate.id);
    }
}

// Show deploy modal
async function showDeployModal(templateId) {
    try {
        const result = await marketplace.getTemplateDetails(templateId);
        
        if (result.success) {
            const template = result.template;
            marketplace.currentTemplate = template;
            
            // Populate modal
            document.getElementById('deploy-template-id').value = template.id;
            document.getElementById('deploy-app-name').textContent = template.name;
            document.getElementById('deploy-app-icon').src = template.icon_url || '/static/favicons/dashboard.png';
            document.getElementById('deploy-app-display-name').textContent = template.display_name;
            document.getElementById('deploy-app-description').textContent = template.description || '';
            document.getElementById('deploy-app-category').textContent = template.category;
            document.getElementById('deploy-app-category').className = `badge badge-category badge-${template.category}`;
            document.getElementById('deploy-app-version').textContent = template.version || 'latest';
            
            // Environment variables
            const envContainer = document.getElementById('deploy-env-vars');
            if (template.environment_vars && Object.keys(template.environment_vars).length > 0) {
                envContainer.innerHTML = Object.entries(template.environment_vars).map(([key, desc]) => `
                    <div class="mb-2">
                        <label class="form-label small">${key}</label>
                        <input type="text" class="form-control form-control-sm" 
                               name="env_${key}" 
                               placeholder="${desc || 'Auto-generated if left empty'}">
                        <small class="form-text text-muted">${desc || ''}</small>
                    </div>
                `).join('');
            } else {
                envContainer.innerHTML = '<p class="text-muted small">No custom environment variables required</p>';
            }
            
            // Update preview URL on subdomain input
            document.getElementById('deploy-subdomain').addEventListener('input', function() {
                document.getElementById('preview-url').textContent = this.value + '.evindrake.net';
            });
            
            deployModalInstance.show();
        }
    } catch (error) {
        console.error('Error loading deployment modal:', error);
        showToast('Error', 'Failed to load deployment form', 'danger');
    }
}

// Submit deployment
async function submitDeployment() {
    const templateId = document.getElementById('deploy-template-id').value;
    const subdomain = document.getElementById('deploy-subdomain').value.trim().toLowerCase();
    
    if (!subdomain) {
        showToast('Error', 'Please enter a subdomain', 'danger');
        return;
    }
    
    // Validate subdomain format
    if (!/^[a-z0-9-_]+$/.test(subdomain)) {
        showToast('Error', 'Subdomain must contain only lowercase letters, numbers, hyphens, and underscores', 'danger');
        return;
    }
    
    // Collect custom environment variables
    const customEnv = {};
    document.querySelectorAll('[name^="env_"]').forEach(input => {
        if (input.value.trim()) {
            const key = input.name.replace('env_', '');
            customEnv[key] = input.value.trim();
        }
    });
    
    // Show deployment progress
    deployModalInstance.hide();
    showDeploymentProgress('Initiating deployment...');
    
    try {
        const result = await marketplace.deploy(templateId, subdomain, {
            environment: customEnv
        });
        
        if (result.success) {
            showDeploymentProgress(`Deployment successful! Container starting...`);
            
            // Show credentials if any were generated
            if (result.generated_passwords && Object.keys(result.generated_passwords).length > 0) {
                setTimeout(() => {
                    showCredentialsModal(result.deployment_id, result.access_url, result.generated_passwords);
                }, 2000);
            } else {
                showToast('Success', result.message || 'Deployment completed successfully', 'success');
            }
            
            // Refresh deployments list
            setTimeout(loadDeployments, 2000);
        } else {
            showToast('Error', result.error || 'Deployment failed', 'danger');
        }
    } catch (error) {
        console.error('Deployment error:', error);
        showToast('Error', 'Deployment failed: ' + error.message, 'danger');
    }
}

// Show deployment progress toast
function showDeploymentProgress(message) {
    document.getElementById('deployment-status-text').textContent = message;
    deploymentToastInstance.show();
}

// Show credentials modal after deployment
function showCredentialsModal(deploymentId, accessUrl, passwords) {
    let credentialsList = Object.entries(passwords).map(([key, value]) => 
        `<li><strong>${key}:</strong> <code class="selectable">${value}</code></li>`
    ).join('');
    
    const modalHtml = `
        <div class="modal fade" id="credentialsModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content cosmic-glass-card">
                    <div class="modal-header cosmic-gradient">
                        <h5 class="modal-title"><i class="bi bi-shield-check"></i> Deployment Successful</h5>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-success">
                            <i class="bi bi-check-circle"></i> Your application has been deployed successfully!
                        </div>
                        
                        <h6>Access URL:</h6>
                        <p><a href="${accessUrl}" target="_blank" class="text-primary">${accessUrl}</a></p>
                        
                        <h6>Generated Credentials:</h6>
                        <ul>${credentialsList}</ul>
                        
                        <div class="alert alert-warning">
                            <i class="bi bi-exclamation-triangle"></i> <strong>Important:</strong> Save these credentials now. They will not be shown again.
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Got it</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing credentials modal if any
    const existingModal = document.getElementById('credentialsModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add new modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const credentialsModal = new bootstrap.Modal(document.getElementById('credentialsModal'));
    credentialsModal.show();
}

// Load deployments
async function loadDeployments() {
    try {
        const result = await marketplace.getDeployments();
        
        if (result.success) {
            marketplace.deployments = result.deployments;
            renderDeployments(result.deployments);
        }
    } catch (error) {
        console.error('Error loading deployments:', error);
    }
}

// Render deployments sidebar
function renderDeployments(deployments) {
    const container = document.getElementById('my-deployments');
    
    if (deployments.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4 text-muted">
                <i class="bi bi-inbox"></i><br>
                <small>No deployments yet</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = deployments.map(deployment => `
        <div class="deployment-item">
            <div class="deployment-header">
                <strong>${deployment.subdomain || deployment.container_name}</strong>
                <span class="deployment-status status-${deployment.status}">
                    <i class="bi ${getStatusIcon(deployment.status)}"></i>
                </span>
            </div>
            <div class="deployment-meta">
                <small class="text-muted">${deployment.template_name || 'Unknown'}</small>
            </div>
            ${deployment.access_url ? `
                <div class="deployment-link mt-1">
                    <a href="${deployment.access_url}" target="_blank" class="small">
                        <i class="bi bi-box-arrow-up-right"></i> Open
                    </a>
                </div>
            ` : ''}
            <div class="deployment-actions mt-2">
                <button class="btn btn-sm btn-outline-danger" onclick="removeDeployment('${deployment.id}')">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Get status icon
function getStatusIcon(status) {
    const icons = {
        'running': 'bi-play-circle-fill',
        'stopped': 'bi-stop-circle',
        'deploying': 'bi-arrow-clockwise spin',
        'failed': 'bi-exclamation-circle-fill'
    };
    return icons[status] || 'bi-question-circle';
}

// Refresh deployments
function refreshDeployments() {
    loadDeployments();
    showToast('Info', 'Refreshing deployments...', 'info');
}

// Remove deployment
async function removeDeployment(deploymentId) {
    if (!confirm('Are you sure you want to remove this deployment? This will stop and delete the container.')) {
        return;
    }
    
    try {
        const result = await marketplace.removeDeployment(deploymentId);
        
        if (result.success) {
            showToast('Success', result.message || 'Deployment removed successfully', 'success');
            loadDeployments();
        } else {
            showToast('Error', result.error || 'Failed to remove deployment', 'danger');
        }
    } catch (error) {
        console.error('Error removing deployment:', error);
        showToast('Error', 'Failed to remove deployment', 'danger');
    }
}

// Setup category filters
function setupCategoryFilters() {
    document.querySelectorAll('.category-badge').forEach(badge => {
        badge.addEventListener('click', function() {
            // Update active state
            document.querySelectorAll('.category-badge').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // Load apps for category
            const category = this.dataset.category;
            marketplace.currentCategory = category;
            loadApps(category);
        });
    });
}

// Setup search
function setupSearch() {
    const searchInput = document.getElementById('marketplace-search');
    let searchTimeout;
    
    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const query = this.value.trim();
            if (query) {
                loadApps(null, query);
            } else {
                loadApps(marketplace.currentCategory);
            }
        }, 300);
    });
}

// Utility: truncate text
function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Toast notification
function showToast(title, message, type = 'info') {
    // Use existing toast system if available
    if (typeof window.showToast === 'function') {
        window.showToast(title, message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${title}: ${message}`);
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (marketplace.deployInterval) {
        clearInterval(marketplace.deployInterval);
    }
});
