const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const source = path.join(root, 'node_modules', 'three');
const target = path.join(root, 'game', 'vendor', 'three');
fs.mkdirSync(target, { recursive: true });
fs.cpSync(path.join(source, 'build'), path.join(target, 'build'), { recursive: true });
fs.cpSync(path.join(source, 'examples', 'jsm'), path.join(target, 'addons'), { recursive: true });
console.log('Three.js local pronto');
