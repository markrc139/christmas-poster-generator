import * as fal from "@fal-ai/serverless-client";

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

    // Configure Fal.ai with API key from environment variable
    fal.config({
      credentials: process.env.FAL_KEY
    });

    // Build the prompt for the movie poster
    const prompt = `A cozy Christmas movie poster in the style of a romantic holiday film. The scene shows a warm, inviting living room with a crackling fireplace in the background. On a beautifully set dinner table in the foreground, there is ${christmasDinner}. A decorated Christmas tree stands nearby with ${treeDecorations}. On a side table, there is ${christmasDrink}. The movie title "${movieTitle}" appears at the top in elegant, festive typography. The overall atmosphere is warm, romantic, and festive with soft lighting from the fireplace and Christmas lights. Cinematic composition, professional movie poster design, high quality, photorealistic.`;

    // Prepare images array - only include uploaded photos
    const images = [];
    if (photo1) images.push(photo1);
    if (photo2) images.push(photo2);

    console.log('Starting image generation with Flux Kontext Pro...');
    console.log('Number of reference images:', images.length);

    // Queue the job (don't wait for it to complete)
    const { request_id } = await fal.queue.submit("fal-ai/flux-kontext-pro", {
      input: {
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
      }
    });

    console.log('Job queued with request_id:', request_id);

    // Return the request_id immediately so the frontend can poll for results
    return res.status(200).json({
      success: true,
      requestId: request_id,
      message: 'Generation started'
    });

  } catch (error) {
    console.error('Error starting generation:', error);
    return res.status(500).json({ 
      error: 'Failed to start poster generation',
      details: error.message 
    });
  }
}
