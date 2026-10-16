import {createServer} from '../src/server/server.js';

// Reuse the existing HTTP route table inside one Vercel Node Function.
// Static files are emitted separately by the curated Vercel site build.
const application = createServer();

export default function handler(request, response) {
  application.emit('request', request, response);
}
