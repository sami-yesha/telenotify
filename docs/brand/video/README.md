# Promo video

`telenotify-promo.mp4`: 45 s, 1080×1350 (4:5, best for the LinkedIn and Instagram feed), H.264, no sound.
Covers for the thumbnail: `cover-logo.png`, `cover-free-open-source.png`.

The design follows the landing page (`portal/src/app/globals.css`, `portal/src/components/landing/hero.css`): keep them in step when the page changes.

The video is generated from `promo.html`, where every frame is a function of time. To change and rebuild it:

```bash
cd docs/brand/video
npm i -D playwright-core && npx playwright install chromium   # once
node render.js /tmp/frames 30                                 # ~1350 JPEG frames
swift encode.swift /tmp/frames telenotify-promo.mp4 30        # macOS: H.264 MP4
node render.js /tmp/covers --at 3.5,44                        # stills
```

The MP4 isn't committed (it's large); regenerate it with the commands above.
