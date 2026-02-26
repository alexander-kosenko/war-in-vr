# 🚀 Cloudflare Worker для автоматичного upload

Цей Worker дозволяє завантажувати файли в R2 прямо з браузера (адмін панелі) безпечно.

## 📦 Що потрібно

1. ✅ Node.js встановлений (`node --version`)
2. ✅ Wrangler CLI (`npm install -g wrangler`)

## 🛠️ Налаштування (5 хвилин)

### Крок 1: Встановити Wrangler

```bash
npm install -g wrangler
```

### Крок 2: Увійти в Cloudflare

```bash
cd worker
wrangler login
```

Відкриється браузер - підтвердіть доступ.

### Крок 3: Встановити секретний пароль

```bash
wrangler secret put ADMIN_PASSWORD
```

Введіть пароль (наприклад: `war-in-vr-2024`) - він буде зберігатися безпечно в Cloudflare.

### Крок 4: Deploy Worker

```bash
wrangler deploy
```

✅ **Готово!** Отримаєте URL типу: `https://war-in-vr-upload.YOUR-SUBDOMAIN.workers.dev`

---

## 🔧 Оновлення адмін панелі

Після deploy Worker потрібно оновити `admin/app.js`:

Знайдіть функцію `uploadToR2()` (рядок ~167) і замініть на:

```javascript
async function uploadToR2(sceneId, blobs) {
    const WORKER_URL = 'https://war-in-vr-upload.YOUR-SUBDOMAIN.workers.dev';
    
    const formData = new FormData();
    formData.append('password', CONFIG.ADMIN_PASSWORD);
    formData.append('sceneId', sceneId);
    formData.append('mobile', blobs.mobile, `scene-${sceneId}-mobile.webp`);
    formData.append('desktop', blobs.desktop, `scene-${sceneId}-desktop.webp`);
    formData.append('vr', blobs.vr, `scene-${sceneId}-vr.jpg`);
    
    const response = await fetch(WORKER_URL, {
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
}
```

Замініть `YOUR-SUBDOMAIN` на ваш реальний URL Worker!

---

## 🧪 Тестування

1. Відкрийте адмін панель: https://vr-photo.pages.dev/admin/
2. Введіть пароль
3. Оберіть тестове фото
4. Натисніть "Завантажити"
5. Файли автоматично завантажаться в R2! ✅

---

## 💰 Вартість

**Worker Free Tier:**
- ✅ 100,000 requests/день безкоштовно
- ✅ 10ms CPU time безкоштовно
- ✅ Для вашого use case = $0/міс

---

## 🔄 Оновлення Worker

Після змін в `worker.js`:

```bash
cd worker
wrangler deploy
```

---

## 🐛 Troubleshooting

### Помилка: "R2_BUCKET is not defined"

Перевірте `wrangler.toml` - має бути секція `[[r2_buckets]]`

### Помилка: "Unauthorized"

Перевірте що встановили ADMIN_PASSWORD: `wrangler secret put ADMIN_PASSWORD`

### Помилка: "CORS"

Worker вже має CORS headers - якщо проблема, перевірте `Access-Control-Allow-Origin`

---

## 📞 Допомога

Детальна документація: https://developers.cloudflare.com/workers/

**Готово! Тепер адмін панель працює повністю автоматично** 🎉
