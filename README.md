# B.C Tracker

A fasting, calorie and workout tracker that runs entirely in the browser.
No server, no build step, no external accounts. All data is saved on the
device using the browser's local storage.

## Features

- Profile creation with a passcode, multiple profiles supported on one device
- BMI calculator with metric and imperial units
- Fasting timer with 10, 12, 16, 18, 24, 30 and 42 hour plans, a progress
  ring, and a stage by stage guide to what is commonly said to happen in
  the body during a fast (insulin drop, glycogen use, ketosis, autophagy)
- A "Stop fasting" option with a confirm step. Stopping logs your fast to
  history and clears your timer. Nothing restarts automatically, you stay
  stopped until you set a new last meal time
- If you set a last meal time in the past, the app lets you know and
  offers a one-tap way to switch to the current time instead. It still
  lets you save the past time on purpose for retroactive logging
- Next meal time calculated from your last meal and chosen fasting plan
- Today screen shows calories eaten and your daily goal at a glance
- A history dashboard showing past days: calories eaten versus goal,
  calories burnt, workouts completed, and fasts finished with planned
  versus actual length. Calories burnt for a day is whatever you fell
  short of your goal by (so if you eat less than your goal, the
  difference counts as burnt) plus any calories from workouts you
  checked off that day
- Built in list of common foods with calories, plus the ability to add any
  food and calorie count of your own. Foods you add are saved and show
  up in search from then on
- Daily calorie log with a running total against a daily goal (defaults to
  1500 for women and 2000 for men, editable in Profile)
- Custom workout checklist you can tick off each day, with a built in
  library of common workouts and their approximate calorie burn, plus the
  ability to add your own workout and calorie figure. Checking a workout
  off for the day counts its calories toward that day's calories burnt
- Download a backup file of all your data at any time, and restore from
  that file later, including on a fresh browser with no profiles saved
- Dark mode and light mode with a wide choice of accent colours
- Installable to a phone home screen as a standalone app
- Extra settings and customisation live on the Profile page rather than
  cluttering the main screens, scroll down there to find them

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

## Backing up and restoring your data

Since everything lives in the browser's local storage, clearing your
browser, switching phones, or reinstalling can wipe your profile. To
protect against that:

1. Open **Profile** and tap **Download backup**. This saves a `.json`
   file with your profile and all your logged data.
2. Keep that file somewhere safe (a notes app, email to yourself, cloud
   drive, and so on).
3. If your data ever disappears, open the app and, on the sign-in
   screen, tap **Restore from backup**, then pick the saved file. Your
   profile and passcode come back exactly as they were, and you can log
   in right away.
4. You can also restore a backup while already logged in, from
   **Profile > Restore from file**. This replaces the current
   profile's data with what is in the file, which is useful for moving
   a backup onto a new device.

Back up regularly, especially before clearing site data or switching
devices, since there's no automatic cloud copy.

## Pushing updates after the app is already installed

Because the app is installed as a Progressive Web App, it caches its
files for offline use. After editing any file in this project and
pushing to GitHub, open `service-worker.js` and bump the version number
in this line:

```js
const CACHE_NAME = "bc-tracker-v5";
```

Change it to `v6`, `v7`, and so on with each update you push. That tells
installed copies of the app to fetch the new files instead of using the
old cached ones. Without this step, people who already installed the
app to their home screen may keep seeing the old version for a while.

If a browser ever seems stuck on a broken or outdated version even after
a cache bump, the most reliable fix is to remove the home screen icon
and any installed app entry, then add it fresh from the browser again.

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

The "calories burnt" figures shown in History are a simple estimate, not
a measurement. For any given day, it's whatever you came in under your
daily goal by (so eating less than your goal counts the shortfall as
burnt), plus the calories from any workouts you checked off that day.
Workout calories come from either the built in workout library or
whatever figure you enter yourself, so their accuracy depends on how
closely your actual effort matches that estimate. None of this accounts
for your individual metabolism, body composition, or activity level, so
treat it as a rough guide rather than a precise number.

## Project structure

```
bc-tracker/
  index.html
  css/
    style.css
  js/
    app.js
    foods.js
    workouts.js
  icons/
    icon-192.png
    icon-512.png
  manifest.json
  service-worker.js
  README.md
```
