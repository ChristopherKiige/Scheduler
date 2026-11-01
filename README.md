# Cadence

A desktop weekly planner that fits your goals around the life you already have, scores your week NeetCode-style, and pings you before each block.

## Run it (Windows)

1. Install [Node.js](https://nodejs.org) (LTS).
2. In this folder:
   ```
   npm install
   npm start
   ```
3. Optional — build a real installer with a desktop shortcut: `npm run dist` → `dist/Cadence Setup.exe`.

Closing the window keeps Cadence running in the system tray so notifications still arrive. Right-click the tray icon → **Quit** to fully exit. Turn on *Start in the tray when Windows starts* in Settings to have it always running.

## AI (optional — everything else works without it)

The **Tell me** box turns plain English into goals, deadlines and events, and goals can fetch starter links.

- **Ollama (free, local):** install Ollama, run `ollama pull llama3.1`, keep it running. Any model name works — set it in Settings.
- **Claude:** Settings → Provider: Claude API, paste an API key from console.anthropic.com. Costs a fraction of a cent per request.

Without AI, "X hours a week" phrases still get turned into goals.

## What's preloaded

| Fixed | When |
|---|---|
| Bravella (work) | Mon–Fri 9:00–5:00 |
| Mobile Devices lecture | Mon & Thu 8:00–9:30 pm |
| Mobile Devices lab | Tue 5:00–6:30 pm |
| Gym (scored ★) | Mon–Fri 11:00 pm–midnight |

Protected free time: dinner daily, Friday night, Saturday evening.

Goals: Exam prep 3h, Wayfarer 4h, NeetCode roadmap 3h (tracks your topic), Anime Log 2h, Investing research 1.5h. Planned sessions go in weekday evenings (5:30–10:45 pm, max 2.5h) and weekends (10 am–9 pm, max 5h). All of it is editable in Settings or by clicking a goal.

## How scoring works

Every scored block (goal sessions + gym) has a checkbox. The ring fills per category by time completed; the line underneath says whether you're on pace, ahead or behind for the week. Past weeks keep their final score in the little bar chart.

Link a deadline to a goal → 1.5× hours two weeks out, 2× in the final week, scheduled before the due date. Fell behind? ⤮ Reshuffle re-places missed sessions in what's left of the week.

Your data lives in `%APPDATA%\Cadence\cadence-data.json`.
