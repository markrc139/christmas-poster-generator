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

    const apiKey = process.env.FAL_KEY;
    
    if (!apiKey) {
      throw new Error('FAL_KEY not configured');
    }

    console.log('Checking status for request:', requestId);

    // Try to get the result directly - Fal.ai queue returns status in the result
    const resultResponse = await fetch(`https://queue.fal.run/fal-ai/flux/kontext-pro/requests/${requestId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Key ${apiKey}`
      }
    });

    console.log('Result response status:', resultResponse.status);

    if (resultResponse.status === 404) {
      // Request not found or still queued
      return res.status(200).json({
        status: 'processing',
        message: 'Still generating...'
      });
    }

    if (!resultResponse.ok) {
      const errorText = await resultResponse.text();
      console.error('Result check error:', errorText);
      
      // If it's a 405, the request might still be processing
      if (resultResponse.status === 405) {
        return res.status(200).json({
          status: 'processing',
          message: 'Still generating...'
        });
      }
      
      throw new Error(`Result check failed: ${resultResponse.status}`);
    }

    const result = await resultResponse.json();
    console.log('Result received:', JSON.stringify(result).substring(0, 200));

    // Check if it has the completed data
    if (result.images && result.images.length > 0) {
      console.log('Generation complete!');
      return res.status(200).json({
        status: 'completed',
        imageUrl: result.images[0].url
      });
    }

    // Check status field if present
    if (result.status === 'IN_PROGRESS' || result.status === 'IN_QUEUE') {
      return res.status(200).json({
        status: 'processing',
        message: 'Still generating...'
      });
    }

    if (result.status === 'FAILED') {
      console.error('Generation failed');
      return res.status(500).json({
        status: 'failed',
        error: 'Generation failed',
        details: result.error || 'Unknown error'
      });
    }

    // Unknown response
    console.log('Unknown result structure:', result);
    return res.status(200).json({
      status: 'processing',
      message: 'Still processing...'
    });

  } catch (error) {
    console.error('Error checking status:', error);
    console.error('Error message:', error.message);
    
    // Don't fail completely, just report as still processing
    return res.status(200).json({
      status: 'processing',
      message: 'Checking status...'
    });
  }
}
