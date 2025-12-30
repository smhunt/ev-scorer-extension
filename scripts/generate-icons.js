// Generate extension icons
// Run with: node scripts/generate-icons.js

const fs = require('fs');
const path = require('path');

// Simple PNG generator - creates a colored square with "EV" text
// For a production extension, you'd use proper image tools

// PNG header and IHDR chunk creator
function createPNG(size, bgColor, textColor) {
  // For simplicity, we'll create basic PNG data
  // This is a minimal implementation

  const { createCanvas } = require('canvas');
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background with gradient
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#635bff');
  gradient.addColorStop(1, '#4f46e5');

  // Rounded rectangle
  const radius = size * 0.2;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Lightning bolt / EV icon
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'white';
  ctx.lineWidth = size * 0.06;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Draw stylized layers (like the sidebar icon)
  const cx = size / 2;
  const cy = size / 2;
  const s = size * 0.3;

  ctx.beginPath();
  // Top layer
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx - s, cy - s * 0.3);
  ctx.lineTo(cx + s, cy - s * 0.3);
  ctx.closePath();
  ctx.fill();

  // Middle layer
  ctx.beginPath();
  ctx.moveTo(cx - s, cy + s * 0.1);
  ctx.lineTo(cx + s, cy + s * 0.1);
  ctx.lineTo(cx, cy + s * 0.5);
  ctx.closePath();
  ctx.fill();

  // Bottom layer
  ctx.beginPath();
  ctx.moveTo(cx - s, cy + s * 0.5);
  ctx.lineTo(cx + s, cy + s * 0.5);
  ctx.lineTo(cx, cy + s);
  ctx.closePath();
  ctx.fill();

  return canvas.toBuffer('image/png');
}

// Check if canvas is available
try {
  require('canvas');

  const sizes = [16, 48, 128];
  const iconsDir = path.join(__dirname, '..', 'icons');

  sizes.forEach(size => {
    const buffer = createPNG(size);
    fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buffer);
    console.log(`Created icon${size}.png`);
  });

  console.log('Icons generated successfully!');
} catch (e) {
  console.log('Canvas module not available. Creating placeholder icons...');
  console.log('For proper icons, install canvas: npm install canvas');
  console.log('Or manually create icon16.png, icon48.png, icon128.png');

  // Create a simple HTML file to generate icons in browser
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Generate Icons</title>
</head>
<body>
  <h1>EV Scorer Icons</h1>
  <p>Right-click each icon and save as PNG:</p>
  <div id="icons"></div>
  <script>
    const sizes = [16, 48, 128];
    const container = document.getElementById('icons');

    sizes.forEach(size => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.style.margin = '10px';
      canvas.style.border = '1px solid #ccc';

      const ctx = canvas.getContext('2d');

      // Background gradient
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, '#635bff');
      gradient.addColorStop(1, '#4f46e5');

      // Rounded rect
      const r = size * 0.15;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(size - r, 0);
      ctx.quadraticCurveTo(size, 0, size, r);
      ctx.lineTo(size, size - r);
      ctx.quadraticCurveTo(size, size, size - r, size);
      ctx.lineTo(r, size);
      ctx.quadraticCurveTo(0, size, 0, size - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Layers icon
      ctx.strokeStyle = 'white';
      ctx.lineWidth = Math.max(1, size * 0.08);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const cx = size / 2;
      const cy = size / 2;
      const s = size * 0.28;

      // Draw 3 stacked layers
      [[0, -0.4], [0, 0], [0, 0.4]].forEach(([ox, oy], i) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy + oy * s - s * 0.3);
        ctx.lineTo(cx - s, cy + oy * s);
        ctx.lineTo(cx, cy + oy * s + s * 0.3);
        ctx.lineTo(cx + s, cy + oy * s);
        ctx.closePath();
        if (i === 0) {
          ctx.fillStyle = 'white';
          ctx.fill();
        } else {
          ctx.stroke();
        }
      });

      const label = document.createElement('div');
      label.innerHTML = '<br>icon' + size + '.png';

      const wrapper = document.createElement('div');
      wrapper.style.display = 'inline-block';
      wrapper.style.textAlign = 'center';
      wrapper.appendChild(canvas);
      wrapper.appendChild(label);

      container.appendChild(wrapper);
    });
  </script>
</body>
</html>`;

  const iconsDir = path.join(__dirname, '..', 'icons');
  fs.writeFileSync(path.join(iconsDir, 'generate.html'), html);
  console.log('Created icons/generate.html - open in browser to create icons');
}
