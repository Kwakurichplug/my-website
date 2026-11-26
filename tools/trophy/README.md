# LetBetAfrika trophy (YOU WON screen)

Our own 3D model, rendered with three.js – **no AI imagery, no stock art**. Gold cup with the **LB monogram + ball**
(the app-icon mark) engraved on the front inside a laurel, big cast handles, knob stem, and a **green lacquer plinth**
carrying the **LetBet|Afrika** wordmark (white enamel + gold, Kanit italic 800 like the site header).
Post-production adds the light burst out of the cup, bloom and glints.

Output (committed): `betting/img/trophy-lb.webp` (900×1080) and `betting/img/trophy-lb-600.webp` (600×720),
transparent background, used by `Pages.trophy()` in `betting/pages.js` (CSS layer v19 in `app.css`).

## Re-render

```bash
cd tools/trophy
npm init -y && npm i three@0.170.0          # three.js only for this tool, not shipped to the site
node render.js "size=2000&el=15&ty=5.2&dist=40&gr=1&gg=0.64&gb=0.17&lw=3.7&lh=3.0&hr=0.2&hflat=0.6&exp=0.92" render.png
# copy the JSON printed after "saved render.png in …s" into the next command
python3 post.py render.png '<json>' .       # writes trophy.webp, trophy-720.webp, trophy-on-dark.jpg (preview)
cp trophy.webp ../../betting/img/trophy-lb.webp && cp trophy-720.webp ../../betting/img/trophy-lb-600.webp
```

Needs Node 20+, Playwright's Chromium (WebGL via SwiftShader works headless), Python 3 with Pillow + numpy.
`last-render.log` holds the projection info of the committed render.

Useful parameters (query string): `gr,gg,gb` gold colour (linear), `rough` polish, `exp` exposure, `el` camera
elevation, `lw,lh,ly` logo size/height on the cup, `laurel=0` to drop the laurel, `wfs` wordmark size,
`gi` light inside the cup, `hr,hflat` handle thickness/profile. `kanit-800i.woff2` is Kanit (SIL Open Font Licence).
