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
- State lives in `data.json`. The minimum check interval is 30 seconds.
- To run a second copy without touching your data (for example, for testing): `PORT=3199 DATA_DIR=/some/dir npm start`.
