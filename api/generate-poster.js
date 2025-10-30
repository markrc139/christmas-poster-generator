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
    let negativePrompt = '';
    let genreDescription = 'Professional Christmas holiday movie poster';
    
    if (numPeople === 0) {
      peopleDescription = 'An empty, cozy living room decorated for Christmas';
      negativePrompt = '';
      genreDescription = 'Professional Christmas holiday movie poster';
    } else if (numPeople === 1) {
      const gender = gender1 || 'person';
      
      if (gender === 'male') {
        peopleDescription = 'A single handsome man, masculine features, male person, standing prominently in the center foreground, facing the camera directly with a warm smile, full body visible from head to toe, positioned as the main focal point. ONE MALE PERSON ONLY.';
        negativePrompt = 'woman, female, women, females, feminine features, multiple people, couple, romantic';
        genreDescription = 'Professional Christmas family holiday movie poster';
      } else if (gender === 'female') {
        peopleDescription = 'A single beautiful woman, feminine features, female person, standing prominently in the center foreground, facing the camera directly with a warm smile, full body visible from head to toe, positioned as the main focal point. ONE FEMALE PERSON ONLY.';
        negativePrompt = 'man, male, men, males, masculine features, multiple people, couple, romantic';
        genreDescription = 'Professional Christmas family holiday movie poster';
      } else {
        peopleDescription = 'A person standing prominently in the center foreground, facing the camera directly with a warm smile, full body visible from head to toe, positioned as the main focal point';
        negativePrompt = 'multiple people';
        genreDescription = 'Professional Christmas holiday movie poster';
      }
      
    } else if (numPeople === 2) {
      const g1 = gender1 || 'person';
      const g2 = gender2 || 'person';
      
      // Build very explicit descriptions
      let person1Desc = '';
      let person2Desc = '';
      
      if (g1 === 'male') {
        person1Desc = 'a handsome man with masculine features, short hair, male person';
      } else if (g1 === 'female') {
        person1Desc = 'a beautiful woman with feminine features, long hair, female person';
      } else {
        person1Desc = 'a person';
      }
      
      if (g2 === 'male') {
        person2Desc = 'a handsome man with masculine features, short hair, male person';
      } else if (g2 === 'female') {
        person2Desc = 'a beautiful woman with feminine features, long hair, female person';
      } else {
        person2Desc = 'a person';
      }
      
      peopleDescription = `EXACTLY TWO PEOPLE STANDING TOGETHER: ${person1Desc} on the left side AND ${person2Desc} on the right side, both prominently positioned in the center foreground, standing side by side together, both facing the camera directly with warm smiles, both full bodies visible from head to toe, positioned as the main co-stars. TWO DISTINCT PEOPLE TOTAL, NOT THE SAME PERSON TWICE.`;
      
      // Build negative prompt and genre based on genders
      if (g1 === 'male' && g2 === 'male') {
        negativePrompt = 'woman, women, female, females, feminine features, long hair, one person, three people, more than two people, romantic couple, romance';
        genreDescription = 'Professional Christmas buddy comedy movie poster, male friendship film';
      } else if (g1 === 'female' && g2 === 'female') {
        negativePrompt = 'man, men, male, males, masculine features, short hair, one person, three people, more than two people, romantic couple, romance';
        genreDescription = 'Professional Christmas friendship movie poster, female friends film';
      } else {
        // Mixed genders - romantic comedy is OK here
        negativePrompt = 'one person, three people, more than two people, same person twice';
        genreDescription = 'Professional Christmas romantic comedy movie poster';
      }
    }

    // Build the improved prompt - genre changes based on genders
    const prompt = `${genreDescription}. IMPORTANT: Portrait orientation, vertical format.

Main subjects: ${peopleDescription}

Setting: They are standing in the center-front of a beautifully decorated, warm living room. Behind them is a crackling fireplace with stockings, and a gorgeously decorated Christmas tree with ${treeDecorations}. Warm Christmas lights create a cozy golden glow throughout the room.

Foreground details: An elegantly set dinner table with ${christmasDinner}, and ${christmasDrink} on a nearby side table.

Style: Cinematic movie poster composition, professional lighting, warm holiday atmosphere, Hallmark Christmas movie aesthetic, photorealistic, high quality. The people must be facing forward toward the camera, positioned prominently and clearly visible as the stars of this film.

CRITICAL: Portrait orientation (taller than wide), vertical poster format, 9:16 aspect ratio. Two completely different people with different appearances.

NEGATIVE PROMPT (things to avoid): ${negativePrompt}`;

    console.log('Full prompt:', prompt);
    console.log('Genre:', genreDescription);

    const apiKey = process.env.FAL_KEY;
    
    if (!apiKey) {
      throw new Error('FAL_KEY not configured');
    }

    const payload = {
      prompt: prompt,
      num_inference_steps: 50,
      guidance_scale: 7.5,
      num_images: 1,
      output_format: "png",
      aspect_ratio: "9:16",
      safety_tolerance: "2"
    };

    console.log('Payload guidance_scale:', payload.guidance_scale);
    console.log('Payload num_inference_steps:', payload.num_inference_steps);
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
