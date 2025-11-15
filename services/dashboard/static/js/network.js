// Network Management Page JavaScript

// Store bandwidth history for the chart
let bandwidthHistory = {
    timestamps: [],
    upload: [],
    download: [],
    maxDataPoints: 60 // Last hour at 1-minute intervals (or 60 points at 5-second intervals for 5 minutes)
};

let bandwidthChart = null;
let refreshInterval = null;

// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Helper function to get IP address from interface
function getIPAddress(addresses) {
    const ipv4 = addresses.find(addr => addr.family.includes('AF_INET') && !addr.family.includes('AF_INET6'));
    return ipv4 ? ipv4.address : 'N/A';
}

// Helper function to get MAC address from interface
function getMACAddress(addresses) {
    const mac = addresses.find(addr => addr.family.includes('AF_PACKET') || addr.family.includes('AF_LINK'));
    return mac ? mac.address : 'N/A';
}

// Load network statistics
async function loadNetworkStats() {
    console.log('[Network Stats] Loading...');
    const statsTable = document.getElementById('network-stats');
    
    if (!statsTable) {
        console.warn('[Network Stats] Stats table element not found');
        return;
    }
    
    try {
        const response = await fetch('/api/network/stats', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('[Network Stats] Response:', result);
        
        if (result.success && result.data) {
            const stats = result.data;
            console.log('[Network Stats] Data loaded successfully');
            
            // Update statistics table
            statsTable.innerHTML = `
                <tr>
                    <td><strong>Total Sent</strong></td>
                    <td>${formatBytes(stats.bytes_sent)}</td>
                </tr>
                <tr>
                    <td><strong>Total Received</strong></td>
                    <td>${formatBytes(stats.bytes_recv)}</td>
                </tr>
                <tr>
                    <td><strong>Packets Sent</strong></td>
                    <td>${stats.packets_sent.toLocaleString()}</td>
                </tr>
                <tr>
                    <td><strong>Packets Received</strong></td>
                    <td>${stats.packets_recv.toLocaleString()}</td>
                </tr>
                <tr>
                    <td><strong>Errors In</strong></td>
                    <td class="${stats.errors_in > 0 ? 'text-danger' : ''}">${stats.errors_in}</td>
                </tr>
                <tr>
                    <td><strong>Errors Out</strong></td>
                    <td class="${stats.errors_out > 0 ? 'text-danger' : ''}">${stats.errors_out}</td>
                </tr>
                <tr>
                    <td><strong>Drops In</strong></td>
                    <td class="${stats.drops_in > 0 ? 'text-warning' : ''}">${stats.drops_in}</td>
                </tr>
                <tr>
                    <td><strong>Drops Out</strong></td>
                    <td class="${stats.drops_out > 0 ? 'text-warning' : ''}">${stats.drops_out}</td>
                </tr>
            `;
        } else {
            console.error('[Network Stats] Invalid response format:', result);
            throw new Error(result.message || 'Invalid response format');
        }
    } catch (error) {
        console.error('[Network Stats] Error:', error);
        const statsTable = document.getElementById('network-stats');
        if (statsTable) {
            statsTable.innerHTML = `
                <tr>
                    <td colspan="2" class="text-center text-danger">
                        <i class="fas fa-exclamation-triangle"></i> Failed to load stats<br>
                        <small>${error.message}</small>
                    </td>
                </tr>
            `;
        }
    }
}

// Load bandwidth usage
async function loadBandwidth() {
    console.log('[Bandwidth] Loading...');
    try {
        const response = await fetch('/api/network/bandwidth', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('[Bandwidth] Response received');
        
        if (result.success && result.data) {
            const data = result.data;
            
            // Update current bandwidth display
            const uploadEl = document.getElementById('upload-speed');
            const downloadEl = document.getElementById('download-speed');
            
            if (uploadEl) uploadEl.textContent = data.upload_mbps.toFixed(2) + ' Mbps';
            if (downloadEl) downloadEl.textContent = data.download_mbps.toFixed(2) + ' Mbps';
            
            // Add to history
            const now = new Date();
            bandwidthHistory.timestamps.push(now.toLocaleTimeString());
            bandwidthHistory.upload.push(data.upload_mbps);
            bandwidthHistory.download.push(data.download_mbps);
            
            // Keep only last N data points
            if (bandwidthHistory.timestamps.length > bandwidthHistory.maxDataPoints) {
                bandwidthHistory.timestamps.shift();
                bandwidthHistory.upload.shift();
                bandwidthHistory.download.shift();
            }
            
            // Update chart
            updateBandwidthChart();
        } else {
            console.error('[Bandwidth] Invalid response:', result);
        }
    } catch (error) {
        console.error('[Bandwidth] Error:', error);
        const uploadEl = document.getElementById('upload-speed');
        const downloadEl = document.getElementById('download-speed');
        if (uploadEl) uploadEl.textContent = 'Error';
        if (downloadEl) downloadEl.textContent = 'Error';
    }
}

// Initialize and update bandwidth chart
function updateBandwidthChart() {
    const ctx = document.getElementById('bandwidthChart');
    if (!ctx) {
        console.warn('[Bandwidth Chart] Canvas element not found');
        return;
    }
    
    // Check if Chart.js is available
    if (typeof Chart === 'undefined') {
        console.error('[Bandwidth Chart] Chart.js is not loaded');
        return;
    }
    
    if (!bandwidthChart) {
        bandwidthChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: bandwidthHistory.timestamps,
                datasets: [
                    {
                        label: 'Upload',
                        data: bandwidthHistory.upload,
                        borderColor: 'rgba(75, 192, 192, 1)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Download',
                        data: bandwidthHistory.download,
                        borderColor: 'rgba(54, 162, 235, 1)',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Mbps'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    title: {
                        display: true,
                        text: 'Bandwidth Usage History'
                    }
                }
            }
        });
    } else {
        bandwidthChart.data.labels = bandwidthHistory.timestamps;
        bandwidthChart.data.datasets[0].data = bandwidthHistory.upload;
        bandwidthChart.data.datasets[1].data = bandwidthHistory.download;
        bandwidthChart.update('none'); // Update without animation for smooth real-time updates
    }
}

// Load network interfaces
async function loadNetworkInterfaces() {
    console.log('[Network Interfaces] Loading...');
    const container = document.getElementById('network-interfaces');
    
    if (!container) {
        console.error('[Network Interfaces] Container element not found!');
        return;
    }
    
    try {
        const response = await fetch('/api/network/interfaces', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('[Network Interfaces] Response:', result);
        
        if (result.success && result.data) {
            const interfaces = result.data;
            
            if (interfaces.length === 0) {
                container.innerHTML = `
                    <p class="text-center text-muted">
                        <i class="fas fa-info-circle"></i> No network interfaces found
                    </p>
                `;
                return;
            }
            
            let html = '';
            interfaces.forEach(iface => {
                const isUp = iface.stats?.is_up;
                const statusClass = isUp ? 'success' : 'secondary';
                const statusIcon = isUp ? 'check-circle' : 'times-circle';
                const ipAddress = getIPAddress(iface.addresses);
                const macAddress = getMACAddress(iface.addresses);
                
                html += `
                    <div class="card mb-2" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">
                        <div class="card-body p-2">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <strong><i class="fas fa-network-wired"></i> ${iface.name}</strong>
                                    <span class="badge bg-${statusClass} ms-2">
                                        <i class="fas fa-${statusIcon}"></i> ${isUp ? 'UP' : 'DOWN'}
                                    </span>
                                </div>
                                <small class="text-muted">MTU: ${iface.stats?.mtu || 'N/A'}</small>
                            </div>
                            <div class="row mt-2">
                                <div class="col-md-6">
                                    <small><strong>IP:</strong> ${ipAddress}</small><br>
                                    <small><strong>MAC:</strong> ${macAddress}</small>
                                </div>
                                <div class="col-md-6">
                                    ${iface.io ? `
                                        <small><strong>TX:</strong> ${formatBytes(iface.io.bytes_sent)}</small><br>
                                        <small><strong>RX:</strong> ${formatBytes(iface.io.bytes_recv)}</small>
                                    ` : '<small class="text-muted">No I/O stats</small>'}
                                </div>
                            </div>
                            ${iface.io && (iface.io.errors_in > 0 || iface.io.errors_out > 0) ? `
                                <div class="mt-2">
                                    <small class="text-danger">
                                        <i class="fas fa-exclamation-triangle"></i> 
                                        Errors: ${iface.io.errors_in + iface.io.errors_out}
                                    </small>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
        } else {
            console.error('[Network Interfaces] Invalid response:', result);
            throw new Error(result.message || 'Invalid response');
        }
    } catch (error) {
        console.error('[Network Interfaces] Error:', error);
        if (container) {
            container.innerHTML = `
                <p class="text-center text-danger">
                    <i class="fas fa-exclamation-triangle"></i> Failed to load interfaces<br>
                    <small>${error.message}</small>
                </p>
            `;
        }
    }
}

// Load listening ports
async function loadListeningPorts() {
    console.log('[Listening Ports] Loading...');
    const container = document.getElementById('listening-ports');
    
    if (!container) {
        console.error('[Listening Ports] Container element not found!');
        return;
    }
    
    try {
        const response = await fetch('/api/network/ports', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('[Listening Ports] Response:', result);
        
        if (result.success && result.data) {
            const ports = result.data;
            
            if (ports.length === 0) {
                container.innerHTML = `
                    <tr>
                        <td colspan="4" class="text-center text-muted">
                            <i class="fas fa-info-circle"></i> No listening ports found
                        </td>
                    </tr>
                `;
                return;
            }
            
            // Common ports to highlight
            const commonPorts = [80, 443, 22, 3000, 5000, 8080, 8443, 3306, 5432, 27017, 6379];
            
            let html = '';
            ports.forEach(port => {
                const isCommon = commonPorts.includes(port.port);
                const rowClass = isCommon ? 'table-warning' : '';
                
                html += `
                    <tr class="${rowClass}">
                        <td>
                            <strong>${port.port}</strong>
                            ${isCommon ? '<i class="fas fa-star text-warning ms-1" title="Common port"></i>' : ''}
                        </td>
                        <td><span class="badge bg-info">${port.protocol}</span></td>
                        <td><code>${port.address}</code></td>
                        <td>
                            ${port.process ? `<span class="badge bg-secondary">${port.process}</span>` : '<span class="text-muted">N/A</span>'}
                        </td>
                    </tr>
                `;
            });
            
            container.innerHTML = html;
        } else {
            console.error('[Listening Ports] Invalid response:', result);
            throw new Error(result.message || 'Invalid response');
        }
    } catch (error) {
        console.error('[Listening Ports] Error:', error);
        if (container) {
            container.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-danger">
                        <i class="fas fa-exclamation-triangle"></i> Failed to load ports<br>
                        <small>${error.message}</small>
                    </td>
                </tr>
            `;
        }
    }
}

// Load active connections
async function loadActiveConnections() {
    console.log('[Active Connections] Loading...');
    try {
        const response = await fetch('/api/network/connections', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('[Active Connections] Response:', result);
        
        if (result.success && result.data) {
            const data = result.data;
            
            // Update connection summary with null checks
            const totalEl = document.getElementById('total-connections');
            const tcpEl = document.getElementById('tcp-connections');
            const udpEl = document.getElementById('udp-connections');
            const establishedEl = document.getElementById('established-connections');
            
            if (totalEl) totalEl.textContent = data.total || 0;
            if (tcpEl) tcpEl.textContent = data.by_protocol?.TCP || 0;
            if (udpEl) udpEl.textContent = data.by_protocol?.UDP || 0;
            if (establishedEl) establishedEl.textContent = data.by_status?.ESTABLISHED || 0;
            
            // Update connections table
            const container = document.getElementById('active-connections');
            
            if (!container) {
                console.warn('[Active Connections] Container element not found');
                return;
            }
            
            if (data.error) {
                container.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center text-warning">
                            <i class="fas fa-exclamation-triangle"></i> ${data.error}
                        </td>
                    </tr>
                `;
                return;
            }
            
            if (!data.connections || data.connections.length === 0) {
                container.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center text-muted">
                            <i class="fas fa-info-circle"></i> No active connections
                        </td>
                    </tr>
                `;
                return;
            }
            
            let html = '';
            data.connections.forEach(conn => {
                // Determine if it's a Docker connection
                const isDocker = conn.process && (
                    conn.process.includes('docker') || 
                    conn.process.includes('containerd') ||
                    conn.local_address?.includes('172.') ||
                    conn.remote_address?.includes('172.')
                );
                
                const rowClass = isDocker ? 'table-info' : '';
                
                // Status badge color
                let statusClass = 'secondary';
                if (conn.status === 'ESTABLISHED') statusClass = 'success';
                else if (conn.status === 'LISTEN') statusClass = 'primary';
                else if (conn.status === 'TIME_WAIT') statusClass = 'warning';
                else if (conn.status === 'CLOSE_WAIT') statusClass = 'danger';
                
                html += `
                    <tr class="${rowClass}">
                        <td><span class="badge bg-info">${conn.protocol}</span></td>
                        <td><code>${conn.local_address || 'N/A'}</code></td>
                        <td><code>${conn.remote_address || 'N/A'}</code></td>
                        <td><span class="badge bg-${statusClass}">${conn.status}</span></td>
                        <td>
                            ${conn.process ? `
                                <span class="badge bg-secondary">${conn.process}</span>
                                ${isDocker ? '<i class="fab fa-docker text-info ms-1" title="Docker connection"></i>' : ''}
                            ` : '<span class="text-muted">N/A</span>'}
                        </td>
                    </tr>
                `;
            });
            
            container.innerHTML = html;
        } else {
            console.error('[Active Connections] Invalid response:', result);
            throw new Error(result.message || 'Invalid response');
        }
    } catch (error) {
        console.error('[Active Connections] Error:', error);
        const container = document.getElementById('active-connections');
        if (container) {
            container.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-danger">
                        <i class="fas fa-exclamation-triangle"></i> Failed to load connections<br>
                        <small>${error.message}</small>
                    </td>
                </tr>
            `;
        }
    }
}

// Load all network data
async function loadAllNetworkData() {
    await Promise.all([
        loadNetworkStats(),
        loadBandwidth(),
        loadNetworkInterfaces(),
        loadListeningPorts(),
        loadActiveConnections()
    ]);
}

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    console.log('✓ Network monitoring page loaded - initialization starting');
    
    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not loaded! Bandwidth chart will not work.');
        const ctx = document.getElementById('bandwidthChart');
        if (ctx) {
            ctx.getContext('2d').fillText('Chart.js failed to load', 10, 50);
        }
    } else {
        console.log('✓ Chart.js is available, version:', Chart.version);
    }
    
    // Verify all required DOM elements exist
    const requiredElements = [
        'upload-speed', 'download-speed', 'bandwidthChart',
        'network-stats', 'network-interfaces', 'listening-ports',
        'active-connections', 'total-connections', 'tcp-connections',
        'udp-connections', 'established-connections'
    ];
    
    let allElementsFound = true;
    requiredElements.forEach(id => {
        const element = document.getElementById(id);
        if (!element) {
            console.error(`Missing required element: ${id}`);
            allElementsFound = false;
        }
    });
    
    if (allElementsFound) {
        console.log('✓ All required DOM elements found');
    } else {
        console.error('Some required DOM elements are missing!');
    }
    
    // Load initial data
    console.log('Loading initial network data...');
    loadAllNetworkData().then(() => {
        console.log('✓ Initial network data loaded successfully');
    }).catch(error => {
        console.error('Failed to load initial network data:', error);
    });
    
    // Set up auto-refresh every 5 seconds
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    refreshInterval = setInterval(() => {
        console.log('Auto-refreshing network data...');
        loadAllNetworkData();
    }, 5000);
    console.log('✓ Auto-refresh interval set to 5 seconds');
});

// Clean up on page unload
window.addEventListener('beforeunload', function() {
    console.log('Cleaning up network monitoring page...');
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    if (bandwidthChart) {
        bandwidthChart.destroy();
    }
});
