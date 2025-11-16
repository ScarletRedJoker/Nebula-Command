async function loadEnergyStats() {
    const resp = await fetch('/api/homeassistant/energy');
    if (resp.ok) {
        const data = await resp.json();
        document.getElementById('dailyEnergy').textContent = data.daily_consumption.toFixed(1);
        document.getElementById('costToday').textContent = '$' + data.cost_today.toFixed(2);
        document.getElementById('peakHour').textContent = data.peak_hour;
    }
}

async function loadDevices() {
    const resp = await fetch('/api/homeassistant/devices');
    if (resp.ok) {
        const data = await resp.json();
        const grid = document.getElementById('deviceGrid');
        grid.innerHTML = data.devices.map(device => `
            <div class="device-card ${device.type}">
                <div class="device-icon">
                    <i class="bi bi-${getDeviceIcon(device.type)}"></i>
                </div>
                <h4>${device.name}</h4>
                <p class="device-state">${device.state}</p>
                <button onclick="toggleDevice('${device.id}')" class="btn-control">
                    ${device.state === 'on' ? 'Turn Off' : 'Turn On'}
                </button>
            </div>
        `).join('');
    }
}

async function loadAutomations() {
    const resp = await fetch('/api/homeassistant/automations');
    if (resp.ok) {
        const data = await resp.json();
        const list = document.getElementById('automationList');
        list.innerHTML = data.automations.map(auto => `
            <div class="automation-item">
                <div class="automation-info">
                    <h4>${auto.name}</h4>
                    <span class="status ${auto.enabled ? 'enabled' : 'disabled'}">
                        ${auto.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                </div>
                <button onclick="toggleAutomation('${auto.id}')" class="btn-toggle">
                    ${auto.enabled ? 'Disable' : 'Enable'}
                </button>
            </div>
        `).join('');
    }
}

function getDeviceIcon(type) {
    const icons = {
        'light': 'lightbulb',
        'switch': 'toggle-on',
        'sensor': 'thermometer-half'
    };
    return icons[type] || 'gear';
}

async function toggleDevice(deviceId) {
    await fetch('/api/homeassistant/control', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({device_id: deviceId, action: 'toggle'})
    });
    loadDevices();
}

document.addEventListener('DOMContentLoaded', () => {
    loadEnergyStats();
    loadDevices();
    loadAutomations();
    
    setInterval(loadEnergyStats, 30000);
    setInterval(loadDevices, 30000);
});
