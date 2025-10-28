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
    const { movieTitle, christmasDrink, treeDecorations, christmasDinner, photo1, photo2, gender1, gender2 } = req.body;

    // Validate required fields
    if (!movieTitle || !christmasDrink || !treeDecorations || !christmasDinner) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Count people and determine genders
    const numPeople = (photo1 ? 1 : 0) + (photo2 ? 1 : 0);
    
    console.log('Number of photos:', numPeople);
    console.log('Gender 1:', gender1);
    console.log('Gender 2:', gender2);
    
    let peopleDescription = '';
    if (numPeople === 0) {
      peopleDescription = 'An empty, cozy living room decorated for Christmas';
    } else if (numPeople === 1) {
      const gender = gender1 || 'person';
      const descriptor = gender === 'male' ? 'a handsome man' : gender === 'female' ? 'a beautiful woman' : 'a person';
      peopleDescription = `${descriptor} standing prominently in the center foreground, facing the camera directly with a warm smile, full body visible from head to toe, positioned as the main focal point`;
    } else if (numPeople === 2) {
      const g1 = gender1 || 'person';
      const g2 = gender2 || 'person';
      
      let person1 = g1 === 'male' ? 'a handsome man' : g1 === 'female' ? 'a beautiful woman' : 'a person';
      let person2 = g2 === 'male' ? 'a handsome man' : g2 === 'female' ? 'a beautiful woman' : 'a person';
      
      peopleDescription = `Two people standing together: ${person1} and ${person2}, both prominently positioned in the center foreground, standing side by side, both facing the camera directly with warm smiles, both full bodies visible from head to toe, positioned as the main co-stars`;
    }

    // Build the improved prompt - very explicit about composition
    const prompt = `Professional Christmas romantic comedy movie poster. IMPORTANT: Portrait orientation, taller than wide, vertical format.

Main subjects: ${peopleDescription} of the scene.

Setting: They are standing in the center-front of a beautifully decorated, warm living room. Behind them is a crackling fireplace with stockings, and a gorgeously decorated Christmas tree with ${treeDecorations}. Warm Christmas lights create a cozy golden glow throughout the room.

Foreground details: An elegantly set dinner table with ${christmasDinner}, and ${christmasDrink} on a nearby side table.

Style: Cinematic movie poster composition, professional lighting, warm romantic holiday atmosphere, Hallmark Christmas movie aesthetic, photorealistic, high quality. The people must be facing forward toward the camera, positioned prominently and clearly visible as the stars of this film.

CRITICAL: Portrait orientation (taller than wide), vertical poster format, 9:16 aspect ratio.`;

    console.log('Full prompt:', prompt);

    const apiKey = process.env.FAL_KEY;
    
    if (!apiKey) {
      throw new Error('FAL_KEY not configured');
    }

    const payload = {
      prompt: prompt,
      num_inference_steps: 35,
      guidance_scale: 5.0,
      num_images: 1,
      output_format: "png",
      aspect_ratio: "9:16",
      safety_tolerance: "2"
    };

    console.log('Payload aspect_ratio:', payload.aspect_ratio);
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
