# Competition 43 — Speakers List parity ledger

Reference: `design/source-of-truth/embeds/speakers-list.png`
Viewport: 1536 × 1024
Fixture: `http://100.105.117.93:5443/fixtures/embeds/speakers-list`

## Capture command

`node -e "import('playwright').then(async({chromium})=>{const b=await chromium.launch({headless:true});const p=await b.newPage({viewport:{width:1536,height:1024}});await p.goto('http://127.0.0.1:5443/fixtures/embeds/speakers-list');await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:'.scratch/qa/ticket-43/final.png'});await b.close()})"`

## Iteration history

1. Initial render: inherited `grid-area` created an unintended header column; generic track utility classes painted backgrounds behind session links; card grid was too narrow; footer sat above its reference baseline. Corrected root grid flow, isolated link treatments, and widened the module grid.
2. Second render: composition matched, but portrait crops were vertically centered too low, the search action had a skewed edge, and footer/frame geometry ended early. Corrected portrait alignment, rectangular search action, outer-frame height, and footer placement.
3. Final render: fixed min-height had stretched row gaps and pushed controls/modules down. Added start alignment and captured with an explicit scroll origin.

## Final Vision inspection

No meaningful mismatch remains in structure, alignment, scale, spacing, typography, color, borders, controls, portrait crops, imagery treatment, or content density. The final image preserves the reference's single framed canvas, header hierarchy, four-part filter row, three-column by five-row directory, 96px circular portraits, compact public session links, and centered ChartStead attribution. Portrait identities and native browser glyph rendering differ by design; all portraits are committed demo-safe assets with stable URLs and useful alternative text.
