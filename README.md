# Spirited Away AR poster — v0.4 (bridge room)

The poster is the **back wall of a room**. The floor is a wooden bridge with red railings, the ceiling is the night sky,
the left wall is an ocean view, the right wall is the bathhouse. Characters stand on the bridge in two groups (helpers left, bathhouse family right), and you look around by moving your phone. Tap a character → caption (+ voice if you add audio).

## Files
- `index.html`, `app.js`, `scene.js`, `style.css` – the app
- `layout.json` – **everything you tune**: box size, wall images, characters (image, height, x, z), dialogue lines, audio paths
- `assets/` – images, plus optional `assets/music.mp3` and `assets/voice/<name>.mp3`
- `targets.mind` – poster tracking file (you create it once, see below)

## 1. Make the tracking file (do this once, ~1 minute)
1. Open https://hiukim.github.io/mind-ar-js-doc/tools/compile
2. Upload `assets/poster_target.jpg` → **Start** → **Download** (`targets.mind`)
3. Upload `targets.mind` to the repo next to `index.html`.
Without it the site falls back to "placement mode" (no poster lock; the box floats in front of the camera and follows your phone's motion).

## 2. Deploy
GitHub repo → upload everything (keep the `assets` folder) → Settings → Pages → `main` / root. Camera needs HTTPS (GitHub Pages is HTTPS).

## Test without a camera
Add `?preview` to the URL: drag to look around, pinch/scroll to zoom, tap characters.

## Intro video and music
- `assets/intro.mp4` plays muted and looping behind the start screen (compressed copy of your trailer). Swap the file to change it.
- `assets/music.mp3` (Always With Me, flute) plays after tapping Start and keeps looping; the ♪ button mutes.

## Voices
- Voices duck the music while they play.
- Put voice clips in `assets/voice/` using the names in `layout.json` (`kamaji.mp3`, `lin.mp3` …). Captions show even without audio.
- Captions in `layout.json` are placeholders — edit the `line` fields.

## URL switches (debugging)
`?nogyro` turns off the gyroscope hand-off · `?gyroflip` reverses its direction if the box moves the wrong way when the poster leaves view.

## Changing the room
In `layout.json`: `walls` (image per wall; `squash` stretches a picture so it looks right once the wall is seen at an angle), `railing` (height), and each character's `x` (left/right), `z` (0 = at the poster, 1.5 = at the viewer), `h` (height).
`assets/deck.jpg` and `assets/rail.png` are painted for this project; replace them with your own art any time.

## Notes
- Artwork belongs to Studio Ghibli: fine for a class/demo, get permission before publishing publicly.
