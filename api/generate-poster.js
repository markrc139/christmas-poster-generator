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

  console.log('Generate poster function started');

  try {
    const { movieTitle, christmasDrink, treeDecorations, christmasDinner, photo1, photo2 } = req.body;

    // Validate required fields
    if (!movieTitle || !christmasDrink || !treeDecorations || !christmasDinner) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Require at least one photo for face-swapping
    if (!photo1 && !photo2) {
      return res.status(400).json({ error: 'At least one photo is required for face generation' });
    }

    // Count people for prompt
    const numPeople = (photo1 ? 1 : 0) + (photo2 ? 1 : 0);
    const peopleText = numPeople === 2 
      ? 'A romantic couple, man and woman, standing together' 
      : 'A person standing';

    // Build the prompt
    const prompt = `Professional Christmas movie poster. ${peopleText} in a cozy living room decorated for Christmas. Warm crackling fireplace in background. Elegant dinner table with ${christmasDinner}. Beautiful Christmas tree with ${treeDecorations}. ${christmasDrink} on side table. Movie title "${movieTitle}" in elegant festive typography at top. Romantic, warm, festive atmosphere. Soft lighting from fireplace and Christmas lights. Cinematic composition. High quality, photorealistic. The people are the main focus, prominently featured.`;

    console.log('Calling Replicate API');

    const apiKey = process.env.REPLICATE_API_TOKEN;
    
    if (!apiKey) {
      throw new Error('REPLICATE_API_TOKEN not configured');
    }

    // Use InstantID model
    const payload = {
      version: "7d6da9c0fc8e4b9c3b5f5e5c5e5c5e5c5e5c5e5c5e5c5e5c5e5c5e5c5e5c5e5",
      input: {
        image: photo1 || photo2,
        prompt: prompt,
        negative_prompt: "blurry, low quality, distorted, deformed, ugly",
        num_outputs: 1,
        width: 768,
        height: 1024
      }
    };

    // If there are 2 photos, we'll need to handle differently
    // For now, we'll use the first photo as the main face reference

    console.log('Submitting to Replicate');

    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': 'Token ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log('Replicate response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Replicate error:', errorText);
      throw new Error(`Replicate API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Prediction created, ID:', data.id);

    return res.status(200).json({
      success: true,
      requestId: data.id,
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
