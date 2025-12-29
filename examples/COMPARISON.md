# Browser vs Node.js Code Comparison

This example demonstrates how the exact same code can work in both browser and Node.js environments.

## Shared Code (works in both environments)

```javascript
// This code works identically in both browser and Node.js!
async function saveUserData(name, email) {
  // Get the root directory
  const root = await navigator.storage.getDirectory();
  
  // Create a user data file
  const fileHandle = await root.getFileHandle('user.json', { create: true });
  
  // Write user data
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify({ name, email }, null, 2));
  await writable.close();
  
  console.log('User data saved!');
}

async function loadUserData() {
  // Get the root directory
  const root = await navigator.storage.getDirectory();
  
  // Get the user data file
  const fileHandle = await root.getFileHandle('user.json');
  
  // Read user data
  const file = await fileHandle.getFile();
  const text = await file.text();
  
  return JSON.parse(text);
}
```

## Browser Environment

```html
<!DOCTYPE html>
<html>
<head>
  <title>OPFS Browser Example</title>
</head>
<body>
  <h1>Browser OPFS Example</h1>
  <button onclick="saveData()">Save Data</button>
  <button onclick="loadData()">Load Data</button>
  
  <script type="module">
    // Use the browser's native OPFS API
    async function saveUserData(name, email) {
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle('user.json', { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify({ name, email }, null, 2));
      await writable.close();
      console.log('User data saved!');
    }
    
    async function loadUserData() {
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle('user.json');
      const file = await fileHandle.getFile();
      const text = await file.text();
      return JSON.parse(text);
    }
    
    window.saveData = async () => {
      await saveUserData('John Doe', 'john@example.com');
      alert('Data saved!');
    };
    
    window.loadData = async () => {
      const data = await loadUserData();
      alert(`Loaded: ${data.name} (${data.email})`);
    };
  </script>
</body>
</html>
```

## Node.js Environment

```javascript
// app.js
import { navigator } from 'node-opfs';

// Use the same functions - no changes needed!
async function saveUserData(name, email) {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle('user.json', { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify({ name, email }, null, 2));
  await writable.close();
  console.log('User data saved!');
}

async function loadUserData() {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle('user.json');
  const file = await fileHandle.getFile();
  const text = await file.text();
  return JSON.parse(text);
}

// Use the functions
await saveUserData('John Doe', 'john@example.com');
const data = await loadUserData();
console.log('Loaded:', data);
```

## Universal Module Pattern

For maximum compatibility, you can use a conditional import:

```javascript
// universal-storage.js
let navigator;

if (typeof window !== 'undefined') {
  // Running in browser - use native OPFS
  navigator = window.navigator;
} else {
  // Running in Node.js - use node-opfs
  const nodeOpfs = await import('node-opfs');
  navigator = nodeOpfs.navigator;
}

// Now use navigator.storage.getDirectory() the same way in both environments
export { navigator };
```

## Key Benefits

1. **Write Once, Run Anywhere**: Same code works in browser and Node.js
2. **No Polyfills Needed**: Direct API compatibility
3. **Type Safety**: Full TypeScript support in both environments
4. **Testing**: Test your browser OPFS code in Node.js
5. **Server-Side Rendering**: Use OPFS API in SSR applications
