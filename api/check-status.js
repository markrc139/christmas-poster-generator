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

    // Check status using REST API
    const statusResponse = await fetch(`https://queue.fal.run/fal-ai/flux/kontext-pro/requests/${requestId}/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      console.error('Status check error:', errorText);
      throw new Error(`Status check failed: ${statusResponse.status}`);
    }

    const statusData = await statusResponse.json();
    console.log('Current status:', statusData.status);

    // Handle different status states
    if (statusData.status === 'IN_PROGRESS' || statusData.status === 'IN_QUEUE') {
      return res.status(200).json({
        status: 'processing',
        message: 'Still generating...'
      });
    }

    if (statusData.status === 'COMPLETED') {
      // Get the result
      const resultResponse = await fetch(`https://queue.fal.run/fal-ai/flux/kontext-pro/requests/${requestId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Key ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!resultResponse.ok) {
        throw new Error('Failed to get result');
      }

      const result = await resultResponse.json();
      console.log('Generation complete!');

      return res.status(200).json({
        status: 'completed',
        imageUrl: result.images[0].url
      });
    }

    if (statusData.status === 'FAILED') {
      console.error('Generation failed');
      return res.status(500).json({
        status: 'failed',
        error: 'Generation failed',
        details: statusData.error || 'Unknown error'
      });
    }

    // Unknown status
    return res.status(200).json({
      status: 'unknown',
      message: 'Unknown status',
      rawStatus: statusData.status
    });

  } catch (error) {
    console.error('Error checking status:', error);
    console.error('Error message:', error.message);
    return res.status(500).json({ 
      error: 'Failed to check status',
      details: error.message 
    });
  }
}
