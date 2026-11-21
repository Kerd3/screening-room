# Design system: "Screening room"

The app should feel like a dimmed auditorium a minute before the film starts. The posters are the light source. The interface is the velvet around them.

## Sources and revisions
- **ui-ux-pro-max** `--design-system`: it returned a light rose "Feature-Rich Showcase" landing pattern, which is the wrong product shape. Not used.
- **ui-ux-pro-max** `--domain color "video streaming dark"`: the Video Streaming/OTT palette (black background, play-red accent). It was taken as a starting point, then **revised**. A pure-black background with a single red accent is a stock "generated" look (frontend-design skill, trait 2). It was replaced with warm velvet and tungsten light, both drawn from actual cinemas.
- **ui-ux-pro-max** suggested a GSAP stagger on grid items. **Rejected**: staggered card entrances read as templated. See Motion below.

## Color tokens
| Token | Hex | Use |
|---|---|---|
| `velvet` | `#1B1726` | page background |
| `stall` | `#241F33` | rails, panels, inputs, skeletons |
| `stall-raised` | `#2E2840` | hover and pressed surfaces, popovers |
| `paper` | `#EDE6D8` | primary text (contrast against velvet is about 13:1) |
| `usher` | `#9C94A8` | secondary text and metadata (about 6:1 against velvet) |
| `tungsten` | `#F0B44C` | the only accent: bookmarks, active nav, focus ring, primary buttons |
| `lilac` | `#B9A8E6` | recommendation reasons only ("Because you saved…") |
| `exit` | `#E5675C` | errors and destructive actions |

Text placed on tungsten uses `velvet`. Lilac never appears on buttons, so it stays a signal for one meaning: why something is being recommended.

## Type
- **Big Shoulders Display** (600 to 800): page titles, the hero's film title, and empty-state headlines. It is a condensed signage face, set big and tight (`leading-[0.9]`, slight negative tracking). It is never used under 28px.
- **Instrument Sans** (400, 500, 600): everything else. Body text is 16px with 1.5 line height. Metadata is 13 to 14px in `usher`.
- Scale: 13 / 14 / 16 / 20 / 28 / 40 / 64 / 96 (the last two are display sizes only).
- No all-caps labels and no monospace metadata. Separate metadata items with spacing, not middle dots.

## Layout
```
desktop ≥1024                         mobile <768
┌──┬───────────────────────────┐      ┌──────────────────────┐
│  │ search ________________   │      │ logo  nav icons   ◉  │
│N │                           │      ├──────────────────────┤
│a │ [ hero backdrop: Home ]   │      │ search ____________  │
│v │ Trending ▸ ▸ ▸ ▸ (scroll) │      │ ▢ ▢   (2 columns)    │
│  │ For you  ▸ ▸ ▸            │      │ ▢ ▢                  │
│r │ ▢ ▢ ▢ ▢ ▢ ▢ (grid)        │      └──────────────────────┘
│a │ ▢ ▢ ▢ ▢ ▢ ▢               │
└──┴───────────────────────────┘
```
- Content is left-aligned throughout. Centered text is reserved for empty states.
- The rail is 88px wide on desktop. Tablet and mobile use a top bar with icon links and labels hidden visually but kept for screen readers.
- Grid: `repeat(auto-fill, minmax(150px, 1fr))` on mobile, growing to 180px on desktop. The gap is 16px on mobile and 24px on desktop.
- Posters are bare 2:3 images with a 6px radius, no border, frame or shadow. The title sits under the poster in paper; metadata sits under that in usher.
- Radius hierarchy: posters 6px, panels and popovers 14px, chips and the search field fully rounded.

## The one bold element
The Home hero shows the top trending title's backdrop at full width, with a soft radial "projector cone" of light falling from the top. The title is set in Big Shoulders at 64 to 96px. On first load the backdrop fades up from dark over 900ms, like a lamp warming up. **That is the only automatic animation in the app.**

## Motion
- Only user-triggered motion beyond the hero. The bookmark toggle fills with tungsten and makes a single small scale pulse (150ms). Popovers open in 180ms and close in 120ms.
- No entrance animations on cards or sections.
- All motion is wrapped in `motion-safe:`, and the hero fade is skipped under `prefers-reduced-motion`.

## Copy voice
Plain, second person, sentence case. Buttons name the action: "Bookmark", "Remove bookmark", "Share", "Save rating". Empty states point to the next step: "Nothing bookmarked yet. Tap the bookmark on any poster to keep it here." Errors say what happened and what to do next, without apologizing.

## Quality floor (ui-ux-pro-max checklist)
- Touch targets at least 44×44px, including the bookmark button on posters.
- Visible focus ring: a 2px tungsten outline with a 2px offset.
- Contrast of at least 4.5:1 for all text. Usher on stall is about 4.9:1.
- SVG icons from Lucide only; no emoji icons.
- `cursor-pointer` on every clickable element.
- Poster boxes have a fixed aspect ratio so the layout doesn't shift as images load.
- Check at 375, 768, 1024 and 1440px widths. No horizontal scrolling except intentional carousels, which also scroll by keyboard.
