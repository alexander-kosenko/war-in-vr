// Cloudflare Worker для безпечного upload/delete в R2
// Auth: ADMIN_SECRET (Cloudflare secret, set via: wrangler secret put ADMIN_SECRET)
// Deploy: cd worker && wrangler deploy

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

// ── main handler ───────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = (origin === ALLOWED_ORIGIN || origin.startsWith('http://localhost')) ? origin : ALLOWED_ORIGIN;

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ── GET /photos → scan R2 bucket and return actual list ─────────────────
    if (request.method === 'GET') {
      try {
        const bucket = env.R2_BUCKET;
        const listed = await bucket.list();
        
        // Extract photo IDs from paths like "1/picture/1.jpg", "2/picture/1.jpg"
        const photoIds = new Set();
        for (const obj of listed.objects) {
          const match = obj.key.match(/^(\d+)\/picture\/1\.jpg$/);
          if (match) {
            photoIds.add(Number(match[1]));
          }
        }
        
        const sorted = Array.from(photoIds).sort((a, b) => a - b);
        return new Response(JSON.stringify({ photos: sorted }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('GET /photos error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
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

