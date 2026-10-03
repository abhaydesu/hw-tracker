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
- **Series:** the parser (`sources/series.mjs`) tells lines apart by name first (Silver Series, Pantone, Car Culture, Pop Culture, Fast & Furious, Mario Kart…) and by MRP second: Mainline ₹179 (also the older ₹167 and `n/250` numbering), Silver ₹299, Premium ₹549. Monster trucks, Track Fleet, track sets, multipacks and accessories are kept out of all three and shown under Other, even when they share a price. Amazon is a separate list of everything at ₹600 or below.
- State lives in `data.json`. Paths work the same on Windows and macOS. The minimum check interval is 30 seconds.
- To run a second copy without touching your data, set `PORT` and `DATA_DIR` before `npm start`. On Windows Command Prompt: `set PORT=3199` then `set DATA_DIR=C:\temp\hw` then `npm start`. On PowerShell: `$env:PORT=3199; $env:DATA_DIR='C:\temp\hw'; npm start`.
