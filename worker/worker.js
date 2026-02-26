// Cloudflare Worker для безпечного upload в R2
// Deploy: wrangler deploy

export default {
  async fetch(request, env) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only accept POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { 
        status: 405,
        headers: corsHeaders 
      });
    }

    try {
      const formData = await request.formData();
      
      // Check password
      const password = formData.get('password');
      if (password !== env.ADMIN_PASSWORD) {
        return new Response(JSON.stringify({ 
          error: 'Невірний пароль' 
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const sceneId = formData.get('sceneId');
      const mobileFile = formData.get('mobile');
      const desktopFile = formData.get('desktop');
      const vrFile = formData.get('vr');

      if (!sceneId || !mobileFile || !desktopFile || !vrFile) {
        return new Response(JSON.stringify({ 
          error: 'Відсутні необхідні файли' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Upload to R2
      const bucket = env.R2_BUCKET;
      
      await bucket.put(`${sceneId}/picture/mobile.webp`, mobileFile);
      await bucket.put(`${sceneId}/picture/desktop.webp`, desktopFile);
      await bucket.put(`${sceneId}/picture/1.jpg`, vrFile);

      return new Response(JSON.stringify({
        success: true,
        message: `Сцена ${sceneId} успішно завантажена!`,
        urls: {
          vr: `${env.PUBLIC_URL}/${sceneId}/picture/1.jpg`,
          desktop: `${env.PUBLIC_URL}/${sceneId}/picture/desktop.webp`,
          mobile: `${env.PUBLIC_URL}/${sceneId}/picture/mobile.webp`
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
