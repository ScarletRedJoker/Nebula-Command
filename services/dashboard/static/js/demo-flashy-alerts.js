// Flashy Demo Alerts for Investor Presentations
// Shows impressive deployment progress without actual operations

function showFlashyDeploymentAlert(serviceName, productionUrl = 'https://host.evindrake.net') {
    const alert = document.createElement('div');
    alert.className = 'flashy-demo-alert';
    alert.innerHTML = `
        <div class="flashy-alert-content">
            <div class="flashy-header">
                <div class="pulse-dot"></div>
                <h3>🚀 ${serviceName} Deployment Initiated!</h3>
            </div>
            
            <div class="progress-container">
                <div class="progress-bar">
                    <div class="progress-fill"></div>
                </div>
                <div class="progress-text">Processing...</div>
            </div>
            
            <div class="deployment-steps">
                <div class="step">
                    <span class="step-icon">✓</span>
                    <span>Container image verified</span>
                </div>
                <div class="step">
                    <span class="step-icon">⚡</span>
                    <span>Network configuration generated</span>
                </div>
                <div class="step">
                    <span class="step-icon">🔒</span>
                    <span>SSL certificates provisioning...</span>
                </div>
                <div class="step pending">
                    <span class="step-icon">⏳</span>
                    <span>Health checks configuring...</span>
                </div>
            </div>
            
            <div class="flashy-notice">
                <div class="notice-icon">✨</div>
                <div class="notice-content">
                    <strong>Demo Environment</strong>
                    <p>This is a demonstration of the deployment workflow. For real deployments with full functionality:</p>
                    <a href="${productionUrl}" class="production-link" target="_blank">
                        Open Production Dashboard →
                    </a>
                </div>
            </div>
            
            <button class="close-flashy" onclick="this.closest('.flashy-demo-alert').remove()">
                Got it!
            </button>
        </div>
    `;
    
    document.body.appendChild(alert);
    
    // Animate progress bar
    setTimeout(() => {
        const progressFill = alert.querySelector('.progress-fill');
        progressFill.style.width = '100%';
        
        setTimeout(() => {
            alert.querySelector('.progress-text').textContent = 'Deployment running in background...';
            
            // Animate steps
            const steps = alert.querySelectorAll('.step');
            steps.forEach((step, index) => {
                setTimeout(() => {
                    step.classList.remove('pending');
                    step.classList.add('completed');
                    const icon = step.querySelector('.step-icon');
                    icon.textContent = '✓';
                }, index * 500);
            });
        }, 2000);
    }, 100);
    
    return alert;
}

// CSS for flashy alerts (inject into page)
const flashyStyles = document.createElement('style');
flashyStyles.textContent = `
.flashy-demo-alert {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 10000;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 20px;
    padding: 30px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    max-width: 500px;
    width: 90%;
    animation: slideIn 0.4s ease-out;
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translate(-50%, -60%);
    }
    to {
        opacity: 1;
        transform: translate(-50%, -50%);
    }
}

.flashy-alert-content {
    color: white;
}

.flashy-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
}

.flashy-header h3 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
}

.pulse-dot {
    width: 12px;
    height: 12px;
    background: #4ade80;
    border-radius: 50%;
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0%, 100% {
        opacity: 1;
        transform: scale(1);
    }
    50% {
        opacity: 0.5;
        transform: scale(1.2);
    }
}

.progress-container {
    margin: 20px 0;
}

.progress-bar {
    height: 6px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 8px;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4ade80, #22c55e);
    width: 0%;
    transition: width 2s ease-out;
}

.progress-text {
    font-size: 0.875rem;
    opacity: 0.9;
}

.deployment-steps {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 12px;
    padding: 15px;
    margin: 20px 0;
}

.step {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    font-size: 0.875rem;
    transition: all 0.3s ease;
}

.step.pending {
    opacity: 0.6;
}

.step.completed .step-icon {
    color: #4ade80;
}

.step-icon {
    font-size: 1.2rem;
    width: 24px;
    text-align: center;
}

.flashy-notice {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    padding: 15px;
    margin: 20px 0;
    display: flex;
    gap: 12px;
}

.notice-icon {
    font-size: 1.5rem;
}

.notice-content {
    flex: 1;
}

.notice-content strong {
    display: block;
    margin-bottom: 5px;
    font-size: 1.1rem;
}

.notice-content p {
    margin: 5px 0;
    font-size: 0.875rem;
    opacity: 0.9;
}

.production-link {
    display: inline-block;
    margin-top: 10px;
    padding: 8px 16px;
    background: white;
    color: #667eea;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    font-size: 0.875rem;
    transition: transform 0.2s ease;
}

.production-link:hover {
    transform: translateX(4px);
}

.close-flashy {
    width: 100%;
    padding: 12px;
    background: rgba(255, 255, 255, 0.2);
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 10px;
    color: white;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
}

.close-flashy:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: translateY(-2px);
}
`;

document.head.appendChild(flashyStyles);

// Export for use in other scripts
window.showFlashyDeploymentAlert = showFlashyDeploymentAlert;
