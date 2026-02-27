// Cloudflare Worker для безпечного upload/delete в R2
// Auth: ADMIN_SECRET (Cloudflare secret, set via: wrangler secret put ADMIN_SECRET)
// Deploy: cd worker && wrangler deploy

const PHOTOS_JSON_KEY = 'photos.json';
const ALLOWED_ORIGIN = 'https://vr-photo.pages.dev';

// ── helpers ────────────────────────────────────────────────────────────────────

/**
 * Constant-time string comparison to avoid timing attacks.
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Returns the current photos list from R2.
 * R2 object exists and has items → use it.
 * R2 object doesn't exist or is empty → fall back to static site photos.json.
 */
async function getPhotosList(bucket) {
  try {
    const obj = await bucket.get(PHOTOS_JSON_KEY);
    if (obj) {
      const data = await obj.json();
      const list = (data.photos || []).map(Number).filter(n => n > 0);
      if (list.length > 0) return list;
    }
  } catch { /* ignore parse errors, fall through */ }

  // Fallback: fetch the static photos.json committed to the Pages site
  try {
    const resp = await fetch(`${ALLOWED_ORIGIN}/photos.json?t=${Date.now()}`);
    if (resp.ok) {
      const data = await resp.json();
      return (data.photos || []).map(Number).filter(n => n > 0);
    }
  } catch { /* ignore */ }

  return [];
}

async function savePhotosList(bucket, list) {
  const sorted = [...new Set(list)].filter(n => n > 0).sort((a, b) => a - b);
  const body = JSON.stringify({ photos: sorted, lastUpdated: new Date().toISOString().split('T')[0] });
  await bucket.put(PHOTOS_JSON_KEY, body, { httpMetadata: { contentType: 'application/json' } });
}

// ── main handler ───────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = (origin === ALLOWED_ORIGIN || origin.startsWith('http://localhost')) ? origin : ALLOWED_ORIGIN;

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    try {
      const formData = await request.formData();

      // ── Auth: validate ADMIN_SECRET ────────────────────────────────────────
      const apiSecret = formData.get('apiSecret');
      if (!apiSecret || !env.ADMIN_SECRET || !safeCompare(apiSecret, env.ADMIN_SECRET)) {
        return new Response(JSON.stringify({ error: 'Невірний ключ доступу' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const action = formData.get('action') || 'upload';
      const bucket = env.R2_BUCKET;

      // ── DELETE ─────────────────────────────────────────────────────────────
      if (action === 'delete') {
        const sceneId = formData.get('sceneId');
        if (!sceneId || isNaN(Number(sceneId))) {
          return new Response(JSON.stringify({ error: 'Відсутній або невірний sceneId' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Delete all known file variants for this scene
        await Promise.all([
          bucket.delete(`${sceneId}/picture/1.jpg`),
          bucket.delete(`${sceneId}/picture/mobile.webp`),
          bucket.delete(`${sceneId}/picture/desktop.webp`),
        ]);

        const list = await getPhotosList(bucket);
        await savePhotosList(bucket, list.filter(id => id !== Number(sceneId)));

        return new Response(JSON.stringify({ success: true, message: `Фото ${sceneId} видалено` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ── UPLOAD ─────────────────────────────────────────────────────────────
      const sceneId = formData.get('sceneId');
      const file = formData.get('file');

      if (!sceneId || isNaN(Number(sceneId)) || !file) {
        return new Response(JSON.stringify({ error: 'Відсутні необхідні поля (sceneId, file)' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      await bucket.put(`${sceneId}/picture/1.jpg`, file, {
        httpMetadata: { contentType: file.type || 'image/jpeg' }
      });

      const list = await getPhotosList(bucket);
      if (!list.includes(Number(sceneId))) list.push(Number(sceneId));
      await savePhotosList(bucket, list);

      return new Response(JSON.stringify({
        success: true,
        message: `Фото ${sceneId} завантажено!`,
        url: `${env.PUBLIC_URL}/${sceneId}/picture/1.jpg`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

