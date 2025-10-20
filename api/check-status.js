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
    const { requestId } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: 'Missing requestId' });
    }

    // Configure Fal.ai with API key
    fal.config({
      credentials: process.env.FAL_KEY
    });

    console.log('Checking status for request:', requestId);

    // Check the status using the correct method
    const status = await fal.queue.status("fal-ai/flux-kontext-pro", {
      requestId: requestId,
      logs: true
    });

    console.log('Current status:', status.status);

    // Handle different status states
    if (status.status === 'IN_PROGRESS' || status.status === 'IN_QUEUE') {
      return res.status(200).json({
        status: 'processing',
        message: 'Still generating...'
      });
    }

    if (status.status === 'COMPLETED') {
      // Get the result
      const result = await fal.queue.result("fal-ai/flux-kontext-pro", {
        requestId: requestId
      });

      console.log('Generation complete!');
      console.log('Result:', result);

      return res.status(200).json({
        status: 'completed',
        imageUrl: result.images[0].url
      });
    }

    if (status.status === 'FAILED') {
      console.error('Generation failed');
      console.error('Error:', status.error);
      return res.status(500).json({
        status: 'failed',
        error: 'Generation failed',
        details: status.error || 'Unknown error'
      });
    }

    // Unknown status
    console.log('Unknown status:', status);
    return res.status(200).json({
      status: 'unknown',
      message: 'Unknown status',
      rawStatus: status.status
    });

  } catch (error) {
    console.error('Error checking status:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    return res.status(500).json({ 
      error: 'Failed to check status',
      details: error.message 
    });
  }
}
