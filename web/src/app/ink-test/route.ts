export function GET() {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Orbit Ink Lab</title>
<style>
  html, body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f8fafc; }
  body { padding: 16px; }
  h1 { font-size: 20px; margin: 0 0 6px; }
  .hint { color: #64748b; font-size: 14px; margin: 0 0 16px; }
  .pads { display: grid; gap: 16px; grid-template-columns: 1fr; }
  @media (min-width: 1000px) { .pads { grid-template-columns: repeat(3, 1fr); } }
  .pad { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; }
  .pad h2 { font-size: 15px; margin: 0 0 8px; }
  .ink { display: block; width: 100%; height: 220px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; }
  #pad1, #pad3 { touch-action: none; }
  #pad2 { touch-action: manipulation; }
  .stat { font: 12px ui-monospace, SFMono-Regular, monospace; color: #334155; margin-top: 8px; white-space: pre-wrap; min-height: 60px; }
  .badge { display: inline-block; background: #eef2ff; color: #4338ca; border-radius: 6px; padding: 2px 6px; font-size: 11px; margin-left: 6px; }
</style>
</head>
<body>
<h1>Orbit Ink Lab <span class="badge">ink-lab-v1</span></h1>
<p class="hint">Draw 3 quick separate strokes in each pad (dots or short lines, right after each other). The stroke counter should reach 3 in every pad. Note which pads drop strokes.</p>
<div class="pads">
  <div class="pad"><h2>1. Current logic</h2><canvas id="pad1" class="ink"></canvas><div class="stat" id="stat1"></div></div>
  <div class="pad"><h2>2. Gesture-suppressed</h2><canvas id="pad2" class="ink"></canvas><div class="stat" id="stat2"></div></div>
  <div class="pad"><h2>3. Signature Pad</h2><canvas id="pad3" class="ink"></canvas><div class="stat" id="stat3"></div></div>
</div>
<script src="/vendor/signature_pad.umd.min.js"></script>
<script src="/ink-test.js"></script>
</body>
</html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
