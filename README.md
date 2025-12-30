# EV Value Scorer Chrome Extension

A Chrome extension for saving and comparing electric vehicle listings from Canadian car sites. Uses Multi-Criteria Decision Analysis (MCDA) to score and rank vehicles based on your priorities.

## Features

- **Auto-Detection**: Automatically detects EV listings on supported sites
- **One-Click Save**: Floating "Save to EV Scorer" button on listing pages
- **MCDA Scoring**: Intelligent scoring algorithm weighing price, odometer, range, year, and more
- **Sidebar Panel**: Full-featured comparison interface accessible from any tab
- **Price Tracking**: Monitors price changes over time
- **Export/Import**: Backup and restore your saved listings
- **Keyboard Shortcuts**: Quick access with Alt+E and Alt+S

## Supported Sites

| Site | URL | Status |
|------|-----|--------|
| AutoTrader | autotrader.ca | ✅ Full Support |
| Kijiji | kijiji.ca | ✅ Full Support |
| Clutch | clutch.ca | ✅ Full Support |
| CarGurus | cargurus.ca | ✅ Full Support |
| Canada Drives | canadadrives.ca | ✅ Full Support |

## Installation

### From Source (Developer Mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/smhunt/ev-scorer-extension.git
   ```

2. Open Chrome and navigate to `chrome://extensions`

3. Enable **Developer mode** (toggle in top right)

4. Click **Load unpacked**

5. Select the `ev-scorer-extension` folder

### Generating Icons (Optional)

If you need to regenerate the icons:
```bash
npm install
npm run icons
```

## Usage

### Saving Listings

1. Visit any supported car listing site
2. Navigate to an EV listing page
3. Click the purple **"Save to EV Scorer"** button that appears
4. Or use **Alt+S** to quick-save

### Viewing & Comparing

1. Click the extension icon in your toolbar
2. Click **"Open Sidebar"** for the full interface
3. Cars are automatically scored and ranked
4. Star your favorites for quick filtering

### Scoring Criteria

The MCDA algorithm scores vehicles based on:

| Criteria | Weight | Direction |
|----------|--------|-----------|
| Price | 35% | Lower is better |
| Odometer | 16% | Lower is better |
| Range | 12% | Higher is better |
| Year | 10% | Newer is better |
| Trim Level | 10% | Higher is better |
| Distance | 10% | Closer is better |
| Remote Start | 10% | Fob+App is best |
| Length | 10% | Shorter is better |
| Damage | 5% | Less is better |
| Heat Pump | 5% | Yes is better |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+E` | Open extension popup |
| `Alt+S` | Quick save current listing |

## Data Storage

All data is stored locally in Chrome's extension storage. Your listings never leave your browser unless you explicitly export them.

### Export/Import

- **Export**: Click the Export button in the popup to download a JSON backup
- **Import**: Click Import and select a previously exported JSON file

## Project Structure

```
ev-scorer-extension/
├── manifest.json          # Extension manifest (MV3)
├── background/
│   └── service-worker.js  # Background service worker
├── content/
│   ├── content.js         # Main content script
│   ├── overlay.css        # Floating button styles
│   └── parsers/           # Site-specific parsers
│       ├── autotrader.js
│       ├── kijiji.js
│       ├── clutch.js
│       ├── cargurus.js
│       └── canadadrives.js
├── sidebar/
│   ├── sidebar.html       # Sidebar panel UI
│   ├── sidebar.css        # Sidebar styles
│   └── sidebar.js         # Sidebar logic + scoring
├── popup/
│   ├── popup.html         # Quick actions popup
│   ├── popup.css
│   └── popup.js
├── shared/
│   ├── vehicle-db.js      # EV database for detection
│   └── storage.js         # Chrome storage wrapper
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Development

### Testing Parsers

```bash
node test/test-parser.cjs
```

### Adding a New Site Parser

1. Create a new parser in `content/parsers/`
2. Follow the existing parser structure with `isListingPage()`, `isEVListing()`, and `extractData()`
3. Add the parser to the content script array in `content/content.js`
4. Update `manifest.json` to include the new site in `matches` and `host_permissions`

## License

ISC

## Contributing

Pull requests welcome! Please ensure parsers are tested against real listings before submitting.
