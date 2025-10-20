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

  try {
    const requestId = req.body.requestId;

    if (!requestId) {
      return res.status(400).json({ error: 'Missing requestId' });
    }

    const apiKey = process.env.FAL_KEY;

    console.log('Checking status for:', requestId);

    const resultUrl = `https://queue.fal.run/fal-ai/flux-pro/requests/${requestId}`;
    console.log('Getting result from:', resultUrl);
    
    const resultResponse = await fetch(resultUrl, {
      method: 'GET',
      headers: {
        'Authorization': 'Key ' + apiKey
      }
    });

    console.log('Status check response:', resultResponse.status);

    if (resultResponse.status === 404) {
      console.log('404 - Still queued');
      return res.status(200).json({
        status: 'processing',
        message: 'Still generating...'
      });
    }

    if (resultResponse.status === 405) {
      console.log('405 - Still processing');
      return res.status(200).json({
        status: 'processing',
        message: 'Processing...'
      });
    }

    if (!resultResponse.ok) {
      const errorText = await resultResponse.text();
      
      // Check if it's just "still in progress"
      if (errorText.includes('still in progress')) {
        console.log('Still in progress');
        return res.status(200).json({
          status: 'processing',
          message: 'Still generating...'
        });
      }
      
      console.error('Check error:', errorText);
      return res.status(200).json({
        status: 'processing',
        message: 'Checking...'
      });
    }

    const result = await resultResponse.json();
    console.log('Result received:', JSON.stringify(result).substring(0, 300));

    if (result.images && result.images.length > 0) {
      console.log('Complete!');
      return res.status(200).json({
        status: 'completed',
        imageUrl: result.images[0].url
      });
    }

    if (result.data && result.data.images && result.data.images.length > 0) {
      console.log('Complete (nested)!');
      return res.status(200).json({
        status: 'completed',
        imageUrl: result.data.images[0].url
      });
    }

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
        error: 'Generation failed'
      });
    }

    console.log('Unknown status, continuing');
    return res.status(200).json({
      status: 'processing',
      message: 'Processing...'
    });

  } catch (error) {
    console.error('Check error:', error.message);
    return res.status(200).json({
      status: 'processing',
      message: 'Checking...'
    });
  }
}
