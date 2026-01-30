/**
 * Shared speech bubble drawing module.
 * Supports light/dark themes, code detection, and click-to-continue indicator.
 */

/**
 * Draw a speech bubble with text.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} options
 * @param {string} options.text - The text to display
 * @param {number} options.anchorX - X position of the anchor point (where tail points)
 * @param {number} options.anchorY - Y position of the anchor point
 * @param {number} [options.maxWidth=280] - Maximum bubble width
 * @param {'light'|'dark'|'auto'} [options.theme='auto'] - Color theme
 * @param {boolean} [options.isCode] - Force code styling (auto-detected if not set)
 * @param {'up'|'down'} [options.tailDirection='down'] - Tail points toward anchor
 * @param {boolean} [options.showClickIndicator=false] - Show "Click to continue" hint
 * @param {number} [options.maxLines=12] - Maximum lines to show before truncating
 */
export function drawSpeechBubble(ctx, options) {
  const {
    text,
    anchorX,
    anchorY,
    maxWidth = 280,
    theme = 'auto',
    tailDirection = 'down',
    showClickIndicator = false,
    maxLines = 12,
  } = options;

  // Auto-detect code
  const isCode = options.isCode !== undefined ? options.isCode : detectCode(text);
  const isDark = theme === 'dark' || (theme === 'auto' && isCode);

  const padding = 10;
  const fontSize = 11;
  const lineHeight = 14;
  const tailH = 10;

  // Theme colors
  const bgColor = isDark ? '#1e1e1e' : '#ffffff';
  const borderColor = isDark ? '#4285f4' : '#000000';
  const textColor = isDark ? '#9cdcfe' : '#000000';
  const indicatorColor = isDark ? '#888888' : '#666666';

  ctx.font = isCode ? `${fontSize}px monospace` : `bold ${fontSize}px Arial, sans-serif`;

  // Split and wrap text
  let lines = [];
  const codeMaxLines = Math.min(maxLines, 8); // Code gets fewer lines

  if (isCode) {
    const codeLines = text.split('\n');
    // If code is minified (single long line), wrap it
    if (codeLines.length === 1 && codeLines[0].length > 45) {
      const code = codeLines[0];
      const charsPerLine = 38;
      for (let i = 0; i < code.length && lines.length < codeMaxLines - 1; i += charsPerLine) {
        lines.push(code.substring(i, i + charsPerLine));
      }
      if (code.length > charsPerLine * (codeMaxLines - 1)) {
        lines.push('...');
      }
    } else {
      // Multi-line code: show each line, truncate if needed
      for (const line of codeLines) {
        if (lines.length >= codeMaxLines - 1) {
          lines.push('...');
          break;
        }
        const truncated = line.length > 40 ? line.substring(0, 37) + '...' : line;
        lines.push(truncated);
      }
    }
  } else {
    // Word wrap for regular text
    const words = text.split(' ');
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      if (ctx.measureText(testLine).width > maxWidth - padding * 2) {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
        if (lines.length >= maxLines - 1) {
          lines.push('...');
          currentLine = '';
          break;
        }
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine && lines.length < maxLines) lines.push(currentLine);
  }

  // Add click indicator line
  if (showClickIndicator) {
    lines.push('');
    lines.push('[ Click to continue ]');
  }

  // Calculate bubble dimensions
  let bubbleW = padding * 2;
  for (const line of lines) {
    bubbleW = Math.max(bubbleW, ctx.measureText(line).width + padding * 2);
  }
  bubbleW = Math.min(bubbleW, maxWidth);
  const bubbleH = lines.length * lineHeight + padding * 2;

  // Position bubble above or below anchor
  const bubbleX = anchorX - bubbleW / 2;
  const bubbleY = tailDirection === 'down'
    ? anchorY - bubbleH - tailH - 8
    : anchorY + tailH + 8;

  // Draw bubble background
  ctx.fillStyle = bgColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 8);
  ctx.fill();
  ctx.stroke();

  // Draw tail
  ctx.fillStyle = bgColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (tailDirection === 'down') {
    ctx.moveTo(anchorX - 8, bubbleY + bubbleH);
    ctx.lineTo(anchorX + 8, bubbleY + bubbleH);
    ctx.lineTo(anchorX, bubbleY + bubbleH + tailH);
  } else {
    ctx.moveTo(anchorX - 8, bubbleY);
    ctx.lineTo(anchorX + 8, bubbleY);
    ctx.lineTo(anchorX, bubbleY - tailH);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cover the tail join line
  ctx.fillStyle = bgColor;
  if (tailDirection === 'down') {
    ctx.fillRect(anchorX - 7, bubbleY + bubbleH - 2, 14, 4);
  } else {
    ctx.fillRect(anchorX - 7, bubbleY - 2, 14, 4);
  }

  // Draw text
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    // Click indicator uses different color
    if (showClickIndicator && i === lines.length - 1) {
      ctx.fillStyle = indicatorColor;
      ctx.font = `italic ${fontSize - 1}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(lines[i], anchorX, bubbleY + padding + i * lineHeight);
      ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = textColor;
      ctx.font = isCode ? `${fontSize}px monospace` : `bold ${fontSize}px Arial, sans-serif`;
      ctx.fillText(lines[i], bubbleX + padding, bubbleY + padding + i * lineHeight);
    }
  }
  ctx.textAlign = 'left';

  // Return bubble bounds for click detection
  return {
    x: bubbleX,
    y: bubbleY,
    width: bubbleW,
    height: bubbleH + tailH,
  };
}

/**
 * Check if text looks like code.
 */
function detectCode(text) {
  return text.includes('function') ||
         text.includes('const ') ||
         text.includes('let ') ||
         text.includes('var ') ||
         text.includes('world.') ||
         text.includes('planck.') ||
         text.includes('{') ||
         text.includes('return ');
}
