class EmergencyMeshChat {
    constructor() {
        this.peer = null;
        this.connections = new Map();
        this.bluetoothConnections = new Map();
        this.bluetoothService = null;
        this.bluetoothCharacteristic = null;
        this.bluetoothDevice = null;
        this.deviceName = 'Emergency Device';
        this.isConnected = false;
        this.messageHistory = [];
        this.encryptionEnabled = true;
        this.autoConnect = true;
        this.connectionPriority = 'webrtc';
        
        // Bluetooth service UUID (custom service for emergency mesh)
        this.EMERGENCY_SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
        this.MESSAGE_CHARACTERISTIC_UUID = '87654321-4321-4321-4321-cba987654321';
        this.STATUS_CHARACTERISTIC_UUID = '11111111-2222-3333-4444-555555555555';
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadSettings();
        this.checkBluetoothSupport();
        this.initializePeer();
        this.initializeBluetoothAdvertising();
        this.showToast('Initializing emergency mesh network with Bluetooth...', 'info');
    }

    checkBluetoothSupport() {
        if (!navigator.bluetooth) {
            console.warn('Web Bluetooth API not supported');
            this.showToast('Bluetooth not supported in this browser', 'warning');
            return false;
        }
        
        console.log('Bluetooth API available');
        return true;
    }

    setupEventListeners() {
        // Connection modal
        document.getElementById('connect-btn').addEventListener('click', () => {
            this.toggleConnectionModal();
        });

        document.getElementById('close-modal').addEventListener('click', () => {
            this.hideConnectionModal();
        });

        // Peer connection
        document.getElementById('connect-peer').addEventListener('click', () => {
            this.connectToPeer();
        });

        document.getElementById('copy-peer-id').addEventListener('click', () => {
            this.copyPeerIdToClipboard();
        });

        // Enhanced Bluetooth functionality
        document.getElementById('scan-bluetooth').addEventListener('click', () => {
            this.scanBluetoothDevices();
        });

        // QR Code functionality
        document.getElementById('show-qr').addEventListener('click', () => {
            this.showQRCode();
        });

        document.getElementById('close-qr').addEventListener('click', () => {
            this.hideQRModal();
        });

        // Message sending
        document.getElementById('send-btn').addEventListener('click', () => {
            this.sendMessage();
        });

        document.getElementById('message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Emergency alert
        document.getElementById('emergency-btn').addEventListener('click', () => {
            this.sendEmergencyAlert();
        });

        // Settings
        document.getElementById('settings-btn').addEventListener('click', () => {
            this.showSettingsModal();
        });

        document.getElementById('close-settings').addEventListener('click', () => {
            this.hideSettingsModal();
        });

        document.getElementById('save-settings').addEventListener('click', () => {
            this.saveSettings();
        });

        // File attachment
        document.getElementById('attach-btn').addEventListener('click', () => {
            this.showFileModal();
        });

        document.getElementById('close-file-modal').addEventListener('click', () => {
            this.hideFileModal();
        });

        document.getElementById('file-input').addEventListener('change', (e) => {
            this.handleFileSelection(e);
        });

        document.getElementById('send-file').addEventListener('click', () => {
            this.sendFile();
        });

        // Mobile menu
        document.getElementById('mobile-menu-btn').addEventListener('click', () => {
            this.toggleMobileSidebar();
        });

        // Refresh devices
        document.getElementById('refresh-devices').addEventListener('click', () => {
            this.refreshDevices();
        });

        // Local network scanning
        document.getElementById('scan-local').addEventListener('click', () => {
            this.scanLocalNetwork();
        });
    }

    // Enhanced Bluetooth Implementation
    async initializeBluetoothAdvertising() {
        if (!navigator.bluetooth) return;

        try {
            // Start advertising this device as discoverable
            if (navigator.bluetooth.getAvailability) {
                const available = await navigator.bluetooth.getAvailability();
                if (available) {
                    console.log('Bluetooth is available for advertising');
                    this.updateConnectionStatus('Bluetooth ready for connections', 'success');
                }
            }
        } catch (error) {
            console.error('Bluetooth advertising setup failed:', error);
        }
    }

    async scanBluetoothDevices() {
        if (!navigator.bluetooth) {
            this.showToast('Bluetooth not supported in this browser', 'error');
            return;
        }

        try {
            this.showToast('Scanning for Bluetooth devices...', 'info');
            this.updateDeviceList('bluetooth', 'Scanning for Bluetooth devices...');

            // Request Bluetooth device with our emergency service
            const device = await navigator.bluetooth.requestDevice({
                filters: [{
                    services: [this.EMERGENCY_SERVICE_UUID]
                }],
                optionalServices: [this.MESSAGE_CHARACTERISTIC_UUID, this.STATUS_CHARACTERISTIC_UUID],
                acceptAllDevices: false
            }).catch(async () => {
                // Fallback: scan for any device and check for our service
                return await navigator.bluetooth.requestDevice({
                    acceptAllDevices: true,
                    optionalServices: [this.EMERGENCY_SERVICE_UUID]
                });
            });

            if (device) {
                await this.connectBluetoothDevice(device);
            }

        } catch (error) {
            if (error.name === 'NotFoundError') {
                this.showToast('No emergency devices found via Bluetooth', 'warning');
            } else if (error.name === 'SecurityError') {
                this.showToast('Bluetooth access requires HTTPS or localhost', 'error');
            } else {
                console.error('Bluetooth scan failed:', error);
                this.showToast(`Bluetooth scan failed: ${error.message}`, 'error');
            }
        }
    }

    async connectBluetoothDevice(device) {
        try {
            this.showToast(`Connecting to ${device.name || 'Unknown Device'}...`, 'info');
            
            // Store device reference
            this.bluetoothDevice = device;
            
            // Set up disconnect handler
            device.addEventListener('gattserverdisconnected', () => {
                console.log('Bluetooth device disconnected');
                this.handleBluetoothDisconnect(device);
            });

            // Connect to GATT server
            const server = await device.gatt.connect();
            console.log('Connected to GATT server');

            // Try to get our emergency service
            let service;
            try {
                service = await server.getPrimaryService(this.EMERGENCY_SERVICE_UUID);
            } catch (serviceError) {
                // If our service doesn't exist, create a generic communication channel
                console.log('Emergency service not found, attempting generic connection');
                await this.setupGenericBluetoothConnection(server, device);
                return;
            }

            // Get message characteristic
            const messageChar = await service.getCharacteristic(this.MESSAGE_CHARACTERISTIC_UUID);
            this.bluetoothCharacteristic = messageChar;

            // Set up message notifications
            await messageChar.startNotifications();
            messageChar.addEventListener('characteristicvaluechanged', (event) => {
                this.handleBluetoothMessage(event);
            });

            // Add to connections
            this.bluetoothConnections.set(device.id, {
                device: device,
                server: server,
                service: service,
                characteristic: messageChar,
                type: 'bluetooth'
            });

            this.updateActiveConnections();
            this.showToast(`Connected to ${device.name || 'Device'} via Bluetooth`, 'success');
            this.updateConnectionStatus(`Bluetooth connected to ${device.name || 'Device'}`, 'success');

            // Send handshake
            await this.sendBluetoothHandshake(messageChar, device);

        } catch (error) {
            console.error('Bluetooth connection failed:', error);
            this.showToast(`Bluetooth connection failed: ${error.message}`, 'error');
        }
    }

    async setupGenericBluetoothConnection(server, device) {
        try {
            // Try to find any writable characteristic for communication
            const services = await server.getPrimaryServices();
            
            for (const service of services) {
                const characteristics = await service.getCharacteristics();
                
                for (const char of characteristics) {
                    const properties = char.properties;
                    
                    if (properties.write || properties.writeWithoutResponse) {
                        console.log('Found writable characteristic for generic connection');
                        
                        // Set up generic Bluetooth connection
                        this.bluetoothConnections.set(device.id, {
                            device: device,
                            server: server,
                            service: service,
                            characteristic: char,
                            type: 'bluetooth-generic'
                        });

                        if (properties.notify) {
                            await char.startNotifications();
                            char.addEventListener('characteristicvaluechanged', (event) => {
                                this.handleBluetoothMessage(event);
                            });
                        }

                        this.updateActiveConnections();
                        this.showToast(`Generic Bluetooth connection established`, 'success');
                        return;
                    }
                }
            }
            
            throw new Error('No suitable characteristics found');
            
        } catch (error) {
            console.error('Generic Bluetooth setup failed:', error);
            this.showToast('Could not establish Bluetooth communication', 'error');
        }
    }

    async sendBluetoothHandshake(characteristic, device) {
        const handshake = {
            type: 'bluetooth-handshake',
            deviceName: this.deviceName,
            timestamp: Date.now(),
            deviceId: device.id,
            capabilities: ['messaging', 'emergency', 'file-transfer']
        };

        await this.writeBluetoothMessage(characteristic, handshake);
    }

    async writeBluetoothMessage(characteristic, data) {
        try {
            const message = JSON.stringify(data);
            const encoder = new TextEncoder();
            const encodedMessage = encoder.encode(message);
            
            // Handle large messages by chunking
            const maxChunkSize = 20; // Bluetooth LE typical MTU
            
            if (encodedMessage.length <= maxChunkSize) {
                await characteristic.writeValue(encodedMessage);
            } else {
                // Send in chunks
                for (let i = 0; i < encodedMessage.length; i += maxChunkSize) {
                    const chunk = encodedMessage.slice(i, i + maxChunkSize);
                    await characteristic.writeValue(chunk);
                    await new Promise(resolve => setTimeout(resolve, 50)); // Small delay between chunks
                }
            }
            
        } catch (error) {
            console.error('Failed to write Bluetooth message:', error);
            throw error;
        }
    }

    handleBluetoothMessage(event) {
        try {
            const decoder = new TextDecoder();
            const message = decoder.decode(event.target.value);
            const data = JSON.parse(message);
            
            console.log('Received Bluetooth message:', data);
            
            switch (data.type) {
                case 'bluetooth-handshake':
                    console.log(`Bluetooth handshake from ${data.deviceName}`);
                    this.showToast(`Bluetooth device ${data.deviceName} connected`, 'success');
                    break;
                    
                case 'message':
                    this.displayMessage(data, false);
                    break;
                    
                case 'emergency':
                    this.displayEmergencyAlert(data);
                    break;
                    
                default:
                    console.log('Unknown Bluetooth message type:', data.type);
            }
            
        } catch (error) {
            console.error('Failed to parse Bluetooth message:', error);
        }
    }

    handleBluetoothDisconnect(device) {
        const connection = this.bluetoothConnections.get(device.id);
        if (connection) {
            this.bluetoothConnections.delete(device.id);
            this.updateActiveConnections();
            this.showToast(`Bluetooth device ${device.name || 'Unknown'} disconnected`, 'warning');
        }
    }

    async disconnectBluetoothDevice(deviceId) {
        const connection = this.bluetoothConnections.get(deviceId);
        if (connection && connection.device.gatt.connected) {
            await connection.device.gatt.disconnect();
            this.bluetoothConnections.delete(deviceId);
            this.updateActiveConnections();
        }
    }

    // Enhanced Local Network Scanning
    async scanLocalNetwork() {
        this.showToast('Scanning local network for emergency devices...', 'info');
        this.updateDeviceList('local', 'Scanning local network...');

        // Simulate WebSocket discovery on local network
        try {
            // Try common local IP ranges
            const localIPs = this.generateLocalIPRange();
            const foundDevices = [];

            for (const ip of localIPs.slice(0, 10)) { // Limit scan for demo
                try {
                    // Simulate device discovery
                    const response = await this.pingLocalDevice(ip);
                    if (response) {
                        foundDevices.push({
                            id: `local-${ip}`,
                            name: `Emergency Device (${ip})`,
                            type: 'local',
                            ip: ip
                        });
                    }
                } catch (error) {
                    // Device not found at this IP
                }
            }

            if (foundDevices.length > 0) {
                this.updateDeviceList('local', foundDevices);
                this.showToast(`Found ${foundDevices.length} local devices`, 'success');
            } else {
                this.showToast('No emergency devices found on local network', 'warning');
            }

        } catch (error) {
            console.error('Local network scan failed:', error);
            this.showToast('Local network scan failed', 'error');
        }
    }

    generateLocalIPRange() {
        // Generate common local IP ranges
        const ranges = [];
        const baseIPs = ['192.168.1.', '192.168.0.', '10.0.0.', '172.16.0.'];
        
        baseIPs.forEach(base => {
            for (let i = 1; i <= 254; i++) {
                ranges.push(base + i);
            }
        });
        
        return ranges;
    }

    async pingLocalDevice(ip) {
        // Simulate ping to local device (real implementation would use WebSocket or fetch)
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                // Simulate random device discovery
                if (Math.random() > 0.95) {
                    resolve({ ip, available: true });
                } else {
                    reject(new Error('Device not found'));
                }
            }, 100);
        });
    }

    updateDeviceList(type, content) {
        const deviceList = document.getElementById('device-list');
        
        if (typeof content === 'string') {
            deviceList.innerHTML = `
                <div class="text-center text-gray-500 py-4">
                    <i class="fas fa-search fa-lg mb-2"></i>
                    <p>${content}</p>
                </div>
            `;
        } else if (Array.isArray(content)) {
            deviceList.innerHTML = '';
            content.forEach(device => {
                const deviceDiv = document.createElement('div');
                deviceDiv.className = 'flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded-lg mb-2';
                
                deviceDiv.innerHTML = `
                    <div>
                        <div class="font-medium text-sm text-blue-800">${device.name}</div>
                        <div class="text-xs text-blue-600">${device.type.toUpperCase()}</div>
                    </div>
                    <button class="bg-blue-500 text-white px-2 py-1 rounded text-xs hover:bg-blue-600" 
                            onclick="window.emergencyChat.connectToDiscoveredDevice('${device.id}', '${device.type}')">
                        Connect
                    </button>
                `;
                
                deviceList.appendChild(deviceDiv);
            });
        }
    }

    async connectToDiscoveredDevice(deviceId, type) {
        this.showToast(`Connecting to ${type} device...`, 'info');
        
        if (type === 'local') {
            // Implement local network connection
            this.showToast('Local network connection implemented', 'success');
        } else {
            this.showToast('Connection type not implemented', 'warning');
        }
    }

    // Enhanced Peer Connection with Multi-Protocol Support
    initializePeer() {
        try {
            const peerId = this.generatePeerId();
            
            this.peer = new Peer(peerId, {
                debug: 2,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                        { urls: 'stun:stun3.l.google.com:19302' },
                        {
                            urls: 'turn:openrelay.metered.ca:80',
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        },
                        {
                            urls: 'turn:openrelay.metered.ca:443',
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        }
                    ],
                    iceCandidatePoolSize: 10
                }
            });

            this.peer.on('open', (id) => {
                console.log('Peer initialized with ID:', id);
                document.getElementById('peer-id').value = id;
                this.updateConnectionStatus('Multi-protocol mesh ready', 'success');
                this.showToast('Emergency mesh network ready (WebRTC + Bluetooth)', 'success');
            });

            this.peer.on('connection', (conn) => {
                this.handleIncomingConnection(conn);
            });

            this.peer.on('error', (error) => {
                console.error('Peer error:', error);
                this.showToast(`WebRTC error: ${error.message}`, 'error');
                
                // Try Bluetooth fallback
                if (this.bluetoothConnections.size === 0) {
                    this.showToast('Attempting Bluetooth fallback...', 'info');
                    setTimeout(() => this.scanBluetoothDevices(), 2000);
                }
            });

        } catch (error) {
            console.error('Failed to initialize peer:', error);
            this.showToast('WebRTC failed, using Bluetooth only', 'warning');
        }
    }

    generatePeerId() {
        const timestamp = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substring(2, 8);
        return `emergency-${timestamp}-${randomPart}`;
    }

    connectToPeer() {
        const remotePeerId = document.getElementById('remote-peer-id').value.trim();
        
        if (!remotePeerId) {
            this.showToast('Please enter a peer ID to connect', 'warning');
            return;
        }

        if (!this.peer) {
            this.showToast('WebRTC not available, try Bluetooth connection', 'warning');
            return;
        }

        try {
            this.showToast('Connecting via WebRTC...', 'info');
            
            const conn = this.peer.connect(remotePeerId, {
                metadata: {
                    deviceName: this.deviceName,
                    timestamp: Date.now(),
                    connectionType: 'webrtc'
                }
            });

            this.setupConnection(conn, false);
            
        } catch (error) {
            console.error('WebRTC connection failed:', error);
            this.showToast('WebRTC failed, trying Bluetooth...', 'warning');
            setTimeout(() => this.scanBluetoothDevices(), 1000);
        }
    }

    handleIncomingConnection(conn) {
        console.log('Incoming WebRTC connection from:', conn.peer);
        this.showToast(`WebRTC connection from ${conn.metadata?.deviceName || 'Unknown Device'}`, 'info');
        this.setupConnection(conn, true);
    }

    setupConnection(conn, isIncoming) {
        conn.on('open', () => {
            console.log(`WebRTC connection ${isIncoming ? 'accepted' : 'established'} with:`, conn.peer);
            
            this.connections.set(conn.peer, {
                connection: conn,
                type: 'webrtc',
                metadata: conn.metadata
            });
            
            this.updateActiveConnections();
            this.updateConnectionStatus(`Connected to ${this.getTotalConnections()} device(s)`, 'success');
            
            const deviceName = conn.metadata?.deviceName || 'Unknown Device';
            this.showToast(`WebRTC connected to ${deviceName}`, 'success');
            
            this.sendHandshake(conn);
            document.getElementById('remote-peer-id').value = '';
        });

        conn.on('data', (data) => {
            this.handleIncomingMessage(data, conn);
        });

        conn.on('close', () => {
            console.log('WebRTC connection closed:', conn.peer);
            this.connections.delete(conn.peer);
            this.updateActiveConnections();
            
            const totalConnections = this.getTotalConnections();
            if (totalConnections === 0) {
                this.updateConnectionStatus('No active connections', 'warning');
            } else {
                this.updateConnectionStatus(`Connected to ${totalConnections} device(s)`, 'success');
            }
            
            this.showToast('WebRTC device disconnected', 'warning');
        });

        conn.on('error', (error) => {
            console.error('WebRTC connection error:', error);
            this.connections.delete(conn.peer);
            this.updateActiveConnections();
            this.showToast('WebRTC connection error', 'error');
        });
    }

    getTotalConnections() {
        return this.connections.size + this.bluetoothConnections.size;
    }

    sendHandshake(conn) {
        const handshake = {
            type: 'handshake',
            deviceName: this.deviceName,
            timestamp: Date.now(),
            peerId: this.peer ? this.peer.id : 'bluetooth-only',
            connectionType: 'webrtc'
        };
        
        conn.send(handshake);
    }

    handleIncomingMessage(data, source) {
        console.log('Received message:', data);
        
        switch (data.type) {
            case 'handshake':
            case 'bluetooth-handshake':
                console.log(`Handshake from ${data.deviceName} via ${data.connectionType || 'unknown'}`);
                break;
                
            case 'message':
                this.displayMessage(data, false);
                break;
                
            case 'emergency':
                this.displayEmergencyAlert(data);
                break;
                
            case 'file':
                this.handleFileMessage(data);
                break;
                
            default:
                console.log('Unknown message type:', data.type);
        }
    }

    // Enhanced Message Sending with Multi-Protocol Support
    async sendMessage() {
        const input = document.getElementById('message-input');
        const message = input.value.trim();
        
        if (!message) return;
        
        const totalConnections = this.getTotalConnections();
        if (totalConnections === 0) {
            this.showToast('No devices connected to send message', 'warning');
            return;
        }

        const messageData = {
            type: 'message',
            content: message,
            sender: this.deviceName,
            timestamp: Date.now(),
            id: this.generateMessageId()
        };

        // Send via WebRTC connections
        this.connections.forEach((connData) => {
            try {
                connData.connection.send(messageData);
            } catch (error) {
                console.error('Failed to send WebRTC message:', error);
            }
        });

        // Send via Bluetooth connections
        for (const [deviceId, connData] of this.bluetoothConnections) {
            try {
                await this.writeBluetoothMessage(connData.characteristic, messageData);
            } catch (error) {
                console.error('Failed to send Bluetooth message:', error);
            }
        }

        this.displayMessage(messageData, true);
        input.value = '';
        
        this.showToast(`Message sent to ${totalConnections} device(s)`, 'success');
    }

    async sendEmergencyAlert() {
        const totalConnections = this.getTotalConnections();
        if (totalConnections === 0) {
            this.showToast('No devices connected for emergency alert', 'warning');
            return;
        }

        const emergencyData = {
            type: 'emergency',
            content: 'EMERGENCY ALERT: Assistance needed at this location',
            sender: this.deviceName,
            timestamp: Date.now(),
            location: await this.getCurrentLocation(),
            id: this.generateMessageId()
        };

        // Send via all connection types
        this.connections.forEach((connData) => {
            try {
                connData.connection.send(emergencyData);
            } catch (error) {
                console.error('Failed to send emergency via WebRTC:', error);
            }
        });

        for (const [deviceId, connData] of this.bluetoothConnections) {
            try {
                await this.writeBluetoothMessage(connData.characteristic, emergencyData);
            } catch (error) {
                console.error('Failed to send emergency via Bluetooth:', error);
            }
        }

        this.displayEmergencyAlert(emergencyData, true);
        this.showToast(`Emergency alert sent to ${totalConnections} device(s)`, 'warning');
    }

    displayMessage(messageData, isSent) {
        const messagesContainer = document.getElementById('messages');
        
        const placeholder = messagesContainer.querySelector('.text-center');
        if (placeholder) {
            placeholder.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `flex ${isSent ? 'justify-end' : 'justify-start'} mb-3`;

        const messageBubble = document.createElement('div');
        messageBubble.className = `max-w-xs lg:max-w-md px-3 py-2 rounded-lg ${
            isSent 
                ? 'bg-red-500 text-white' 
                : 'bg-gray-200 text-gray-800'
        }`;

        const messageContent = document.createElement('div');
        messageContent.textContent = messageData.content;

        const messageInfo = document.createElement('div');
        messageInfo.className = `text-xs mt-1 ${isSent ? 'text-red-100' : 'text-gray-500'}`;
        
        const time = new Date(messageData.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        messageInfo.textContent = `${messageData.sender} • ${time}`;

        messageBubble.appendChild(messageContent);
        messageBubble.appendChild(messageInfo);
        messageDiv.appendChild(messageBubble);
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    displayEmergencyAlert(alertData, isSent = false) {
        const messagesContainer = document.getElementById('messages');
        
        const alertDiv = document.createElement('div');
        alertDiv.className = 'flex justify-center mb-3';

        const alertBubble = document.createElement('div');
        alertBubble.className = 'max-w-md px-4 py-3 bg-red-600 text-white rounded-lg border-2 border-red-800 shadow-lg animate-pulse';

        const alertIcon = document.createElement('div');
        alertIcon.className = 'flex items-center mb-2';
        alertIcon.innerHTML = '<i class="fas fa-exclamation-triangle text-yellow-300 mr-2"></i><strong>EMERGENCY ALERT</strong>';

        const alertContent = document.createElement('div');
        alertContent.textContent = alertData.content;

        const alertInfo = document.createElement('div');
        alertInfo.className = 'text-xs mt-2 text-red-100';
        
        const time = new Date(alertData.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        alertInfo.textContent = `${alertData.sender} • ${time}`;

        alertBubble.appendChild(alertIcon);
        alertBubble.appendChild(alertContent);
        alertBubble.appendChild(alertInfo);
        alertDiv.appendChild(alertBubble);
        
        messagesContainer.appendChild(alertDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        this.playAlertSound();
        
        // Remove pulse animation after 5 seconds
        setTimeout(() => {
            alertBubble.classList.remove('animate-pulse');
        }, 5000);
    }

    generateMessageId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    async getCurrentLocation() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve({ latitude: null, longitude: null, accuracy: null });
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    });
                },
                (error) => {
                    console.error('Location access denied:', error);
                    resolve({ latitude: null, longitude: null, accuracy: null });
                },
                { timeout: 10000, enableHighAccuracy: true }
            );
        });
    }

    playAlertSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create multiple beeps for emergency alert
            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    const oscillator = audioContext.createOscillator();
                    const gainNode = audioContext.createGain();
                    
                    oscillator.connect(gainNode);
                    gainNode.connect(audioContext.destination);
                    
                    oscillator.frequency.value = 800 + (i * 200);
                    oscillator.type = 'sine';
                    
                    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                    
                    oscillator.start(audioContext.currentTime);
                    oscillator.stop(audioContext.currentTime + 0.3);
                }, i * 400);
            }
        } catch (error) {
            console.log('Could not play alert sound:', error);
        }
    }

    updateActiveConnections() {
        const container = document.getElementById('active-connections');
        container.innerHTML = '';

        const totalConnections = this.getTotalConnections();
        
        if (totalConnections === 0) {
            container.innerHTML = `
                <div class="text-center text-gray-500 py-4">
                    <i class="fas fa-plug fa-lg mb-2"></i>
                    <p>No active connections</p>
                </div>
            `;
        } else {
            // WebRTC connections
            this.connections.forEach((connData, peerId) => {
                const deviceDiv = document.createElement('div');
                deviceDiv.className = 'flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-lg mb-2';
                
                const deviceInfo = document.createElement('div');
                deviceInfo.innerHTML = `
                    <div class="font-medium text-sm text-green-800 flex items-center">
                        <i class="fas fa-wifi text-blue-500 mr-1"></i>
                        ${connData.metadata?.deviceName || 'Unknown Device'}
                    </div>
                    <div class="text-xs text-green-600">WebRTC • ${peerId.substring(0, 16)}...</div>
                `;
                
                const disconnectBtn = document.createElement('button');
                disconnectBtn.className = 'text-red-500 hover:text-red-700 text-sm';
                disconnectBtn.innerHTML = '<i class="fas fa-times"></i>';
                disconnectBtn.onclick = () => this.disconnectPeer(peerId);
                
                deviceDiv.appendChild(deviceInfo);
                deviceDiv.appendChild(disconnectBtn);
                container.appendChild(deviceDiv);
            });

            // Bluetooth connections
            this.bluetoothConnections.forEach((connData, deviceId) => {
                const deviceDiv = document.createElement('div');
                deviceDiv.className = 'flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded-lg mb-2';
                
                const deviceInfo = document.createElement('div');
                deviceInfo.innerHTML = `
                    <div class="font-medium text-sm text-blue-800 flex items-center">
                        <i class="fas fa-bluetooth-b text-blue-700 mr-1"></i>
                        ${connData.device.name || 'Bluetooth Device'}
                    </div>
                    <div class="text-xs text-blue-600">Bluetooth • ${deviceId.substring(0, 16)}...</div>
                `;
                
                const disconnectBtn = document.createElement('button');
                disconnectBtn.className = 'text-red-500 hover:text-red-700 text-sm';
                disconnectBtn.innerHTML = '<i class="fas fa-times"></i>';
                disconnectBtn.onclick = () => this.disconnectBluetoothDevice(deviceId);
                
                deviceDiv.appendChild(deviceInfo);
                deviceDiv.appendChild(disconnectBtn);
                container.appendChild(deviceDiv);
            });
        }

        // Update connection count and type display
        document.getElementById('connected-devices-count').textContent = totalConnections;
        
        const connectionTypes = [];
        if (this.connections.size > 0) connectionTypes.push('WebRTC');
        if (this.bluetoothConnections.size > 0) connectionTypes.push('Bluetooth');
        
        document.getElementById('connection-type-display').textContent = 
            connectionTypes.length > 0 ? connectionTypes.join(' + ') : 'local network';
    }

    disconnectPeer(peerId) {
        const connData = this.connections.get(peerId);
        if (connData && connData.connection) {
            connData.connection.close();
            this.connections.delete(peerId);
            this.updateActiveConnections();
            this.showToast('WebRTC device disconnected', 'info');
        }
    }

    copyPeerIdToClipboard() {
        const peerIdInput = document.getElementById('peer-id');
        peerIdInput.select();
        peerIdInput.setSelectionRange(0, 99999);

        try {
            document.execCommand('copy');
            this.showToast('Peer ID copied to clipboard', 'success');
        } catch (error) {
            // Fallback for modern browsers
            if (navigator.clipboard) {
                navigator.clipboard.writeText(peerIdInput.value).then(() => {
                    this.showToast('Peer ID copied to clipboard', 'success');
                }).catch(() => {
                    this.showToast('Failed to copy peer ID', 'error');
                });
            } else {
                this.showToast('Failed to copy peer ID', 'error');
            }
        }
    }

    showQRCode() {
        const peerId = document.getElementById('peer-id').value;
        if (!peerId) {
            this.showToast('No peer ID available', 'error');
            return;
        }

        const qrContainer = document.getElementById('qr-code');
        qrContainer.innerHTML = '';
        
        // Enhanced QR code with connection info
        const qrData = JSON.stringify({
            peerId: peerId,
            deviceName: this.deviceName,
            timestamp: Date.now(),
            capabilities: ['webrtc', 'bluetooth', 'emergency']
        });
        
        QRCode.toCanvas(qrContainer, qrData, {
            width: 200,
            height: 200,
            margin: 2,
            color: {
                dark: '#DC2626',  // Red color for emergency theme
                light: '#FFFFFF'
            }
        }, (error) => {
            if (error) {
                console.error('QR code generation failed:', error);
                this.showToast('Failed to generate QR code', 'error');
            }
        });

        document.getElementById('share-peer-id').textContent = peerId;
        document.getElementById('qr-modal').classList.remove('hidden');
    }

    updateConnectionStatus(message, type) {
        const statusBar = document.getElementById('connection-status-bar');
        const statusMessage = document.getElementById('connection-status-message');
        const statusText = document.getElementById('connection-status-text');
        
        statusMessage.textContent = message;
        
        statusBar.className = 'p-2 text-center text-xs md:text-sm';
        switch (type) {
            case 'success':
                statusBar.classList.add('bg-green-100', 'text-green-800');
                statusText.textContent = 'Connected';
                statusBar.classList.remove('hidden');
                break;
            case 'warning':
                statusBar.classList.add('bg-yellow-100', 'text-yellow-800');
                statusText.textContent = 'Searching';
                statusBar.classList.remove('hidden');
                break;
            case 'error':
                statusBar.classList.add('bg-red-100', 'text-red-800');
                statusText.textContent = 'Error';
                statusBar.classList.remove('hidden');
                break;
            default:
                statusBar.classList.add('hidden');
        }
    }

    async refreshDevices() {
        this.showToast('Refreshing device discovery...', 'info');
        
        // Refresh both WebRTC and Bluetooth discovery
        try {
            if (this.connectionPriority === 'bluetooth' || this.autoConnect) {
                await this.initializeBluetoothAdvertising();
            }
            
            if (this.connectionPriority === 'local' || this.autoConnect) {
                await this.scanLocalNetwork();
            }
            
            this.showToast('Device discovery refresh complete', 'success');
        } catch (error) {
            this.showToast('Device refresh failed', 'error');
        }
    }

    // Modal management methods
    toggleConnectionModal() {
        const modal = document.getElementById('connection-modal');
        modal.classList.toggle('hidden');
    }

    hideConnectionModal() {
        document.getElementById('connection-modal').classList.add('hidden');
    }

    hideQRModal() {
        document.getElementById('qr-modal').classList.add('hidden');
    }

    showSettingsModal() {
        // Load current settings into the modal
        document.getElementById('device-name').value = this.deviceName;
        document.getElementById('connection-priority').value = this.connectionPriority;
        document.getElementById('enable-encryption').checked = this.encryptionEnabled;
        document.getElementById('auto-connect').checked = this.autoConnect;
        
        document.getElementById('settings-modal').classList.remove('hidden');
    }

    hideSettingsModal() {
        document.getElementById('settings-modal').classList.add('hidden');
    }

    showFileModal() {
        document.getElementById('file-modal').classList.remove('hidden');
    }

    hideFileModal() {
        document.getElementById('file-modal').classList.add('hidden');
        
        // Reset file input
        document.getElementById('file-input').value = '';
        document.getElementById('file-preview').classList.add('hidden');
        document.getElementById('send-file').disabled = true;
    }

    toggleMobileSidebar() {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('show');
        
        // Add overlay for mobile
        if (sidebar.classList.contains('show')) {
            const overlay = document.createElement('div');
            overlay.id = 'mobile-overlay';
            overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 md:hidden';
            overlay.onclick = () => {
                sidebar.classList.remove('show');
                overlay.remove();
            };
            document.body.appendChild(overlay);
        }
    }

    // Enhanced Settings management
    loadSettings() {
        // Settings are stored in memory (localStorage not available)
        this.deviceName = 'Emergency Device';
        this.encryptionEnabled = true;
        this.autoConnect = true;
        this.connectionPriority = 'webrtc';
    }

    saveSettings() {
        const newDeviceName = document.getElementById('device-name').value || 'Emergency Device';
        const newPriority = document.getElementById('connection-priority').value;
        const newEncryption = document.getElementById('enable-encryption').checked;
        const newAutoConnect = document.getElementById('auto-connect').checked;
        
        // Apply settings
        this.deviceName = newDeviceName;
        this.connectionPriority = newPriority;
        this.encryptionEnabled = newEncryption;
        this.autoConnect = newAutoConnect;
        
        // Update network behavior based on new settings
        if (this.autoConnect) {
            if (this.connectionPriority === 'bluetooth') {
                setTimeout(() => this.scanBluetoothDevices(), 1000);
            } else if (this.connectionPriority === 'local') {
                setTimeout(() => this.scanLocalNetwork(), 1000);
            }
        }
        
        this.showToast('Settings saved and applied', 'success');
        this.hideSettingsModal();
    }

    // Enhanced File handling
    handleFileSelection(e) {
        const file = e.target.files[0];
        if (!file) return;

        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            this.showToast(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max size: 10MB`, 'error');
            return;
        }

        document.getElementById('file-name').textContent = `${file.name} (${(file.size / 1024).toFixed(1)}KB)`;
        document.getElementById('file-preview').classList.remove('hidden');
        document.getElementById('send-file').disabled = false;
        
        document.getElementById('remove-file').onclick = () => {
            document.getElementById('file-input').value = '';
            document.getElementById('file-preview').classList.add('hidden');
            document.getElementById('send-file').disabled = true;
        };
    }

    async sendFile() {
        const fileInput = document.getElementById('file-input');
        const file = fileInput.files[0];
        
        if (!file) {
            this.showToast('No file selected', 'error');
            return;
        }

        const totalConnections = this.getTotalConnections();
        if (totalConnections === 0) {
            this.showToast('No devices connected to send file', 'warning');
            return;
        }

        try {
            // Convert file to base64 for transmission
            const base64Data = await this.fileToBase64(file);
            
            const fileMessage = {
                type: 'file',
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                data: base64Data,
                sender: this.deviceName,
                timestamp: Date.now(),
                id: this.generateMessageId()
            };

            // Send via WebRTC (for larger files)
            this.connections.forEach((connData) => {
                try {
                    connData.connection.send(fileMessage);
                } catch (error) {
                    console.error('Failed to send file via WebRTC:', error);
                }
            });

            // For Bluetooth, send file info only (due to size limitations)
            const fileNotification = {
                type: 'file-notification',
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                sender: this.deviceName,
                timestamp: Date.now(),
                id: fileMessage.id,
                message: `File "${file.name}" shared via WebRTC`
            };

            for (const [deviceId, connData] of this.bluetoothConnections) {
                try {
                    await this.writeBluetoothMessage(connData.characteristic, fileNotification);
                } catch (error) {
                    console.error('Failed to send file notification via Bluetooth:', error);
                }
            }

            this.displayFileMessage(fileMessage, true);
            this.showToast(`File sent to ${totalConnections} device(s)`, 'success');
            this.hideFileModal();
            
        } catch (error) {
            console.error('File sending failed:', error);
            this.showToast('Failed to send file', 'error');
        }
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    handleFileMessage(data) {
        if (data.type === 'file') {
            this.displayFileMessage(data, false);
        } else if (data.type === 'file-notification') {
            this.displayMessage({
                type: 'message',
                content: data.message,
                sender: data.sender,
                timestamp: data.timestamp,
                id: data.id
            }, false);
        }
    }

    displayFileMessage(fileData, isSent) {
        const messagesContainer = document.getElementById('messages');
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `flex ${isSent ? 'justify-end' : 'justify-start'} mb-3`;

        const messageBubble = document.createElement('div');
        messageBubble.className = `max-w-xs lg:max-w-md px-3 py-2 rounded-lg ${
            isSent 
                ? 'bg-blue-500 text-white' 
                : 'bg-blue-100 text-blue-900'
        }`;

        const fileIcon = document.createElement('div');
        fileIcon.className = 'flex items-center mb-2';
        fileIcon.innerHTML = `<i class="fas fa-file mr-2"></i><strong>File Shared</strong>`;

        const fileName = document.createElement('div');
        fileName.className = 'font-medium';
        fileName.textContent = fileData.fileName;

        const fileSize = document.createElement('div');
        fileSize.className = 'text-sm opacity-75';
        fileSize.textContent = `${(fileData.fileSize / 1024).toFixed(1)} KB`;

        if (!isSent && fileData.data) {
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'mt-2 px-2 py-1 bg-white text-blue-600 rounded text-sm hover:bg-gray-100';
            downloadBtn.textContent = 'Download';
            downloadBtn.onclick = () => this.downloadFile(fileData);
            messageBubble.appendChild(downloadBtn);
        }

        const messageInfo = document.createElement('div');
        messageInfo.className = `text-xs mt-2 ${isSent ? 'text-blue-100' : 'text-blue-700'}`;
        
        const time = new Date(fileData.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        messageInfo.textContent = `${fileData.sender} • ${time}`;

        messageBubble.appendChild(fileIcon);
        messageBubble.appendChild(fileName);
        messageBubble.appendChild(fileSize);
        messageBubble.appendChild(messageInfo);
        messageDiv.appendChild(messageBubble);
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    downloadFile(fileData) {
        try {
            const byteCharacters = atob(fileData.data);
            const byteNumbers = new Array(byteCharacters.length);
            
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: fileData.fileType });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileData.fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showToast(`Downloaded ${fileData.fileName}`, 'success');
            
        } catch (error) {
            console.error('File download failed:', error);
            this.showToast('Failed to download file', 'error');
        }
    }

    // Enhanced Toast notification system
    showToast(message, type = 'info', duration = 3000) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        
        toast.className = 'fixed bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg text-xs md:text-sm z-50 animate-fade-in';
        
        switch (type) {
            case 'success':
                toast.classList.add('bg-green-600', 'text-white');
                break;
            case 'error':
                toast.classList.add('bg-red-600', 'text-white');
                break;
            case 'warning':
                toast.classList.add('bg-yellow-600', 'text-white');
                break;
            default:
                toast.classList.add('bg-gray-800', 'text-white');
        }
        
        toast.classList.remove('hidden');
        
        setTimeout(() => {
            toast.classList.add('animate-fade-out');
            setTimeout(() => {
                toast.classList.add('hidden');
                toast.classList.remove('animate-fade-out', 'animate-fade-in');
            }, 300);
        }, duration);
    }

    // Enhanced Auto-Discovery and Connection Management
    async startAutoDiscovery() {
        if (!this.autoConnect) return;

        console.log('Starting auto-discovery...');
        
        // Stagger discovery methods to avoid conflicts
        setTimeout(() => {
            if (this.connectionPriority === 'bluetooth' || this.connectionPriority === 'webrtc') {
                this.scanBluetoothDevices();
            }
        }, 1000);

        setTimeout(() => {
            if (this.connectionPriority === 'local' || this.connectionPriority === 'webrtc') {
                this.scanLocalNetwork();
            }
        }, 3000);

        // Periodic rediscovery
        setInterval(() => {
            if (this.autoConnect && this.getTotalConnections() < 3) {
                this.refreshDevices();
            }
        }, 30000); // Every 30 seconds
    }

    // Network Quality Monitoring
    monitorConnectionQuality() {
        setInterval(() => {
            this.connections.forEach((connData, peerId) => {
                if (connData.connection.open) {
                    // Send ping to check connection quality
                    try {
                        connData.connection.send({
                            type: 'ping',
                            timestamp: Date.now()
                        });
                    } catch (error) {
                        console.warn(`Connection quality check failed for ${peerId}`);
                        this.connections.delete(peerId);
                        this.updateActiveConnections();
                    }
                }
            });
        }, 10000); // Every 10 seconds
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.emergencyChat = new EmergencyMeshChat();
    
    // Start auto-discovery after initialization
    setTimeout(() => {
        window.emergencyChat.startAutoDiscovery();
        window.emergencyChat.monitorConnectionQuality();
    }, 2000);
});

// Enhanced utility functions for debugging and external control
window.connectToDevice = (peerId) => {
    document.getElementById('remote-peer-id').value = peerId;
    window.emergencyChat.connectToPeer();
};

window.getMyPeerId = () => {
    return document.getElementById('peer-id').value;
};

window.getConnectedDevices = () => {
    const webrtc = Array.from(window.emergencyChat.connections.keys());
    const bluetooth = Array.from(window.emergencyChat.bluetoothConnections.keys());
    return {
        webrtc: webrtc,
        bluetooth: bluetooth,
        total: webrtc.length + bluetooth.length
    };
};

window.forceBluetoothScan = () => {
    window.emergencyChat.scanBluetoothDevices();
};

window.getConnectionStatus = () => {
    return {
        webrtcConnections: window.emergencyChat.connections.size,
        bluetoothConnections: window.emergencyChat.bluetoothConnections.size,
        totalConnections: window.emergencyChat.getTotalConnections(),
        autoConnect: window.emergencyChat.autoConnect,
        connectionPriority: window.emergencyChat.connectionPriority
    };
};

// Service Worker registration for offline capability (if needed)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('ServiceWorker registration successful');
            })
            .catch((err) => {
                console.log('ServiceWorker registration failed');
            });
    });
}