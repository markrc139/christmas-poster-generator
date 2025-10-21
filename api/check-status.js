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

    const apiKey = process.env.REPLICATE_API_TOKEN;

    console.log('Checking status for:', requestId);

    const response = await fetch(`https://api.replicate.com/v1/predictions/${requestId}`, {
      method: 'GET',
      headers: {
        'Authorization': 'Token ' + apiKey,
        'Content-Type': 'application/json'
      }
    });

    console.log('Status check response:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Status check error:', errorText);
      return res.status(200).json({
        status: 'processing',
        message: 'Checking...'
      });
    }

    const result = await response.json();
    console.log('Status:', result.status);

    // Replicate statuses: starting, processing, succeeded, failed, canceled
    if (result.status === 'starting' || result.status === 'processing') {
      return res.status(200).json({
        status: 'processing',
        message: 'Still generating...'
      });
    }

    if (result.status === 'succeeded') {
      console.log('Generation complete!');
      
      // Replicate returns output as an array of URLs
      const imageUrl = Array.isArray(result.output) ? result.output[0] : result.output;
      
      return res.status(200).json({
        status: 'completed',
        imageUrl: imageUrl
      });
    }

    if (result.status === 'failed' || result.status === 'canceled') {
      console.error('Generation failed:', result.error);
      return res.status(500).json({
        status: 'failed',
        error: 'Generation failed',
        details: result.error
      });
    }

    // Unknown status
    console.log('Unknown status, continuing to poll');
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
