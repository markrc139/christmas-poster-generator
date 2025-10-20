export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Starting generation');
    
    const body = req.body;
    const movieTitle = body.movieTitle;
    const christmasDrink = body.christmasDrink;
    const treeDecorations = body.treeDecorations;
    const christmasDinner = body.christmasDinner;
    const photo1 = body.photo1;
    const photo2 = body.photo2;

    if (!movieTitle || !christmasDrink || !treeDecorations || !christmasDinner) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const prompt = `A cozy Christmas movie poster in the style of a romantic holiday film. The scene shows a warm, inviting living room with a crackling fireplace in the background. On a beautifully set dinner table in the foreground, there is ${christmasDinner}. A decorated Christmas tree stands nearby with ${treeDecorations}. On a side table, there is ${christmasDrink}. The movie title "${movieTitle}" appears at the top in elegant, festive typography. The overall atmosphere is warm, romantic, and festive with soft lighting from the fireplace and Christmas lights. Cinematic composition, professional movie poster design, high quality, photorealistic.`;

    const apiKey = process.env.FAL_KEY;
    
    const payload = {
      prompt: prompt,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      output_format: "png",
      aspect_ratio: "2:3"
    };

    if (photo1 || photo2) {
      payload.image_url = photo1 || photo2;
    }

    console.log('Calling Fal.ai queue');

    const falResponse = await fetch('https://queue.fal.run/fal-ai/flux-pro', {
      method: 'POST',
      headers: {
        'Authorization': 'Key ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log('Response status:', falResponse.status);

    if (!falResponse.ok) {
      const errorText = await falResponse.text();
      console.error('Fal error:', errorText);
      return res.status(500).json({ error: 'Fal.ai error', details: errorText });
    }

    const falData = await falResponse.json();
    console.log('Response data:', JSON.stringify(falData).substring(0, 500));

    const requestId = falData.request_id || falData.id || falData.inference_id;

    if (!requestId) {
      console.error('No request ID in response');
      return res.status(500).json({ error: 'No request ID from Fal.ai' });
    }

    console.log('Success, ID:', requestId);

    return res.status(200).json({
      success: true,
      requestId: requestId,
      message: 'Started'
    });

  } catch (error) {
    console.error('Catch error:', error.message);
    return res.status(500).json({ 
      error: 'Failed',
      details: error.message
    });
  }
}
