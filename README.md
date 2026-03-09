# 🗺️ משחק הגיאוגרפיה של ישראל — Israel Geo Game

An educational geography quiz game where players identify the locations of Israeli cities and settlements on an interactive map. Inspired by GeoGuessr-style mechanics, but focused exclusively on the map of Israel.

![Menu Screen](https://github.com/user-attachments/assets/fa9a3541-9b71-4d46-86d9-8f2dadcb164f)

## Features

- **Interactive map** — Click on a Leaflet/OpenStreetMap map to guess settlement locations
- **96 settlements** — Cities, local councils, kibbutzim and more across all of Israel
- **8 playable regions** — North, Haifa & Carmel, Center, Tel Aviv, Jerusalem, South, Judea & Samaria, Shephelah
- **Region-based play** — Play one region, several, or all of Israel
- **Accurate scoring** — Haversine formula calculates distance; closer guesses earn more points (max 1000/round)
- **Visual feedback** — Markers for guess and correct location, dashed line between them, distance and score display
- **Round summary** — Full game summary with per-round breakdown, average distance, and best guess
- **Game modes** — Fixed rounds (5/10/15/20) or endless practice
- **Hebrew support** — Full RTL layout with Hebrew as the primary language, English secondary
- **Clean architecture** — Modular React + TypeScript code, easy to extend with new features

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build tool | Vite |
| Map | Leaflet + React-Leaflet + OpenStreetMap tiles |
| Data | Static TypeScript modules (no backend needed) |
| Styling | Plain CSS with CSS variables |

## Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9

## Getting Started

```bash
# Clone the repository
git clone https://github.com/NaorTm/IsraelGeoGame.git
cd IsraelGeoGame

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Build for Production

```bash
npm run build    # TypeScript check + Vite production build
npm run preview  # Preview the production build locally
```

The output is placed in the `dist/` folder and can be deployed to any static hosting service.

## Project Structure

```
src/
├── components/         # React UI components
│   ├── GameMap.tsx      # Leaflet map with click handling, markers, lines
│   ├── MenuScreen.tsx   # Region/mode selection, game start
│   ├── PlayingScreen.tsx# Active round — settlement prompt + map
│   ├── FeedbackScreen.tsx# Post-guess feedback — distance, score, markers
│   └── SummaryScreen.tsx# End-of-game score summary table
├── data/
│   ├── settlements.ts   # Settlement dataset (96 entries)
│   └── regions.ts       # Region definitions (8 regions)
├── hooks/
│   └── useGame.ts       # Core game state machine
├── types/
│   └── index.ts         # TypeScript interfaces and types
├── utils/
│   └── geo.ts           # Haversine distance, scoring, helpers
├── App.tsx              # Root component — phase router
├── App.css              # All application styles
├── index.css            # Global CSS reset
└── main.tsx             # Entry point
```

## Data Model

### Settlement

Each settlement entry in `src/data/settlements.ts`:

```typescript
{
  id: "jerusalem",
  name_he: "ירושלים",
  name_en: "Jerusalem",
  lat: 31.7683,
  lng: 35.2137,
  region: "jerusalem",
  type: "city",
  aliases: ["ירושלם"]
}
```

### Region

Each region entry in `src/data/regions.ts`:

```typescript
{
  id: "north",
  name_he: "צפון",
  name_en: "North",
  description_he: "הגליל והגולן",
  description_en: "Galilee and Golan"
}
```

## How to Update Data

### Adding settlements

Edit `src/data/settlements.ts` and add entries to the `settlements` array. Every settlement must reference a valid `region` id.

### Adding or changing regions

Edit `src/data/regions.ts`. Update region ids in the settlements file to match. The game UI automatically picks up new regions.

## Scoring

| Distance | Approximate Score |
|----------|------------------|
| 0 km | 1000 |
| 5 km | 861 |
| 10 km | 741 |
| 25 km | 472 |
| 50 km | 223 |
| 100 km | 50 |
| 150 km+ | ~0 |

Formula: `score = 1000 × e^(−0.03 × distance_km)`

## Future Expansion Ideas

The architecture is designed for easy extension:

- ⏱️ Timer mode
- ❤️ Lives / mistakes limit
- 🏆 Leaderboard (localStorage or backend)
- 🔍 Search & learn mode — explore settlements on the map
- 🎚️ Difficulty levels
- 🗂️ Category filters (only cities, only kibbutzim, etc.)
- 🗺️ Map overlays (region boundaries, terrain)
- 🌐 Full i18n support

## License

This project is provided as-is for educational purposes.
