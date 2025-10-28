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

    // Count people and build detailed description
    const numPeople = (photo1 ? 1 : 0) + (photo2 ? 1 : 0);
    
    let peopleDescription = '';
    if (numPeople === 0) {
      peopleDescription = 'An empty, cozy living room decorated for Christmas';
    } else if (numPeople === 1) {
      peopleDescription = 'A person standing prominently in the center foreground, facing the camera directly with a warm smile. Full body visible from head to toe, positioned as the main focal point of the scene';
    } else {
      peopleDescription = 'Two people standing together prominently in the center foreground, both facing the camera directly with warm smiles, positioned side by side. Both full bodies visible from head to toe, positioned as the main focal points of the scene';
    }

    // Build the improved prompt with emphasis on portrait orientation and movie poster style
    const prompt = `A professional Christmas romantic comedy movie poster in portrait orientation (2:3 aspect ratio). ${peopleDescription}, positioned in the center-front of a beautifully decorated, warm, inviting living room. 

Behind them: a crackling fireplace with stockings hung, a gorgeously decorated Christmas tree adorned with ${treeDecorations}, warm ambient lighting from Christmas lights creating a cozy glow.

In the foreground: an elegantly set dinner table displaying ${christmasDinner}, and on a nearby side table sits ${christmasDrink}.

At the top of the poster in elegant, festive holiday typography: "${movieTitle}"

Style: Professional movie poster composition, cinematic lighting, warm and romantic holiday atmosphere, Hallmark Christmas movie aesthetic, people are the clear protagonists facing camera, portrait orientation, high quality, photorealistic. The people should be facing forward toward the camera, fully visible, positioned prominently as the stars of this romantic holiday film.`;

    console.log('Prompt created, calling Fal.ai FLUX Pro API');
    console.log('Number of people in scene:', numPeople);

    const apiKey = process.env.FAL_KEY;
    
    if (!apiKey) {
      throw new Error('FAL_KEY not configured');
    }

    const payload = {
      prompt: prompt,
      num_inference_steps: 30,
      guidance_scale: 4.0,
      num_images: 1,
      output_format: "png",
      aspect_ratio: "2:3",
      safety_tolerance: "2"
    };

    // Don't use image_url reference - it can confuse the generation
    // Let FLUX Pro generate the scene from scratch, then we'll face swap

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
      message: 'Poster generation started',
      numPeople: numPeople
    });

  } catch (error) {
    console.error('Error in generate-poster:', error.message);
    return res.status(500).json({ 
      error: 'Failed to start generation',
      details: error.message
    });
  }
}
