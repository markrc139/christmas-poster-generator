import JSZip from 'jszip';

/**
 * Creates a ZIP file containing two face images in the correct order
 * Order matters: face1.jpg = left person, face2.jpg = right person
 * This matches the left-to-right order that Remaker's face detection uses
 * 
 * @param {string} photo1Base64 - Base64 string of first photo (left person)
 * @param {string} photo2Base64 - Base64 string of second photo (right person)
 * @returns {Promise<Buffer>} ZIP file as buffer
 */
export async function createFaceZip(photo1Base64, photo2Base64) {
  const zip = new JSZip();
  
  // Remove data URI prefix if present (e.g., "data:image/jpeg;base64,")
  const cleanBase64_1 = photo1Base64.replace(/^data:image\/\w+;base64,/, '');
  const cleanBase64_2 = photo2Base64.replace(/^data:image\/\w+;base64,/, '');
  
  // Add files in order - CRITICAL: Order must match detected face positions
  // Remaker detects faces left-to-right, so face1.jpg goes on left person
  zip.file('face1.jpg', cleanBase64_1, { base64: true });
  zip.file('face2.jpg', cleanBase64_2, { base64: true });
  
  // Generate and return as Node buffer
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  
  console.log('Created face ZIP file, size:', zipBuffer.length, 'bytes');
  return zipBuffer;
}

/**
 * Validates that a base64 string is a valid image
 * @param {string} base64String - Base64 image string
 * @returns {boolean} True if valid
 */
export function isValidImageBase64(base64String) {
  if (!base64String || typeof base64String !== 'string') {
    return false;
  }
  
  // Check for data URI prefix
  const dataUriRegex = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/;
  if (dataUriRegex.test(base64String)) {
    return true;
  }
  
  // Check for raw base64 (roughly)
  const base64Regex = /^[A-Za-z0-9+/=]+$/;
  return base64Regex.test(base64String) && base64String.length > 100;
}
