/**
 * Global Authentication Check Utility
 * Provides reusable authentication checking across the dashboard
 */

class AuthCheck {
    /**
     * Check if user is authenticated
     * @returns {Promise<boolean>} True if authenticated, false otherwise
     */
    static async checkAuth() {
        try {
            const response = await fetch('/api/health');
            if (response.redirected || response.url.includes('/login')) {
                return false;
            }
            return response.ok;
        } catch {
            return false;
        }
    }
    
    /**
     * Generate a login prompt message with button
     * @param {string} message - Custom message to display
     * @returns {string} HTML string with login prompt
     */
    static showLoginPrompt(message = 'Please log in to continue') {
        return `⚠️ ${message}. <a href="/login" class="btn btn-primary btn-sm ms-2">Login Now</a>`;
    }
    
    /**
     * Redirect to login page with return URL
     * @param {string} returnUrl - Optional custom return URL
     */
    static handleUnauthorized(returnUrl = null) {
        const redirect = returnUrl || window.location.pathname;
        window.location.href = '/login?redirect=' + encodeURIComponent(redirect);
    }
    
    /**
     * Check if API response indicates authentication failure
     * @param {Response} response - Fetch API response object
     * @returns {boolean} True if authentication is required
     */
    static isUnauthorized(response) {
        return response.redirected || 
               response.url.includes('/login') || 
               response.status === 401 ||
               response.status === 403;
    }
    
    /**
     * Wrap fetch call with authentication checking
     * @param {string} url - API endpoint URL
     * @param {Object} options - Fetch options
     * @returns {Promise<Response>} Fetch response
     * @throws {Error} If authentication fails
     */
    static async authenticatedFetch(url, options = {}) {
        const response = await fetch(url, options);
        
        if (this.isUnauthorized(response)) {
            throw new Error('AUTH_REQUIRED');
        }
        
        return response;
    }
    
    /**
     * Display authentication error message in element
     * @param {string|HTMLElement} elementOrId - Element or element ID to show error in
     * @param {string} customMessage - Optional custom error message
     */
    static displayAuthError(elementOrId, customMessage = null) {
        const element = typeof elementOrId === 'string' 
            ? document.getElementById(elementOrId) 
            : elementOrId;
            
        if (!element) return;
        
        const message = customMessage || 'Your session has expired. Please log in again.';
        element.innerHTML = this.showLoginPrompt(message);
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthCheck;
}
