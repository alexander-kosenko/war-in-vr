// Configuration
const CONFIG = {
    GOOGLE_CLIENT_ID: '160253975823-l8hvle27hsh4ohboh3pj3kn9j2ilhnm0.apps.googleusercontent.com',
    ADMIN_SECRET: 'fedf785341de1f3f34c7d702fc7764f1a2917947a0537bcb',
    UPLOAD_MODE: 'WORKER',
    WORKER_URL: 'https://war-in-vr-upload.vr-livingthewar.workers.dev',
    R2_PUBLIC_URL: 'https://pub-21040fd818d4437484f8a3c1ca05743a.r2.dev',
    SITE_URL: window.location.origin
};

let selectedFile = null;
let selectedFiles = []; // Array of { file, id }
let uploadedPhotos = [];
let currentCredential = null; // Google ID token

// ─── Auth (Google OAuth) ──────────────────────────────────────────────────────
const SESSION_KEY = 'war_vr_admin_session';

function initGoogleAuth() {
    if (typeof google === 'undefined') {
        setTimeout(initGoogleAuth, 200);
        return;
    }

    google.accounts.id.initialize({
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        callback: onGoogleSignIn,
        auto_select: false,          // не чіпаємо FedCM автоматично
        cancel_on_tap_outside: false,
        use_fedcm_for_prompt: false, // вимкнути FedCM (уникає AbortError + COOP)
    });

    // Якщо є збережена сесія — відразу входимо без Google-промпту
    const saved = sessionLoad();
    if (saved && saved.credential) {
        try {
            const p = parseJwt(saved.credential);
            if (p.exp * 1000 > Date.now()) {
                currentCredential = saved.credential;
                showMain(saved.name, saved.email);
                return;
            }
        } catch {}
        // Токен прострочений — очищаємо, показуємо кнопку (без prompt)
        sessionClear();
    }

    google.accounts.id.renderButton(
        document.getElementById('googleSignInBtn'),
        { theme: 'filled_black', size: 'large', shape: 'rectangular', width: 280 }
    );
    // Не викликаємо prompt() — уникаємо FedCM throttle/AbortError
}

function onGoogleSignIn(response) {
    currentCredential = response.credential;
    const payload = parseJwt(currentCredential);
    sessionSave({ email: payload.email, name: payload.name, credential: currentCredential });
    showMain(payload.name, payload.email);
}

function showMain(name, email) {
    document.getElementById('authScreen').style.display = 'none';
    const ms = document.getElementById('mainSection');
    ms.style.display = 'block';
    const logo = ms.querySelector('.top-bar-logo');
    if (logo) logo.title = email;
    loadPhotos();
}

function logout() {
    sessionClear();
    currentCredential = null;
    if (typeof google !== 'undefined') google.accounts.id.disableAutoSelect();
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('mainSection').style.display = 'none';
    hideAlert();
    // Re-render Google button
    if (typeof google !== 'undefined') {
        google.accounts.id.renderButton(
            document.getElementById('googleSignInBtn'),
            { theme: 'filled_black', size: 'large', shape: 'rectangular', width: 280 }
        );
    }
}

// ─── Session helpers ──────────────────────────────────────────────────────────
function sessionSave(data) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch {}
}
function sessionLoad() {
    try { const r = localStorage.getItem(SESSION_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function sessionClear() {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
}

function parseJwt(token) {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
}

// ─── LocalStorage helpers ────────────────────────────────────────────────────
const LS_KEY = 'war_in_vr_photos';

function lsLoad() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? JSON.parse(raw).map(Number) : null;
    } catch { return null; }
}

function lsSave(list) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch {}
}

// ─── Load photos ─────────────────────────────────────────────────────────────

async function loadPhotos() {
    const gallery = document.getElementById('gallery');
    if (gallery) gallery.innerHTML = '<p class="gallery-empty">Завантаження…</p>';
    try {
        if (CONFIG.UPLOAD_MODE === 'LOCAL') {
            // In LOCAL mode: start from static photos.json, then overlay localStorage edits
            const resp = await fetch('/photos.json?t=' + Date.now());
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            const base = (data.photos || []).map(Number);
            const saved = lsLoad();
            uploadedPhotos = saved !== null ? saved : base;
        } else {
            // WORKER mode: запитуємо актуальний список фото з R2 через worker
            const resp = await fetch(CONFIG.WORKER_URL, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (resp.ok) {
                const data = await resp.json();
                uploadedPhotos = (data.photos || []).map(Number);
                console.log('✓ Актуальні фото з R2:', uploadedPhotos.length);
            } else {
                throw new Error(`Помилка отримання списку фото: HTTP ${resp.status}`);
            }
        }
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
        const badge = document.getElementById('galleryCount');
        if (badge) badge.textContent = '0';
        return;
    }

    gallery.innerHTML = '';
    const sorted = [...uploadedPhotos].sort((a, b) => a - b);
    sorted.forEach(id => {
        try {
            gallery.appendChild(createPhotoCard(id));
        } catch (e) {
            console.error('Card error #' + id, e);
        }
    });
    const badge = document.getElementById('galleryCount');
    if (badge) badge.textContent = sorted.length;
}

function createPhotoCard(id) {
    const photoUrl = photoUrlFor(id);
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.id = `card-${id}`;
    const r2Url = `${CONFIG.R2_PUBLIC_URL}/${id}/picture/1.jpg`;
    card.innerHTML = `
        <div class="card-photo-wrap">
            <img class="card-photo" src="${r2Url}" alt="Photo #${id}" loading="lazy">
        </div>
        <div class="card-right">
            <div class="card-info">
                <div class="card-id">Фото #${id}</div>
                <div class="card-url">${photoUrl}</div>
                <div class="card-btns">
                    <button class="cbtn cbtn-replace" onclick="replacePhoto(${id})">&#9998; Замінити</button>
                    <button class="cbtn cbtn-delete" onclick="confirmDeletePhoto(${id})">✕ Видалити</button>
                </div>
            </div>
            <div class="card-qr-col">
                <img class="card-qr" id="qr-preview-${id}" alt="QR #${id}">
                <div class="qr-dl-row">
                    <button class="cbtn cbtn-outline" onclick="downloadQRForPhoto(${id}, 'png')">PNG</button>
                    <button class="cbtn cbtn-outline" onclick="downloadQRForPhoto(${id}, 'svg')">SVG</button>
                </div>
            </div>
        </div>
    `;

    // Render QR preview — larger margin (5 cells = thick white border)
    requestAnimationFrame(() => {
        try {
            const img = document.getElementById(`qr-preview-${id}`);
            if (img) img.src = makeQRDataURL(photoUrl, 3, 5);
        } catch(e) { console.error('QR preview error', e); }
    });

    return card;
}

// ─── Delete & Replace ────────────────────────────────────────────────────────

let replaceTargetId = null;
let replaceFile = null;

function replacePhoto(id) {
    replaceTargetId = id;
    replaceFile = null;
    document.getElementById('replaceModalSubtitle').textContent = `Фото #${id}`;
    document.getElementById('replaceFileInfo').classList.remove('active');
    document.getElementById('replaceFileInput').value = '';
    document.getElementById('replaceConfirmBtn').disabled = true;
    openModal('replaceModal');
}

function handleReplaceFileSelect(event) {
    const file = event.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    replaceFile = file;
    document.getElementById('replaceFileName').textContent = file.name;
    document.getElementById('replaceFileSize').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
    document.getElementById('replaceFileInfo').classList.add('active');
    document.getElementById('replaceConfirmBtn').disabled = false;
}

async function confirmReplace() {
    if (!replaceFile || !replaceTargetId) return;
    const btn = document.getElementById('replaceConfirmBtn');
    btn.disabled = true;
    btn.textContent = 'Завантаження…';

    try {
        if (CONFIG.UPLOAD_MODE === 'WORKER') {
            if (!CONFIG.WORKER_URL) throw new Error('WORKER_URL не налаштований!');
            const formData = new FormData();
            formData.append('apiSecret', CONFIG.ADMIN_SECRET);
            formData.append('action', 'upload');
            formData.append('sceneId', String(replaceTargetId));
            formData.append('file', replaceFile, `${replaceTargetId}.jpg`);
            const response = await fetch(CONFIG.WORKER_URL, { method: 'POST', body: formData });
            if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error || `HTTP ${response.status}`); }
        } else {
            triggerDownload(replaceFile, `photo-${replaceTargetId}.jpg`);
            await new Promise(r => setTimeout(r, 400));
        }
        closeModal('replaceModal');
        showAlert(`Фото #${replaceTargetId} замінено!`, 'success');
    } catch (e) {
        showAlert('Помилка: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Замінити';
    }
}

function openModal(id) {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'flex'; el.classList.add('open'); }
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.classList.remove('open'); }
}

function confirmDeletePhoto(id) {
    document.getElementById('confirmText').textContent = `Фото #${id}`;
    document.getElementById('confirmOk').onclick = () => {
        closeModal('confirmModal');
        deletePhoto(id);
    };
    openModal('confirmModal');
}

async function deletePhoto(id) {
    const card = document.getElementById(`card-${id}`);
    if (card) {
        card.style.opacity = '0.4';
        card.style.pointerEvents = 'none';
    }

    if (CONFIG.UPLOAD_MODE === 'WORKER' && CONFIG.WORKER_URL) {
        try {
            const formData = new FormData();
            formData.append('apiSecret', CONFIG.ADMIN_SECRET);
            formData.append('action', 'delete');
            formData.append('sceneId', String(id));

            const resp = await fetch(CONFIG.WORKER_URL, { method: 'POST', body: formData });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${resp.status}`);
            }
        } catch (e) {
            showAlert('Помилка видалення: ' + e.message, 'error');
            if (card) { card.style.opacity = ''; card.style.pointerEvents = ''; }
            return;
        }
    }

    // Remove from list and re-render
    uploadedPhotos = uploadedPhotos.filter(p => p !== id);
    if (CONFIG.UPLOAD_MODE === 'LOCAL') lsSave([...uploadedPhotos]);
    renderGallery();
    showAlert(`Фото #${id} видалено${CONFIG.UPLOAD_MODE !== 'WORKER' ? ' (з інтерфейсу; видаліть файли з R2 вручну)' : ''}!`, 'success');
}

// ─── QR helpers ───────────────────────────────────────────────────────────────

function photoUrlFor(id) {
    return `${CONFIG.SITE_URL}/?id=${id}`;
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
            const dataUrl = makeQRDataURL(url, 14, 5); // ~14px/cell + 5-cell white border
            triggerDownload(dataURLtoBlob(dataUrl), `qr-photo-${id}.png`);
        } catch (e) {
            console.error(e);
            showAlert('Не вдалося згенерувати PNG', 'error');
        }
    } else if (format === 'svg') {
        try {
            const svg = makeQR(url).createSvgTag(10, 5);
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
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    // Validate all files are images
    const invalidFiles = files.filter(f => !f.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
        showAlert('Всі файли повинні бути зображеннями', 'error');
        return;
    }

    // Single file mode (backward compatibility)
    if (files.length === 1) {
        setSelectedFile(files[0]);
        return;
    }

    // Multiple files mode
    const startId = parseInt(document.getElementById('photoId').value);
    selectedFiles = files.map((file, index) => ({
        file,
        id: startId + index
    }));

    renderFileList();
    document.getElementById('uploadBtn').disabled = false;
    document.getElementById('uploadBtn').textContent = `Завантажити ${files.length} фото`;
}

function setSelectedFile(file) {
    if (!file || !file.type.startsWith('image/')) {
        showAlert('Будь ласка, оберіть файл зображення', 'error');
        return;
    }
    selectedFile = file;
    selectedFiles = [];
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
    document.getElementById('fileInfo').classList.add('active');
    document.getElementById('fileList').classList.remove('active');
    document.getElementById('uploadBtn').disabled = false;
    document.getElementById('uploadBtn').textContent = 'Завантажити';
}

function renderFileList() {
    const container = document.getElementById('fileList');
    container.innerHTML = '';
    
    if (selectedFiles.length === 0) {
        container.classList.remove('active');
        document.getElementById('fileInfo').classList.remove('active');
        return;
    }

    document.getElementById('fileInfo').classList.remove('active');
    container.classList.add('active');

    selectedFiles.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.innerHTML = `
            <div class="file-item-icon">📷</div>
            <div class="file-item-info">
                <div class="file-item-name">${item.file.name}</div>
                <div class="file-item-meta">
                    <span class="file-item-id">ID: ${item.id}</span>
                    <span>${(item.file.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
            </div>
            <button class="file-item-remove" onclick="removeFileFromList(${index})" title="Видалити">×</button>
        `;
        container.appendChild(div);
    });
}

function removeFileFromList(index) {
    selectedFiles.splice(index, 1);
    if (selectedFiles.length === 0) {
        document.getElementById('uploadBtn').disabled = true;
        document.getElementById('uploadBtn').textContent = 'Завантажити';
    } else {
        document.getElementById('uploadBtn').textContent = `Завантажити ${selectedFiles.length} фото`;
    }
    renderFileList();
}

// ─── Upload ───────────────────────────────────────────────────────────────────

async function processAndUpload() {
    // Multiple files mode
    if (selectedFiles.length > 0) {
        await uploadMultipleFiles();
        return;
    }

    // Single file mode
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
        await uploadSingleFile(selectedFile, photoId);
        
        // Add to gallery if not already present
        if (!uploadedPhotos.includes(photoId)) {
            uploadedPhotos.push(photoId);
            if (CONFIG.UPLOAD_MODE === 'LOCAL') lsSave([...uploadedPhotos]);
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

async function uploadSingleFile(file, photoId) {
    if (CONFIG.UPLOAD_MODE === 'WORKER') {
        if (!CONFIG.WORKER_URL) throw new Error('WORKER_URL не налаштований!');

        const formData = new FormData();
        formData.append('apiSecret', CONFIG.ADMIN_SECRET);
        formData.append('action', 'upload');
        formData.append('sceneId', String(photoId));
        formData.append('file', file, `${photoId}.jpg`);

        const response = await fetch(CONFIG.WORKER_URL, { method: 'POST', body: formData });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${response.status}`);
        }
    } else {
        // LOCAL mode — download original file to computer
        triggerDownload(file, `photo-${photoId}.jpg`);
        await new Promise(r => setTimeout(r, 400));
    }
}

async function uploadMultipleFiles() {
    const uploadBtn = document.getElementById('uploadBtn');
    const progressContainer = document.getElementById('uploadProgress');
    
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Завантаження…';
    progressContainer.innerHTML = '';
    progressContainer.classList.add('active');
    hideAlert();

    const results = {
        success: [],
        failed: []
    };

    // Create progress items
    const progressItems = selectedFiles.map(item => {
        const div = document.createElement('div');
        div.className = 'progress-item';
        div.id = `progress-${item.id}`;
        div.innerHTML = `
            <div class="progress-item-header">
                <div class="progress-item-title">Фото #${item.id} - ${item.file.name}</div>
                <div class="progress-item-status uploading">Завантаження...</div>
            </div>
            <div class="progress-bar">
                <div class="progress-bar-fill" style="width: 0%"></div>
            </div>
        `;
        progressContainer.appendChild(div);
        return { id: item.id, div };
    });

    // Upload files sequentially
    for (let i = 0; i < selectedFiles.length; i++) {
        const item = selectedFiles[i];
        const progressItem = progressItems[i];
        const statusEl = progressItem.div.querySelector('.progress-item-status');
        const barEl = progressItem.div.querySelector('.progress-bar-fill');

        try {
            // Simulate progress
            barEl.style.width = '50%';
            
            await uploadSingleFile(item.file, item.id);
            
            // Success
            barEl.style.width = '100%';
            barEl.classList.add('success');
            statusEl.textContent = '✓ Завантажено';
            statusEl.className = 'progress-item-status success';
            
            results.success.push(item.id);
            
            // Add to gallery if not already present
            if (!uploadedPhotos.includes(item.id)) {
                uploadedPhotos.push(item.id);
            }

        } catch (error) {
            // Error
            barEl.style.width = '100%';
            barEl.classList.add('error');
            statusEl.textContent = '✗ Помилка: ' + error.message;
            statusEl.className = 'progress-item-status error';
            results.failed.push({ id: item.id, error: error.message });
        }
    }

    // Save and refresh gallery
    if (CONFIG.UPLOAD_MODE === 'LOCAL') lsSave([...uploadedPhotos]);
    renderGallery();

    // Show summary
    const successCount = results.success.length;
    const failedCount = results.failed.length;
    
    if (successCount > 0 && failedCount === 0) {
        showAlert(`✓ Всі фото успішно завантажено (${successCount})!`, 'success');
    } else if (successCount > 0 && failedCount > 0) {
        showAlert(`Завантажено ${successCount} фото, помилки: ${failedCount}`, 'error');
    } else {
        showAlert('Всі завантаження завершились помилкою', 'error');
    }

    // Reset form
    setTimeout(() => {
        resetUploadForm();
        progressContainer.classList.remove('active');
        
        // Scroll to first uploaded photo
        if (results.success.length > 0) {
            const firstId = results.success[0];
            const card = document.getElementById(`card-${firstId}`);
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 2000);

    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Завантажити';
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
    selectedFiles = [];
    document.getElementById('fileInput').value = '';
    document.getElementById('fileInfo').classList.remove('active');
    document.getElementById('fileList').classList.remove('active');
    document.getElementById('uploadBtn').disabled = true;
    document.getElementById('uploadBtn').textContent = 'Завантажити';

    // Increment photo ID to next available
    const maxId = uploadedPhotos.length > 0 ? Math.max(...uploadedPhotos) : 0;
    const photoIdInput = document.getElementById('photoId');
    photoIdInput.value = maxId + 1;
    document.getElementById('photoIdPreview').textContent = photoIdInput.value;
}

// ─── DOMContentLoaded ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
    // Ініціалізація Google OAuth
    initGoogleAuth();
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

    // Drag & drop — replace zone
    const replaceUpload = document.getElementById('replaceFileUpload');
    if (replaceUpload) {
        replaceUpload.addEventListener('dragover', (e) => {
            e.preventDefault();
            replaceUpload.classList.add('dragover');
        });
        replaceUpload.addEventListener('dragleave', () => {
            replaceUpload.classList.remove('dragover');
        });
        replaceUpload.addEventListener('drop', (e) => {
            e.preventDefault();
            replaceUpload.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (!file || !file.type.startsWith('image/')) return;
            replaceFile = file;
            document.getElementById('replaceFileName').textContent = file.name;
            document.getElementById('replaceFileSize').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
            document.getElementById('replaceFileInfo').classList.add('active');
            document.getElementById('replaceConfirmBtn').disabled = false;
        });
    }

// Enter key on password field handled by form onsubmit
});
