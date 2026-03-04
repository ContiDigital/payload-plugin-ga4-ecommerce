import { buildConfig } from 'payload';
import devConfig from './dev/payload.config.js';

async function run() {
  const config = await devConfig;
  const slugs = config.collections.map(c => c.slug);
  console.log("Registered Collections:", slugs);
  if (slugs.includes('ga4-analytics-cache')) {
    console.log("CACHE COLLECTION FOUND AND WORKING!");
  } else {
    console.log("CACHE COLLECTION MISSING!");
  }
}
run();
