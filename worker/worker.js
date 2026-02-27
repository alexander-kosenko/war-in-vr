// Cloudflare Worker для безпечного upload/delete в R2
// Auth: Google ID token verification
// Deploy: cd worker && wrangler deploy

const PHOTOS_JSON_KEY = 'photos.json';
const ALLOWED_ORIGIN = 'https://vr-photo.pages.dev';

async function verifyGoogleToken(token, clientId) {
  const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
  if (!resp.ok) return null;
  const payload = await resp.json();
  // Перевіряємо що токен виданий для нашого Client ID і не прострочений
  if (payload.aud !== clientId) return null;
  if (payload.exp < Date.now() / 1000) return null;
  return payload;
}

async function getPhotosList(bucket) {
  try {
    const obj = await bucket.get(PHOTOS_JSON_KEY);
    if (!obj) return [];
    const data = await obj.json();
    return (data.photos || []).map(Number);
  } catch {
    return [];
  }
}

async function savePhotosList(bucket, list) {
  const sorted = [...new Set(list)].sort((a, b) => a - b);
  const body = JSON.stringify({ photos: sorted, lastUpdated: new Date().toISOString().split('T')[0] });
  await bucket.put(PHOTOS_JSON_KEY, body, { httpMetadata: { contentType: 'application/json' } });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = (origin === ALLOWED_ORIGIN || origin === 'http://localhost') ? origin : ALLOWED_ORIGIN;

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    try {
      const formData = await request.formData();

      // ── Auth: verify Google ID token ───────────────────────────────────────
      const googleToken = formData.get('googleToken');
      if (!googleToken) {
        return new Response(JSON.stringify({ error: 'Токен відсутній' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const payload = await verifyGoogleToken(googleToken, env.GOOGLE_CLIENT_ID);
      if (!payload) {
        return new Response(JSON.stringify({ error: 'Невалідний або прострочений токен' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const action = formData.get('action') || 'upload';
      const bucket = env.R2_BUCKET;

      // ── DELETE ──────────────────────────────────────────────────────────────
      if (action === 'delete') {
        const sceneId = formData.get('sceneId');
        if (!sceneId) {
          return new Response(JSON.stringify({ error: 'Відсутній sceneId' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

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

      // ── UPLOAD ──────────────────────────────────────────────────────────────
      const sceneId = formData.get('sceneId');
      const file = formData.get('file');

      if (!sceneId || !file) {
        return new Response(JSON.stringify({ error: 'Відсутні необхідні поля' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      await bucket.put(`${sceneId}/picture/1.jpg`, file);

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
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

