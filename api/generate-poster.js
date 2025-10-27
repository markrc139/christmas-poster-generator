export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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

    // Count people for prompt
    const numPeople = (photo1 ? 1 : 0) + (photo2 ? 1 : 0);
    const peopleText = numPeople === 2 
      ? 'A romantic couple, man and woman, standing together' 
      : numPeople === 1 
      ? 'A person standing' 
      : 'An empty cozy';

    // Build the prompt for FLUX Pro
    const prompt = `A cozy Christmas movie poster in the style of a romantic holiday film. ${peopleText} in a warm, inviting living room with a crackling fireplace in the background. On a beautifully set dinner table in the foreground, there is ${christmasDinner}. A decorated Christmas tree stands nearby with ${treeDecorations}. On a side table, there is ${christmasDrink}. The movie title "${movieTitle}" appears at the top in elegant, festive typography. The overall atmosphere is warm, romantic, and festive with soft lighting from the fireplace and Christmas lights. Cinematic composition, professional movie poster design, high quality, photorealistic.`;

    console.log('Calling Fal.ai FLUX Pro API');

    const apiKey = process.env.FAL_KEY;
    
    if (!apiKey) {
      throw new Error('FAL_KEY not configured');
    }

    const payload = {
      prompt: prompt,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      output_format: "png",
      aspect_ratio: "2:3"
    };

    // Add photo reference if provided (helps with style guidance)
    if (photo1 || photo2) {
      payload.image_url = photo1 || photo2;
      payload.image_prompt_strength = 0.1; // Low strength for style reference only
    }

    console.log('Submitting to FLUX Pro queue');

    const falResponse = await fetch('https://queue.fal.run/fal-ai/flux-pro', {
      method: 'POST',
      headers: {
        'Authorization': 'Key ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log('FLUX Pro response status:', falResponse.status);

    if (!falResponse.ok) {
      const errorText = await falResponse.text();
      console.error('Fal.ai error:', errorText);
      return res.status(500).json({ error: 'Fal.ai error', details: errorText });
    }

    const falData = await falResponse.json();
    console.log('Response data:', JSON.stringify(falData).substring(0, 500));

    // Extract request ID from various possible response formats
    const requestId = falData.request_id || falData.id || falData.inference_id;

    if (!requestId) {
      console.error('No request ID found in response');
      return res.status(500).json({ error: 'No request ID from Fal.ai' });
    }

    console.log('Generation started successfully, request ID:', requestId);

    return res.status(200).json({
      success: true,
      requestId: requestId,
      message: 'Poster generation started'
    });

  } catch (error) {
    console.error('Error in generate-poster:', error.message);
    return res.status(500).json({ 
      error: 'Failed to start generation',
      details: error.message
    });
  }
}
