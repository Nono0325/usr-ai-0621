// Global States
let activePondId = null;
let currentSensorType = 'temperature';
let currentDays = 7;
let chartInstance = null;
let chatHistory = [];
let wheelSpinningSpeedFactor = 0.0;
let activeCreatures = { fish: true, shrimp: false, crab: false };
let currentWeatherMode = 'day';
let feedParticles = [];
let rainSystem = null;
let isScanning = false;
let scanMesh = null;
let scanProgress = 0;
let autoFeederIntervalId = null;
let feederCapacity = 100;
let feederIntervalSeconds = 15;
let feederTimeLeft = 15;
let feederLightMat = null;

// Three.js 3D Scene variables
let scene, camera, renderer;
let waterWheelMesh, waterMesh, fishGroup, bubbleSystem;
let ambientLight, dirLight;
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

            // Clear any active feed pellets
            if (feedParticles.length > 0) {
                feedParticles.forEach(p => {
                    if (scene) scene.remove(p.mesh);
                });
                feedParticles = [];
            }
        });
    });

    // Creature Selector checkbox handlers
    const fishCb = document.getElementById('creature-fish-cb');
    const shrimpCb = document.getElementById('creature-shrimp-cb');
    const crabCb = document.getElementById('creature-crab-cb');
    
    const onCbChange = () => {
        activeCreatures.fish = fishCb ? fishCb.checked : false;
        activeCreatures.shrimp = shrimpCb ? shrimpCb.checked : false;
        activeCreatures.crab = crabCb ? crabCb.checked : false;
        spawnCreatures();
    };
    
    if (fishCb) fishCb.addEventListener('change', onCbChange);
    if (shrimpCb) shrimpCb.addEventListener('change', onCbChange);
    if (crabCb) crabCb.addEventListener('change', onCbChange);

    // Weather button listeners
    const dayBtn = document.getElementById('weather-day-btn');
    const nightBtn = document.getElementById('weather-night-btn');
    const rainBtn = document.getElementById('weather-rain-btn');
    
    if (dayBtn) dayBtn.addEventListener('click', () => setWeatherMode('day'));
    if (nightBtn) nightBtn.addEventListener('click', () => setWeatherMode('night'));
    if (rainBtn) rainBtn.addEventListener('click', () => setWeatherMode('rain'));
    
    // Feed button listener
    const feedBtn = document.getElementById('feed-fish-btn');
    if (feedBtn) {
        feedBtn.addEventListener('click', () => feedFish());
    }

    // AI Scan button listener
    const aiScanBtn = document.getElementById('ai-scan-btn');
    if (aiScanBtn) {
        aiScanBtn.addEventListener('click', () => triggerAIScan());
    }
    
    // Scan modal close listeners
    const closeScanBtn = document.getElementById('close-scan-modal-btn');
    const closeScanX = document.getElementById('close-scan-modal-x');
    const scanModal = document.getElementById('scan-modal');
    if (closeScanBtn && scanModal) {
        closeScanBtn.addEventListener('click', () => scanModal.classList.remove('open'));
    }
    if (closeScanX && scanModal) {
        closeScanX.addEventListener('click', () => scanModal.classList.remove('open'));
    }

    // Automatic Feeder Event Listeners
    const feederSwitch = document.getElementById('auto-feeder-switch');
    const saveFeederBtn = document.getElementById('save-feeder-btn');
    const refillFeederBtn = document.getElementById('refill-feeder-btn');
    
    if (feederSwitch) {
        feederSwitch.addEventListener('change', () => toggleAutoFeeder(feederSwitch.checked));
    }
    if (saveFeederBtn) {
        saveFeederBtn.addEventListener('click', () => applyFeederInterval());
    }
    if (refillFeederBtn) {
        refillFeederBtn.addEventListener('click', () => refillFeeder());
    }

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
    
    // Load water wheels to calculate active ratio and update UI
    loadWaterWheels(activePondId);
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
    const container = document.getElementById('canvas-wrapper');
    if (!container) return;

    const width = container.clientWidth;
    const height = window.innerWidth <= 768 ? 320 : container.clientHeight;
    
    // Window resize event handler to dynamically resize Three.js canvas
    window.addEventListener('resize', () => {
        const wrapper = document.getElementById('canvas-wrapper');
        if (wrapper && camera && renderer) {
            const w = wrapper.clientWidth;
            const h = window.innerWidth <= 768 ? 320 : wrapper.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        }
    });

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
    ambientLight = new THREE.AmbientLight(0x223355, 0.6);
    scene.add(ambientLight);

    dirLight = new THREE.DirectionalLight(0x5588ff, 1.2);
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

    // Build 3D Automatic Feeder Model
    const feederGroup = new THREE.Group();
    feederGroup.position.set(-3.8, 0.25, 0); // Position on the opposite side of the water wheel
    
    // Pillar stand support
    const standGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.4, 8);
    const standMat = new THREE.MeshStandardMaterial({ color: 0x5a6e85, metalness: 0.5, roughness: 0.3 });
    const stand = new THREE.Mesh(standGeo, standMat);
    stand.position.y = -0.6;
    feederGroup.add(stand);
    
    // Feeder Main tank box
    const tankGeo = new THREE.BoxGeometry(0.5, 0.6, 0.5);
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x223047, metalness: 0.7, roughness: 0.2 });
    const tank = new THREE.Mesh(tankGeo, tankMat);
    tank.position.y = 0.3;
    feederGroup.add(tank);
    
    // Feeder indicator light
    const lightGeo = new THREE.SphereGeometry(0.04, 8, 8);
    feederLightMat = new THREE.MeshBasicMaterial({ color: 0xff4d4d }); // default off/red
    const indicatorLight = new THREE.Mesh(lightGeo, feederLightMat);
    indicatorLight.position.set(0, 0.3, 0.26); // front face of the tank box
    feederGroup.add(indicatorLight);
    
    // Delivery spout/pipe
    const spoutGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8);
    spoutGeo.rotateX(Math.PI / 4); // slope downward
    const spoutMat = new THREE.MeshStandardMaterial({ color: 0x4a5d73, metalness: 0.6 });
    const spout = new THREE.Mesh(spoutGeo, spoutMat);
    spout.position.set(0.18, 0.1, 0);
    feederGroup.add(spout);
    
    scene.add(feederGroup);

    // Build Floating creatures
    fishGroup = new THREE.Group();
    scene.add(fishGroup);

    // Spawn selected creatures
    spawnCreatures();

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

// --- Realistic Creatures Mesh Building Functions ---

function createRealisticFish() {
    const fish = new THREE.Group();
    
    // Body (streamlined ellipsoid)
    const bodyGeo = new THREE.SphereGeometry(0.12, 16, 16);
    bodyGeo.scale(1, 0.7, 2.5); // Flattened and elongated
    const bodyMat = new THREE.MeshStandardMaterial({ 
        color: 0xff7a00, 
        roughness: 0.1, 
        metalness: 0.5,
        emissive: 0xff3c00,
        emissiveIntensity: 0.2
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    fish.add(body);
    
    // Tail fin pivot and mesh
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0, -0.3); // Set hinge at the back of body
    
    // Tail fin shape (vertical diamond or triangle)
    const tailGeo = new THREE.ConeGeometry(0.02, 0.22, 4);
    tailGeo.rotateX(Math.PI / 2); // align flat
    tailGeo.scale(1, 1.8, 1);     // stretch vertically
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff3c00, roughness: 0.2 });
    const tailMesh = new THREE.Mesh(tailGeo, tailMat);
    tailMesh.position.set(0, 0, -0.12); // offset backward from hinge
    tailPivot.add(tailMesh);
    
    fish.add(tailPivot);
    fish.userData.tailPivot = tailPivot; // save reference for tail wagging!
    
    // Pectoral fins (left & right)
    const finGeo = new THREE.BoxGeometry(0.12, 0.01, 0.18);
    const leftFin = new THREE.Mesh(finGeo, tailMat);
    leftFin.position.set(0.14, -0.04, 0.05);
    leftFin.rotation.set(0.2, 0, 0.4);
    fish.add(leftFin);
    
    const rightFin = new THREE.Mesh(finGeo, tailMat);
    rightFin.position.set(-0.14, -0.04, 0.05);
    rightFin.rotation.set(0.2, 0, -0.4);
    fish.add(rightFin);

    // Dorsal fin (top)
    const dorsalGeo = new THREE.BoxGeometry(0.01, 0.12, 0.25);
    const dorsalFin = new THREE.Mesh(dorsalGeo, tailMat);
    dorsalFin.position.set(0, 0.12, -0.05);
    dorsalFin.rotation.set(-0.3, 0, 0);
    fish.add(dorsalFin);
    
    return fish;
}

function createRealisticShrimp() {
    const shrimp = new THREE.Group();
    
    // Shrimp body segments (curved chain of cylinders/spheres)
    const bodyMat = new THREE.MeshStandardMaterial({ 
        color: 0xff9999, 
        transparent: true, 
        opacity: 0.85, 
        roughness: 0.2,
        emissive: 0xff3333,
        emissiveIntensity: 0.15
    });
    
    // Segment 1 (head/carapace)
    const headGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.25, 8);
    headGeo.rotateX(Math.PI / 2);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.set(0, 0.05, 0.12);
    shrimp.add(head);
    
    // Segments 2-5 (abdomen)
    const abdGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const segments = [];
    for (let i = 0; i < 4; i++) {
        const seg = new THREE.Mesh(abdGeo, bodyMat);
        // Curve downwards and backwards
        const z = -i * 0.08;
        const y = 0.05 - (i * 0.03);
        seg.position.set(0, y, z);
        seg.scale.set(0.8, 1, 1.2);
        shrimp.add(seg);
        segments.push(seg);
    }
    
    // Tail fan (uropod)
    const tailGeo = new THREE.BoxGeometry(0.08, 0.005, 0.12);
    const tail = new THREE.Mesh(tailGeo, bodyMat);
    tail.position.set(0, -0.08, -0.32);
    tail.rotation.x = -0.3;
    shrimp.add(tail);
    
    // Long antennae (forward extending thin lines/tubes)
    const antGeo = new THREE.BoxGeometry(0.003, 0.003, 0.45);
    const leftAnt = new THREE.Mesh(antGeo, bodyMat);
    leftAnt.position.set(0.02, 0.06, 0.3);
    leftAnt.rotation.set(0.1, 0.2, 0);
    shrimp.add(leftAnt);
    
    const rightAnt = new THREE.Mesh(antGeo, bodyMat);
    rightAnt.position.set(-0.02, 0.06, 0.3);
    rightAnt.rotation.set(0.1, -0.2, 0);
    shrimp.add(rightAnt);
    
    // Small swimming legs (pleopods)
    const legGeo = new THREE.BoxGeometry(0.005, 0.06, 0.005);
    const legs = [];
    for (let i = 0; i < 4; i++) {
        const leftLeg = new THREE.Mesh(legGeo, bodyMat);
        leftLeg.position.set(0.03, -0.02 - (i * 0.02), -0.05 - (i * 0.05));
        leftLeg.rotation.z = -0.3;
        shrimp.add(leftLeg);
        legs.push(leftLeg);
        
        const rightLeg = new THREE.Mesh(legGeo, bodyMat);
        rightLeg.position.set(-0.03, -0.02 - (i * 0.02), -0.05 - (i * 0.05));
        rightLeg.rotation.z = 0.3;
        shrimp.add(rightLeg);
        legs.push(rightLeg);
    }
    shrimp.userData.legs = legs; // reference to animate pleopods wiggling
    
    return shrimp;
}

function createRealisticCrab() {
    const crab = new THREE.Group();
    
    const bodyMat = new THREE.MeshStandardMaterial({ 
        color: 0xcc3333, 
        roughness: 0.4, 
        metalness: 0.2,
        emissive: 0x990000,
        emissiveIntensity: 0.2
    });
    
    // Main Carapace (wide, flat shell)
    const shellGeo = new THREE.SphereGeometry(0.15, 12, 12);
    shellGeo.scale(1.4, 0.6, 1.1);
    const shell = new THREE.Mesh(shellGeo, bodyMat);
    shell.castShadow = true;
    crab.add(shell);
    
    // Front Claws (chelae) - left & right
    const armGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.12, 8);
    const clawGeo = new THREE.SphereGeometry(0.05, 8, 8);
    clawGeo.scale(1, 0.7, 1.4); // pinch shape
    
    // Left Claw
    const leftArm = new THREE.Group();
    leftArm.position.set(0.14, 0, 0.08);
    leftArm.rotation.set(0, 0.6, 0.4);
    const lSegment = new THREE.Mesh(armGeo, bodyMat);
    lSegment.rotation.z = Math.PI / 2;
    leftArm.add(lSegment);
    const lClaw = new THREE.Mesh(clawGeo, bodyMat);
    lClaw.position.set(0.08, 0, 0.06);
    lClaw.rotation.y = 0.4;
    leftArm.add(lClaw);
    crab.add(leftArm);
    
    // Right Claw
    const rightArm = new THREE.Group();
    rightArm.position.set(-0.14, 0, 0.08);
    rightArm.rotation.set(0, -0.6, -0.4);
    const rSegment = new THREE.Mesh(armGeo, bodyMat);
    rSegment.rotation.z = -Math.PI / 2;
    rightArm.add(rSegment);
    const rClaw = new THREE.Mesh(clawGeo, bodyMat);
    rClaw.position.set(-0.08, 0, 0.06);
    rClaw.rotation.y = -0.4;
    rightArm.add(rClaw);
    crab.add(rightArm);
    
    // 6 walking legs (3 on each side)
    const legGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.15, 6);
    const legs = [];
    
    for (let i = 0; i < 3; i++) {
        const zOffset = -0.06 + i * 0.06;
        
        // Left leg
        const leftLeg = new THREE.Group();
        leftLeg.position.set(0.12, -0.02, zOffset);
        const lUpper = new THREE.Mesh(legGeo, bodyMat);
        lUpper.position.set(0.05, -0.04, 0);
        lUpper.rotation.set(0, 0, 0.8);
        leftLeg.add(lUpper);
        crab.add(leftLeg);
        legs.push(leftLeg);
        
        // Right leg
        const rightLeg = new THREE.Group();
        rightLeg.position.set(-0.12, -0.02, zOffset);
        const rUpper = new THREE.Mesh(legGeo, bodyMat);
        rUpper.position.set(-0.05, -0.04, 0);
        rUpper.rotation.set(0, 0, -0.8);
        rightLeg.add(rUpper);
        crab.add(rightLeg);
        legs.push(rightLeg);
    }
    crab.userData.legs = legs; // reference to animate walking legs
    
    return crab;
}

function spawnCreatures() {
    if (!fishGroup || !scene) return;
    
    // Clear existing objects
    while(fishGroup.children.length > 0) {
        fishGroup.remove(fishGroup.children[0]);
    }
    
    // Determine active types
    const types = [];
    if (activeCreatures.fish) types.push('fish');
    if (activeCreatures.shrimp) types.push('shrimp');
    if (activeCreatures.crab) types.push('crab');
    
    if (types.length === 0) return; // No creatures selected
    
    const countPerType = 4;
    
    types.forEach(type => {
        for (let i = 0; i < countPerType; i++) {
            let creature;
            const radius = 1.8 + Math.random() * 2.2;
            const angle = Math.random() * Math.PI * 2;
            
            let yLevel = -0.3 - Math.random() * 0.4; // default fish depth
            
            if (type === 'fish') {
                creature = createRealisticFish();
            } else if (type === 'shrimp') {
                creature = createRealisticShrimp();
                yLevel = -0.5 - Math.random() * 0.4;
            } else if (type === 'crab') {
                creature = createRealisticCrab();
                yLevel = -1.15; // Bottom floor of pond
            }
            
            creature.position.set(Math.cos(angle) * radius, yLevel, Math.sin(angle) * radius);
            
            creature.userData = {
                type: type,
                radius: radius,
                angle: angle,
                baseY: yLevel,
                speed: (type === 'crab' ? 0.004 : 0.008) + Math.random() * 0.008, // crabs walk slower
                wiggleSpeed: 8 + Math.random() * 6
            };
            
            // If in night mode, activate emissive bioluminescence glow immediately
            if (currentWeatherMode === 'night') {
                creature.children.forEach(child => {
                    if (child.material) child.material.emissiveIntensity = 1.8;
                });
            }
            
            fishGroup.add(creature);
        }
    });
}

// 3D Scene Animation Loop
function animate() {
    requestAnimationFrame(animate);

    // 1. Water Surface Animation
    if (waterMesh) {
        waterMesh.rotation.y += 0.002;
    }

    // 2. Water Wheel Spinning
    if (wheelSpinningSpeedFactor > 0 && waterWheelMesh) {
        waterWheelMesh.rotation.z -= 0.06 * wheelSpinningSpeedFactor; // Scale speed by active wheels ratio
    }

    // 3. Creatures Swimming/Walking (with dynamic Feed Chasing)
    if (fishGroup) {
        fishGroup.children.forEach(creature => {
            const type = creature.userData.type;
            const r = creature.userData.radius;
            const a = creature.userData.angle;
            
            // Move in circular path OR chase feed
            let targetFeed = null;
            let minDist = 999;
            
            // Fish and shrimp chase feed (crabs stay on bottom but can chase food that reaches bottom)
            if (type !== 'crab' && feedParticles.length > 0) {
                feedParticles.forEach(pellet => {
                    const d = creature.position.distanceTo(pellet.mesh.position);
                    if (d < minDist) {
                        minDist = d;
                        targetFeed = pellet;
                    }
                });
            }
            
            // If a close feed exists, steer towards it
            if (targetFeed && minDist < 3.5) { // Only chase if within 3.5 units
                const targetPos = targetFeed.mesh.position;
                
                // Direction vector to target
                const dir = new THREE.Vector3().subVectors(targetPos, creature.position);
                dir.normalize();
                
                // Move towards target
                const swimSpeed = creature.userData.speed * 1.5; // swim faster when chasing food!
                creature.position.addScaledVector(dir, swimSpeed);
                
                // Face the food
                const angleToFood = Math.atan2(dir.x, dir.z);
                creature.rotation.y = angleToFood;
                
                // If close enough, eat it!
                if (minDist < 0.22) {
                    // Remove feed from scene
                    scene.remove(targetFeed.mesh);
                    // Remove from array
                    const idx = feedParticles.indexOf(targetFeed);
                    if (idx > -1) {
                        feedParticles.splice(idx, 1);
                    }
                    
                    // Trigger a happy wiggle boost
                    creature.userData.wiggleSpeed = 25; // wiggle extremely fast!
                    setTimeout(() => {
                        creature.userData.wiggleSpeed = 8 + Math.random() * 6; // restore wiggle speed
                    }, 1200);
                }
                
                // Keep tail/pleopods wiggling
                if (type === 'fish') {
                    if (creature.userData.tailPivot) {
                        creature.userData.tailPivot.rotation.y = Math.sin(Date.now() * 0.0015 * creature.userData.wiggleSpeed) * 0.45;
                    }
                } else if (type === 'shrimp') {
                    if (creature.userData.legs) {
                        creature.userData.legs.forEach((leg, idx) => {
                            leg.rotation.x = Math.sin(Date.now() * 0.015 + idx) * 0.35;
                        });
                    }
                }
            } else if (type === 'crab') {
                // Crab locomotion (always crawl sideways on bottom, can also eat pellets that reach the bottom!)
                let bottomFeed = null;
                let bottomMinDist = 999;
                
                // Crabs only search for pellets that have sunk close to bottom (y < -0.8)
                feedParticles.forEach(pellet => {
                    if (pellet.mesh.position.y < -0.8) {
                        const d = creature.position.distanceTo(pellet.mesh.position);
                        if (d < bottomMinDist) {
                            bottomMinDist = d;
                            bottomFeed = pellet;
                        }
                    }
                });
                
                if (bottomFeed && bottomMinDist < 2.0) {
                    // Crawl towards bottom food
                    const targetPos = bottomFeed.mesh.position;
                    const dir = new THREE.Vector3().subVectors(targetPos, creature.position);
                    dir.y = 0; // stay on bottom plane
                    dir.normalize();
                    
                    creature.position.addScaledVector(dir, creature.userData.speed * 1.3);
                    
                    // Crabs walk sideways! Face offset
                    const angleToFood = Math.atan2(dir.x, dir.z);
                    creature.rotation.y = angleToFood - Math.PI / 2;
                    
                    // Eat it!
                    if (bottomMinDist < 0.25) {
                        scene.remove(bottomFeed.mesh);
                        const idx = feedParticles.indexOf(bottomFeed);
                        if (idx > -1) {
                            feedParticles.splice(idx, 1);
                        }
                    }
                } else {
                    // Default crawl sideways
                    creature.userData.angle += creature.userData.speed;
                    creature.position.x = Math.cos(a) * r;
                    creature.position.z = Math.sin(a) * r;
                    creature.rotation.y = -a;
                }
                
                // Animate crab walking legs
                if (creature.userData.legs) {
                    creature.userData.legs.forEach((leg, idx) => {
                        leg.rotation.z = Math.sin(Date.now() * 0.012 + idx) * 0.35;
                    });
                }
                creature.position.y = creature.userData.baseY;
            } else {
                // Default circular swimming path
                creature.userData.angle += creature.userData.speed;
                creature.position.x = Math.cos(a) * r;
                creature.position.z = Math.sin(a) * r;
                
                if (type === 'fish') {
                    creature.rotation.y = -a + Math.PI / 2;
                    if (creature.userData.tailPivot) {
                        creature.userData.tailPivot.rotation.y = Math.sin(Date.now() * 0.0015 * creature.userData.wiggleSpeed) * 0.45;
                    }
                    creature.position.y = creature.userData.baseY + 0.04 * Math.sin(Date.now() * 0.001 * creature.userData.wiggleSpeed);
                } else if (type === 'shrimp') {
                    creature.rotation.y = -a + Math.PI / 2;
                    if (creature.userData.legs) {
                        creature.userData.legs.forEach((leg, idx) => {
                            leg.rotation.x = Math.sin(Date.now() * 0.015 + idx) * 0.35;
                        });
                    }
                    const pulse = Math.sin(Date.now() * 0.005) * 0.04;
                    creature.position.y = creature.userData.baseY + 0.05 * Math.sin(Date.now() * 0.002 * creature.userData.wiggleSpeed);
                    creature.position.x += Math.sin(-a) * pulse;
                    creature.position.z += Math.cos(-a) * pulse;
                }
            }
        });
    }

    // 4. Bubbles rising animation
    if (bubbleSystem) {
        const posAttr = bubbleSystem.geometry.attributes.position;
        const speeds = bubbleSystem.userData.speeds;
        
        for (let i = 0; i < bubbleSystem.userData.count; i++) {
            if (wheelSpinningSpeedFactor > 0) {
                // Rising active simulation scaled by speed factor
                posAttr.array[i*3] += speeds[i].x * wheelSpinningSpeedFactor;
                posAttr.array[i*3+1] += speeds[i].y * wheelSpinningSpeedFactor;
                posAttr.array[i*3+2] += speeds[i].z * wheelSpinningSpeedFactor;
                
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

    // 5. Rain Animation
    if (rainSystem && rainSystem.visible) {
        const posAttr = rainSystem.geometry.attributes.position;
        const velocities = rainSystem.userData.velocities;
        
        for (let i = 0; i < rainSystem.userData.count; i++) {
            posAttr.array[i*3+1] += velocities[i];
            
            if (posAttr.array[i*3+1] <= 0.05) {
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * 5.0;
                posAttr.array[i*3] = Math.cos(angle) * radius;
                posAttr.array[i*3+1] = 8.0;
                posAttr.array[i*3+2] = Math.sin(angle) * radius;
            }
        }
        posAttr.needsUpdate = true;
    }

    // 6. Feed Particles Physics & Sinking
    if (feedParticles.length > 0) {
        feedParticles.forEach(pellet => {
            if (!pellet.isSinking) {
                if (pellet.fromFeeder) {
                    pellet.mesh.position.x += pellet.speedX;
                    pellet.mesh.position.y -= pellet.speedY;
                    pellet.speedY += 0.003; // gravity acceleration
                } else {
                    pellet.mesh.position.y -= pellet.speedY;
                }
                if (pellet.mesh.position.y <= 0.05) {
                    pellet.isSinking = true;
                }
            } else {
                pellet.mesh.position.y -= pellet.sinkingSpeed;
                if (pellet.mesh.position.y <= -1.15) {
                    pellet.mesh.position.y = -1.15;
                }
            }
        });
    }

    // Slow orbital rotation of camera to make scene alive
    const timer = Date.now() * 0.0001;
    camera.position.x = 12 * Math.sin(timer);
    camera.position.z = 12 * Math.cos(timer);
    camera.lookAt(0, 0, 0);

    // 7. AI Scan Animation and Progress updating
    if (isScanning && scanMesh) {
        scanMesh.position.y -= 0.015;
        
        // Progress calculates from y: 1.0 (0%) down to -1.2 (100%)
        // delta is 2.2
        const progress = Math.min(100, Math.floor(((1.0 - scanMesh.position.y) / 2.2) * 100));
        
        const pBar = document.getElementById('scan-progress-bar');
        const pText = document.getElementById('scan-progress-text');
        if (pBar) pBar.style.width = progress + '%';
        if (pText) pText.textContent = progress + '%';
        
        if (scanMesh.position.y <= -1.2) {
            scene.remove(scanMesh);
            scanMesh = null;
            isScanning = false;
            
            // Hide HUD
            const hud = document.getElementById('scan-hud');
            if (hud) hud.style.display = 'none';
            
            // Generate report content & open modal
            generateAIScanReport();
            const scanModal = document.getElementById('scan-modal');
            if (scanModal) scanModal.classList.add('open');
        }
    }

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
            
            const totalWheels = data.wheels.length;
            const activeWheels = data.wheels.filter(w => w.status === 'on').length;
            wheelSpinningSpeedFactor = totalWheels > 0 ? (activeWheels / totalWheels) : 0.0;
            isWheelSpinning = activeWheels > 0;
            
            const ratioEl = document.getElementById('wheels-active-ratio');
            if (ratioEl) {
                if (totalWheels === 0) {
                    ratioEl.textContent = '無水車';
                } else {
                    const percentage = Math.round(wheelSpinningSpeedFactor * 100);
                    ratioEl.textContent = `運轉率: ${percentage}%`;
                }
            }
            
            updateLegacyPondCardWheelUI(pondId, isWheelSpinning);
            
            if (totalWheels === 0) {
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

// --- Weather Lighting Cycles & Feeding Simulation Functions ---

function setWeatherMode(mode) {
    currentWeatherMode = mode;
    
    const dayBtn = document.getElementById('weather-day-btn');
    const nightBtn = document.getElementById('weather-night-btn');
    const rainBtn = document.getElementById('weather-rain-btn');
    
    // Reset background and borders
    if (dayBtn) { dayBtn.style.background = 'rgba(255, 255, 255, 0.05)'; dayBtn.style.borderColor = 'rgba(255, 255, 255, 0.1)'; dayBtn.style.color = 'var(--text-secondary)'; }
    if (nightBtn) { nightBtn.style.background = 'rgba(255, 255, 255, 0.05)'; nightBtn.style.borderColor = 'rgba(255, 255, 255, 0.1)'; nightBtn.style.color = 'var(--text-secondary)'; }
    if (rainBtn) { rainBtn.style.background = 'rgba(255, 255, 255, 0.05)'; rainBtn.style.borderColor = 'rgba(255, 255, 255, 0.1)'; rainBtn.style.color = 'var(--text-secondary)'; }
    
    // Set active button style
    const activeBtn = document.getElementById(`weather-${mode}-btn`);
    if (activeBtn) {
        activeBtn.style.background = 'rgba(0, 242, 254, 0.15)';
        activeBtn.style.borderColor = 'rgba(0, 242, 254, 0.3)';
        activeBtn.style.color = '#fff';
    }
    
    // Update lights in Three.js
    if (!ambientLight || !dirLight || !scene) return;
    
    if (mode === 'day') {
        ambientLight.color.setHex(0x223355);
        ambientLight.intensity = 0.6;
        dirLight.color.setHex(0x5588ff);
        dirLight.intensity = 1.2;
        scene.background.setHex(0x0a0f1d);
        if (scene.fog) {
            scene.fog.color.setHex(0x0a0f1d);
        }
        if (rainSystem) rainSystem.visible = false;
        
        // Reset bioluminescent glow
        if (fishGroup) {
            fishGroup.children.forEach(c => {
                c.children.forEach(child => {
                    if (child.material) child.material.emissiveIntensity = 0.2;
                });
            });
        }
    } else if (mode === 'night') {
        ambientLight.color.setHex(0x080c18);
        ambientLight.intensity = 0.2;
        dirLight.color.setHex(0x224488);
        dirLight.intensity = 0.4;
        scene.background.setHex(0x03050a);
        if (scene.fog) {
            scene.fog.color.setHex(0x03050a);
        }
        if (rainSystem) rainSystem.visible = false;
        
        // Enable bioluminescent glow (neon glowing biological lights)
        if (fishGroup) {
            fishGroup.children.forEach(c => {
                c.children.forEach(child => {
                    if (child.material) child.material.emissiveIntensity = 1.8;
                });
            });
        }
    } else if (mode === 'rain') {
        ambientLight.color.setHex(0x222a35);
        ambientLight.intensity = 0.4;
        dirLight.color.setHex(0x445566);
        dirLight.intensity = 0.5;
        scene.background.setHex(0x080a0f);
        if (scene.fog) {
            scene.fog.color.setHex(0x080a0f);
        }
        
        initRainSystem();
        if (rainSystem) rainSystem.visible = true;
        
        // Reset bioluminescent glow
        if (fishGroup) {
            fishGroup.children.forEach(c => {
                c.children.forEach(child => {
                    if (child.material) child.material.emissiveIntensity = 0.2;
                });
            });
        }
    }
}

function initRainSystem() {
    if (rainSystem) return; // already initialized
    
    const count = 300;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];
    
    for (let i = 0; i < count; i++) {
        // Spawn randomly in cylinder space above the pond
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 5.0;
        positions[i*3] = Math.cos(angle) * radius;
        positions[i*3+1] = 0.05 + Math.random() * 8.0; // y from water surface to sky
        positions[i*3+2] = Math.sin(angle) * radius;
        
        velocities.push(-0.15 - Math.random() * 0.1); // downward speed
    }
    
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
        color: 0x88ccff,
        size: 0.08,
        transparent: true,
        opacity: 0.6
    });
    
    rainSystem = new THREE.Points(geo, mat);
    rainSystem.userData = { velocities: velocities, count: count };
    scene.add(rainSystem);
}

function feedFish() {
    if (!scene) return;
    
    const count = 8;
    const geometry = new THREE.SphereGeometry(0.05, 8, 8);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x8d5828, // brown food
        roughness: 0.8 
    });
    
    for (let i = 0; i < count; i++) {
        const pellet = new THREE.Mesh(geometry, material);
        pellet.castShadow = true;
        
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 4.0;
        const y = 3.0 + Math.random() * 1.5;
        pellet.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
        
        scene.add(pellet);
        feedParticles.push({
            mesh: pellet,
            speedY: 0.04 + Math.random() * 0.03,
            sinkingSpeed: 0.005 + Math.random() * 0.005,
            isSinking: false
        });
    }
}

// --- AI Smart Scan Functions ---

function triggerAIScan() {
    if (isScanning) return;
    if (!scene) return;
    
    isScanning = true;
    scanProgress = 0;
    
    // Clear previous scan mesh if exists
    if (scanMesh) {
        scene.remove(scanMesh);
    }
    
    // Show HUD overlay
    const hud = document.getElementById('scan-hud');
    const pBar = document.getElementById('scan-progress-bar');
    const pText = document.getElementById('scan-progress-text');
    if (hud) hud.style.display = 'flex';
    if (pBar) pBar.style.width = '0%';
    if (pText) pText.textContent = '0%';
    
    // Create Three.js scanning disc/mesh
    const scanGeometry = new THREE.RingGeometry(0, 4.8, 32);
    scanGeometry.rotateX(-Math.PI / 2);
    const scanMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff88,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide
    });
    scanMesh = new THREE.Mesh(scanGeometry, scanMaterial);
    
    // Add bright green outline ring
    const ringGeo = new THREE.RingGeometry(4.7, 4.8, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00ff88,
        side: THREE.DoubleSide
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    scanMesh.add(ringMesh);
    
    // Position scan disc above water
    scanMesh.position.set(0, 1.0, 0);
    scene.add(scanMesh);
}

function generateAIScanReport() {
    // Current date/time
    const dateText = document.getElementById('scan-report-time');
    if (dateText) {
        const now = new Date();
        dateText.textContent = 'GEN-DATE: ' + now.toLocaleString();
    }
    
    // Community distribution & Biomass
    let fishCount = activeCreatures.fish ? 4 : 0;
    let shrimpCount = activeCreatures.shrimp ? 4 : 0;
    let crabCount = activeCreatures.crab ? 4 : 0;
    let totalCount = fishCount + shrimpCount + crabCount;
    
    let distHtml = '';
    let weight = 0;
    
    if (totalCount === 0) {
        distHtml = '<span style="color: var(--text-secondary);">池內無生物</span>';
        weight = 0;
    } else {
        const distParts = [];
        if (fishCount > 0) {
            const pct = Math.round((fishCount / totalCount) * 100);
            distParts.push(`🐟 魚類 (${fishCount} 隻 / ${pct}%)`);
            weight += 1.4; // 0.35kg each
        }
        if (shrimpCount > 0) {
            const pct = Math.round((shrimpCount / totalCount) * 100);
            distParts.push(`🦐 蝦類 (${shrimpCount} 隻 / ${pct}%)`);
            weight += 0.2; // 0.05kg each
        }
        if (crabCount > 0) {
            const pct = Math.round((crabCount / totalCount) * 100);
            distParts.push(`🦀 螃蟹 (${crabCount} 隻 / ${pct}%)`);
            weight += 0.8; // 0.20kg each
        }
        distHtml = distParts.join('<br>');
        // Add random variance (+/- 10%)
        weight = weight * (0.9 + Math.random() * 0.2);
    }
    
    const scanDist = document.getElementById('scan-distribution');
    if (scanDist) scanDist.innerHTML = distHtml;
    
    const scanBiomass = document.getElementById('scan-biomass');
    if (scanBiomass) scanBiomass.textContent = '預估總生物量：' + weight.toFixed(2) + ' kg';
    
    // Biometrics based on weather
    const scanActivity = document.getElementById('scan-activity');
    const scanAppetite = document.getElementById('scan-appetite');
    
    if (currentWeatherMode === 'day') {
        if (scanActivity) {
            scanActivity.textContent = (90 + Math.floor(Math.random() * 7)) + '% (優良)';
            scanActivity.style.color = '#00ff88';
        }
        if (scanAppetite) {
            scanAppetite.textContent = '高 (進食意願強烈)';
            scanAppetite.style.color = '#00ff88';
        }
    } else if (currentWeatherMode === 'night') {
        if (scanActivity) {
            scanActivity.textContent = (65 + Math.floor(Math.random() * 10)) + '% (夜間休息/底棲活躍)';
            scanActivity.style.color = '#4facfe';
        }
        if (scanAppetite) {
            scanAppetite.textContent = '中等 (夜間掠食)';
            scanAppetite.style.color = '#ff9f43';
        }
    } else { // rain
        if (scanActivity) {
            scanActivity.textContent = (72 + Math.floor(Math.random() * 10)) + '% (一般)';
            scanActivity.style.color = '#a18cd1';
        }
        if (scanAppetite) {
            scanAppetite.textContent = '較低 (受氣壓與水溫影響)';
            scanAppetite.style.color = '#ff4d4d';
        }
    }
    
    // Telemetry read & diagnosis
    const tempText = document.getElementById('temp-value')?.textContent || '25.0';
    const phText = document.getElementById('ph-value')?.textContent || '7.5';
    const doText = document.getElementById('do-value')?.textContent || '5.5';
    const levelText = document.getElementById('level-value')?.textContent || '1.5';
    
    const temp = parseFloat(tempText);
    const ph = parseFloat(phText);
    const doVal = parseFloat(doText);
    const level = parseFloat(levelText);
    
    let diagnosisParts = [];
    let recParts = [];
    
    // DO diagnosis
    if (doVal < 4.0) {
        diagnosisParts.push(`🚨 <b>溶氧量極低 (${doText} mg/L)</b>：水體嚴重缺氧，對魚蝦健康有高度窒息威脅。`);
        recParts.push(`🚨 建議<b>立即開啟所有增氧水車</b>，並點選「智慧自動化增氧」套用合理臨界值以節能。`);
    } else if (doVal < 5.0) {
        diagnosisParts.push(`⚠️ <b>溶氧量偏低 (${doText} mg/L)</b>：水體含氧量略顯不足，雖無即時生命危險，但會影響生長與進食。`);
        recParts.push(`💡 建議在氣壓偏低或傍晚時，<b>增開 1~2 台水車</b>以防溶氧崩潰。`);
    } else {
        diagnosisParts.push(`✅ <b>溶氧量充足 (${doText} mg/L)</b>：水體氧氣含量優良，有利於多物種混合養殖。`);
    }
    
    // Temperature diagnosis
    if (temp > 30.0) {
        diagnosisParts.push(`⚠️ <b>水溫偏高 (${tempText}°C)</b>：高溫會降低氧溶解度，且易加速池底殘餌與糞便腐敗。`);
        recParts.push(`💡 建議在大熱天<b>適度調降飼料投餵量</b>，並在中午時段運轉水車促進表底層水體對流降溫。`);
    } else if (temp < 20.0) {
        diagnosisParts.push(`⚠️ <b>水溫偏低 (${tempText}°C)</b>：低溫使魚蝦等變溫生物消化代謝變慢。`);
        recParts.push(`💡 建議在冷天<b>減少投餌頻率與份量</b>，避免殘餌污染底質。`);
    } else {
        diagnosisParts.push(`✅ <b>水溫合適 (${tempText}°C)</b>：目前處於溫和且適合生物生長的溫度區間。`);
    }
    
    // pH diagnosis
    if (ph < 6.5) {
        diagnosisParts.push(`⚠️ <b>酸鹼 pH 值偏酸 (${phText})</b>：水質酸化會損害蝦蟹的外殼鈣化過程，並降低對病菌的抵抗力。`);
        recParts.push(`💡 建議適度換水，或以適量石灰、水質改良劑逐步調節酸鹼度。`);
    } else if (ph > 8.5) {
        diagnosisParts.push(`⚠️ <b>酸鹼 pH 值偏鹼 (${phText})</b>：水質過鹼會增加游離氨（分子氨）的毒性，可能損傷鰓部。`);
        recParts.push(`💡 建議加強注水淡化，並加強巡檢水色，防範藻類過度繁衍引起 pH 劇烈震盪。`);
    } else {
        diagnosisParts.push(`✅ <b>酸鹼 pH 值正常 (${phText})</b>：水質酸鹼度非常平衡。`);
    }
    
    // Level diagnosis
    if (level < 1.0) {
        diagnosisParts.push(`⚠️ <b>水位偏低 (${levelText}m)</b>：池體水位過淺，池水保溫能力弱，易因氣溫變化引發溫度劇烈震盪。`);
        recParts.push(`💡 建議點選「實體感測器」或連動注水閥進行補水，維持池水深度在 1.2m 以上。`);
    } else if (level > 2.5) {
        diagnosisParts.push(`⚠️ <b>水位偏高 (${levelText}m)</b>：防汛餘裕降低，注意強降雨時的池水溢堤與潰池風險。`);
    } else {
        diagnosisParts.push(`✅ <b>池水位穩定 (${levelText}m)</b>：水位高度合宜。`);
    }
    
    // Join messages
    const scanDiagnosis = document.getElementById('scan-diagnosis');
    if (scanDiagnosis) {
        scanDiagnosis.innerHTML = diagnosisParts.join('<br><br>');
    }
    
    const scanRecommendation = document.getElementById('scan-recommendation');
    if (scanRecommendation) {
        if (recParts.length === 0) {
            scanRecommendation.innerHTML = `✅ 目前各項指標皆正常。建議：<br>1. 維持目前定時定量投餵計畫。<br>2. 保持智慧溶氧自動化迴路在「開啟」狀態，以應對夜間突發氣候變化。`;
        } else {
            scanRecommendation.innerHTML = recParts.join('<br><br>');
        }
    }
}

// --- Automatic Feeder Control Functions ---

function toggleAutoFeeder(enabled) {
    const badge = document.getElementById('feeder-status-badge');
    
    // Clear existing timer if active
    if (autoFeederIntervalId) {
        clearInterval(autoFeederIntervalId);
        autoFeederIntervalId = null;
    }
    
    if (enabled) {
        // Update UI
        if (badge) {
            badge.textContent = '自動中';
            badge.style.background = 'rgba(46, 213, 115, 0.15)';
            badge.style.borderColor = 'rgba(46, 213, 115, 0.3)';
            badge.style.color = '#2ed573';
        }
        
        // Update indicator light to green
        if (feederLightMat) {
            feederLightMat.color.setHex(0x00ff88);
        }
        
        // Load interval settings
        const intervalInput = document.getElementById('auto-feeder-interval');
        if (intervalInput) {
            feederIntervalSeconds = Math.max(5, parseInt(intervalInput.value) || 15);
        }
        feederTimeLeft = feederIntervalSeconds;
        
        const countdownText = document.getElementById('feeder-countdown');
        if (countdownText) countdownText.textContent = feederTimeLeft + ' 秒';
        
        // Start second countdown interval
        autoFeederIntervalId = setInterval(() => {
            if (feederCapacity <= 0) {
                if (countdownText) countdownText.textContent = '飼料箱已空！';
                return;
            }
            
            feederTimeLeft--;
            if (countdownText) countdownText.textContent = feederTimeLeft + ' 秒';
            
            if (feederTimeLeft <= 0) {
                // Drop feed!
                feedFromMachine(4);
                
                // Record last feeding time
                const lastTimeText = document.getElementById('feeder-last-time');
                if (lastTimeText) {
                    const now = new Date();
                    lastTimeText.textContent = now.toLocaleTimeString();
                }
                
                // Reduce capacity by 2%
                feederCapacity = Math.max(0, feederCapacity - 2);
                updateFeederCapacityUI();
                
                // Reset timer
                feederTimeLeft = feederIntervalSeconds;
            }
        }, 1000);
    } else {
        // Update UI
        if (badge) {
            badge.textContent = '已關閉';
            badge.style.background = 'rgba(255, 255, 255, 0.05)';
            badge.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            badge.style.color = 'var(--text-secondary)';
        }
        
        // Update indicator light to red
        if (feederLightMat) {
            feederLightMat.color.setHex(0xff4d4d);
        }
        
        const countdownText = document.getElementById('feeder-countdown');
        if (countdownText) countdownText.textContent = '--';
    }
}

function applyFeederInterval() {
    const intervalInput = document.getElementById('auto-feeder-interval');
    if (intervalInput) {
        const val = parseInt(intervalInput.value);
        if (isNaN(val) || val < 5 || val > 300) {
            alert('請輸入 5 到 300 秒之間的有效投餵間隔時間！');
            return;
        }
        feederIntervalSeconds = val;
        feederTimeLeft = val;
        
        // If active, reset current interval timer
        const autoSwitch = document.getElementById('auto-feeder-switch');
        if (autoSwitch && autoSwitch.checked) {
            toggleAutoFeeder(true);
        }
        
        // Custom button text confirmation style
        const btn = document.getElementById('save-feeder-btn');
        if (btn) {
            const origText = btn.textContent;
            btn.textContent = '已設定';
            btn.style.background = 'var(--color-success)';
            setTimeout(() => {
                btn.textContent = origText;
                btn.style.background = '';
            }, 1500);
        }
    }
}

function refillFeeder() {
    feederCapacity = 100;
    updateFeederCapacityUI();
    
    // Animate button feedback
    const btn = document.getElementById('refill-feeder-btn');
    if (btn) {
        const origHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> 已補充';
        btn.style.background = 'rgba(46, 213, 115, 0.15)';
        btn.style.borderColor = 'rgba(46, 213, 115, 0.3)';
        btn.style.color = '#2ed573';
        setTimeout(() => {
            btn.innerHTML = origHtml;
            btn.style.background = '';
            btn.style.borderColor = '';
            btn.style.color = '';
        }, 1500);
    }
}

function updateFeederCapacityUI() {
    const capText = document.getElementById('feeder-capacity-text');
    const capBar = document.getElementById('feeder-capacity-bar');
    
    if (capText) capText.textContent = feederCapacity + '%';
    if (capBar) {
        capBar.style.width = feederCapacity + '%';
        // Change color based on capacity
        if (feederCapacity < 20) {
            capBar.style.background = 'linear-gradient(90deg, #ff4d4d, #ff6b6b)';
            capBar.style.boxShadow = '0 0 8px rgba(255, 77, 77, 0.5)';
        } else if (feederCapacity < 50) {
            capBar.style.background = 'linear-gradient(90deg, #ff9f43, #ffb366)';
            capBar.style.boxShadow = '0 0 8px rgba(255, 159, 67, 0.5)';
        } else {
            capBar.style.background = 'linear-gradient(90deg, #2ed573, #7bed9f)';
            capBar.style.boxShadow = '0 0 8px rgba(46, 213, 115, 0.5)';
        }
    }
}

function feedFromMachine(count = 4) {
    if (!scene) return;
    
    const geometry = new THREE.SphereGeometry(0.04, 8, 8);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x8d5828, // brown food
        roughness: 0.8 
    });
    
    // Flash indicator light orange during physical feeding
    if (feederLightMat) {
        const prevColor = feederLightMat.color.getHex();
        feederLightMat.color.setHex(0xffaa00);
        setTimeout(() => {
            if (feederLightMat) {
                feederLightMat.color.setHex(prevColor);
            }
        }, 1500);
    }
    
    for (let i = 0; i < count; i++) {
        const pellet = new THREE.Mesh(geometry, material);
        pellet.castShadow = true;
        
        // Spawns near delivery spout: (-3.6, 0.2, 0)
        // With a tiny random offset representing feed scattering
        const x = -3.6 + (Math.random() - 0.5) * 0.2;
        const y = 0.25 + Math.random() * 0.1;
        const z = (Math.random() - 0.5) * 0.3;
        
        // Feed particles spray forward (toward center +x direction)
        const speedX = 0.02 + Math.random() * 0.02;
        
        pellet.position.set(x, y, z);
        scene.add(pellet);
        
        feedParticles.push({
            mesh: pellet,
            speedX: speedX,
            speedY: -0.015 + Math.random() * 0.01, // small upward bounce then downward fall
            sinkingSpeed: 0.005 + Math.random() * 0.005,
            isSinking: false,
            fromFeeder: true
        });
    }
}

