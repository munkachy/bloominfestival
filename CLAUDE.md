# munkachy/bloominfestival: Bloomin' Festival website (GitHub Pages, bloominfestival.com)

The festival of St. Bernard Abbey and St. Bernard Prep (Cullman, AL), April 17–18, 2027. Static site served from `main`
(custom domain in `CNAME`); plain HTML, CSS and JS, no build step. Paths are **absolute** (`/assets/...`).
Publish (push to `main`) after testing; Pages takes a minute or two, longer when GitHub's queue is slow.

| Path | What |
|---|---|
| `index.html`, `artisans/`, `become-a-sponsor/`, … | The public pages. Styles: `assets/bf.css` (colours, fonts, buttons) + `assets/site.css` (header, footer, dark mode) |
| `become-an-exhibitor/` | Exhibitor info, rules (`#bf-rules`), and the **payment gate**: two Yes/No questions before the Blackbaud form appears (`assets/bf.js`) |
| `become-an-exhibitor/apply/` | **The vendor application** (`assets/apply.js`, `apply.css`). Replaced the Google Form (Oct 2026) |
| `team/` | **Festival team tools** behind the team password: Vendor Desk (`assets/team.js`, `team.css`) and the Map tab (`assets/team-map.js`) |
| `map/` | **Public festival map** (`assets/map-public.js`); `?booth=12` highlights a vendor's booth |
| `assets/map.js`, `map.css` | The map engine shared by the team map, the public map, the poster and the picture |
| `assets/map-start.json` | Last year's layout (77 booths, stands, tents, stage, 310 booth spots), used once when the team starts the map |
| `images/map-*.webp` | Br. Nicholas's campus drawing: `map-campus` (whole campus, 2 px/ft), `map-festival` (grounds in detail), `map-festival-print` (3x, posters) |
| `assets/vault.js` | All the locking (encryption), shared by the form, the Desk and the map |
| `mailbox/Code.gs` | The Google Apps Script "mailbox" (see below). Not served; kept here as the source |

## How the private data works (read before changing anything that touches vendors)

- **Nothing personal is readable outside a team member's browser.** Vendors' applications and photos are sealed in the
  vendor's browser with the festival's public key (ECDH P-256 + HKDF + AES-GCM). The team's statuses, notes and the map
  are sealed with a team key. The private key and team key are locked with the **team password** (PBKDF2-SHA256,
  600,000 rounds) and separately with a printed **recovery code**. Never add code that sends readable personal data
  anywhere, and never put the password, the recovery code or vendor data in the repo or a commit.
- **The mailbox** is a Google Apps Script web app in the user's own Google account (URL in `assets/vault.js`). It only
  stores sealed data in a Drive folder ("Bloomin' Festival vault"), numbers applications (`BF27-0001`), rate-limits
  the public form, and emails the notification list (number only) when one arrives. To change it: edit `mailbox/Code.gs`,
  then the user pastes it into script.google.com and deploys a **new version** of the same deployment (the URL stays).
  `hello` → `{ready}`; actions are listed at the top of `handle_`.
- The team password was created by the user on 30 Oct 2026. Notification addresses are set in the Desk's Settings tab.
- The festival year rolls over automatically each May (`SEASON` in `vault.js`). Each year, update the dates, fees and
  deadline written in the pages (exhibitor page, the form's header, `map/`, the poster subtitle in `team-map.js`).

## The map

- Coordinates are **feet** on Br. Nicholas's page 1 (1 drawing unit = 1 ft, checked against OpenStreetMap building
  outlines and the football field). His page 2 (the grounds, with trees and lamps) is laid on top at
  `BASE.festival` in `map.js`. Booths are 12 × 12 ft; "two spaces" makes 24 × 12.
- **Booth spots** (`doc.spots`) are the places booths snap to: straight runs along walkways and roads, a symmetric ring
  of 16 (+4 inner) around the statue. Elsewhere booths snap to a 12 ft campus grid. Snap can be turned off.
- The team's map document is sealed and saved with `putMap` (optimistic `rev`; on a conflict the browser takes the
  other person's version and re-applies its own changes). **Publish** writes `public-map.json` (plain): booth layout,
  site elements, and vendors' business names/crafts/websites only if "Show vendors' names" is on. Never contact details.
- Colours come from Br. Nicholas's drawing (`PAL` in `map.js`); icons are drawn in `ICONS` (add more there).

## Testing

There is no test folder in the repo (tests use real vendor exports, which must never be committed). Test with
Playwright against the real `mailbox/Code.gs` running on stand-in Google services (a small Node `vm` harness:
DriveApp/PropertiesService/CacheService/LockService/Utilities/ContentService/MailApp in memory), routing the
`script.google.com` URL to it and serving the repo for `http://localhost:8766`. Check desktop (1440) and phone (390),
light and dark, no console errors, no sideways scroll. Never run a test that submits to the **live** mailbox: it would
email the team and use up an application number.

## Old Google tools

The old Google Form and response sheets are no longer linked. Applications from the sheet can be brought into the Desk
(Settings → Import, CSV), locked in the browser. The user may close the Google Form and set the sheets to Restricted.
