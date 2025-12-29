import { navigator, StorageManager } from '../dist/index.js';

async function main() {
  console.log('Node.js OPFS Example\n');

  // Example 1: Basic file operations
  console.log('Example 1: Basic file operations');
  const root = await navigator.storage.getDirectory();
  
  const fileHandle = await root.getFileHandle('example.txt', { create: true });
  
  // Write to the file
  const writable = await fileHandle.createWritable();
  await writable.write('Hello from Node.js OPFS!');
  await writable.close();
  console.log('✓ File created and written');
  
  // Read from the file
  const file = await fileHandle.getFile();
  const text = await file.text();
  console.log('✓ File content:', text);
  console.log();

  // Example 2: Working with directories
  console.log('Example 2: Working with directories');
  const documentsDir = await root.getDirectoryHandle('documents', { create: true });
  const projectsDir = await documentsDir.getDirectoryHandle('projects', { create: true });
  console.log('✓ Created nested directories: documents/projects');
  
  // Create files in the nested directory
  const readmeHandle = await projectsDir.getFileHandle('README.md', { create: true });
  const readmeWritable = await readmeHandle.createWritable();
  await readmeWritable.write('# My Project\n\nThis is a sample project.');
  await readmeWritable.close();
  console.log('✓ Created README.md in projects directory');
  console.log();

  // Example 3: Listing directory contents
  console.log('Example 3: Listing directory contents');
  console.log('Root directory contents:');
  for await (const [name, handle] of root) {
    console.log(`  - ${name} (${handle.kind})`);
  }
  console.log();

  // Example 4: Advanced write operations
  console.log('Example 4: Advanced write operations');
  const dataHandle = await root.getFileHandle('data.txt', { create: true });
  const dataWritable = await dataHandle.createWritable();
  
  // Write data
  await dataWritable.write('0123456789');
  
  // Seek and overwrite
  await dataWritable.write({ type: 'seek', position: 5 });
  await dataWritable.write('HELLO');
  
  await dataWritable.close();
  
  const dataFile = await dataHandle.getFile();
  const dataText = await dataFile.text();
  console.log('✓ Advanced write result:', dataText);
  console.log();

  // Example 5: Custom storage location
  console.log('Example 5: Custom storage location');
  const customStorage = new StorageManager('./custom-opfs-storage');
  const customRoot = await customStorage.getDirectory();
  
  const customFile = await customRoot.getFileHandle('custom.txt', { create: true });
  const customWritable = await customFile.createWritable();
  await customWritable.write('This is stored in a custom location!');
  await customWritable.close();
  console.log('✓ Created file in custom location: ./custom-opfs-storage');
  console.log();

  // Example 6: Removing entries
  console.log('Example 6: Removing entries');
  await root.removeEntry('data.txt');
  console.log('✓ Removed data.txt');
  
  // Remove directory recursively
  await root.removeEntry('documents', { recursive: true });
  console.log('✓ Removed documents directory recursively');
  console.log();

  // Example 7: Resolving paths
  console.log('Example 7: Resolving paths');
  const testDir = await root.getDirectoryHandle('test', { create: true });
  const testFile = await testDir.getFileHandle('file.txt', { create: true });
  
  const path = await root.resolve(testFile);
  console.log('✓ Path from root to file:', path.join('/'));
  console.log();

  // Cleanup
  await root.removeEntry('test', { recursive: true });
  await root.removeEntry('example.txt');
  await customRoot.removeEntry('custom.txt');
  
  console.log('✓ Cleaned up example files');
  console.log('\nExample completed successfully!');
}

main().catch(console.error);
