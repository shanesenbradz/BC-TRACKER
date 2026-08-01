# B.C Tracker

A fasting, calorie and workout tracker that runs entirely in the browser.
No server, no build step, no external accounts. All data is saved on the
device using the browser's local storage.

## Features

- Profile creation with a passcode, multiple profiles supported on one device
- BMI calculator with metric and imperial units
- Fasting timer with 10, 12 and 16 hour plans, a progress ring, and a stage
  by stage guide to what is commonly said to happen in the body during a
  fast (insulin drop, glycogen use, ketosis, autophagy)
- Next meal time calculated from your last meal and chosen fasting plan
- Built in list of common foods with calories, plus the ability to add any
  food and calorie count of your own
- Daily calorie log with a running total against a daily goal (defaults to
  1500 for women and 2000 for men, editable in Profile)
- Custom workout list with a checklist you can tick off each day
- Dark mode and light mode with a switchable accent colour
- Installable to a phone home screen as a standalone app

## Running it locally

No build tools are required. Any static file server works, for example:

```
cd bc-tracker
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a browser.

## Hosting on GitHub Pages

1. Create a new repository on GitHub, for example `bc-tracker`.
2. Add all the files in this folder to the repository (`index.html`,
   `css/`, `js/`, `manifest.json`, `service-worker.js`, `icons/`).
3. Commit and push to the `main` branch.
4. In the repository, go to **Settings > Pages**.
5. Under **Build and deployment**, set **Source** to `Deploy from a
   branch`, pick the `main` branch and the `/ (root)` folder, then save.
6. GitHub will publish the site at
   `https://<your-username>.github.io/<repository-name>/`.
   It can take a minute or two for the first deployment to go live.

No further configuration is needed. Every file in this project uses
relative paths, so it works whether it is hosted at the root of a domain
or in a subfolder like a GitHub Pages project site.

## Installing on a phone home screen

**iPhone (Safari)**
1. Open the GitHub Pages link in Safari.
2. Tap the Share icon.
3. Tap **Add to Home Screen**, then confirm.

**Android (Chrome)**
1. Open the GitHub Pages link in Chrome.
2. Tap the three dot menu.
3. Tap **Add to Home screen** (or use the install prompt if one appears),
   then confirm.

Once installed, the app opens full screen without browser controls, and
works offline after the first load.

## A note on the passcode

The passcode is a simple local lock so a profile is not opened by
accident, not a full security system. Everything is stored on the
device itself in plain browser storage, so anyone with access to the
device and its browser storage could read the underlying data. Do not
use a passcode you use anywhere else, and do not store sensitive
personal or medical information beyond what the app already asks for.

## Notes on the fasting information

The descriptions of what happens at each fasting stage reflect commonly
cited, general fasting research and popular science explanations. They
are simplified, general information, not medical advice, and timing
varies by person. Speak with a doctor before starting any fasting plan,
especially if you have a medical condition or take medication.

## Project structure

```
bc-tracker/
  index.html
  css/
    style.css
  js/
    app.js
    foods.js
  icons/
    icon-192.png
    icon-512.png
  manifest.json
  service-worker.js
  README.md
```
