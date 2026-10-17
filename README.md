# Hot Wheels Watcher (Blinkit)

Checks Blinkit for Hot Wheels stock at your locations, highlights the models you want, and can add them to your cart.

```
npm install && npx playwright install chromium   # first time only
npm start                                        # then open http://localhost:3000
```

- **Locations:** a pincode, an address, `lat, lon`, or a full Google Maps link. Exact coordinates are the most accurate, because stock depends on the nearest Blinkit store.
- **Watched models:** tap ☆ on any car, or type a name. These are case-insensitive "name contains" matches. Watched items are sorted first and are the only ones auto-carted.
- **Alerts:** click "Enable alerts" for desktop notifications and a beep. The dashboard tab has to stay open.
- **Cart:** the app runs its own Chrome profile (`.browser-profile/`). "Open cart in Blinkit" shows that window, where you log in once and pay. It never pays for you.
- Blinkit keeps one cart per delivery location, so auto-cart is best used with a single location.
- **Browse three ways:** by Category (Premium, Silver, Mainline, Other), by Seller (each store has its own All / Premium / Mainline / Silver / Other chips, so Amazon Premium is one click), or by Location (one list per Blinkit pin, since Blinkit stock follows the nearest store). The sidebar filters sellers, stock and sort in every mode.
- **Series:** `sources/series.mjs` classifies by name first and MRP second. Premium is the collector tier: Car Culture, Pop Culture, Boulevard, Team Transport (any price), Real Riders, F1 Race Team, Fast & Furious, Mario Kart, and 2-packs. Silver Series, Pantone, Vintage Club and Neon Speeders are Silver. Mainline is `n/250` numbering or MRP ₹160–189. Multi-packs, trucks, track sets, accessories, RC, large scale and resale prices (₹4,000+) go to Other, with a sub-filter.
- **Amazon:** a result is kept only when "Hot Wheels" is in its brand or full title. It runs 11 searches (plain, Car Culture, Premium, Team Transport, 2-pack, Boulevard, Silver Series…) and classifies by name, because Amazon prices are seller-set.
- **Stores:** Blinkit (per location), Amazon, Hamleys, FirstCry, FunCorp, Crossword. Every store except Amazon sells at MRP, so each category lists those first and Amazon after.
- State lives in `data.json`. Paths work the same on Windows and macOS. The minimum check interval is 30 seconds.
- To run a second copy without touching your data, set `PORT` and `DATA_DIR` before `npm start`. On Windows Command Prompt: `set PORT=3199` then `set DATA_DIR=C:\temp\hw` then `npm start`. On PowerShell: `$env:PORT=3199; $env:DATA_DIR='C:\temp\hw'; npm start`.
