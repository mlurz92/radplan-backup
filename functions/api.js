export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Pragma, Cache-Control, Authorization",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!env.RADPLAN_KV) {
    return new Response(JSON.stringify({ error: "KV namespace binding missing" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }

  if (request.method === "GET") {
    try {
      const data = await env.RADPLAN_KV.get("RADPLAN_DATA");
      
      if (data) {
        return new Response(data, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      } else {
        return new Response(JSON.stringify({ main: {}, plans: {}, lastModified: 0 }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: "KV read error" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
  }

  if (request.method === "POST") {
    try {
      const bodyText = await request.text();
      const parsedData = JSON.parse(bodyText);
      const clientTimestamp = parseInt(parsedData.lastModified, 10) || 0;
      
      const existingRaw = await env.RADPLAN_KV.get("RADPLAN_DATA");
      if (existingRaw) {
        const existingData = JSON.parse(existingRaw);
        const serverTimestamp = parseInt(existingData.lastModified, 10) || 0;
        
        if (clientTimestamp > 0 && clientTimestamp < serverTimestamp) {
          return new Response(JSON.stringify({ error: "Conflict", latestData: existingData }), {
            status: 409,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders
            }
          });
        }
      }
      
      parsedData.lastModified = Date.now();
      
      const dataToSave = JSON.stringify(parsedData);
      await env.RADPLAN_KV.put("RADPLAN_DATA", dataToSave);
      
      return new Response(JSON.stringify({ success: true, lastModified: parsedData.lastModified }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON or KV write error" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
  }

  return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
    status: 405,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    }
  });
}
