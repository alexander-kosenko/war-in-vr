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
    // GET /?id=X returns specific photo info
    // GET / returns all photos
    if (request.method === 'GET') {
      try {
        const url = new URL(request.url);
        const photoId = url.searchParams.get('id');
        const bucket = env.R2_BUCKET;
        
        // Single photo query
        if (photoId) {
          const prefix = `${photoId}/`;
          const listed = await bucket.list({ prefix, limit: 1 });
          
          if (listed.objects.length > 0) {
            const match = listed.objects[0].key.match(/^(\d+)\/(.+)$/);
            if (match) {
              return new Response(JSON.stringify({ 
                id: Number(match[1]), 
                filename: match[2] 
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }
          }
          
          return new Response(JSON.stringify({ error: 'Photo not found' }), {
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // All photos list
        const listed = await bucket.list();
        
        // Extract photo IDs and filenames from paths like "1/photo.jpg", "2/panorama.jpg"
        const photos = [];
        const seenIds = new Set();
        
        for (const obj of listed.objects) {
          const match = obj.key.match(/^(\d+)\/(.+)$/);
          if (match && !seenIds.has(match[1])) {
            seenIds.add(match[1]);
            photos.push({
              id: Number(match[1]),
              filename: match[2]
            });
          }
        }
        
        photos.sort((a, b) => a.id - b.id);
        return new Response(JSON.stringify({ photos }), {
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

        // List all files in the scene directory and delete them
        const prefix = `${sceneId}/`;
        const listed = await bucket.list({ prefix });
        await Promise.all(listed.objects.map(obj => bucket.delete(obj.key)));

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

      // Use original filename
      const filename = file.name || '1.jpg';
      const key = `${sceneId}/${filename}`;

      await bucket.put(key, file, {
        httpMetadata: { contentType: file.type || 'image/jpeg' }
      });

      return new Response(JSON.stringify({
        success: true,
        message: `Фото ${sceneId} завантажено!`,
        url: `${env.PUBLIC_URL}/${key}`,
        filename: filename
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

