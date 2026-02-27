// Configuration
const CONFIG = {
    ADMIN_PASSWORD: 'war-in-vr-2024',
    UPLOAD_MODE: 'LOCAL', // 'LOCAL' або 'WORKER'
    WORKER_URL: '',        // для WORKER режиму
    R2_PUBLIC_URL: 'https://pub-21040fd818d4437484f8a3c1ca05743a.r2.dev',
    SITE_URL: window.location.origin
};

let selectedFile = null;
let uploadedPhotos = [];

// ─── Auth ─────────────────────────────────────────────────────────────────────

function authenticate() {
    const password = document.getElementById('password').value;

    if (password === CONFIG.ADMIN_PASSWORD) {
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('mainSection').style.display = 'block';
        loadPhotos();
    } else {
        showAlert('Невірний пароль!', 'error');
    }
}

function logout() {
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('mainSection').style.display = 'none';
    document.getElementById('password').value = '';
    hideAlert();
}

// ─── Load photos from photos.json ────────────────────────────────────────────

async function loadPhotos() {
    const gallery = document.getElementById('gallery');
    if (gallery) gallery.innerHTML = '<p class="gallery-empty">Завантаження…</p>';
    try {
        const resp = await fetch('/photos.json?t=' + Date.now());
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        uploadedPhotos = (data.photos || []).map(Number);
    } catch (e) {
        console.error('loadPhotos error:', e);
        if (gallery) gallery.innerHTML = `<p class="gallery-empty" style="color:#c62828">Помилка завантаження: ${e.message}</p>`;
        uploadedPhotos = [];
    }
    renderGallery();
}

// ─── Gallery ──────────────────────────────────────────────────────────────────

function renderGallery() {
    const gallery = document.getElementById('gallery');

    if (uploadedPhotos.length === 0) {
        gallery.innerHTML = '<p class="gallery-empty">Немає завантажених фото</p>';
        return;
    }

    gallery.innerHTML = '';
    [...uploadedPhotos].sort((a, b) => a - b).forEach(id => {
        try {
            gallery.appendChild(createPhotoCard(id));
        } catch (e) {
            console.error('Card error #' + id, e);
        }
    });
}

function createPhotoCard(id) {
    const photoUrl = photoUrlFor(id);
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.id = `card-${id}`;
    const r2Url = `${CONFIG.R2_PUBLIC_URL}/${id}/picture/1.jpg`;
    card.innerHTML = `
        <div class="card-id">#${id}</div>
        <div class="card-photo-wrap">
            <img class="card-photo" src="${r2Url}" alt="Photo #${id}" loading="lazy">
        </div>
        <div class="card-qr-wrap">
            <img class="card-qr" id="qr-preview-${id}" alt="QR #${id}">
        </div>
        <div class="card-url">${photoUrl}</div>
        <div class="card-buttons">
            <button class="btn-dl" onclick="downloadQRForPhoto(${id}, 'png')">↓ PNG</button>
            <button class="btn-dl" onclick="downloadQRForPhoto(${id}, 'svg')">↓ SVG</button>
        </div>
    `;

    // Render QR preview
    requestAnimationFrame(() => {
        try {
            const img = document.getElementById(`qr-preview-${id}`);
            if (img) img.src = makeQRDataURL(photoUrl, 4, 3);
        } catch(e) { console.error('QR preview error', e); }
    });

    return card;
}

// ─── QR helpers ───────────────────────────────────────────────────────────────

function photoUrlFor(id) {
    return `${CONFIG.SITE_URL}/photo/?id=${id}`;
}

/**
 * Creates a QR object using qrcode-generator.
 */
function makeQR(text) {
    const qr = qrcode(0, 'H');
    qr.addData(text);
    qr.make();
    return qr;
}

/**
 * Returns a PNG data URL with the given cellSize and margin (in cells).
 */
function makeQRDataURL(text, cellSize, margin) {
    return makeQR(text).createDataURL(cellSize, margin);
}

/**
 * Converts a data URL string to a Blob.
 */
function dataURLtoBlob(dataUrl) {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8 = new Uint8Array(n);
    while (n--) u8[n] = bstr.charCodeAt(n);
    return new Blob([u8], { type: mime });
}

// ─── Download QR for a specific photo ────────────────────────────────────────

async function downloadQRForPhoto(id, format) {
    if (typeof qrcode === 'undefined') {
        showAlert('Бібліотека QR-коду не завантажилася. Перезавантажте сторінку.', 'error');
        return;
    }
    const url = photoUrlFor(id);

    if (format === 'png') {
        try {
            const dataUrl = makeQRDataURL(url, 12, 4); // ~600px
            triggerDownload(dataURLtoBlob(dataUrl), `qr-photo-${id}.png`);
        } catch (e) {
            console.error(e);
            showAlert('Не вдалося згенерувати PNG', 'error');
        }
    } else if (format === 'svg') {
        try {
            const svg = makeQR(url).createSvgTag(10, 4);
            const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
            triggerDownload(blob, `qr-photo-${id}.svg`);
        } catch (e) {
            console.error(e);
            showAlert('Не вдалося згенерувати SVG', 'error');
        }
    }
}

function triggerDownload(blob, filename) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ─── File selection ───────────────────────────────────────────────────────────

function handleFileSelect(event) {
    setSelectedFile(event.target.files[0]);
}

function setSelectedFile(file) {
    if (!file || !file.type.startsWith('image/')) {
        showAlert('Будь ласка, оберіть файл зображення', 'error');
        return;
    }
    selectedFile = file;
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
    document.getElementById('fileInfo').classList.add('active');
    document.getElementById('uploadBtn').disabled = false;
}

// ─── Upload ───────────────────────────────────────────────────────────────────

async function processAndUpload() {
    if (!selectedFile) {
        showAlert('Оберіть файл для завантаження', 'error');
        return;
    }

    const photoId = parseInt(document.getElementById('photoId').value);
    if (!photoId || photoId < 1) {
        showAlert('Введіть коректний номер фото', 'error');
        return;
    }

    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Завантаження…';
    hideAlert();

    try {
        if (CONFIG.UPLOAD_MODE === 'WORKER') {
            if (!CONFIG.WORKER_URL) throw new Error('WORKER_URL не налаштований!');

            const formData = new FormData();
            formData.append('password', CONFIG.ADMIN_PASSWORD);
            formData.append('sceneId', String(photoId));
            formData.append('file', selectedFile, `${photoId}.jpg`);

            const response = await fetch(CONFIG.WORKER_URL, { method: 'POST', body: formData });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Upload failed');
            }
        } else {
            // LOCAL mode — download original file to computer
            triggerDownload(selectedFile, `photo-${photoId}.jpg`);
            await new Promise(r => setTimeout(r, 400));
        }

        // Add to gallery if not already present
        if (!uploadedPhotos.includes(photoId)) {
            uploadedPhotos.push(photoId);
            renderGallery();
        }

        showAlert(`Фото #${photoId} успішно завантажено!`, 'success');
        resetUploadForm();

        // Scroll to new card
        setTimeout(() => {
            const card = document.getElementById(`card-${photoId}`);
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);

    } catch (error) {
        showAlert('Помилка: ' + error.message, 'error');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Завантажити';
    }
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function showAlert(message, type) {
    const mainVisible = document.getElementById('mainSection').style.display === 'block';
    const id = mainVisible ? 'alertMain' : 'alert';
    const el = document.getElementById(id);
    el.textContent = message;
    el.className = 'alert alert-' + type + ' active';
}

function hideAlert() {
    ['alert', 'alertMain'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });
}

function resetUploadForm() {
    selectedFile = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('fileInfo').classList.remove('active');
    document.getElementById('uploadBtn').disabled = true;

    // Increment photo ID
    const photoIdInput = document.getElementById('photoId');
    photoIdInput.value = parseInt(photoIdInput.value) + 1;
    document.getElementById('photoIdPreview').textContent = photoIdInput.value;
}

// ─── DOMContentLoaded ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
    // Photo ID live preview
    const photoIdInput = document.getElementById('photoId');
    if (photoIdInput) {
        photoIdInput.addEventListener('input', function () {
            document.getElementById('photoIdPreview').textContent = this.value || '1';
        });
    }

    // Drag & drop
    const fileUpload = document.getElementById('fileUpload');
    if (fileUpload) {
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
            setSelectedFile(e.dataTransfer.files[0]);
        });
    }

    // Enter key on password field
    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') authenticate();
        });
    }
});
