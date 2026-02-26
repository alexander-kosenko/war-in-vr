// Configuration
const CONFIG = {
    ADMIN_PASSWORD: 'war-in-vr-2024',
    UPLOAD_MODE: 'LOCAL', // 'LOCAL' або 'WORKER'
    WORKER_URL: '', // для WORKER режиму
    R2_PUBLIC_URL: 'https://pub-21040fd818d4437484f8a3c1ca05743a.r2.dev',
    SITE_URL: window.location.origin // https://vr-photo.pages.dev
};

let selectedFile = null;
let isAuthenticated = false;
let currentQRCode = null;

// Photo ID preview
document.addEventListener('DOMContentLoaded', function() {
    const photoIdInput = document.getElementById('photoId');
    if (photoIdInput) {
        photoIdInput.addEventListener('input', function() {
            document.getElementById('photoIdPreview').textContent = this.value || '1';
        });
    }
});

// Authentication
function authenticate() {
    const password = document.getElementById('password').value;
    
    if (password === CONFIG.ADMIN_PASSWORD) {
        isAuthenticated = true;
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('uploadSection').classList.add('active');
        hideAlert();
    } else {
        showAlert('Невірний пароль!', 'error');
    }
}

function logout() {
    isAuthenticated = false;
    document.getElementById('authSection').style.display = 'block';
    document.getElementById('uploadSection').classList.remove('active');
    document.getElementById('password').value = '';
    resetForm();
}

// File handling
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        selectedFile = file;
        showFileInfo(file);
        document.getElementById('uploadBtn').disabled = false;
    } else {
        showAlert('Будь ласка, оберіть файл зображення', 'error');
    }
}

function showFileInfo(file) {
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    
    fileName.textContent = file.name;
    fileSize.textContent = `Розмір: ${(file.size / 1024 / 1024).toFixed(2)} MB`;
    fileInfo.classList.add('active');
}

// Drag and drop
const fileUpload = document.getElementById('fileUpload');

fileUpload.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileUpload.classList.add('dragover');
});

fileUpload.addEventListener('dragleave', () => {
    fileUpload.classList.remove('dragover');
});

fileUpload.addEventListener('drop', (e) => {
    e.preventDefault();
    fileUpload.classList.remove('dragover');
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        selectedFile = file;
        showFileInfo(file);
        document.getElementById('uploadBtn').disabled = false;
    }
});

// Image processing and upload
async function processAndUpload() {
    if (!selectedFile) {
        showAlert('Оберіть файл для завантаження', 'error');
        return;
    }

    const photoId = document.getElementById('photoId').value;
    if (!photoId || photoId < 1) {
        showAlert('Введіть коректний номер фото', 'error');
        return;
    }

    const uploadBtn = document.getElementById('uploadBtn');
    const progressSection = document.getElementById('progressSection');
    
    uploadBtn.disabled = true;
    progressSection.classList.add('active');
    hideAlert();

    try {
        // Process images
        updateProgress(10, 'Обробка mobile версії...');
        updateVersionStatus('statusMobile', 'processing');
        const mobileBlob = await compressImage(selectedFile, {
            maxSizeMB: 3,
            maxWidthOrHeight: 2048,
            fileType: 'image/webp',
            useWebWorker: true
        });
        updateVersionStatus('statusMobile', 'done');

        updateProgress(40, 'Обробка desktop версії...');
        updateVersionStatus('statusDesktop', 'processing');
        const desktopBlob = await compressImage(selectedFile, {
            maxSizeMB: 6,
            maxWidthOrHeight: 4096,
            fileType: 'image/webp',
            useWebWorker: true
        });
        updateVersionStatus('statusDesktop', 'done');

        updateProgress(70, 'Обробка VR версії...');
        updateVersionStatus('statusVr', 'processing');
        const vrBlob = await compressImage(selectedFile, {
            maxSizeMB: 12,
            maxWidthOrHeight: 8192,
            fileType: 'image/jpeg',
            quality: 0.9,
            useWebWorker: true
        });
        updateVersionStatus('statusVr', 'done');

        // Upload to R2
        updateProgress(80, 'Завантаження на сервер...');
        await uploadToR2(photoId, {
            mobile: mobileBlob,
            desktop: desktopBlob,
            vr: vrBlob
        });

        updateProgress(100, 'Готово! ✓');
        
        // Show success with QR code
        showSuccessWithQR(photoId);
        
        setTimeout(() => {
            resetForm();
        }, 3000);

    } catch (error) {
        console.error('Error:', error);
        showAlert('Помилка: ' + error.message, 'error');
        resetForm();
    }
}

async function compressImage(file, options) {
    try {
        const compressed = await imageCompression(file, options);
        return compressed;
    } catch (error) {
        throw new Error('Помилка обробки зображення: ' + error.message);
    }
}

async function uploadToR2(sceneId, blobs) {
    if (CONFIG.UPLOAD_MODE === 'WORKER') {
        // Автоматичний upload через Cloudflare Worker
        if (!CONFIG.WORKER_URL) {
            throw new Error('WORKER_URL не налаштований! Встановіть URL Worker в CONFIG або змініть режим на LOCAL.');
        }
        
        console.log('Uploading to R2 via Worker:', sceneId);
        
        const formData = new FormData();
        formData.append('password', CONFIG.ADMIN_PASSWORD);
        formData.append('sceneId', sceneId);
        formData.append('mobile', blobs.mobile, `scene-${sceneId}-mobile.webp`);
        formData.append('desktop', blobs.desktop, `scene-${sceneId}-desktop.webp`);
        formData.append('vr', blobs.vr, `scene-${sceneId}-vr.jpg`);
        
        const response = await fetch(CONFIG.WORKER_URL, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
        }
        
        const result = await response.json();
        console.log('Upload success:', result);
        
        return result;
        
    } else {
        // LOCAL режим - завантажуємо файли на комп'ютер
        console.log('Downloading files locally (LOCAL mode):', {
            photoId,
            mobile: blobs.mobile.size,
            desktop: blobs.desktop.size,
            vr: blobs.vr.size
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Завантажуємо на комп'ютер
        downloadBlob(blobs.mobile, `photo-${photoId}-mobile.webp`);
        downloadBlob(blobs.desktop, `photo-${photoId}-desktop.webp`);
        downloadBlob(blobs.vr, `photo-${photoId}-vr.jpg`);
        
        console.log('Файли завантажені! Тепер upload через: ./admin/upload-to-r2.sh ' + photoId + ' photo-' + photoId + '-mobile.webp photo-' + photoId + '-desktop.webp photo-' + photoId + '-vr.jpg');
    }
}

// Helper function to download processed images (for testing)
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// UI helpers
function updateProgress(percent, text) {
    document.getElementById('progressFill').style.width = percent + '%';
    document.getElementById('progressText').textContent = text;
}

function updateVersionStatus(elementId, status) {
    const element = document.getElementById(elementId);
    element.className = 'version-status ' + status;
    
    const icons = {
        'pending': '⏳',
        'processing': '⚙️',
        'done': '✓'
    };
    
    element.textContent = icons[status] || '';
}

function showAlert(message, type) {
    const alert = document.getElementById('alert');
    alert.textContent = message;
    alert.className = 'alert alert-' + type + ' active';
}

function hideAlert() {
    document.getElementById('alert').classList.remove('active');
}

function resetForm() {
    selectedFile = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('fileInfo').classList.remove('active');
    document.getElementById('progressSection').classList.remove('active');
    document.getElementById('uploadBtn').disabled = true;
    
    updateProgress(0, 'Підготовка...');
    updateVersionStatus('statusMobile', 'pending');
    updateVersionStatus('statusDesktop', 'pending');
    updateVersionStatus('statusVr', 'pending');
}

// QR Code functions
function showSuccessWithQR(photoId) {
    // Hide upload section
    document.getElementById('uploadSection').classList.remove('active');
    
    // Show success section
    const successSection = document.getElementById('successSection');
    successSection.classList.add('active');
    
    // Set photo URL
    const photoUrl = `${CONFIG.SITE_URL}/photo/${photoId}/`;
    document.getElementById('photoUrl').textContent = photoUrl;
    
    // Generate QR code
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = ''; // Clear previous QR
    
    currentQRCode = new QRCode(qrContainer, {
        text: photoUrl,
        width: 512,
        height: 512,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H // High error correction
    });
}

function downloadQR(format) {
    const qrContainer = document.getElementById('qrcode');
    const photoId = document.getElementById('photoId').value;
    
    if (format === 'png') {
        // Download canvas as PNG
        const canvas = qrContainer.querySelector('canvas');
        if (canvas) {
            canvas.toBlob(function(blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `qr-photo-${photoId}.png`;
                a.click();
                URL.revokeObjectURL(url);
            });
        }
    } else if (format === 'svg') {
        // Convert canvas to high-res PNG for print (2048x2048)
        const canvas = qrContainer.querySelector('canvas');
        if (canvas) {
            const highResCanvas = document.createElement('canvas');
            highResCanvas.width = 2048;
            highResCanvas.height = 2048;
            const ctx = highResCanvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(canvas, 0, 0, 2048, 2048);
            
            highResCanvas.toBlob(function(blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `qr-photo-${photoId}-2048.png`;
                a.click();
                URL.revokeObjectURL(url);
            });
        }
    }
}

function uploadAnother() {
    // Hide success section
    document.getElementById('successSection').classList.remove('active');
    
    // Show upload section
    document.getElementById('uploadSection').classList.add('active');
    
    // Reset form
    resetForm();
    
    // Increment photo ID
    const photoIdInput = document.getElementById('photoId');
    photoIdInput.value = parseInt(photoIdInput.value) + 1;
    document.getElementById('photoIdPreview').textContent = photoIdInput.value;
}

// Check authentication on page load
window.addEventListener('load', () => {
    if (isAuthenticated) {
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('uploadSection').classList.add('active');
    }
});
