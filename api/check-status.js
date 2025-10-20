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

    // Try to get the result directly
    const resultUrl = `https://fal.run/fal-ai/flux-pro/requests/${requestId}`;
    console.log('Getting result from:', resultUrl);
    
    const resultResponse = await fetch(resultUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    console.log('Result response status:', resultResponse.status);

    if (resultResponse.status === 404) {
      console.log('404 - Request not found, might still be queued');
      return res.status(200).json({
        status: 'processing',
        message: 'Still generating...'
      });
    }

    if (resultResponse.status === 405) {
      // Method not allowed - still processing
      return res.status(200).json({
        status: 'processing',
        message: 'Processing...'
      });
    }

    if (!resultResponse.ok) {
      const errorText = await resultResponse.text();
      console.error('Result check error:', resultResponse.status, errorText);
      
      // Continue polling on errors
      return res.status(200).json({
        status: 'processing',
        message: 'Checking...'
      });
    }

    const result = await resultResponse.json();
    console.log('Result received:', JSON.stringify(result).substring(0, 300));

    // Check if it has the completed data
    if (result.images && result.images.length > 0) {
      console.log('Generation complete!');
      return res.status(200).json({
        status: 'completed',
        imageUrl: result.images[0].url
      });
    }

    // Check if result has data in different structure
    if (result.data && result.data.images && result.data.images.length > 0) {
      console.log('Generation complete (nested data)!');
      return res.status(200).json({
        status: 'completed',
        imageUrl: result.data.images[0].url
      });
    }

    // Check status field if present
    const status = result.status || result.state;
    if (status === 'IN_PROGRESS' || status === 'IN_QUEUE' || status === 'PENDING') {
      return res.status(200).json({
        status: 'processing',
        message: 'Still generating...'
      });
    }

    if (status === 'FAILED' || status === 'ERROR') {
      console.error('Generation failed');
      return res.status(500).json({
        status: 'failed',
        error: 'Generation failed',
        details: result.error || 'Unknown error'
      });
    }

    // Unknown response, keep polling
    console.log('Unknown result structure, continuing to poll');
    return res.status(200).json({
      status: 'processing',
      message: 'Processing...'
    });

  } catch (error) {
    console.error('Error in check-status:', error);
    console.error('Error message:', error.message);
    
    // Don't fail, just keep polling
    return res.status(200).json({
      status: 'processing',
      message: 'Checking status...'
    });
  }
}
