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

  try {
    const { movieTitle, christmasDrink, treeDecorations, christmasDinner, photo1, photo2 } = req.body;

    // Validate required fields
    if (!movieTitle || !christmasDrink || !treeDecorations || !christmasDinner) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if at least one photo is provided
    if (!photo1 && !photo2) {
      return res.status(400).json({ error: 'At least one photo is required' });
    }

    // Build the prompt for the movie poster
    const prompt = `A cozy Christmas movie poster in the style of a romantic holiday film. The scene shows a warm, inviting living room with a crackling fireplace in the background. On a beautifully set dinner table in the foreground, there is ${christmasDinner}. A decorated Christmas tree stands nearby with ${treeDecorations}. On a side table, there is ${christmasDrink}. The movie title "${movieTitle}" appears at the top in elegant, festive typography. The overall atmosphere is warm, romantic, and festive with soft lighting from the fireplace and Christmas lights. Cinematic composition, professional movie poster design, high quality, photorealistic.`;

    // Prepare images array
    const images = [];
    if (photo1) images.push(photo1);
    if (photo2) images.push(photo2);

    console.log('Starting image generation with Flux Kontext Pro...');
    console.log('Number of reference images:', images.length);

    // Call Fal.ai REST API directly
    const apiKey = process.env.FAL_KEY;
    
    if (!apiKey) {
      throw new Error('FAL_KEY not configured');
    }

    const response = await fetch('https://queue.fal.run/fal-ai/flux-kontext-pro', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: prompt,
        images: images,
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
        enable_safety_checker: true,
        output_format: "png",
        image_size: {
          width: 768,
          height: 1024
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Fal.ai API error:', errorText);
      throw new Error(`Fal.ai API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Job submitted successfully');
    console.log('Request ID:', data.request_id);

    // Return the request_id immediately
    return res.status(200).json({
      success: true,
      requestId: data.request_id,
      message: 'Generation started'
    });

  } catch (error) {
    console.error('Error starting generation:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ 
      error: 'Failed to start poster generation',
      details: error.message 
    });
  }
}
