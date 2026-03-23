# VoiceKey

**Sing in your perfect key.** Real-time vocal range detection + song transposition for singers and guitarists.

- **Owner:** Ricky (rickybarton138@btinternet.com)
- **Stack:** Vite + React 18 (single-page app, no backend)
- **Repo:** github.com/Rickybarton138/voicekey
- **Live:** voicekey.netlify.app
- **Hosting:** Netlify (auto-deploys from `main`)

## Architecture

Single-component app (`src/App.jsx`, ~890 lines). No router, no state management library, no backend. Everything runs client-side:

- **Web Audio API** — microphone access + real-time pitch detection (autocorrelation algorithm)
- **Music theory engine** — note/chord transposition, voice type classification (Bass → Soprano)
- **Song library** — hardcoded song data with chord progressions (Wonderwall, Creep, Hotel California, etc.)
- **SVG chord diagrams** — rendered inline for guitar fingering reference
- **Freemium model** — 3 free analyses, then upgrade gate (Pro features: AI Coach, Practice Mode, Chord Diagrams, Setlist)

## Key Modules (all in App.jsx)

| Section | What it does |
|---------|-------------|
| Music Theory | Note/chord transposition, voice type detection |
| Pitch Detection | `autoCorrelate()` — autocorrelation-based pitch from mic input |
| Song Data | `SONGS` object + `getSong()` URL matcher |
| Chord Diagrams | SVG `ChordDiagram` component with `CHORD_SHAPES` data |
| Waveform | Animated waveform visualiser during recording |
| AI Coach Modal | Claude API integration for personalised coaching (Pro) |
| Setlist Modal | Save/load transposed songs |
| Upgrade Modal | Freemium gate UI |
| Main App | 4-tab flow: Voice → Song → Results → Practice |

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Dev server (localhost:5173)
npm run build        # Production build → dist/
npm run preview      # Preview production build locally
```

## Deployment

Push to `main` → Netlify auto-builds via `netlify.toml`:
- Build command: `npm run build`
- Publish directory: `dist`
- SPA redirect: `/* → /index.html` (200)

## Agent Behaviour Rules

1. **Plan Mode Default** — enter plan mode for 3+ step tasks; stop and re-plan on failure
2. **Subagent Strategy** — offload research/exploration to subagents; one task per subagent
3. **Self-Improvement Loop** — after any user correction, update `tasks/lessons.md`; review lessons each session
4. **Verification Before Done** — prove it works before marking complete; run build, check for errors
5. **Demand Elegance (Balanced)** — challenge hacky solutions on non-trivial changes; skip for simple fixes
6. **Autonomous Bug Fixing** — just fix bugs using logs/errors/tests; zero context switching from user

## Task Management

- Plans and progress: `tasks/todo.md`
- Captured lessons: `tasks/lessons.md`

## Core Principles

- **Simplicity First** — minimise code impact, this is a single-file app by design
- **No Laziness** — find root causes, senior-level standards
- **No Backend** — everything client-side; if a feature needs a server, discuss first
