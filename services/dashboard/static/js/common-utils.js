/**
 * Common Utilities for Dashboard
 * Phase 2B - UI Polish
 * Shared functions for toast notifications, loading states, and accessibility
 */

/**
 * Show toast notification
 * @param {string} message - The message to display
 * @param {string} type - Toast type: 'success', 'info', 'warning', 'danger'
 * @param {number} duration - Duration in milliseconds (default: 4000)
 */
function showToast(message, type = 'info', duration = 4000) {
    const toastContainer = getOrCreateToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');
    
    const iconMap = {
        success: 'check-circle-fill',
        info: 'info-circle-fill',
        warning: 'exclamation-triangle-fill',
        danger: 'x-circle-fill'
    };
    
    const icon = iconMap[type] || iconMap.info;
    
    toast.innerHTML = `
        <i class="bi bi-${icon}" aria-hidden="true"></i>
        <span>${message}</span>
        <button type="button" class="toast-close" aria-label="Close notification" onclick="this.parentElement.remove()">
            <i class="bi bi-x" aria-hidden="true"></i>
        </button>
    `;
    
    toastContainer.appendChild(toast);
    
    // Auto-remove after duration
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Get or create toast container
 */
function getOrCreateToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-relevant', 'additions');
        document.body.appendChild(container);
    }
    return container;
}

/**
 * Set button loading state
 * @param {HTMLElement} button - The button element
 * @param {boolean} isLoading - Whether button should show loading state
 * @param {string} loadingText - Optional loading text (default: 'Loading...')
 */
function setButtonLoading(button, isLoading, loadingText = 'Loading...') {
    if (!button) return;
    
    if (isLoading) {
        button.disabled = true;
        button.setAttribute('data-original-content', button.innerHTML);
        button.innerHTML = `
            <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
            ${loadingText}
        `;
        button.setAttribute('aria-busy', 'true');
    } else {
        button.disabled = false;
        const originalContent = button.getAttribute('data-original-content');
        if (originalContent) {
            button.innerHTML = originalContent;
            button.removeAttribute('data-original-content');
        }
        button.removeAttribute('aria-busy');
    }
}

/**
 * Show empty state in a container
 * @param {HTMLElement} container - The container element
 * @param {Object} options - Empty state options
 */
function showEmptyState(container, options = {}) {
    if (!container) return;
    
    const {
        icon = 'inbox',
        title = 'No items yet',
        message = 'Get started by adding your first item',
        actionButton = null
    } = options;
    
    let actionButtonHTML = '';
    if (actionButton) {
        actionButtonHTML = `
            <button class="btn btn-primary mt-3" onclick="${actionButton.action}" aria-label="${actionButton.label}">
                <i class="bi bi-${actionButton.icon || 'plus-circle'} me-2" aria-hidden="true"></i>
                ${actionButton.label}
            </button>
        `;
    }
    
    container.innerHTML = `
        <div class="empty-state text-center py-5">
            <i class="bi bi-${icon} display-1 text-muted" aria-hidden="true"></i>
            <h3 class="mt-3">${title}</h3>
            <p class="text-muted">${message}</p>
            ${actionButtonHTML}
        </div>
    `;
}

/**
 * Show loading state in a container
 * @param {HTMLElement} container - The container element
 * @param {string} message - Loading message
 */
function showLoadingState(container, message = 'Loading...') {
    if (!container) return;
    
    container.innerHTML = `
        <div class="loading-state text-center py-5">
            <div class="spinner-border text-primary mb-3" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="text-muted">${message}</p>
        </div>
    `;
}

/**
 * Add keyboard accessibility to clickable cards
 * @param {HTMLElement} card - The card element
 * @param {Function} clickHandler - The click handler function
 * @param {string} ariaLabel - Aria label for the card
 */
function makeCardAccessible(card, clickHandler, ariaLabel) {
    if (!card) return;
    
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    if (ariaLabel) {
        card.setAttribute('aria-label', ariaLabel);
    }
    
    card.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            clickHandler(event);
        }
    });
}

// Add toast styles if not already present
document.addEventListener('DOMContentLoaded', function() {
    if (!document.getElementById('toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
            .toast-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-width: 400px;
            }
            
            .toast-notification {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 16px 20px;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                transition: all 0.3s ease;
                animation: slideIn 0.3s ease;
            }
            
            .toast-notification i:first-child {
                font-size: 1.25rem;
                flex-shrink: 0;
            }
            
            .toast-notification span {
                flex: 1;
                color: white;
                font-weight: 500;
            }
            
            .toast-close {
                background: none;
                border: none;
                color: white;
                cursor: pointer;
                padding: 4px;
                opacity: 0.7;
                transition: opacity 0.2s;
                font-size: 1.1rem;
            }
            
            .toast-close:hover {
                opacity: 1;
            }
            
            .toast-success {
                background: linear-gradient(135deg, rgba(16, 185, 129, 0.9), rgba(5, 150, 105, 0.9));
                color: white;
            }
            
            .toast-info {
                background: linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(37, 99, 235, 0.9));
                color: white;
            }
            
            .toast-warning {
                background: linear-gradient(135deg, rgba(245, 158, 11, 0.9), rgba(217, 119, 6, 0.9));
                color: white;
            }
            
            .toast-danger {
                background: linear-gradient(135deg, rgba(239, 68, 68, 0.9), rgba(220, 38, 38, 0.9));
                color: white;
            }
            
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateX(100%);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }
            
            .empty-state {
                color: var(--text-secondary);
            }
            
            .empty-state h3 {
                color: var(--text-primary);
                font-weight: 600;
            }
            
            .loading-state {
                color: var(--text-secondary);
            }
            
            @media (max-width: 768px) {
                .toast-container {
                    right: 10px;
                    left: 10px;
                    max-width: none;
                }
                
                .toast-notification {
                    font-size: 0.9rem;
                }
            }
        `;
        document.head.appendChild(style);
    }
});
