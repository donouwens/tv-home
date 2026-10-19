# TV Home

A home screen for the living-room Samsung (QE65QN85C, Tizen 7). It shows the time, Vilnius weather, PSV, FC Seoul and FC Tokyo (scores, standings, a watch button when a match is live), new long-form videos from 12 YouTube channels, what's on CNN, LRT and Euronews, and shortcuts to the PS5, Apple TV and Netflix. Behind it plays a random muted video from six city-walk and night-drive channels. After 30 seconds without the remote it becomes that video with just the clock, the weather and any live score on top. Videos you pick open in the TV's YouTube app, where you're signed in.

## How it fits together

```
GitHub Action (every 30 min)          GitHub Pages                        Samsung TV
scripts/build-feed.mjs  ──writes──▶  app/ + data/feed.json  ◀──frames──  tizen/ wrapper app
 YouTube RSS, TV guides               the home screen itself              remote keys, HDMI inputs,
                                      weather + football live in-browser  Netflix, screensaver off
```

- **`app/`** is the home screen: plain HTML, CSS and JavaScript, no build step. It's served from GitHub Pages because YouTube only plays embeds on a real web page.
- **`scripts/build-feed.mjs`** runs in the Action and writes `app/data/feed.json`: the latest uploads per channel (YouTube's long-form playlist, so no Shorts), the idle videos, J.LEAGUE International live streams, and the TV guide from tv24.lt (CNN, LRT) and filmweb.pl (Euronews). If a source fails, it keeps that source's data from the previous run.
- **`tizen/`** is a small TV app that shows the hosted page full screen and does what only a TV app can: remote media keys, switching HDMI inputs, opening Netflix, links and videos in the YouTube app, keeping the TV's screensaver away.
- Weather (Open-Meteo) and football (ESPN, plus TheSportsDB for FC Seoul's K League games) are fetched by the page itself.

## 1. Publish the page

1. Create an empty public repository called `tv-home` on the `donouwens` GitHub account (free Pages needs a public repo, so the channel list and teams are visible to anyone who looks). Then, in this folder:
   ```
   git init -b main && git add . && git commit -m "TV Home"
   git remote add origin https://github.com/donouwens/tv-home.git && git push -u origin main
   ```
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Open **Actions → Build feed and deploy → Run workflow** (it also runs on every push and every 30 minutes).
4. After a minute, https://donouwens.github.io/tv-home/ shows the home screen. Use the arrow keys, Enter and Escape.

A different repo name? Change `tizen/js/config.js` and the widget `id` in `tizen/config.xml` to match.

**Optional: video lengths.** The RSS feeds don't include durations. To show them (and to know for sure when a J.LEAGUE stream is live), create a YouTube Data API v3 key in Google Cloud and add it in the repo as **Settings → Secrets and variables → Actions → New repository secret**, named `YT_API_KEY`. It uses a few hundred of the 10,000 free daily units.

## 2. Install on the TV

You do this once, from the Mac, with Samsung's own tools.

1. **Rosetta (Macs with an Apple chip).** Samsung's tools are Intel-only, so run `softwareupdate --install-rosetta --agree-to-license` first. Apple keeps Rosetta for general apps through macOS 27.
2. **Tizen Studio.** Download `web-ide_Tizen_Studio_<version>_macos-64.dmg` from Samsung's [installer folder](https://download.tizen.org/sdk/Installer/) and install it to `~/tizen-studio` (not the Desktop). If macOS won't open the installer, right-click → **Open**, or System Settings → Privacy & Security → **Open Anyway**. In its Package Manager, under Extension SDK, install **TV Extensions** and **Samsung Certificate Extension**.
3. **Developer Mode.** On the TV open **Apps**, scroll to the bottom and open **App Settings**. The solar remote has no number keys, so send the code from the Mac: `python3 tools/tv-keys.py <TV IP> 1 2 3 4 5` (allow it on the TV the first time). Turn **Developer mode** on, enter the Mac's IP address (System Settings → Wi-Fi → Details), and restart the TV by holding the power button until it switches off and on again.
4. **The TV's IP address:** Settings → All Settings → Connection → Network → Network Status → IP Settings.
5. **Connect:** `~/tizen-studio/tools/sdb connect <TV IP>`
6. **Certificate.** In Tizen Studio open **Tools → Certificate Manager → + → Samsung → TV**, name the profile `TVHome`, create a new author certificate (any name and password, then sign in with your Samsung account), then a new distributor certificate with privilege level **Public**. The TV's ID (DUID) is filled in because it's connected. Finish.
7. **Install:** from this folder, run `tools/install-mac.sh <TV IP>`. It packages `tizen/`, signs it with the `TVHome` profile, installs it and starts it.
8. **Start with the TV:** Settings → All Settings → General & Privacy → Start Screen Options → **Autorun Last App: On**. Leave TV Home open when you switch the TV off and it comes back next time.

Tizen Studio is being replaced by Samsung's VS Code extension, which uses the same tools underneath and also needs Rosetta for now. If Tizen Studio stops working on a later macOS, that extension is the next step.

You only reinstall if `tizen/` changes. Changes to `app/` or `config.json` go live through GitHub Pages; the TV picks them up when it comes back to the app after 12 hours, or at 4:00 at night.

## Using it

| Where | Key | Does |
|---|---|---|
| Home | Arrows, OK | Move, open |
| Home | OK on a video | Opens it in the YouTube app; it then makes way for that channel's next new video |
| Home | OK on CNN, LRT or Euronews | Switch to the Telia box (HDMI 2) |
| Home | OK on PS5 or Apple TV | Switch to HDMI 3 or HDMI 1 |
| Home | OK on Watch (live match) | FC Tokyo: the J.LEAGUE International stream in the YouTube app. FC Seoul: K League TV in the TV's browser |
| Watching in the home screen | OK / ◀ ▶ / Back | Pause, skip 10 s, back home (in a desktop browser, or if the YouTube app can't open) |
| Idle | OK | Sound on or off |
| Idle | ▶ | Another video |
| Idle | Any other key | Back to the home screen |

## Changing things

Everything personal is in `app/config.json`; edit it on GitHub and the Action republishes.

- `youtube.subscriptions`, `youtube.idle`: channels as `{ "handle", "id", "name" }`. The `id` is the channel ID that starts with `UC` (on the channel page: About → Share channel → Copy channel ID).
- `teams`: ESPN team IDs and league codes, TheSportsDB IDs, the badge colours and the watch link. Crests come from ESPN (PSV, FC Tokyo) and TheSportsDB (FC Seoul); to use another image, add `"logo": "<url>"` to a team's `badge`. Until a crest loads, the badge shows the club's initials.
- `tv`: channel name, the HDMI port of the box, its logo and where its TV guide comes from (one source, or a list that's tried in order).
- `inputs`: name, HDMI port (or `"app"` for an installed TV app such as Netflix), logo and the colour of the square behind it.
- `idleSeconds`: how long the home screen stays up before fading to the screensaver.
- `youtubeApp`: how a video is handed to the YouTube app: `"appcontrol"` or `"dial"`, or `"off"` to play videos in the home screen instead.
- `location`, `accent`.

Channel logos (`app/logos/`) come from the [tv-logo/tv-logos](https://github.com/tv-logo/tv-logos) collection, and the PlayStation, Apple TV and Netflix marks from [Simple Icons](https://simpleicons.org). All logos and crests belong to their owners.

## Trying it on a computer

```
cd app && python3 -m http.server 8000
```

Then open http://localhost:8000/?mock=1&now=2026-10-19T08:52:00Z for sample data (`&live=tokyo` or `&live=tokyo,seoul` adds a live match, `&idle=1` starts on the idle screen). Without `mock` it uses the live sources, and the videos need the feed that the Action builds (`node scripts/build-feed.mjs` makes one locally).

## What to expect

- **The YouTube app.** Samsung doesn't document how one app hands a specific video to YouTube, so `youtubeApp` has two ways to try. If YouTube opens on its own home page instead of the video, switch to the other one. If the app can't be opened at all, the video plays in the home screen instead.
- **Watched videos.** A video you open from the home screen is remembered on the TV and drops off the row. YouTube doesn't share watch history with other apps, so videos you watched on your phone, or found in the YouTube app yourself, still show here.
- **Ads in the background videos.** The background plays through YouTube's embedded player, which isn't signed in to your account, so YouTube can show ads there even with Premium.
- **Switching inputs** uses Samsung's TV Window API, then steps the app aside so the input fills the screen. It hasn't been tried on this TV yet. If a tile doesn't switch, the Source button on the remote still does, and the tile shows a message.
- **TV channels** open the Telia box on HDMI 2. The box has its own remote and no API, so the tiles can't change its channel.
- **K League TV** opens in the TV's browser and may need a pass or be unavailable in Lithuania.
- **FC Seoul** comes from TheSportsDB's free tier: live scores can lag during a match (the card still says Live while it's on), and the league table only covers the top five, so their position disappears if they drop below fifth.
- **Sources** are free, unofficial and can change. When one fails, the Action keeps the last good data and lists the problem under `errors` in `data/feed.json` and in the Action's log.
- **GitHub pauses scheduled runs** after 60 days without a commit. If the videos stop updating, re-enable the workflow on the Actions tab (or push any change).

## Troubleshooting

- *Black screen, "The home screen can't load right now":* the TV can't reach GitHub Pages. Press OK to try again.
- *Install fails with a certificate or signature error:* make sure the `TVHome` profile is the Samsung type, was created while the TV was connected (so it holds its DUID), and is active (`~/tizen-studio/tools/ide/bin/tizen security-profiles list`).
- *Can't connect:* Developer Mode must have the Mac's current IP; restart the TV after changing it. Quit Tizen Studio before running the install script, and run `~/tizen-studio/tools/sdb kill-server` if it still can't find the TV.
