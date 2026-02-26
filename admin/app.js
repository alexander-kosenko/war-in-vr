// Configuration
const CONFIG = {
    // Пароль для доступу до адмін панелі - ЗМІНІТЬ ЦЕ!
    ADMIN_PASSWORD: 'war-in-vr-2024',
    
    // Cloudflare R2 налаштування
    R2_ENDPOINT: 'https://61c36404c5fefc47469062825042a5d9.r2.cloudflarestorage.com',
    R2_BUCKET: 'warinvr-panoramas',
    
    // ⚠️ УВАГА: Не зберігайте credentials в клієнтському коді!
    // Для production використовуйте Cloudflare Worker або AWS CLI
    // Зараз файли завантажуються локально для безпеки
    
    // Public URL для доступу до файлів
    PUBLIC_URL: 'https://pub-21040fd818d4437484f8a3c1ca05743a.r2.dev'
};

let selectedFile = null;
let isAuthenticated = false;

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

    const sceneId = document.getElementById('sceneSelect').value;
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
        await uploadToR2(sceneId, {
            mobile: mobileBlob,
            desktop: desktopBlob,
            vr: vrBlob
        });

        updateProgress(100, 'Готово! ✓');
        showAlert(`Сцена ${sceneId} успішно оновлена!`, 'success');
        
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
    // ВАЖЛИВО: Ця функція потребує налаштування Cloudflare R2 credentials
    // Після створення R2 bucket, замініть цю функцію на реальний upload
    
    // Для тестування - симуляція завантаження
    console.log('Uploading to R2:', {
        sceneId,
        mobile: blobs.mobile.size,
        desktop: blobs.desktop.size,
        vr: blobs.vr.size
    });

    // TODO: Реалізувати реальний upload після налаштування R2
    // Варіанти:
    // 1. Використати AWS SDK для S3 (R2 S3-compatible)
    // 2. Використати Cloudflare Workers для проксі-upload
    // 3. Використати presigned URLs
    
    await new Promise(resolve => setTimeout(resolve, 2000)); // Симуляція
    
    // Тимчасово: зберігаємо локально для тестування
    downloadBlob(blobs.mobile, `scene-${sceneId}-mobile.webp`);
    downloadBlob(blobs.desktop, `scene-${sceneId}-desktop.webp`);
    downloadBlob(blobs.vr, `scene-${sceneId}-vr.jpg`);
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

// Check authentication on page load
window.addEventListener('load', () => {
    if (isAuthenticated) {
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('uploadSection').classList.add('active');
    }
});
