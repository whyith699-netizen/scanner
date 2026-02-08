// Scanner - Supabase Integration
// File auto-delete after 7 days

// Supabase credentials
const SUPABASE_URL = 'https://bpjmyuegaabdyfbeucox.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwam15dWVnYWFiZHlmYmV1Y294Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0OTUzNjQsImV4cCI6MjA4NjA3MTM2NH0.lyzrdJqj1-r28zb3G2K7RMvObqFkObB7fDDVE_xlcX8';

// Wait for Supabase to load, then initialize
let db = null;

function initSupabase() {
    // Try new ESM approach first
    if (window.supabaseLib && window.supabaseLib.createClient) {
        db = window.supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase initialized via ESM!');
        return true;
    }
    // Fallback to UMD
    if (window.supabase && window.supabase.createClient) {
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase initialized via UMD!');
        return true;
    }
    return false;
}

class ScannerApp {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.previewImage = document.getElementById('preview-img');
        this.cameraCard = document.getElementById('camera-card');
        this.previewSection = document.getElementById('preview-section');
        this.statusDiv = document.getElementById('status');
        
        this.originalImageData = null;
        this.currentFilter = 'original';
        this.brightness = 0;
        this.contrast = 1;
        this.user = null;
        
        this.init();
    }
    
    async init() {
        console.log('Initializing app...');
        
        // Wait for Supabase SDK
        if (!initSupabase()) {
            console.log('Waiting for Supabase SDK...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (!initSupabase()) {
                alert('Failed to load Supabase SDK. Please refresh.');
                return;
            }
        }
        
        this.setupEventListeners();
        await this.checkAuth();
        console.log('App initialized');
    }
    
    async checkAuth() {
        if (!db) return;
        
        try {
            const { data: { session } } = await db.auth.getSession();
            if (session) {
                this.user = session.user;
                this.showApp();
            } else {
                this.showLogin();
            }
            
            db.auth.onAuthStateChange((event, session) => {
                if (session) {
                    this.user = session.user;
                    this.showApp();
                } else {
                    this.showLogin();
                }
            });
        } catch (e) {
            console.error('Auth error:', e);
            this.showLogin();
        }
    }
    
    async login() {
        console.log('Login clicked');
        if (!db) {
            alert('Supabase not loaded. Please refresh.');
            return;
        }
        
        try {
            const { data, error } = await db.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin + window.location.pathname
                }
            });
            
            if (error) {
                console.error('Login error:', error);
                alert('Login error: ' + error.message);
            }
        } catch (e) {
            console.error('Login exception:', e);
            alert('Error: ' + e.message);
        }
    }
    
    async logout() {
        if (db) await db.auth.signOut();
        this.showLogin();
    }
    
    showLogin() {
        document.getElementById('login-section').classList.remove('hidden');
        document.getElementById('app-section').classList.add('hidden');
    }
    
    showApp() {
        document.getElementById('login-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');
        
        if (this.user) {
            const meta = this.user.user_metadata || {};
            document.getElementById('user-photo').src = meta.avatar_url || 'https://via.placeholder.com/40';
            document.getElementById('user-name').textContent = meta.full_name || 'User';
            document.getElementById('user-email').textContent = this.user.email || '';
        }
        
        this.startCamera();
        this.loadFiles();
        this.updateStorageInfo();
    }
    
    async startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1920 } }
            });
            this.video.srcObject = stream;
        } catch (e) {
            console.log('Camera unavailable');
        }
    }
    
    setupEventListeners() {
        document.getElementById('login-btn').addEventListener('click', () => this.login());
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
        
        document.getElementById('upload-btn').addEventListener('click', () => this.upload());
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
                    const bw = (0.299 * r + 0.587 * g + 0.114 * b) > 128 ? 255 : 0;
                    r = g = b = bw;
                    break;
                case 'enhance':
                    r = Math.min(255, r * 1.2 + 10);
                    g = Math.min(255, g * 1.2 + 10);
                    b = Math.min(255, b * 1.2 + 10);
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
        this.previewImage.src = this.canvas.toDataURL('image/jpeg', 0.9);
    }
    
    async upload() {
        if (!this.user || !db) return;
        
        const btn = document.getElementById('upload-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="loading"></span> Uploading...';
        
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `scan_${timestamp}.jpg`;
            const filePath = `${this.user.id}/${filename}`;
            
            const blob = await new Promise(r => this.canvas.toBlob(r, 'image/jpeg', 0.9));
            
            const { error: uploadError } = await db.storage
                .from('scans')
                .upload(filePath, blob, { contentType: 'image/jpeg' });
            
            if (uploadError) throw uploadError;
            
            const { error: dbError } = await db
                .from('files')
                .insert({
                    user_id: this.user.id,
                    filename: filename,
                    path: filePath,
                    size: blob.size,
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                });
            
            if (dbError) console.error('DB error:', dbError);
            
            this.showStatus('✅ Tersimpan! (hapus otomatis 7 hari)', 'success');
            this.loadFiles();
            this.updateStorageInfo();
            setTimeout(() => this.retake(), 2000);
            
        } catch (error) {
            console.error('Upload error:', error);
            this.showStatus('❌ Error: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '☁️ Upload';
        }
    }
    
    async loadFiles() {
        if (!db || !this.user) return;
        
        const list = document.getElementById('file-list');
        
        try {
            const { data, error } = await db
                .from('files')
                .select('*')
                .eq('user_id', this.user.id)
                .order('created_at', { ascending: false })
                .limit(10);
            
            if (error) throw error;
            
            if (!data || data.length === 0) {
                list.innerHTML = '<div class="empty">Belum ada file</div>';
                return;
            }
            
            list.innerHTML = data.map(file => {
                const { data: urlData } = db.storage.from('scans').getPublicUrl(file.path);
                const expiresIn = Math.ceil((new Date(file.expires_at) - Date.now()) / (1000 * 60 * 60 * 24));
                
                return `
                    <div class="file-item">
                        <img src="${urlData.publicUrl}" alt="Scan" onerror="this.style.display='none'">
                        <div class="info">
                            <div class="name">${file.filename}</div>
                            <div class="meta">${this.formatSize(file.size)} • <span class="expires">⏳ ${expiresIn} hari lagi</span></div>
                        </div>
                        <a href="${urlData.publicUrl}" target="_blank" download>📥</a>
                    </div>
                `;
            }).join('');
            
        } catch (error) {
            console.error('Load files error:', error);
            list.innerHTML = '<div class="empty">Error loading files</div>';
        }
    }
    
    async updateStorageInfo() {
        if (!db || !this.user) return;
        
        try {
            const { data, error } = await db
                .from('files')
                .select('size')
                .eq('user_id', this.user.id);
            
            if (error) throw error;
            
            const totalBytes = data.reduce((sum, f) => sum + (f.size || 0), 0);
            const usedMB = (totalBytes / (1024 * 1024)).toFixed(1);
            const percent = Math.min(100, (totalBytes / (100 * 1024 * 1024)) * 100);
            
            document.getElementById('storage-used').textContent = usedMB + ' MB';
            document.getElementById('storage-fill').style.width = percent + '%';
        } catch (e) {
            console.error('Storage info error:', e);
        }
    }
    
    formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    
    download() {
        const link = document.createElement('a');
        link.download = `scan_${Date.now()}.jpg`;
        link.href = this.canvas.toDataURL('image/jpeg', 0.9);
        link.click();
        this.showStatus('💾 Tersimpan ke perangkat!', 'success');
    }
    
    showStatus(msg, type) {
        this.statusDiv.textContent = msg;
        this.statusDiv.className = `status ${type}`;
        this.statusDiv.classList.remove('hidden');
    }
    
    hideStatus() {
        this.statusDiv.classList.add('hidden');
    }
}

// Initialize when DOM ready
document.addEventListener('DOMContentLoaded', () => new ScannerApp());
