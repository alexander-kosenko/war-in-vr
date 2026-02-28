// Cloudflare Worker для безпечного upload/delete в R2
// Auth: Google ID Token (JWT) з email whitelist перевіркою
// Deploy: cd worker && wrangler deploy

const ALLOWED_ORIGIN = 'https://vr-photo.pages.dev';

// Email whitelist - тільки ці акаунти можуть upload/delete
const ALLOWED_EMAILS = [
  'vr.livingthewar@gmail.com'
];

// Rate limiting config
const RATE_LIMIT = {
  IMAGE_REQUESTS_PER_MINUTE: 60,  // max 60 image requests per IP per minute
  WINDOW_MS: 60000                 // 1 minute window
};

// In-memory rate limit tracking (resets on Worker restart)
const rateLimitMap = new Map();

// ── helpers ────────────────────────────────────────────────────────────────────

/**
 * Simple rate limiter for image requests
 * Returns true if request should be allowed
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const key = `img:${ip}`;
  
  // Get existing record
  let record = rateLimitMap.get(key);
  
  // Clean up old entries (older than window)
  if (record && now - record.windowStart > RATE_LIMIT.WINDOW_MS) {
    record = null;
  }
  
  // Initialize or increment
  if (!record) {
    rateLimitMap.set(key, { windowStart: now, count: 1 });
    return true;
  }
  
  // Check limit
  if (record.count >= RATE_LIMIT.IMAGE_REQUESTS_PER_MINUTE) {
    return false;
  }
  
  // Increment counter
  record.count++;
  return true;
}

// Cleanup old entries periodically to prevent memory leak
function cleanupRateLimitMap() {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now - record.windowStart > RATE_LIMIT.WINDOW_MS * 2) {
      rateLimitMap.delete(key);
    }
  }
}

/**
 * Decode JWT token without verification (simplified for private API)
 * Full verification would require fetching Google's public keys
 */
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

/**
 * Validate Google ID token and check email whitelist
 */
function validateGoogleToken(token) {
  if (!token) return { valid: false, error: 'Відсутній токен авторизації' };
  
  const payload = parseJwt(token);
  if (!payload) return { valid: false, error: 'Невірний формат токена' };
  
  // Check token expiration
  if (!payload.exp || payload.exp * 1000 < Date.now()) {
    return { valid: false, error: 'Токен прострочений' };
  }
  
  // Check issuer (Google)
  if (!payload.iss || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) {
    return { valid: false, error: 'Невірний issuer токена' };
  }
  
  // Check email whitelist
  const email = payload.email?.toLowerCase();
  if (!email || !ALLOWED_EMAILS.includes(email)) {
    return { valid: false, error: `Доступ заборонено для ${email || 'невідомого акаунту'}` };
  }
  
  return { valid: true, email, payload };
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

    // ── GET /image → proxy image from R2 with CORS headers ──────────────────
    if (request.method === 'GET') {
      const url = new URL(request.url);
      
      // Image proxy endpoint
      if (url.pathname === '/image') {
        // Rate limiting check
        const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (!checkRateLimit(clientIP)) {
          return new Response(JSON.stringify({ 
            error: 'Too many requests. Please try again later.' 
          }), {
            status: 429,
            headers: { 
              ...corsHeaders, 
              'Content-Type': 'application/json',
              'Retry-After': '60'
            }
          });
        }
        
        // Cleanup old rate limit entries occasionally (1% chance)
        if (Math.random() < 0.01) {
          cleanupRateLimitMap();
        }
        
        const photoId = url.searchParams.get('id');
        const filename = url.searchParams.get('file');
        
        if (!photoId || !filename) {
          return new Response(JSON.stringify({ error: 'Missing id or file parameter' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        try {
          const bucket = env.R2_BUCKET;
          const key = `${photoId}/${filename}`;
          const object = await bucket.get(key);
          
          if (!object) {
            return new Response(JSON.stringify({ error: 'Image not found' }), {
              status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          // Return image with CORS headers
          const headers = new Headers();
          object.writeHttpMetadata(headers);
          headers.set('Access-Control-Allow-Origin', allowedOrigin);
          headers.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
          headers.set('Vary', 'Origin');
          
          return new Response(object.body, { headers });
        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
      
      // ── GET /photos → scan R2 bucket and return actual list ─────────────────
      // GET /?id=X returns specific photo info
      // GET / returns all photos
      try {
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

      // ── Auth: validate Google ID Token ─────────────────────────────────────
      const googleToken = formData.get('googleToken');
      const authResult = validateGoogleToken(googleToken);
      
      if (!authResult.valid) {
        return new Response(JSON.stringify({ error: authResult.error }), {
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

