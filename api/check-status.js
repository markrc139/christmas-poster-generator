import FormData from 'form-data';
import { createFaceZip } from './utils/zip-helper.js';

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
        
        console.log('FLUX Pro non-OK response:', resultResponse.status, errorText);
        
        if (errorText.includes('still in progress') || errorText.includes('IN_PROGRESS')) {
          console.log('Still in progress');
          return res.status(200).json({
            status: 'processing',
            message: 'Generating scene... 🎬',
            step: 'generation'
          });
        }
        
        // Log the full error for debugging
        console.error('FLUX Pro check error - Status:', resultResponse.status, 'Body:', errorText);
        
        // Try to parse as JSON to see if there's more info
        try {
          const errorJson = JSON.parse(errorText);
          console.error('FLUX Pro error details:', JSON.stringify(errorJson, null, 2));
        } catch (e) {
          // Not JSON, already logged as text
        }
        
        return res.status(200).json({
          status: 'processing',
          message: 'Processing your request...',
          step: 'generation'
        });
      }

      const result = await resultResponse.json();
      console.log('FLUX Pro result received');
      console.log('Result structure:', Object.keys(result));
      
      // Log what fields are present to help debug
      if (result.images) console.log('result.images found, count:', result.images.length);
      if (result.data) console.log('result.data found');
      if (result.output) console.log('result.output found');

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

        // REMAKER.AI INTEGRATION: Multi-face swap approach
        console.log('Starting face swap with Remaker.ai');
        const remakerKey = process.env.REMAKER_API_KEY;

        if (!remakerKey) {
          console.error('REMAKER_API_KEY not configured');
          return res.status(200).json({
            status: 'completed',
            imageUrl: generatedImageUrl,
            warning: 'Face swap unavailable - API key not configured'
          });
        }

        // Determine swap strategy based on number of photos
        if (photo1 && !photo2) {
          // Single face swap - use simple endpoint
          console.log('Single face swap with Remaker');
          
          try {
            const formData = new FormData();
            
            // Convert base64 to buffer
            const photo1Buffer = Buffer.from(
              photo1.replace(/^data:image\/\w+;base64,/, ''),
              'base64'
            );
            const targetBuffer = await fetch(generatedImageUrl)
              .then(r => r.arrayBuffer())
              .then(b => Buffer.from(b));
            
            formData.append('target_image', targetBuffer, {
              filename: 'target.jpg',
              contentType: 'image/jpeg'
            });
            formData.append('swap_image', photo1Buffer, {
              filename: 'source.jpg',
              contentType: 'image/jpeg'
            });
            
            const swapResponse = await fetch(
              'https://developer.remaker.ai/api/remaker/v1/face-swap/create-job',
              {
                method: 'POST',
                headers: {
                  'accept': 'application/json',
                  'Authorization': remakerKey,
                  ...formData.getHeaders()
                },
                body: formData
              }
            );

            if (!swapResponse.ok) {
              const errorText = await swapResponse.text();
              console.error('Single face swap error:', errorText);
              return res.status(200).json({
                status: 'completed',
                imageUrl: generatedImageUrl,
                warning: 'Face swap failed, returning original'
              });
            }

            const swapData = await swapResponse.json();
            
            if (swapData.code !== 100000) {
              console.error('Face swap error:', swapData.message);
              return res.status(200).json({
                status: 'completed',
                imageUrl: generatedImageUrl,
                warning: 'Face swap failed'
              });
            }
            
            const swapJobId = swapData.result.job_id;
            console.log('Single face swap started:', swapJobId);

            return res.status(200).json({
              status: 'processing',
              message: 'Adding your face to the poster... 🎭',
              step: 'faceswap-single',
              swapRequestId: swapJobId
            });
            
          } catch (error) {
            console.error('Single face swap error:', error);
            return res.status(200).json({
              status: 'completed',
              imageUrl: generatedImageUrl,
              warning: 'Face swap failed'
            });
          }
          
        } else if (photo1 && photo2) {
          // MULTI-FACE SWAP: Use Remaker's multi-face detection approach
          console.log('Starting multi-face swap - Step 1: Face Detection');
          
          try {
            // Step 1: Detect faces in the generated image
            const formData = new FormData();
            
            // Fetch and convert the generated image to a buffer
            console.log('Fetching generated image for face detection:', generatedImageUrl);
            const targetImageResponse = await fetch(generatedImageUrl);
            if (!targetImageResponse.ok) {
              throw new Error('Failed to fetch generated image');
            }
            const targetImageBuffer = await targetImageResponse.arrayBuffer();
            
            // Append the image as a file - use buffer directly
            const imageBuffer = Buffer.from(targetImageBuffer);
            formData.append('target_image', imageBuffer, 'target.jpg');
            
            console.log('Sending face detection request with image file');
            
            const detectResponse = await fetch(
              'https://developer.remaker.ai/api/remaker/v1/face-detect/create-detect',
              {
                method: 'POST',
                headers: {
                  'accept': 'application/json',
                  'Authorization': remakerKey,
                  ...formData.getHeaders()
                },
                body: formData
              }
            );

            if (!detectResponse.ok) {
              const errorText = await detectResponse.text();
              console.error('Face detection initiation failed:', errorText);
              
              // Fallback: return original image
              return res.status(200).json({
                status: 'completed',
                imageUrl: generatedImageUrl,
                warning: 'Face detection failed, returning original'
              });
            }

            const detectData = await detectResponse.json();
            
            if (detectData.code !== 100000) {
              console.error('Face detection error:', detectData.message);
              return res.status(200).json({
                status: 'completed',
                imageUrl: generatedImageUrl,
                warning: 'Face detection failed'
              });
            }

            const detectJobId = detectData.result.job_id;
            console.log('Face detection started:', detectJobId);

            return res.status(200).json({
              status: 'processing',
              message: 'Detecting faces in the poster... 🔍',
              step: 'face-detect',
              detectJobId: detectJobId,
              generatedImageUrl: generatedImageUrl // Pass through for next step
            });
            
          } catch (error) {
            console.error('Multi-face detection error:', error);
            return res.status(200).json({
              status: 'completed',
              imageUrl: generatedImageUrl,
              warning: 'Face detection failed'
            });
          }
        }
      }

      // Still generating
      return res.status(200).json({
        status: 'processing',
        message: 'Creating your Christmas poster... 🎨',
        step: 'generation'
      });

    } else if (currentStep === 'faceswap-single') {
      // Check single face swap status
      console.log('Checking single face swap status...');
      const remakerKey = process.env.REMAKER_API_KEY;
      
      if (!remakerKey) {
        return res.status(500).json({
          status: 'failed',
          error: 'Configuration error'
        });
      }

      try {
        const statusResponse = await fetch(
          `https://developer.remaker.ai/api/remaker/v1/face-swap/face-swap/${requestId}`,
          {
            method: 'GET',
            headers: {
              'accept': 'application/json',
              'Authorization': remakerKey
            }
          }
        );

        if (!statusResponse.ok) {
          return res.status(200).json({
            status: 'processing',
            message: 'Swapping face... 🎭',
            step: 'faceswap-single'
          });
        }

        const statusData = await statusResponse.json();
        
        if (statusData.code === 100000 && statusData.result.output_image_url) {
          console.log('Single face swap complete!');
          const finalImageUrl = statusData.result.output_image_url[0];
          
          return res.status(200).json({
            status: 'completed',
            imageUrl: finalImageUrl
          });
        }

        // Still processing
        return res.status(200).json({
          status: 'processing',
          message: 'Swapping face... 🎭',
          step: 'faceswap-single'
        });
        
      } catch (error) {
        console.error('Single face swap check error:', error);
        return res.status(200).json({
          status: 'processing',
          message: 'Processing...',
          step: 'faceswap-single'
        });
      }

    } else if (currentStep === 'face-detect') {
      // Check face detection status
      console.log('Checking face detection status...');
      const remakerKey = process.env.REMAKER_API_KEY;
      
      if (!remakerKey) {
        return res.status(500).json({
          status: 'failed',
          error: 'Configuration error'
        });
      }

      try {
        const statusResponse = await fetch(
          `https://developer.remaker.ai/api/remaker/v1/face-detect/face-detect/${requestId}`,
          {
            method: 'GET',
            headers: {
              'accept': 'application/json',
              'Authorization': remakerKey
            }
          }
        );

        if (!statusResponse.ok) {
          return res.status(200).json({
            status: 'processing',
            message: 'Detecting faces... 🔍',
            step: 'face-detect'
          });
        }

        const statusData = await statusResponse.json();
        
        if (statusData.code === 100000 && statusData.result.output_image_url) {
          console.log('Faces detected! Count:', statusData.result.output_image_url[0].length);
          console.log('Face coordinates:', statusData.result.output_image_url[0]);
          
          // Now initiate the multi-face swap
          console.log('Starting multi-face swap with both photos');
          
          // Get the original generated image URL from the request body
          // (We need to pass it through from the previous step)
          const targetImageUrl = req.body.generatedImageUrl;
          
          if (!targetImageUrl) {
            console.error('No target image URL provided');
            return res.status(500).json({
              status: 'failed',
              error: 'Target image URL missing'
            });
          }
          
          // Create ZIP file with both photos
          const faceZipBuffer = await createFaceZip(photo1, photo2);
          
          // Fetch the target image
          const targetImageResponse = await fetch(targetImageUrl);
          const targetImageBuffer = await targetImageResponse.arrayBuffer();
          
          // Create form data
          const formData = new FormData();
          formData.append('target_image', Buffer.from(targetImageBuffer), {
            filename: 'target.jpg',
            contentType: 'image/jpeg'
          });
          formData.append('model_face', faceZipBuffer, {
            filename: 'faces.zip',
            contentType: 'application/zip'
          });
          
          // Submit multi-face swap
          const swapResponse = await fetch(
            'https://developer.remaker.ai/api/remaker/v1/face-detect/create-swap',
            {
              method: 'POST',
              headers: {
                'accept': 'application/json',
                'Authorization': remakerKey,
                ...formData.getHeaders()
              },
              body: formData
            }
          );

          if (!swapResponse.ok) {
            const errorText = await swapResponse.text();
            console.error('Multi-face swap initiation failed:', errorText);
            return res.status(500).json({
              status: 'failed',
              error: 'Face swap initiation failed'
            });
          }

          const swapData = await swapResponse.json();
          
          if (swapData.code !== 100000) {
            console.error('Multi-face swap error:', swapData.message);
            return res.status(500).json({
              status: 'failed',
              error: 'Face swap failed'
            });
          }

          const swapJobId = swapData.result.job_id;
          console.log('Multi-face swap started:', swapJobId);

          return res.status(200).json({
            status: 'processing',
            message: 'Swapping both faces... 🎭🎭',
            step: 'face-swap-multi',
            swapRequestId: swapJobId
          });
        }
        
        // Still detecting
        return res.status(200).json({
          status: 'processing',
          message: 'Detecting faces... 🔍',
          step: 'face-detect'
        });
        
      } catch (error) {
        console.error('Face detection check error:', error);
        return res.status(200).json({
          status: 'processing',
          message: 'Processing...',
          step: 'face-detect'
        });
      }

    } else if (currentStep === 'face-swap-multi') {
      // Check multi-face swap status
      console.log('Checking multi-face swap status...');
      const remakerKey = process.env.REMAKER_API_KEY;
      
      if (!remakerKey) {
        return res.status(500).json({
          status: 'failed',
          error: 'Configuration error'
        });
      }

      try {
        const statusResponse = await fetch(
          `https://developer.remaker.ai/api/remaker/v1/face-detect/face-detect/${requestId}`,
          {
            method: 'GET',
            headers: {
              'accept': 'application/json',
              'Authorization': remakerKey
            }
          }
        );

        if (!statusResponse.ok) {
          return res.status(200).json({
            status: 'processing',
            message: 'Swapping faces... 🎭🎭',
            step: 'face-swap-multi'
          });
        }

        const statusData = await statusResponse.json();
        
        if (statusData.code === 100000 && statusData.result.output_image_url) {
          console.log('Multi-face swap complete!');
          const finalImageUrl = statusData.result.output_image_url[0];
          
          return res.status(200).json({
            status: 'completed',
            imageUrl: finalImageUrl
          });
        }

        // Check if still in progress
        if (statusData.code === 300102) {
          // Still processing
          const progress = statusData.result.progress || 0;
          return res.status(200).json({
            status: 'processing',
            message: `Swapping faces... ${progress}% 🎭🎭`,
            step: 'face-swap-multi'
          });
        }

        // Still processing (other cases)
        return res.status(200).json({
          status: 'processing',
          message: 'Swapping faces... 🎭🎭',
          step: 'face-swap-multi'
        });
        
      } catch (error) {
        console.error('Multi-face swap check error:', error);
        return res.status(200).json({
          status: 'processing',
          message: 'Processing...',
          step: 'face-swap-multi'
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
