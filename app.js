// Drive Scanner - Google Drive Integration
// 100% FREE - Uses user's own Google Drive (15GB)

// TODO: Replace with your Google Cloud Console credentials
const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
const API_KEY = 'YOUR_API_KEY';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

class DriveScanner {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.previewImage = document.getElementById('preview-image');
        this.cameraCard = document.getElementById('camera-card');
        this.previewSection = document.getElementById('preview-section');
        this.statusDiv = document.getElementById('status');
        
        this.originalImageData = null;
        this.currentFilter = 'original';
        this.brightness = 0;
        this.contrast = 1;
        this.selectedFormat = 'jpeg';
        this.accessToken = null;
        this.user = null;
        this.scansFolderId = null;
        
        this.init();
    }
    
    async init() {
        this.setupEventListeners();
        await this.initGoogleAPI();
    }
    
    async initGoogleAPI() {
        // Load Google Identity Services
        google.accounts.id.initialize({
            client_id: CLIENT_ID,
            callback: (response) => this.handleCredentialResponse(response)
        });
        
        // Check for existing session
        const savedToken = localStorage.getItem('drive_token');
        const savedUser = localStorage.getItem('drive_user');
        
        if (savedToken && savedUser) {
            this.accessToken = savedToken;
            this.user = JSON.parse(savedUser);
            
            // Verify token is still valid
            try {
                const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + savedToken);
                if (response.ok) {
                    this.showApp();
                    return;
                }
            } catch (e) {
                // Token expired
            }
            
            // Clear expired token
            localStorage.removeItem('drive_token');
            localStorage.removeItem('drive_user');
        }
        
        this.showLogin();
    }
    
    handleCredentialResponse(response) {
        // Decode JWT to get user info
        const payload = JSON.parse(atob(response.credential.split('.')[1]));
        this.user = {
            name: payload.name,
            email: payload.email,
            picture: payload.picture
        };
        
        // Now get Drive access token
        this.requestDriveAccess();
    }
    
    requestDriveAccess() {
        const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (tokenResponse) => {
                if (tokenResponse.access_token) {
                    this.accessToken = tokenResponse.access_token;
                    localStorage.setItem('drive_token', this.accessToken);
                    localStorage.setItem('drive_user', JSON.stringify(this.user));
                    this.showApp();
                }
            }
        });
        
        tokenClient.requestAccessToken();
    }
    
    showLogin() {
        document.getElementById('login-section').classList.remove('hidden');
        document.getElementById('app-section').classList.add('hidden');
    }
    
    showApp() {
        document.getElementById('login-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');
        
        document.getElementById('user-photo').src = this.user.picture || 'https://via.placeholder.com/40';
        document.getElementById('user-name').textContent = this.user.name || 'User';
        document.getElementById('user-email').textContent = this.user.email;
        
        this.startCamera();
        this.ensureScansFolderExists();
    }
    
    async ensureScansFolderExists() {
        // Check if "Scans" folder exists in Drive
        try {
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=name='Scans' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                { headers: { 'Authorization': `Bearer ${this.accessToken}` } }
            );
            const data = await response.json();
            
            if (data.files && data.files.length > 0) {
                this.scansFolderId = data.files[0].id;
            } else {
                // Create folder
                const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: 'Scans',
                        mimeType: 'application/vnd.google-apps.folder'
                    })
                });
                const folder = await createResponse.json();
                this.scansFolderId = folder.id;
            }
            console.log('Scans folder ID:', this.scansFolderId);
        } catch (e) {
            console.error('Error creating folder:', e);
        }
    }
    
    logout() {
        this.accessToken = null;
        this.user = null;
        localStorage.removeItem('drive_token');
        localStorage.removeItem('drive_user');
        this.showLogin();
    }
    
    async startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
            });
            this.video.srcObject = stream;
        } catch (err) {
            console.error('Camera error:', err);
            this.showStatus('Gunakan "Pilih dari Gallery" untuk memilih foto', 'info');
        }
    }
    
    setupEventListeners() {
        document.getElementById('login-btn').addEventListener('click', () => {
            google.accounts.id.prompt();
        });
        
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());
        document.getElementById('capture-btn').addEventListener('click', () => this.capturePhoto());
        document.getElementById('file-input').addEventListener('change', (e) => this.handleFileSelect(e));
        
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.applyFilters();
            });
        });
        
        document.getElementById('brightness').addEventListener('input', (e) => {
            this.brightness = parseInt(e.target.value);
            document.getElementById('brightness-value').textContent = this.brightness;
            this.applyFilters();
        });
        
        document.getElementById('contrast').addEventListener('input', (e) => {
            this.contrast = parseInt(e.target.value) / 100;
            document.getElementById('contrast-value').textContent = this.contrast.toFixed(1);
            this.applyFilters();
        });
        
        document.querySelectorAll('.format-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
                e.target.closest('.format-btn').classList.add('active');
                this.selectedFormat = e.target.closest('.format-btn').dataset.format;
            });
        });
        
        document.getElementById('upload-btn').addEventListener('click', () => this.uploadToDrive());
        document.getElementById('retake-btn').addEventListener('click', () => this.retake());
        document.getElementById('download-btn').addEventListener('click', () => this.download());
    }
    
    capturePhoto() {
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        this.ctx.drawImage(this.video, 0, 0);
        this.originalImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this.showPreview();
    }
    
    handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                this.canvas.width = img.width;
                this.canvas.height = img.height;
                this.ctx.drawImage(img, 0, 0);
                this.originalImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
                this.showPreview();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
    
    showPreview() {
        this.cameraCard.classList.add('hidden');
        this.previewSection.classList.remove('hidden');
        this.applyFilters();
    }
    
    retake() {
        this.cameraCard.classList.remove('hidden');
        this.previewSection.classList.add('hidden');
        this.resetFilters();
        this.hideStatus();
    }
    
    resetFilters() {
        this.currentFilter = 'original';
        this.brightness = 0;
        this.contrast = 1;
        document.getElementById('brightness').value = 0;
        document.getElementById('contrast').value = 100;
        document.getElementById('brightness-value').textContent = '0';
        document.getElementById('contrast-value').textContent = '1.0';
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.filter-btn[data-filter="original"]').classList.add('active');
    }
    
    applyFilters() {
        if (!this.originalImageData) return;
        
        const imageData = new ImageData(
            new Uint8ClampedArray(this.originalImageData.data),
            this.originalImageData.width,
            this.originalImageData.height
        );
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            let r = data[i], g = data[i + 1], b = data[i + 2];
            
            switch (this.currentFilter) {
                case 'grayscale':
                    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                    r = g = b = gray;
                    break;
                case 'bw':
                    const bwGray = 0.299 * r + 0.587 * g + 0.114 * b;
                    r = g = b = bwGray > 128 ? 255 : 0;
                    break;
                case 'enhance':
                    r = Math.min(255, r * 1.2 + 10);
                    g = Math.min(255, g * 1.2 + 10);
                    b = Math.min(255, b * 1.2 + 10);
                    break;
                case 'vivid':
                    const avg = (r + g + b) / 3;
                    r = Math.min(255, r + (r - avg) * 0.5);
                    g = Math.min(255, g + (g - avg) * 0.5);
                    b = Math.min(255, b + (b - avg) * 0.5);
                    break;
            }
            
            r = ((r - 128) * this.contrast + 128) + this.brightness;
            g = ((g - 128) * this.contrast + 128) + this.brightness;
            b = ((b - 128) * this.contrast + 128) + this.brightness;
            
            data[i] = Math.max(0, Math.min(255, r));
            data[i + 1] = Math.max(0, Math.min(255, g));
            data[i + 2] = Math.max(0, Math.min(255, b));
        }
        
        this.ctx.putImageData(imageData, 0, 0);
        this.previewImage.src = this.canvas.toDataURL('image/jpeg', 0.95);
    }
    
    async uploadToDrive() {
        if (!this.accessToken) {
            this.showStatus('Please login first', 'error');
            return;
        }
        
        const uploadBtn = document.getElementById('upload-btn');
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<span class="loading"></span> Uploading...';
        
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const ext = this.selectedFormat === 'png' ? 'png' : 'jpg';
            const mimeType = this.selectedFormat === 'png' ? 'image/png' : 'image/jpeg';
            const filename = `scan_${timestamp}.${ext}`;
            
            // Get blob from canvas
            const blob = await new Promise((resolve) => {
                this.canvas.toBlob(resolve, mimeType, 0.95);
            });
            
            // Create file metadata
            const metadata = {
                name: filename,
                mimeType: mimeType,
                parents: this.scansFolderId ? [this.scansFolderId] : []
            };
            
            // Upload using multipart
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', blob);
            
            const response = await fetch(
                'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
                {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${this.accessToken}` },
                    body: form
                }
            );
            
            if (response.ok) {
                const result = await response.json();
                this.showStatus(`✅ Tersimpan di Google Drive: ${filename}`, 'success');
                setTimeout(() => this.retake(), 2000);
            } else {
                const error = await response.json();
                throw new Error(error.error?.message || 'Upload failed');
            }
            
        } catch (error) {
            console.error('Upload error:', error);
            this.showStatus(`❌ Error: ${error.message}`, 'error');
        } finally {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = '📤 Simpan ke Google Drive';
        }
    }
    
    download() {
        const mimeType = this.selectedFormat === 'png' ? 'image/png' : 'image/jpeg';
        const ext = this.selectedFormat === 'png' ? 'png' : 'jpg';
        
        const link = document.createElement('a');
        link.download = `scan_${Date.now()}.${ext}`;
        link.href = this.canvas.toDataURL(mimeType, 0.95);
        link.click();
        
        this.showStatus('💾 File tersimpan ke perangkat!', 'success');
    }
    
    showStatus(message, type) {
        this.statusDiv.textContent = message;
        this.statusDiv.className = `status ${type}`;
        this.statusDiv.classList.remove('hidden');
    }
    
    hideStatus() {
        this.statusDiv.classList.add('hidden');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new DriveScanner();
});
