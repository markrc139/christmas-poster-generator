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

      if (resultResponse.status === 404 || resultResponse.status === 405) {
        return res.status(200).json({
          status: 'processing',
          message: 'Generating your Christmas scene... 🎄',
          step: 'generation'
        });
      }

      if (!resultResponse.ok) {
        const errorText = await resultResponse.text();
        if (errorText.includes('still in progress') || errorText.includes('IN_PROGRESS')) {
          return res.status(200).json({
            status: 'processing',
            message: 'Generating scene... 🎬',
            step: 'generation'
          });
        }
        return res.status(200).json({
          status: 'processing',
          message: 'Processing your request...',
          step: 'generation'
        });
      }

      const result = await resultResponse.json();
      console.log('FLUX Pro result received');

      // Extract generated image URL
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

        // If no photos to swap, return immediately
        if (!photo1 && !photo2) {
          console.log('No face swap needed');
          return res.status(200).json({
            status: 'completed',
            imageUrl: generatedImageUrl
          });
        }

        // Start Replicate face swap
        console.log('Starting Replicate face swap');
        const replicateToken = process.env.REPLICATE_API_TOKEN;

        if (!replicateToken) {
          console.error('REPLICATE_API_TOKEN not configured');
          return res.status(200).json({
            status: 'completed',
            imageUrl: generatedImageUrl
          });
        }

        // Strategy for Replicate:
        // Use yan-ops/face_swap model which is designed for this
        // Do TWO sequential swaps if needed

        if (photo1 && !photo2) {
          // Single face swap
          console.log('Starting single Replicate face swap with photo1');
          
          try {
            const swapResponse = await fetch('https://api.replicate.com/v1/predictions', {
              method: 'POST',
              headers: {
                'Authorization': `Token ${replicateToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                version: "c2d783366e8d32e6e82c40682fab6b4c23b9c6eff2692eb2cf4f9d894415d89c",
                input: {
                  source_image: photo1,
                  target_image: generatedImageUrl,
                  cache_days: 1
                }
              })
            });

            if (!swapResponse.ok) {
              const errorText = await swapResponse.text();
              console.error('Replicate error:', errorText);
              return res.status(200).json({
                status: 'completed',
                imageUrl: generatedImageUrl
              });
            }

            const swapData = await swapResponse.json();
            console.log('Replicate face swap started:', swapData.id);

            return res.status(200).json({
              status: 'processing',
              message: 'Adding your face to the poster... 🎭',
              step: 'faceswap',
              swapRequestId: swapData.id
            });
          } catch (error) {
            console.error('Replicate error:', error);
            return res.status(200).json({
              status: 'completed',
              imageUrl: generatedImageUrl
            });
          }
        } else if (photo1 && photo2) {
          // Two faces - start with first one
          console.log('Starting first Replicate face swap with photo1');
          
          try {
            const swapResponse = await fetch('https://api.replicate.com/v1/predictions', {
              method: 'POST',
              headers: {
                'Authorization': `Token ${replicateToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                version: "c2d783366e8d32e6e82c40682fab6b4c23b9c6eff2692eb2cf4f9d894415d89c",
                input: {
                  source_image: photo1,
                  target_image: generatedImageUrl,
                  cache_days: 1,
                  face_index: 0  // Try to target first face
                }
              })
            });

            if (!swapResponse.ok) {
              const errorText = await swapResponse.text();
              console.error('Replicate first swap error:', errorText);
              return res.status(200).json({
                status: 'completed',
                imageUrl: generatedImageUrl
              });
            }

            const swapData = await swapResponse.json();
            console.log('Replicate first face swap started:', swapData.id);

            return res.status(200).json({
              status: 'processing',
              message: 'Adding first face to the poster... 🎭',
              step: 'faceswap1',
              swapRequestId: swapData.id
            });
          } catch (error) {
            console.error('Replicate first swap error:', error);
            return res.status(200).json({
              status: 'completed',
              imageUrl: generatedImageUrl
            });
          }
        }
      }

      // Check for status indicators
      const status = result.status || result.state;
      if (status === 'IN_PROGRESS' || status === 'IN_QUEUE' || status === 'PENDING' || status === 'PROCESSING') {
        return res.status(200).json({
          status: 'processing',
          message: 'Creating your poster... 🎨',
          step: 'generation'
        });
      }

      if (status === 'FAILED' || status === 'ERROR') {
        return res.status(500).json({
          status: 'failed',
          error: 'Poster generation failed.'
        });
      }

      return res.status(200).json({
        status: 'processing',
        message: 'Processing...',
        step: 'generation'
      });

    } else if (currentStep === 'faceswap' || currentStep === 'faceswap1') {
      // Check Replicate face swap status
      console.log('Checking Replicate face swap status...');
      const replicateToken = process.env.REPLICATE_API_TOKEN;
      
      if (!replicateToken) {
        return res.status(500).json({
          status: 'failed',
          error: 'Configuration error'
        });
      }

      try {
        const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${requestId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Token ${replicateToken}`
          }
        });

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          console.error('Replicate status error:', errorText);
          return res.status(200).json({
            status: 'processing',
            message: currentStep === 'faceswap1' ? 'Swapping first face... 🎭' : 'Swapping face... 🎭',
            step: currentStep
          });
        }

        const statusData = await statusResponse.json();
        console.log('Replicate status:', statusData.status);

        if (statusData.status === 'succeeded') {
          console.log('Face swap succeeded!');
          
          // Replicate returns the image URL directly in output
          const imageUrl = statusData.output;
          
          if (!imageUrl) {
            console.error('No output from Replicate');
            return res.status(500).json({
              status: 'failed',
              error: 'No output from face swap'
            });
          }

          console.log('Face swap result URL:', imageUrl);

          // Check if we need second face swap
          if (currentStep === 'faceswap1' && photo2) {
            console.log('Starting second Replicate face swap with photo2');
            
            try {
              const swapResponse = await fetch('https://api.replicate.com/v1/predictions', {
                method: 'POST',
                headers: {
                  'Authorization': `Token ${replicateToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  version: "c2d783366e8d32e6e82c40682fab6b4c23b9c6eff2692eb2cf4f9d894415d89c",
                  input: {
                    source_image: photo2,
                    target_image: imageUrl,
                    cache_days: 1,
                    face_index: 1  // Try to target second face
                  }
                })
              });

              if (!swapResponse.ok) {
                const errorText = await swapResponse.text();
                console.error('Second Replicate swap failed to start:', errorText);
                // Return first swap result
                return res.status(200).json({
                  status: 'completed',
                  imageUrl: imageUrl
                });
              }

              const swapData = await swapResponse.json();
              console.log('Replicate second face swap started:', swapData.id);

              return res.status(200).json({
                status: 'processing',
                message: 'Adding second face to the poster... 🎭',
                step: 'faceswap2',
                swapRequestId: swapData.id
              });
            } catch (error) {
              console.error('Second Replicate swap error:', error);
              return res.status(200).json({
                status: 'completed',
                imageUrl: imageUrl
              });
            }
          }

          // Done!
          return res.status(200).json({
            status: 'completed',
            imageUrl: imageUrl
          });
        }

        if (statusData.status === 'failed' || statusData.status === 'canceled') {
          console.error('Replicate face swap failed:', statusData.error);
          return res.status(500).json({
            status: 'failed',
            error: 'Face swap failed'
          });
        }

        // Still processing (starting, processing)
        return res.status(200).json({
          status: 'processing',
          message: currentStep === 'faceswap1' ? 'Swapping first face... 🎭' : 'Swapping face... 🎭',
          step: currentStep
        });
      } catch (error) {
        console.error('Replicate check error:', error);
        return res.status(200).json({
          status: 'processing',
          message: 'Swapping faces... 🎭',
          step: currentStep
        });
      }

    } else if (currentStep === 'faceswap2') {
      // Check second Replicate face swap status
      console.log('Checking second Replicate face swap status...');
      const replicateToken = process.env.REPLICATE_API_TOKEN;
      
      if (!replicateToken) {
        return res.status(500).json({
          status: 'failed',
          error: 'Configuration error'
        });
      }

      try {
        const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${requestId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Token ${replicateToken}`
          }
        });

        if (!statusResponse.ok) {
          return res.status(200).json({
            status: 'processing',
            message: 'Swapping second face... 🎭',
            step: 'faceswap2'
          });
        }

        const statusData = await statusResponse.json();

        if (statusData.status === 'succeeded') {
          console.log('Second face swap succeeded!');
          
          const imageUrl = statusData.output;
          
          if (!imageUrl) {
            return res.status(500).json({
              status: 'failed',
              error: 'No output from second face swap'
            });
          }

          return res.status(200).json({
            status: 'completed',
            imageUrl: imageUrl
          });
        }

        if (statusData.status === 'failed' || statusData.status === 'canceled') {
          console.error('Second Replicate face swap failed');
          return res.status(500).json({
            status: 'failed',
            error: 'Second face swap failed'
          });
        }

        // Still processing
        return res.status(200).json({
          status: 'processing',
          message: 'Swapping second face... 🎭',
          step: 'faceswap2'
        });
      } catch (error) {
        console.error('Second Replicate check error:', error);
        return res.status(200).json({
          status: 'processing',
          message: 'Swapping second face... 🎭',
          step: 'faceswap2'
        });
      }
    }

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
