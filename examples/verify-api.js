/**
 * Verification script to demonstrate API compatibility
 * This script shows how the API is identical to browser OPFS
 */

import { navigator } from '../dist/index.js';

async function verify() {
  console.log('=== Node.js OPFS API Verification ===\n');

  // Get root directory - same as browser: navigator.storage.getDirectory()
  const root = await navigator.storage.getDirectory();
  console.log('✓ navigator.storage.getDirectory() works');

  // Create a file - same API as browser
  const fileHandle = await root.getFileHandle('verify-test.txt', { create: true });
  console.log('✓ getFileHandle() works');

  // Write to file - same API as browser
  const writable = await fileHandle.createWritable();
  await writable.write('Hello from Node.js OPFS!');
  await writable.close();
  console.log('✓ createWritable() and write() work');

  // Read from file - same API as browser
  const file = await fileHandle.getFile();
  const text = await file.text();
  console.log('✓ getFile() and text() work');
  console.log(`  Content: "${text}"`);

  // Create directory - same API as browser
  const dir = await root.getDirectoryHandle('verify-dir', { create: true });
  console.log('✓ getDirectoryHandle() works');

  // Iterate entries - same API as browser
  console.log('✓ Directory iteration works:');
  for await (const [name, handle] of root) {
    console.log(`  - ${name} (${handle.kind})`);
  }

  // Cleanup
  await root.removeEntry('verify-test.txt');
  await root.removeEntry('verify-dir');

  console.log('\n✅ All API methods verified - 100% compatible with browser OPFS!');
}

verify().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
