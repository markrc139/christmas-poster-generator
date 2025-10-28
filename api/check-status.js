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

  try {
    const { requestId, photo1, photo2, step } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: 'Missing requestId' });
    }

    const currentStep = step || 'generation';
    console.log('Checking status - Step:', currentStep, 'ID:', requestId);

    // STEP 1: Check FLUX Pro generation status
    if (currentStep === 'generation') {
      const falKey = process.env.FAL_KEY;
      const resultUrl = `https://queue.fal.run/fal-ai/flux-pro/requests/${requestId}`;
      
      console.log('Checking FLUX Pro status...');
      
      const resultResponse = await fetch(resultUrl, {
        method: 'GET',
        headers: {
          'Authorization': 'Key ' + falKey
        }
      });

      console.log('FLUX Pro status response:', resultResponse.status);

      // Handle different response codes
      if (resultResponse.status === 404) {
        console.log('404 - Request still queued');
        return res.status(200).json({
          status: 'processing',
          message: 'Generating your Christmas scene... 🎄',
          step: 'generation'
        });
      }

      if (resultResponse.status === 405) {
        console.log('405 - Request still processing');
        return res.status(200).json({
          status: 'processing',
          message: 'Creating your poster... ✨',
          step: 'generation'
        });
      }

      if (!resultResponse.ok) {
        const errorText = await resultResponse.text();
        
        // Check if it's still in progress
        if (errorText.includes('still in progress') || errorText.includes('IN_PROGRESS')) {
          console.log('Still in progress');
          return res.status(200).json({
            status: 'processing',
            message: 'Generating scene... 🎬',
            step: 'generation'
          });
        }
        
        console.error('FLUX Pro check error:', errorText);
        return res.status(200).json({
          status: 'processing',
          message: 'Processing your request...',
          step: 'generation'
        });
      }

      const result = await resultResponse.json();
      console.log('FLUX Pro result received:', JSON.stringify(result).substring(0, 300));

      // Check for completed generation - handle different response formats
      let generatedImageUrl = null;

      if (result.images && result.images.length > 0) {
        generatedImageUrl = result.images[0].url;
      } else if (result.data && result.data.images && result.data.images.length > 0) {
        generatedImageUrl = result.data.images[0].url;
      } else if (result.output && result.output.images && result.output.images.length > 0) {
        generatedImageUrl = result.output.images[0].url;
      }

      if (generatedImageUrl) {
        console.log('Scene generated successfully:', generatedImageUrl);

        // If no photos to swap, return the generated image immediately
        if (!photo1 && !photo2) {
          console.log('No face swap needed, returning generated image');
          return res.status(200).json({
            status: 'completed',
            imageUrl: generatedImageUrl
          });
        }

        // STEP 2: Start face-swap with Segmind
        console.log('Starting face swap with Segmind');
        const segmindKey = process.env.SEGMIND_API_KEY;

        if (!segmindKey) {
          console.error('SEGMIND_API_KEY not configured, returning original image');
          return res.status(200).json({
            status: 'completed',
            imageUrl: generatedImageUrl
          });
        }

        // Use the first available photo for face swap
        const sourcePhoto = photo1 || photo2;

        const swapPayload = {
          source_face_image: sourcePhoto,
          target_faces_image: generatedImageUrl
        };

        try {
          const swapResponse = await fetch('https://api.segmind.com/workflows/6759c2ad2de40ed56063a1f8-v1', {
            method: 'POST',
            headers: {
              'x-api-key': segmindKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(swapPayload)
          });

          console.log('Segmind face swap response status:', swapResponse.status);

          if (!swapResponse.ok) {
            const errorText = await swapResponse.text();
            console.error('Segmind error:', errorText);
            // Return original image if face-swap fails
            return res.status(200).json({
              status: 'completed',
              imageUrl: generatedImageUrl
            });
          }

          const swapData = await swapResponse.json();
          console.log('Face swap queued:', JSON.stringify(swapData));

          // Return processing status with face swap request ID
          return res.status(200).json({
            status: 'processing',
            message: 'Adding your face to the poster... 🎭',
            step: 'faceswap',
            swapRequestId: swapData.request_id || swapData.id
          });
        } catch (swapError) {
          console.error('Face swap initiation error:', swapError);
          // Return original image if face-swap fails
          return res.status(200).json({
            status: 'completed',
            imageUrl: generatedImageUrl
          });
        }
      }

      // Check for explicit status indicators
      const status = result.status || result.state;
      if (status === 'IN_PROGRESS' || status === 'IN_QUEUE' || status === 'PENDING' || status === 'PROCESSING') {
        return res.status(200).json({
          status: 'processing',
          message: 'Creating your poster... 🎨',
          step: 'generation'
        });
      }

      if (status === 'FAILED' || status === 'ERROR') {
        console.error('Generation failed with status:', status);
        return res.status(500).json({
          status: 'failed',
          error: 'Poster generation failed. Please try again.'
        });
      }

      // Unknown status, continue polling
      console.log('Unknown status, continuing to poll:', status);
      return res.status(200).json({
        status: 'processing',
        message: 'Processing...',
        step: 'generation'
      });

    } else if (currentStep === 'faceswap') {
      // STEP 2: Check Segmind face-swap status
      console.log('Checking Segmind face swap status...');
      const segmindKey = process.env.SEGMIND_API_KEY;
      
      if (!segmindKey) {
        console.error('SEGMIND_API_KEY not configured');
        return res.status(500).json({
          status: 'failed',
          error: 'Configuration error'
        });
      }

      try {
        const statusResponse = await fetch(`https://api.segmind.com/workflows/request/${requestId}`, {
          method: 'GET',
          headers: {
            'x-api-key': segmindKey
          }
        });

        console.log('Segmind status response:', statusResponse.status);

        if (!statusResponse.ok) {
          // Continue polling if we can't get status
          return res.status(200).json({
            status: 'processing',
            message: 'Swapping faces... 🎭',
            step: 'faceswap'
          });
        }

        const statusData = await statusResponse.json();
        console.log('Face swap status:', statusData.status);

        if (statusData.status === 'COMPLETED') {
          console.log('Face swap complete! Raw output type:', typeof statusData.output);
          console.log('Face swap complete! Raw output:', statusData.output);
          
          // Extract image URL from Segmind's response format
          let imageUrl = null;
          let outputData = statusData.output;
          
          // If output is a JSON string, parse it first
          if (typeof outputData === 'string') {
            try {
              outputData = JSON.parse(outputData);
              console.log('Parsed output:', outputData);
            } catch (e) {
              console.error('Failed to parse output as JSON:', e);
            }
          }
          
          // Handle array format: [{"keyname": "...", "value": {"data": "url", "type": "image"}}]
          if (Array.isArray(outputData) && outputData.length > 0) {
            const firstItem = outputData[0];
            console.log('First item:', firstItem);
            if (firstItem.value && firstItem.value.data && typeof firstItem.value.data === 'string') {
              imageUrl = firstItem.value.data;
            }
          } else if (typeof outputData === 'string' && outputData.startsWith('http')) {
            // Direct URL string
            imageUrl = outputData;
          }
          
          console.log('Face swap complete! Extracted image URL:', imageUrl);
          
          if (!imageUrl) {
            console.error('Failed to extract image URL from output');
            return res.status(500).json({
              status: 'failed',
              error: 'Could not extract image URL from face swap result'
            });
          }
          
          return res.status(200).json({
            status: 'completed',
            imageUrl: imageUrl
          });
        }

        if (statusData.status === 'FAILED' || statusData.status === 'ERROR') {
          console.error('Face swap failed');
          return res.status(500).json({
            status: 'failed',
            error: 'Face swap failed. Please try again.'
          });
        }

        // Still processing
        return res.status(200).json({
          status: 'processing',
          message: 'Swapping faces... 🎭',
          step: 'faceswap'
        });
      } catch (error) {
        console.error('Segmind status check error:', error);
        return res.status(200).json({
          status: 'processing',
          message: 'Swapping faces... 🎭',
          step: 'faceswap'
        });
      }
    }

    // Invalid step
    return res.status(400).json({
      error: 'Invalid step parameter'
    });

  } catch (error) {
    console.error('Error in check-status:', error.message);
    // Return processing status to continue polling
    return res.status(200).json({
      status: 'processing',
      message: 'Checking status...'
    });
  }
}
