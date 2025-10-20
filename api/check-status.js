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

    // Try the status endpoint with different URL structure
    const statusUrl = `https://fal.run/fal-ai/flux/kontext-pro/requests/${requestId}/status`;
    console.log('Trying status URL:', statusUrl);
    
    const statusResponse = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    console.log('Status response code:', statusResponse.status);

    if (statusResponse.status === 404) {
      console.log('404 - Request not found, might still be queued');
      return res.status(200).json({
        status: 'processing',
        message: 'Still generating...'
      });
    }

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      console.error('Status check error:', statusResponse.status, errorText);
      
      // Continue polling on errors
      return res.status(200).json({
        status: 'processing',
        message: 'Checking...'
      });
    }

    const statusData = await statusResponse.json();
    console.log('Status data:', JSON.stringify(statusData).substring(0, 300));

    // Check various possible status fields
    const status = statusData.status || statusData.state;
    console.log('Current status:', status);

    if (status === 'IN_PROGRESS' || status === 'IN_QUEUE' || status === 'PENDING') {
      return res.status(200).json({
        status: 'processing',
        message: 'Still generating...'
      });
    }

    if (status === 'COMPLETED' || status === 'SUCCESS') {
      // Try to get the result
      const resultUrl = `https://fal.run/fal-ai/flux/kontext-pro/requests/${requestId}`;
      console.log('Getting result from:', resultUrl);
      
      const resultResponse = await fetch(resultUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Key ${apiKey}`,
          'Accept': 'application/json'
        }
      });

      if (!resultResponse.ok) {
        console.error('Failed to get result:', resultResponse.status);
        throw new Error('Failed to retrieve result');
      }

      const result = await resultResponse.json();
      console.log('Result received');

      if (result.images && result.images.length > 0) {
        return res.status(200).json({
          status: 'completed',
          imageUrl: result.images[0].url
        });
      }

      // Check if result has data in different structure
      if (result.data && result.data.images && result.data.images.length > 0) {
        return res.status(200).json({
          status: 'completed',
          imageUrl: result.data.images[0].url
        });
      }

      console.error('Result structure unexpected:', result);
      throw new Error('Unexpected result structure');
    }

    if (status === 'FAILED' || status === 'ERROR') {
      console.error('Generation failed');
      return res.status(500).json({
        status: 'failed',
        error: 'Generation failed',
        details: statusData.error || 'Unknown error'
      });
    }

    // Unknown status, keep polling
    console.log('Unknown status, continuing to poll');
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
