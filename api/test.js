export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).json({ 
    message: 'Test endpoint works!', 
    env: process.env.FAL_KEY ? 'API key exists' : 'No API key',
    nodeVersion: process.version
  });
}
