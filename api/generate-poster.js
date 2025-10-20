export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('Generate poster function started');

  try {
    const { movieTitle, christmasDrink, treeDecorations, christmasDinner, photo1, photo2 } = req.body;

    // Validate required fields
    if (!movieTitle || !christmasDrink || !treeDecorations || !christmasDinner) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Build the prompt
    const prompt = `A cozy Christmas movie poster in the style of a romantic holiday film. The scene shows a warm, inviting living room with a crackling fireplace in the background. On a beautifully set dinner table in the foreground, there is ${christmasDinner}. A decorated Christmas tree stands nearby with ${treeDecorations}. On a side table, there is ${christmasDrink}. The movie title "${movieTitle}" appears at the top in elegant, festive typography. The overall atmosphere is warm, romantic, and festive with soft lighting from the fireplace and Christmas lights. Cinematic composition, professional movie poster design, high quality, photorealistic.`;

    console.log('Calling Fal.ai API');

    const apiKey = process.env.FAL_KEY;
    
    if (!apiKey) {
      throw new Error('FAL_KEY not configured');
    }

    // Build payload
    const payload = {
      prompt: prompt,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      enable_safety_checker: true,
      output_format: "png",
      aspect_ratio: "2:3"
    };

    // Add photo if provided
    if (photo1 || photo2) {
      payload.image_url = photo1 || photo2;
    }

    // Call Fal.ai
    const response = await fetch('https://fal.run/fal-ai/flux-pro', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Fal.ai error:', response.status, errorText);
      throw new Error(`Fal.ai API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Job submitted, request ID:', data.request_id);

    return res.status(200).json({
      success: true,
      requestId: data.request_id,
      message: 'Generation started'
    });

  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ 
      error: 'Failed to start poster generation',
      details: error.message
    });
  }
}
