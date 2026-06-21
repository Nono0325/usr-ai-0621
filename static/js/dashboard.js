// Global States
let activePondId = null;
let currentSensorType = 'temperature';
let currentDays = 7;
let chartInstance = null;
let chatHistory = [];

// Three.js 3D Scene variables
let scene, camera, renderer;
let waterWheelMesh, waterMesh, fishGroup, bubbleSystem;
let isWheelSpinning = false;
let fishSwimSpeed = 0.02;

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
    // Determine initially active pond from the first pond card
    const firstPondCard = document.querySelector('.pond-card');
    if (firstPondCard) {
        activePondId = parseInt(firstPondCard.dataset.id);
        isWheelSpinning = firstPondCard.dataset.wheel === 'true';
        firstPondCard.classList.add('active');
        
        // Sync initial Auto Aeration UI state
        const autoEnabled = firstPondCard.dataset.autoEnabled === 'true';
        const autoThreshold = parseFloat(firstPondCard.dataset.autoThreshold || '4.0');
        
        const autoSwitch = document.getElementById('auto-aeration-switch');
        if (autoSwitch) autoSwitch.checked = autoEnabled;
        
        const autoInput = document.getElementById('auto-aeration-threshold-input');
        if (autoInput) autoInput.value = autoThreshold;
        
        // Load initial Water Wheels list
        loadWaterWheels(activePondId);
    }

    // Initialize 3D Visualizer
    initThreeJS();
    
    // Initialize Historical Chart
    initChart();
    
    // Load historical telemetry
    refreshTelemetryData();

    // Event Listeners
    setupEventListeners();
});

// Setup All Interactive Event Listeners
function setupEventListeners() {
    // 1. Pond Card Click Selector
    document.querySelectorAll('.pond-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.pond-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            activePondId = parseInt(card.dataset.id);
            isWheelSpinning = card.dataset.wheel === 'true';
            
            // Sync Auto Aeration UI State from Card Dataset
            const autoEnabled = card.dataset.autoEnabled === 'true';
            const autoThreshold = parseFloat(card.dataset.autoThreshold || '4.0');
            
            const autoSwitch = document.getElementById('auto-aeration-switch');
            if (autoSwitch) autoSwitch.checked = autoEnabled;
            
            const autoInput = document.getElementById('auto-aeration-threshold-input');
            if (autoInput) autoInput.value = autoThreshold;
            
            // Load Multiple Water Wheels
            loadWaterWheels(activePondId);
            
            // Refresh Dashboard Content
            refreshTelemetryData();
            
            // Update 3D Title
            document.getElementById('pond-title-3d').textContent = card.querySelector('.pond-title').textContent;
        });
    });

    // 2. Auto Aeration Configuration Button
    const saveAutoBtn = document.getElementById('save-auto-aeration-btn');
    if (saveAutoBtn) {
        saveAutoBtn.addEventListener('click', () => {
            saveAutoAerationConfig();
        });
    }
    
    const autoSwitch = document.getElementById('auto-aeration-switch');
    if (autoSwitch) {
        autoSwitch.addEventListener('change', () => {
            saveAutoAerationConfig();
        });
    }

    // 3. Historical Filters
    const sensorSelect = document.getElementById('chart-sensor-select');
    const rangeSelect = document.getElementById('chart-range-select');
    const viewModeSelect = document.getElementById('chart-view-select');
    
    if (sensorSelect) {
        sensorSelect.addEventListener('change', (e) => {
            currentSensorType = e.target.value;
            refreshTelemetryData();
        });
    }
    
    if (rangeSelect) {
        rangeSelect.addEventListener('change', (e) => {
            currentDays = parseInt(e.target.value);
            refreshTelemetryData();
        });
    }
    
    if (viewModeSelect) {
        viewModeSelect.addEventListener('change', (e) => {
            const mode = e.target.value;
            const chartCanvas = document.getElementById('historical-chart');
            const dataTable = document.getElementById('historical-table-box');
            if (mode === 'chart') {
                chartCanvas.style.display = 'block';
                dataTable.style.display = 'none';
            } else {
                chartCanvas.style.display = 'none';
                dataTable.style.display = 'block';
            }
        });
    }

    // 4. Floating Chat Window
    const chatFab = document.getElementById('chat-fab');
    const chatDrawer = document.getElementById('chat-drawer');
    const chatClose = document.getElementById('chat-close');
    const chatSend = document.getElementById('chat-send');
    const chatInput = document.getElementById('chat-input');

    if (chatFab && chatDrawer) {
        chatFab.addEventListener('click', () => {
            chatDrawer.classList.add('open');
            chatInput.focus();
        });
    }
    
    if (chatClose) {
        chatClose.addEventListener('click', () => {
            chatDrawer.classList.remove('open');
        });
    }

    if (chatSend && chatInput) {
        const sendMsg = () => {
            const text = chatInput.value.trim();
            if (!text) return;
            appendChatMessage('user', text);
            chatInput.value = '';
            sendChatMessageToAI(text);
        };

        chatSend.addEventListener('click', sendMsg);
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendMsg();
        });
    }

    // 5. Modals Management
    setupModalHandlers();
}

// Update UI Switch & Visual Indicators
function updateWaterWheelUI(active) {
    const wheelSwitch = document.getElementById('water-wheel-switch');
    if (wheelSwitch) wheelSwitch.checked = active;
    
    // Set 3D rotation state
    isWheelSpinning = active;
    
    // Animate turbine icon on pond card
    const cardBadge = document.querySelector(`.pond-card[data-id="${activePondId}"] .water-wheel-badge`);
    if (cardBadge) {
        if (active) cardBadge.classList.add('spinning');
        else cardBadge.classList.remove('spinning');
    }
    
    // Also toggle running badge
    const cardIndicator = document.querySelector(`.pond-card[data-id="${activePondId}"] .indicator-pill.wheel-pill`);
    if (cardIndicator) {
        if (active) {
            cardIndicator.classList.add('active');
            cardIndicator.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> 水車: 運轉中';
        } else {
            cardIndicator.classList.remove('active');
            cardIndicator.innerHTML = '<i class="fas fa-power-off"></i> 水車: 停止';
        }
    }
}

// API Call: Control Water Wheel status
function toggleWaterWheel(pondId, turnOn) {
    fetch(`/api/ponds/${pondId}/water-wheel/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        json: true,
        body: JSON.stringify({ status: turnOn })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            // Update active state cache on the card dataset
            const card = document.querySelector(`.pond-card[data-id="${pondId}"]`);
            if (card) card.dataset.wheel = turnOn ? 'true' : 'false';
            
            updateWaterWheelUI(turnOn);
            
            // Re-fetch sensor data to reflect Dissolved Oxygen updates
            setTimeout(refreshTelemetryData, 1000);
        } else {
            alert('水車控制失敗: ' + data.message);
        }
    })
    .catch(err => console.error(err));
}

// Refresh Current Telemetry Readings & Historical charts
function refreshTelemetryData() {
    if (!activePondId) return;

    // 1. Load active values for Telemetry Cards
    fetch(`/api/ponds/${activePondId}/sensors/`)
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            // Setup sensor readings fetches
            // In views, sensor_list_api returns: [{id, name, sensor_type, status}]
            // Let's retrieve readings for each sensor
            data.sensors.forEach(sensor => {
                // Fetch historical or current value to update dashboard cards
                fetch(`/api/historical/?pond_id=${activePondId}&sensor_type=${sensor.sensor_type}&days=1`)
                .then(r => r.json())
                .then(history => {
                    if (history.status === 'success' && history.data.length > 0) {
                        const val = history.data[history.data.length - 1];
                        updateCardValue(sensor.sensor_type, val);
                    } else {
                        updateCardValue(sensor.sensor_type, 'N/A');
                    }
                });
            });
        }
    });

    // 2. Load historical chart data
    fetch(`/api/historical/?pond_id=${activePondId}&sensor_type=${currentSensorType}&days=${currentDays}`)
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            // Update Chart.js
            updateChartData(data.labels, data.data, currentSensorType);
            
            // Update Statistics
            document.getElementById('stat-avg').textContent = data.stats.avg;
            document.getElementById('stat-max').textContent = data.stats.max;
            document.getElementById('stat-min').textContent = data.stats.min;
            
            // Update AI health suggestion
            document.getElementById('ai-status').textContent = data.stats.health_status;
            document.getElementById('ai-advice').textContent = data.stats.health_advice;
            
            // Populate Historical Grid/Table
            populateTable(data.labels, data.data);
        }
    })
    .catch(err => console.error(err));
}

function updateCardValue(type, value) {
    let selector = '';
    if (type === 'temperature') selector = '#val-temp';
    else if (type === 'ph') selector = '#val-ph';
    else if (type === 'dissolved_oxygen') selector = '#val-do';
    else if (type === 'water_level') selector = '#val-wl';
    
    const el = document.querySelector(selector);
    if (el) {
        if (typeof value === 'number') {
            el.textContent = value.toFixed(1);
        } else {
            el.textContent = value;
        }
    }
}

// Populate the historical data grid view
function populateTable(labels, dataPoints) {
    const tableBody = document.querySelector('#historical-table-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    // Reverse lists to show newest first
    for (let i = dataPoints.length - 1; i >= 0; i--) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${labels[i]}</td>
            <td>${dataPoints[i]}</td>
            <td><span style="color:var(--color-success)">● 正常</span></td>
        `;
        tableBody.appendChild(tr);
    }
}

// Chart.js Configuration
function initChart() {
    const ctx = document.getElementById('historical-chart').getContext('2d');
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(0, 242, 254, 0.4)');
    gradient.addColorStop(1, 'rgba(0, 242, 254, 0.0)');

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '感測器數值',
                data: [],
                borderColor: '#00f2fe',
                borderWidth: 3,
                backgroundColor: gradient,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#00f2fe',
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#90a1b5' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#90a1b5' }
                }
            }
        }
    });
}

function updateChartData(labels, data, type) {
    if (!chartInstance) return;
    
    let label = '溫度 (°C)';
    let color = '#ff007f'; // Temp color default
    
    if (type === 'ph') {
        label = 'pH 值';
        color = '#00ff87';
    } else if (type === 'dissolved_oxygen') {
        label = '溶氧量 (mg/L)';
        color = '#4facfe';
    } else if (type === 'water_level') {
        label = '水位 (m)';
        color = '#ff9f43';
    }
    
    const ctx = document.getElementById('historical-chart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, color + '66'); // alpha 0.4
    gradient.addColorStop(1, color + '00'); // alpha 0
    
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = data;
    chartInstance.data.datasets[0].label = label;
    chartInstance.data.datasets[0].borderColor = color;
    chartInstance.data.datasets[0].backgroundColor = gradient;
    chartInstance.data.datasets[0].pointBackgroundColor = color;
    chartInstance.update();
}

// Three.js 3D Pond Setup
function initThreeJS() {
    const container = document.getElementById('three-container');
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Create Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1d);
    // Fog for depth feeling
    scene.fog = new THREE.FogExp2(0x0a0f1d, 0.03);

    // Camera
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 8, 12);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('three-canvas'), antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;

    // Lights
    const ambientLight = new THREE.AmbientLight(0x223355, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x5588ff, 1.2);
    dirLight.position.set(5, 15, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Point lights for glowing pond corners
    const pointLight = new THREE.PointLight(0x00f2fe, 2, 10);
    pointLight.position.set(-4, 0.5, -4);
    scene.add(pointLight);

    // Build Pond Basin
    const pondGeo = new THREE.CylinderGeometry(5.2, 4.8, 1.5, 32);
    const pondMat = new THREE.MeshStandardMaterial({
        color: 0x1a2639,
        roughness: 0.6,
        metalness: 0.1,
        side: THREE.BackSide
    });
    const pond = new THREE.Mesh(pondGeo, pondMat);
    pond.position.y = -0.55;
    scene.add(pond);

    // Pond Water Plane
    const waterGeo = new THREE.CylinderGeometry(5, 5, 0.1, 32);
    const waterMat = new THREE.MeshStandardMaterial({
        color: 0x0088cc,
        roughness: 0.1,
        metalness: 0.8,
        transparent: true,
        opacity: 0.6
    });
    waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.y = 0.05;
    scene.add(waterMesh);

    // Build Water Wheel
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(3.8, 0.2, 0);
    
    // Core cylinder
    const coreGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.8, 8);
    coreGeo.rotateX(Math.PI / 2);
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x5a6e85, roughness: 0.3 });
    const core = new THREE.Mesh(coreGeo, metalMat);
    wheelGroup.add(core);

    // Wheel discs
    const discGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.05, 12);
    discGeo.rotateX(Math.PI / 2);
    const discMat = new THREE.MeshStandardMaterial({ color: 0x3a4b5f, metalness: 0.6 });
    
    const disc1 = new THREE.Mesh(discGeo, discMat);
    disc1.position.z = 0.6;
    wheelGroup.add(disc1);

    const disc2 = new THREE.Mesh(discGeo, discMat);
    disc2.position.z = -0.6;
    wheelGroup.add(disc2);

    // Blades/Spokes
    waterWheelMesh = new THREE.Group();
    waterWheelMesh.add(core);
    waterWheelMesh.add(disc1);
    waterWheelMesh.add(disc2);

    const bladeGeo = new THREE.BoxGeometry(0.4, 0.05, 1.1);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xa18cd1, metalness: 0.8, roughness: 0.2 });
    
    for (let i = 0; i < 8; i++) {
        const bladePivot = new THREE.Group();
        const angle = (i * Math.PI) / 4;
        bladePivot.rotation.z = angle;
        
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        blade.position.y = 0.7; // blade distance from center
        bladePivot.add(blade);
        
        waterWheelMesh.add(bladePivot);
    }
    wheelGroup.add(waterWheelMesh);

    // Support pillars
    const pillarGeo = new THREE.BoxGeometry(0.2, 1.2, 0.2);
    const p1 = new THREE.Mesh(pillarGeo, metalMat);
    p1.position.set(0, -0.5, 0.9);
    const p2 = new THREE.Mesh(pillarGeo, metalMat);
    p2.position.set(0, -0.5, -0.9);
    wheelGroup.add(p1);
    wheelGroup.add(p2);

    scene.add(wheelGroup);

    // Build Floating fish
    fishGroup = new THREE.Group();
    scene.add(fishGroup);

    const fishCount = 6;
    const fishGeo = new THREE.ConeGeometry(0.1, 0.4, 8);
    fishGeo.rotateX(Math.PI / 2);
    const fishMat = new THREE.MeshStandardMaterial({ color: 0xffaa44, emissive: 0xff5500, emissiveIntensity: 0.3 });

    for (let i = 0; i < fishCount; i++) {
        const fish = new THREE.Mesh(fishGeo, fishMat);
        // Random placement radius 2 to 4
        const radius = 2.0 + Math.random() * 2.0;
        const angle = Math.random() * Math.PI * 2;
        fish.position.set(Math.cos(angle) * radius, -0.1, Math.sin(angle) * radius);
        
        // Custom variables
        fish.userData = {
            radius: radius,
            angle: angle,
            speed: 0.01 + Math.random() * 0.015,
            wiggleSpeed: 5 + Math.random() * 5
        };
        fishGroup.add(fish);
    }

    // Build Particle Bubble System
    const bubbleGeo = new THREE.BufferGeometry();
    const bubbleCount = 60;
    const bubblePositions = new Float32Array(bubbleCount * 3);
    const bubbleSpeeds = [];

    for (let i = 0; i < bubbleCount; i++) {
        // Init near the water wheel
        bubblePositions[i*3] = 3.8 + (Math.random() - 0.5) * 0.5;
        bubblePositions[i*3+1] = -0.5 + Math.random() * 0.5;
        bubblePositions[i*3+2] = (Math.random() - 0.5) * 1.2;
        bubbleSpeeds.push({
            x: (Math.random() - 0.7) * 0.03, // diffuse left
            y: 0.01 + Math.random() * 0.015,
            z: (Math.random() - 0.5) * 0.01
        });
    }

    bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bubblePositions, 3));
    const bubbleMat = new THREE.PointsMaterial({
        color: 0x00f2fe,
        size: 0.12,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending
    });
    
    bubbleSystem = new THREE.Points(bubbleGeo, bubbleMat);
    scene.add(bubbleSystem);
    bubbleSystem.userData = { speeds: bubbleSpeeds, count: bubbleCount };

    // Resize Handler
    window.addEventListener('resize', () => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    });

    // Start Rendering Loop
    animate();
}

// 3D Scene Animation Loop
function animate() {
    requestAnimationFrame(animate);

    // 1. Water Surface Animation
    if (waterMesh) {
        waterMesh.rotation.y += 0.002;
    }

    // 2. Water Wheel Spinning
    if (isWheelSpinning && waterWheelMesh) {
        waterWheelMesh.rotation.z -= 0.06; // Rotate backwards to simulate paddle speed
    }

    // 3. Fish Swimming
    if (fishGroup) {
        fishGroup.children.forEach(fish => {
            fish.userData.angle += fish.userData.speed;
            const r = fish.userData.radius;
            const a = fish.userData.angle;
            
            // Swim in circular path
            fish.position.x = Math.cos(a) * r;
            fish.position.z = Math.sin(a) * r;
            
            // Set orientation tangent to path
            fish.rotation.y = -a + Math.PI / 2;
            
            // Wiggle up/down
            fish.position.y = -0.15 + 0.05 * Math.sin(Date.now() * 0.003 * fish.userData.wiggleSpeed);
        });
    }

    // 4. Bubbles rising animation
    if (bubbleSystem) {
        const posAttr = bubbleSystem.geometry.attributes.position;
        const speeds = bubbleSystem.userData.speeds;
        
        for (let i = 0; i < bubbleSystem.userData.count; i++) {
            if (isWheelSpinning) {
                // Rising active simulation
                posAttr.array[i*3] += speeds[i].x;
                posAttr.array[i*3+1] += speeds[i].y;
                posAttr.array[i*3+2] += speeds[i].z;
                
                // If bubbles rise above water level or disperse too far
                if (posAttr.array[i*3+1] > 0.4 || posAttr.array[i*3] < 0) {
                    // Recycle
                    posAttr.array[i*3] = 3.8 + (Math.random() - 0.5) * 0.4;
                    posAttr.array[i*3+1] = -0.4;
                    posAttr.array[i*3+2] = (Math.random() - 0.5) * 1.0;
                }
            } else {
                // Decay simulation, hide bubbles slowly
                posAttr.array[i*3+1] += 0.005;
                if (posAttr.array[i*3+1] > 0.4) {
                    posAttr.array[i*3+1] = -2.0; // Hide way below basin
                }
            }
        }
        posAttr.needsUpdate = true;
    }

    // Slow orbital rotation of camera to make scene alive
    const timer = Date.now() * 0.0001;
    camera.position.x = 12 * Math.sin(timer);
    camera.position.z = 12 * Math.cos(timer);
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
}

function parseMarkdown(text) {
    if (!text) return '';
    let html = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
        
    // Bold: **text**
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Inline code: `text`
    html = html.replace(/`(.*?)`/g, '<code style="background:rgba(255,255,255,0.1); padding:2px 4px; border-radius:4px; font-family:monospace; color:var(--color-primary);">$1</code>');
    
    // Bullet points (handle lines starting with - or *)
    html = html.replace(/^\s*[-*]\s+(.*?)$/gm, '<li style="margin-left: 15px; margin-top: 4px;">$1</li>');
    
    // Handle line breaks
    html = html.replace(/\n/g, '<br>');
    return html;
}

// Chat API Messaging
function appendChatMessage(role, text) {
    const chatBody = document.getElementById('chat-body');
    if (!chatBody) return;
    
    // Remove typing bubble if present
    const typing = document.querySelector('.chat-msg-typing');
    if (typing) typing.remove();

    const msg = document.createElement('div');
    msg.className = `chat-msg ${role}`;
    msg.innerHTML = parseMarkdown(text);
    chatBody.appendChild(msg);

    // Scroll to bottom
    chatBody.scrollTop = chatBody.scrollHeight;
    
    // Cache in history
    chatHistory.push({ role: role, content: text });
}

function appendTypingIndicator() {
    const chatBody = document.getElementById('chat-body');
    if (!chatBody) return;
    
    const typing = document.createElement('div');
    typing.className = 'chat-msg-typing';
    typing.innerHTML = `
        AI 處理中
        <div class="dot-pulse"></div>
        <div class="dot-pulse"></div>
        <div class="dot-pulse"></div>
    `;
    chatBody.appendChild(typing);
    chatBody.scrollTop = chatBody.scrollHeight;
}

function sendChatMessageToAI(message) {
    appendTypingIndicator();
    
    fetch('/api/chat/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: message,
            history: chatHistory.slice(-6) // Limit chat context to last 6 messages
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            appendChatMessage('assistant', data.response);
            
            // Execute any UI Actions returned by AI tools
            if (data.ui_actions && data.ui_actions.length > 0) {
                data.ui_actions.forEach(action => {
                    handleAIAction(action);
                });
            }
        } else {
            appendChatMessage('assistant', '小助手通訊中斷，請確認系統連線。' + data.message);
        }
    })
    .catch(err => {
        console.error(err);
        appendChatMessage('assistant', '伺服器忙碌中，請稍後再試。');
    });
}

// Interpret UI triggers sent from the AI Agent (OpenAI tool callback action)
function handleAIAction(action) {
    if (action.action_type === 'water_wheel_control') {
        const pondId = action.pond_id;
        const turnOn = action.water_wheel_status;
        
        // Find if this is the active pond, toggle local switch
        if (pondId === activePondId) {
            updateWaterWheelUI(turnOn);
        }
        // Update local card dataset cache
        const card = document.querySelector(`.pond-card[data-id="${pondId}"]`);
        if (card) {
            card.dataset.wheel = turnOn ? 'true' : 'false';
            // Trigger visual label updates on card
            const active = turnOn;
            const cardIndicator = card.querySelector('.indicator-pill.wheel-pill');
            if (cardIndicator) {
                if (active) {
                    cardIndicator.classList.add('active');
                    cardIndicator.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> 水車: 運轉中';
                } else {
                    cardIndicator.classList.remove('active');
                    cardIndicator.innerHTML = '<i class="fas fa-power-off"></i> 水車: 停止';
                }
            }
            const cardBadge = card.querySelector('.water-wheel-badge');
            if (cardBadge) {
                if (active) cardBadge.classList.add('spinning');
                else cardBadge.classList.remove('spinning');
            }
        }
    } else if (action.action_type === 'ui_refresh') {
        // Refresh the whole sidebar pond list to reflect added or edited ponds
        fetch('/api/ponds/')
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                const listContainer = document.querySelector('.pond-list');
                if (!listContainer) return;
                
                listContainer.innerHTML = '';
                data.ponds.forEach(p => {
                    const card = document.createElement('div');
                    card.className = `pond-card glass-panel ${p.id === activePondId ? 'active' : ''}`;
                    card.dataset.id = p.id;
                    card.dataset.wheel = p.water_wheel_status ? 'true' : 'false';
                    card.dataset.autoEnabled = p.auto_aeration_enabled ? 'true' : 'false';
                    card.dataset.autoThreshold = p.auto_aeration_threshold;
                    
                    const wheelPillClass = p.water_wheel_status ? 'active' : '';
                    const wheelText = p.water_wheel_status ? '<i class="fas fa-sync-alt fa-spin"></i> 水車: 運轉中' : '<i class="fas fa-power-off"></i> 水車: 停止';
                    const wheelSpinningClass = p.water_wheel_status ? 'spinning' : '';
                    
                    card.innerHTML = `
                        <div class="pond-card-header">
                            <div class="pond-title">${p.name}</div>
                        </div>
                        <div class="pond-meta"><i class="fas fa-map-marker-alt"></i> ${p.location}</div>
                        <div class="pond-status-indicators">
                            <div class="indicator-pill wheel-pill ${wheelPillClass}">
                                ${wheelText}
                            </div>
                        </div>
                        <div class="water-wheel-badge ${wheelSpinningClass}">
                            <i class="fas fa-fan"></i>
                        </div>
                    `;
                    listContainer.appendChild(card);
                });
                
                // Re-bind click event triggers to new cards
                setupEventListeners();
                refreshTelemetryData();
            }
        });
    }
}

// Modals Trigger & Form submit handlers
function setupModalHandlers() {
    const addPondBtn = document.getElementById('add-pond-btn');
    const addPondModal = document.getElementById('add-pond-modal');
    const closePondModal = document.getElementById('close-pond-modal');
    const cancelPondModal = document.getElementById('cancel-pond-modal');
    const savePondBtn = document.getElementById('save-pond-btn');

    if (addPondBtn && addPondModal) {
        addPondBtn.addEventListener('click', () => addPondModal.classList.add('open'));
    }
    const closePond = () => addPondModal.classList.remove('open');
    if (closePondModal) closePondModal.addEventListener('click', closePond);
    if (cancelPondModal) cancelPondModal.addEventListener('click', closePond);

    if (savePondBtn) {
        savePondBtn.addEventListener('click', () => {
            const name = document.getElementById('pond-name-input').value.trim();
            const location = document.getElementById('pond-location-input').value.trim();
            if (!name) {
                alert('請輸入魚池名稱！');
                return;
            }

            fetch('/api/ponds/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, location: location })
            })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    closePond();
                    document.getElementById('pond-name-input').value = '';
                    document.getElementById('pond-location-input').value = '';
                    
                    // Trigger sidebar reload
                    handleAIAction({ action_type: 'ui_refresh' });
                } else {
                    alert('新增魚池失敗：' + data.message);
                }
            });
        });
    }

    // AR Mode Simulator Camera Modal
    const arModeBtn = document.getElementById('ar-mode-btn');
    const arModal = document.getElementById('ar-modal');
    const closeArModal = document.getElementById('close-ar-modal');
    const arVideo = document.getElementById('ar-video');

    if (arModeBtn && arModal) {
        arModeBtn.addEventListener('click', () => {
            arModal.classList.add('open');
            
            // Try accessing user camera for interactive AR HUD Simulation
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                .then(stream => {
                    arVideo.srcObject = stream;
                    arVideo.play();
                })
                .catch(err => {
                    console.log("No camera accessed, fallback to simulated render overlay.", err);
                });
            }
            
            // Sync current readings into AR view
            document.getElementById('ar-pond-name').textContent = document.getElementById('pond-title-3d').textContent;
            document.getElementById('ar-temp-val').textContent = document.getElementById('val-temp').textContent;
            document.getElementById('ar-ph-val').textContent = document.getElementById('val-ph').textContent;
            document.getElementById('ar-do-val').textContent = document.getElementById('val-do').textContent;
        });
    }

    if (closeArModal) {
        closeArModal.addEventListener('click', () => {
            arModal.classList.remove('open');
            if (arVideo.srcObject) {
                arVideo.srcObject.getTracks().forEach(track => track.stop());
            }
        });
    }

    // IoT Physical Sensor Integration Modal
    const iotModeBtn = document.getElementById('iot-mode-btn');
    const iotModal = document.getElementById('iot-modal');
    const closeIotModal = document.getElementById('close-iot-modal');
    const closeIotBtn = document.getElementById('close-iot-btn');
    
    if (iotModeBtn && iotModal) {
        iotModeBtn.addEventListener('click', () => {
            iotModal.classList.add('open');
            
            // Populate current pond id into the snippets
            const currentPondIdSpans = document.querySelectorAll('.current-pond-id-span');
            currentPondIdSpans.forEach(el => {
                el.textContent = activePondId;
            });
        });
    }
    
    const closeIot = () => iotModal.classList.remove('open');
    if (closeIotModal) closeIotModal.addEventListener('click', closeIot);
    if (closeIotBtn) closeIotBtn.addEventListener('click', closeIot);

    // Add Sensor Modal
    const addSensorBtn = document.getElementById('add-sensor-btn');
    const addSensorModal = document.getElementById('add-sensor-modal');
    const closeSensorModal = document.getElementById('close-sensor-modal');
    const cancelSensorModal = document.getElementById('cancel-sensor-modal');
    const saveSensorBtn = document.getElementById('save-sensor-btn');

    if (addSensorBtn && addSensorModal) {
        addSensorBtn.addEventListener('click', () => addSensorModal.classList.add('open'));
    }
    const closeSensor = () => addSensorModal.classList.remove('open');
    if (closeSensorModal) closeSensorModal.addEventListener('click', closeSensor);
    if (cancelSensorModal) cancelSensorModal.addEventListener('click', closeSensor);

    if (saveSensorBtn) {
        saveSensorBtn.addEventListener('click', () => {
            const name = document.getElementById('sensor-name-input').value.trim();
            const sensor_type = document.getElementById('sensor-type-select').value;
            if (!name) {
                alert('請輸入感測器名稱！');
                return;
            }
            fetch(`/api/ponds/${activePondId}/sensors/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, sensor_type: sensor_type })
            })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    closeSensor();
                    document.getElementById('sensor-name-input').value = '';
                    refreshTelemetryData();
                    alert(`感測器 '${data.sensor.name}' 已成功新增！`);
                } else {
                    alert('新增感測器失敗：' + data.message);
                }
            });
        });
    }

    // Add Water Wheel Modal
    const addWheelBtn = document.getElementById('add-wheel-btn');
    const addWheelModal = document.getElementById('add-wheel-modal');
    const closeWheelModal = document.getElementById('close-wheel-modal');
    const cancelWheelModal = document.getElementById('cancel-wheel-modal');
    const saveWheelBtn = document.getElementById('save-wheel-btn');

    if (addWheelBtn && addWheelModal) {
        addWheelBtn.addEventListener('click', () => addWheelModal.classList.add('open'));
    }
    const closeWheel = () => addWheelModal.classList.remove('open');
    if (closeWheelModal) closeWheelModal.addEventListener('click', closeWheel);
    if (cancelWheelModal) cancelWheelModal.addEventListener('click', closeWheel);

    if (saveWheelBtn) {
        saveWheelBtn.addEventListener('click', () => {
            const name = document.getElementById('wheel-name-input').value.trim();
            if (!name) {
                alert('請輸入水車名稱！');
                return;
            }
            fetch(`/api/ponds/${activePondId}/water-wheels/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name })
            })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    closeWheel();
                    document.getElementById('wheel-name-input').value = '';
                    loadWaterWheels(activePondId);
                    alert(`水車 '${data.wheel.name}' 已成功新增！`);
                } else {
                    alert('新增水車失敗：' + data.message);
                }
            });
        });
    }
}

// --- Multiple Water Wheels & Auto Aeration Control functions ---
function loadWaterWheels(pondId) {
    fetch(`/api/ponds/${pondId}/water-wheels/`)
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            const container = document.getElementById('wheels-list-container');
            if (!container) return;
            
            container.innerHTML = '';
            
            if (data.wheels.length === 0) {
                container.innerHTML = `<span style="font-size:12.5px; color:var(--text-muted);">本池目前無增氧水車。</span>`;
                return;
            }
            
            data.wheels.forEach(w => {
                const checked = w.status === 'on' ? 'checked' : '';
                const statusLabel = w.status === 'on' ? '<span style="color:var(--color-success)">運轉中</span>' : '<span style="color:var(--text-muted)">停止</span>';
                
                const div = document.createElement('div');
                div.style.display = 'flex';
                div.style.justify = 'space-between';
                div.style.alignItems = 'center';
                div.style.background = 'rgba(255,255,255,0.02)';
                div.style.padding = '8px 12px';
                div.style.borderRadius = '8px';
                div.style.border = '1px solid var(--border-color)';
                
                div.innerHTML = `
                    <div style="display:flex; align-items:center; gap:10px;">
                        <i class="fas fa-fan ${w.status === 'on' ? 'fa-spin' : ''}" style="color: ${w.status === 'on' ? 'var(--color-accent)' : 'var(--text-muted)'}; font-size:14px;"></i>
                        <div>
                            <span style="font-weight:500; font-size:13px; color:#fff;">${w.name}</span>
                            <span style="font-size:11px; margin-left:8px;">(${statusLabel})</span>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <label class="switch" style="transform: scale(0.85); width:50px; height:26px; margin:0;">
                            <input type="checkbox" class="wheel-individual-switch" data-id="${w.id}" ${checked}>
                            <span class="slider"></span>
                        </label>
                        <button class="btn-danger delete-wheel-btn" data-id="${w.id}" style="padding: 4px 8px; font-size: 11px; border-radius: 6px; border:none; line-height:1;"><i class="fas fa-trash-can"></i></button>
                    </div>
                `;
                container.appendChild(div);
            });
            
            // Bind switch handlers
            container.querySelectorAll('.wheel-individual-switch').forEach(sw => {
                sw.addEventListener('change', (e) => {
                    const wheelId = e.target.dataset.id;
                    const turnOn = e.target.checked;
                    toggleIndividualWaterWheel(wheelId, turnOn);
                });
            });

            // Bind delete handlers
            container.querySelectorAll('.delete-wheel-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const wheelId = btn.dataset.id;
                    if (confirm('確定要刪除這台水車嗎？')) {
                        deleteWaterWheel(wheelId);
                    }
                });
            });
        }
    });
}

function toggleIndividualWaterWheel(wheelId, turnOn) {
    fetch(`/api/water-wheels/${wheelId}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: turnOn ? 'on' : 'off' })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            // Update 3D spinning representation
            isWheelSpinning = data.wheel.water_wheel_status;
            
            // Sync sidebars / legacy pond card spinning badge
            updateLegacyPondCardWheelUI(activePondId, isWheelSpinning);
            
            // Re-render list
            loadWaterWheels(activePondId);
            
            // Re-fetch sensor data
            setTimeout(refreshTelemetryData, 1000);
        } else {
            alert('水車更新失敗: ' + data.message);
        }
    })
    .catch(err => console.error(err));
}

function updateLegacyPondCardWheelUI(pondId, active) {
    const card = document.querySelector(`.pond-card[data-id="${pondId}"]`);
    if (!card) return;
    
    card.dataset.wheel = active ? 'true' : 'false';
    const cardBadge = card.querySelector('.water-wheel-badge');
    if (cardBadge) {
        if (active) cardBadge.classList.add('spinning');
        else cardBadge.classList.remove('spinning');
    }
    
    const cardIndicator = card.querySelector('.indicator-pill.wheel-pill');
    if (cardIndicator) {
        if (active) {
            cardIndicator.classList.add('active');
            cardIndicator.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> 水車: 運轉中';
        } else {
            cardIndicator.classList.remove('active');
            cardIndicator.innerHTML = '<i class="fas fa-power-off"></i> 水車: 停止';
        }
    }
}

function deleteWaterWheel(wheelId) {
    fetch(`/api/water-wheels/${wheelId}/`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            loadWaterWheels(activePondId);
            isWheelSpinning = data.water_wheel_status;
            updateLegacyPondCardWheelUI(activePondId, isWheelSpinning);
        } else {
            alert('刪除水車失敗：' + data.message);
        }
    })
    .catch(err => console.error(err));
}

function saveAutoAerationConfig() {
    const enabled = document.getElementById('auto-aeration-switch').checked;
    const threshold = parseFloat(document.getElementById('auto-aeration-threshold-input').value);
    
    if (isNaN(threshold) || threshold < 1.0 || threshold > 10.0) {
        alert('請輸入有效的溶氧臨界值 (1.0 - 10.0 mg/L)！');
        return;
    }
    
    fetch(`/api/ponds/${activePondId}/auto-aeration/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enabled, threshold: threshold })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            // Update legacy spinner status
            isWheelSpinning = data.water_wheel_status;
            updateLegacyPondCardWheelUI(activePondId, isWheelSpinning);
            loadWaterWheels(activePondId);
            
            // Sync pond card attributes
            const card = document.querySelector(`.pond-card[data-id="${activePondId}"]`);
            if (card) {
                card.dataset.autoEnabled = enabled ? 'true' : 'false';
                card.dataset.autoThreshold = threshold;
            }
        } else {
            alert('設定儲存失敗：' + data.message);
        }
    })
    .catch(err => console.error(err));
}
