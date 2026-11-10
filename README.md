# B.C Tracker

A fasting, calorie and workout tracker that runs entirely in the browser.
No server, no build step, no external accounts. All data is saved on the
device using the browser's local storage.

## Android app

Download the APK on your phone: [BC-Tracker.apk](https://github.com/shanesenbradz/BC-TRACKER/releases/latest/download/BC-Tracker.apk)
(or open the [latest release](https://github.com/shanesenbradz/BC-TRACKER/releases/latest)), then open it.
Android asks you to allow installs from your browser or file manager the
first time. Needs Android 7.0 or newer. If an older B.C Tracker app is on
the phone, uninstall it first.

The Android app is the same tracker with a few extras that only an
installed app can do:

- **Stage alerts.** A notification as you reach each stage of your fast,
  and when your plan is complete. They arrive even when the app is closed,
  and are booked again after the phone restarts. Choose which stages alert
  you on the Fasting tab, and send yourself a test.
- **Home screen widget.** A battery-style ring that fills up as you fast,
  with a live countdown of the time left and your current stage. Make it
  wider to also see a battery bar with a tick for each stage and when the
  next stage starts. Add it from Profile, or long-press your home screen
  and pick B.C Tracker from Widgets.
- Backups save straight to your files, and the back button steps back
  through the app before leaving it.

On Android 14 and newer, alerts can arrive a few minutes late unless you
allow exact timing. The Stage alerts card shows a link to that setting
when it is off.

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
- Wallpaper: set any photo (including iPhone HEIC photos) behind the app,
  with visibility, blur and fit controls and optional frosted cards. Each
  profile keeps its own wallpaper. The photo stays on the device and is
  not part of the backup file
- Stage alerts: a notification at each fasting stage and when your plan is
  done. In a browser they arrive only while the app is open
- Spring animations throughout: tabs slide in from the side you tapped,
  cards settle in, the tab bar highlight glides between tabs, and taps,
  checkmarks and totals bounce. Turns itself down if your device is set to
  reduce motion
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
const CACHE_NAME = "bc-tracker-v6";
```

Change it to `v7`, `v8`, and so on with each update you push. That tells
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

## Building the APK

The Android app wraps the same web files. The small native part
(notifications, widget, file saving) lives in `android/src`. It builds
without Android Studio or Gradle:

1. Put the tools listed at the top of `android/build-apk.sh` in
   `android/tools/`.
2. Put your signing key `bctracker-release.jks` in `android/`. Never
   commit it, and keep a copy somewhere safe. Updates must be signed with
   the same key or phones will refuse to install them.
3. Run `KS_PASS=yourpassword ./android/build-apk.sh`.

For a new release, raise `versionCode` and `versionName` in
`android/version.properties`, rebuild, update `.github/release-notes.md`
and push. The Release workflow publishes the APK on GitHub.

## Project structure

```
bc-tracker/
  index.html
  css/
    style.css
  js/
    app.js          tracker logic
    motion.js       animations, haptics, toasts
    wallpaper.js    background photo
    alerts.js       stage alerts and the Android bridge
    foods.js
    workouts.js
  icons/
  manifest.json
  service-worker.js
  BC-Tracker.apk    the Android app
  android/
    AndroidManifest.xml
    src/            WebView, alarms, notifications, widget
    res/            icons, widget layouts
    build-apk.sh
    version.properties
  README.md
```
