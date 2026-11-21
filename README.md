# rangeen

**A color studio for colored-pencil artists.** Drop in a reference photo,
sample any color, and get the closest real pencils from Faber-Castell
Polychromos and Caran d'Ache Luminance. The studio also measures the image's
overall palette and lets you build drawing palettes.

Color measurement and pencil matching come from deterministic, tested code,
not AI. Images are processed in the browser and never uploaded.

## Features

**Reference & sampling**

- Upload by file picker, drag and drop, or paste (JPEG, PNG, WebP, GIF, AVIF, BMP)
- Hover to preview any pixel with a magnifier; click or tap to lock, <kbd>Esc</kbd> to unlock
- Sample a single pixel or average a 3×3, 5×5 or 9×9 patch (averaged in linear light)
- HEX, RGB, CIELAB and LCh readouts with copy buttons
- Mouse, touch, stylus and keyboard (arrow keys + <kbd>Enter</kbd>)

**Pencil matching**

- 220 pencils: Polychromos (120) and Luminance 6901 (100)
- Top 10 matches ranked by CIEDE2000 (ΔE00), with a plain-language closeness label
- Match against one range or both
- Lightfastness on each maker's own scale, pigment codes for Luminance

**Whole-image analysis**

- Dominant colors with their share of the image
- Warm / cool / neutral balance
- Saturation (chroma) and value (L\*) distributions
- Shadows, midtones and highlights
- Tonal range and contrast
- Descriptive labels ("Low key", "Vivid", …), each with the measurement and threshold behind it

**Palettes**

- Multiple named palettes, mixing brands freely
- Add from matches or a searchable catalog (by name, number or pigment)
- Copy a pencil list; saved in your browser

## Getting started

Requires **Node.js 22.9+**.

```bash
# install dependencies (root, frontend and backend)
npm install
npm install --prefix frontend
npm install --prefix backend

# run frontend and backend together
npm run dev
```

- Frontend: <http://localhost:5173>
- Backend: <http://localhost:3000> (the frontend proxies `/api` to it)

The studio works fully without the backend. The backend is there for future
hosted features such as segmentation and optional AI guidance. Copy
`backend/.env.example` to `backend/.env` to change its settings.

### Useful commands

| Where       | Command             | What it does                                |
| ----------- | ------------------- | ------------------------------------------- |
| root        | `npm run dev`       | Frontend + backend with live reload         |
| `frontend/` | `npm test`          | Unit tests (color math, matching, analysis) |
| `frontend/` | `npm run typecheck` | Type-check app, tests and config            |
| `frontend/` | `npm run build`     | Production build to `frontend/dist/`        |
| `backend/`  | `npm test`          | API tests                                   |
| `backend/`  | `npm run build`     | Compile to `backend/dist/`                  |

## Project structure

```
rangeen/
├─ frontend/          React + TypeScript + Vite: the whole studio
│  └─ src/
│     ├─ color/       sRGB ↔ XYZ ↔ CIELAB (D65), CIEDE2000
│     ├─ catalog/     pencil catalogs, validation, matching
│     │  └─ data/     catalog JSON + how each was sourced
│     ├─ analysis/    sampling, downsampling, whole-image analysis
│     ├─ image/       file validation and decoding
│     ├─ state/       hover sample, palettes, range choice
│     └─ components/  title screen and studio UI
├─ backend/           Express 5 + TypeScript API (health check for now)
└─ tools/             scripts that build the catalogs from maker PDFs
   ├─ polychromos-chart/
   └─ luminance-chart/
```

Each package has its own README with more detail:
[frontend](frontend/README.md) · [backend](backend/README.md)

## How the colors work

- **Color pipeline:** sRGB → linear light → CIE XYZ → CIELAB with the D65 white
  point. Averages are taken in linear light. Matching uses CIEDE2000, verified
  against the published reference data (Sharma, Wu & Dalal, 2005).
- **Polychromos** swatch colors are the CMYK values from Faber-Castell's 2014
  printed color chart, converted to sRGB with the Coated FOGRA39 print
  profile. The three metallics (gold, silver, copper) have no flat color and
  are never suggested as matches.
  → [POLYCHROMOS-SOURCE.md](frontend/src/catalog/data/POLYCHROMOS-SOURCE.md)
- **Luminance** swatch colors are measured from the scanned pencil strokes in
  Caran d'Ache's 2023 color chart, at the heavy-pressure end.
  → [LUMINANCE-SOURCE.md](frontend/src/catalog/data/LUMINANCE-SOURCE.md)

Digital swatches are approximations. Paper, pressure, layering and lighting all
change how a pencil looks on the page, so treat ΔE as a guide, not a promise.

## Principles

1. **Accuracy first.** Measurements and matches come from deterministic, tested
   code. The same image always gives the same numbers.
2. **AI assists; it doesn't measure.** Any future AI features will explain results
   the app has measured and won't invent colors or pencils.
3. **Never fabricate catalog data.** Unknown values stay unknown, and every swatch
   color can be traced to its source.
4. **Private by default.** Images stay in the browser. Any hosted processing will
   be disclosed and opt-in.
5. **Useful without AI.** The core workflow needs no AI and no server.

## Roadmap

- [x] Title screen and studio shell
- [x] Image upload and interactive color picker
- [x] Polychromos and Luminance catalogs with CIEDE2000 matching
- [x] Whole-image color analysis
- [x] Drawing palettes
- [ ] Light-pressure tints for layering suggestions
- [ ] Region selection and per-region analysis (hosted, open-source segmentation; correctable masks)

## License

rangeen is free software, licensed under the
[GNU Affero General Public License](https://www.gnu.org/licenses/agpl-3.0.html),
version 3 or (at your option) any later version (AGPL-3.0-or-later). See
[LICENSE](LICENSE) for the full text.

You may use, study, modify and share it. If you distribute it, or modify it
and let others use it over a network (for example by hosting it as a web app),
you must make your source code available under the same license.

## Notes

Faber-Castell, Polychromos, Caran d'Ache and Luminance are trademarks of their
respective owners. rangeen is an independent project and isn't affiliated with
either company.
