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
      console.log('FLUX Pro result received');

      // Check for completed generation
      let generatedImageUrl = null;

      if (result.images && result.images.length > 0) {
        generatedImageUrl = result.images[0].url;
      } else if (result.data && result.data.images && result.data.images.length > 0) {
        generatedImageUrl = result.data.images[0].url;
      } else if (result.output && result.output.images && result.output.images.length > 0) {
        generatedImageUrl = result.output.images[0].url;
      }

      if (generatedImageUrl) {
        console.log('Scene generated successfully');

        // If no photos to swap, return the generated image immediately
        if (!photo1 && !photo2) {
          console.log('No face swap needed, returning generated image');
          return res.status(200).json({
            status: 'completed',
            imageUrl: generatedImageUrl
          });
        }

        // NEW APPROACH: Use a SINGLE face swap call with BOTH faces
        // Many face swap APIs support multiple source faces
        console.log('Starting face swap with Segmind');
        const segmindKey = process.env.SEGMIND_API_KEY;

        if (!segmindKey) {
          console.error('SEGMIND_API_KEY not configured');
          return res.status(200).json({
            status: 'completed',
            imageUrl: generatedImageUrl
          });
        }

        // Determine swap strategy based on number of photos
        if (photo1 && !photo2) {
          // Only one photo - simple swap
          console.log('Single face swap: photo1 only');
          
          const swapPayload = {
            source_face_image: photo1,
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

            if (!swapResponse.ok) {
              const errorText = await swapResponse.text();
              console.error('Face swap error:', errorText);
              return res.status(200).json({
                status: 'completed',
                imageUrl: generatedImageUrl
              });
            }

            const swapData = await swapResponse.json();
            const swapRequestId = swapData.request_id || swapData.id;

            return res.status(200).json({
              status: 'processing',
              message: 'Adding your face to the poster... 🎭',
              step: 'faceswap',
              swapRequestId: swapRequestId
            });
          } catch (error) {
            console.error('Face swap error:', error);
            return res.status(200).json({
              status: 'completed',
              imageUrl: generatedImageUrl
            });
          }
        } else if (photo1 && photo2) {
          // Two photos - we need to do sequential swaps with face indexing
          // Start with swapping the LEFT face (index 0) using photo1
          console.log('Starting first face swap (left person) with photo1');
          
          const swapPayload = {
            source_face_image: photo1,
            target_faces_image: generatedImageUrl,
            face_index: 0  // Try to swap only the first/left face
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

            if (!swapResponse.ok) {
              const errorText = await swapResponse.text();
              console.error('First face swap error:', errorText);
              return res.status(200).json({
                status: 'completed',
                imageUrl: generatedImageUrl
              });
            }

            const swapData = await swapResponse.json();
            const swapRequestId = swapData.request_id || swapData.id;

            return res.status(200).json({
              status: 'processing',
              message: 'Adding first face (left person)... 🎭',
              step: 'faceswap1',
              swapRequestId: swapRequestId
            });
          } catch (error) {
            console.error('First face swap error:', error);
            return res.status(200).json({
              status: 'completed',
              imageUrl: generatedImageUrl
            });
          }
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

      return res.status(200).json({
        status: 'processing',
        message: 'Processing...',
        step: 'generation'
      });

    } else if (currentStep === 'faceswap' || currentStep === 'faceswap1') {
      // Check face swap status
      console.log('Checking face swap status...');
      const segmindKey = process.env.SEGMIND_API_KEY;
      
      if (!segmindKey) {
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

        if (statusResponse.status === 400 || statusResponse.status === 404) {
          const errorText = await statusResponse.text();
          console.error('Face swap status error:', errorText);
          return res.status(500).json({
            status: 'failed',
            error: 'Face swap failed. Please try again.'
          });
        }

        if (!statusResponse.ok) {
          return res.status(200).json({
            status: 'processing',
            message: currentStep === 'faceswap1' ? 'Swapping first face... 🎭' : 'Swapping face... 🎭',
            step: currentStep
          });
        }

        const statusData = await statusResponse.json();

        if (statusData.status === 'COMPLETED') {
          console.log('Face swap complete!');
          
          // Extract image URL
          let imageUrl = null;
          let outputData = statusData.output;
          
          if (typeof outputData === 'string') {
            try {
              outputData = JSON.parse(outputData);
            } catch (e) {
              console.error('Failed to parse output:', e);
            }
          }
          
          if (Array.isArray(outputData) && outputData.length > 0) {
            const firstItem = outputData[0];
            if (firstItem.value && firstItem.value.data) {
              imageUrl = firstItem.value.data;
            }
          } else if (typeof outputData === 'string' && outputData.startsWith('http')) {
            imageUrl = outputData;
          }
          
          if (!imageUrl) {
            return res.status(500).json({
              status: 'failed',
              error: 'Could not extract image from face swap'
            });
          }

          // Check if we need to do a SECOND face swap (for photo2)
          if (currentStep === 'faceswap1' && photo2) {
            console.log('Starting second face swap (right person) with photo2');
            
            const swapPayload = {
              source_face_image: photo2,
              target_faces_image: imageUrl,
              face_index: 1  // Try to swap only the second/right face
            };

            const swapResponse = await fetch('https://api.segmind.com/workflows/6759c2ad2de40ed56063a1f8-v1', {
              method: 'POST',
              headers: {
                'x-api-key': segmindKey,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(swapPayload)
            });

            if (!swapResponse.ok) {
              const errorText = await swapResponse.text();
              console.error('Second face swap failed to start:', errorText);
              // Return result from first swap
              return res.status(200).json({
                status: 'completed',
                imageUrl: imageUrl
              });
            }

            const swapData = await swapResponse.json();
            const swapRequestId = swapData.request_id || swapData.id;

            return res.status(200).json({
              status: 'processing',
              message: 'Adding second face (right person)... 🎭',
              step: 'faceswap2',
              swapRequestId: swapRequestId
            });
          }

          // Done!
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
          message: currentStep === 'faceswap1' ? 'Swapping first face... 🎭' : 'Swapping face... 🎭',
          step: currentStep
        });
      } catch (error) {
        console.error('Face swap check error:', error);
        return res.status(200).json({
          status: 'processing',
          message: 'Swapping faces... 🎭',
          step: currentStep
        });
      }

    } else if (currentStep === 'faceswap2') {
      // Check SECOND face swap status
      console.log('Checking second face swap status...');
      const segmindKey = process.env.SEGMIND_API_KEY;
      
      if (!segmindKey) {
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

        if (statusResponse.status === 400 || statusResponse.status === 404) {
          const errorText = await statusResponse.text();
          console.error('Second face swap error:', errorText);
          return res.status(500).json({
            status: 'failed',
            error: 'Second face swap failed.'
          });
        }

        if (!statusResponse.ok) {
          return res.status(200).json({
            status: 'processing',
            message: 'Swapping second face... 🎭',
            step: 'faceswap2'
          });
        }

        const statusData = await statusResponse.json();

        if (statusData.status === 'COMPLETED') {
          console.log('Second face swap complete!');
          
          // Extract final image URL
          let imageUrl = null;
          let outputData = statusData.output;
          
          if (typeof outputData === 'string') {
            try {
              outputData = JSON.parse(outputData);
            } catch (e) {
              console.error('Failed to parse output:', e);
            }
          }
          
          if (Array.isArray(outputData) && outputData.length > 0) {
            const firstItem = outputData[0];
            if (firstItem.value && firstItem.value.data) {
              imageUrl = firstItem.value.data;
            }
          } else if (typeof outputData === 'string' && outputData.startsWith('http')) {
            imageUrl = outputData;
          }
          
          if (!imageUrl) {
            return res.status(500).json({
              status: 'failed',
              error: 'Could not extract image from second face swap'
            });
          }

          return res.status(200).json({
            status: 'completed',
            imageUrl: imageUrl
          });
        }

        if (statusData.status === 'FAILED' || statusData.status === 'ERROR') {
          console.error('Second face swap failed');
          return res.status(500).json({
            status: 'failed',
            error: 'Second face swap failed.'
          });
        }

        // Still processing
        return res.status(200).json({
          status: 'processing',
          message: 'Swapping second face... 🎭',
          step: 'faceswap2'
        });
      } catch (error) {
        console.error('Second face swap check error:', error);
        return res.status(200).json({
          status: 'processing',
          message: 'Swapping second face... 🎭',
          step: 'faceswap2'
        });
      }
    }

    // Invalid step
    return res.status(400).json({
      error: 'Invalid step parameter'
    });

  } catch (error) {
    console.error('Error in check-status:', error.message);
    return res.status(200).json({
      status: 'processing',
      message: 'Checking status...'
    });
  }
}
