# munkachy/bloominfestival: Bloomin' Festival website (GitHub Pages, bloominfestival.com)

The festival of St. Bernard Abbey and St. Bernard Prep (Cullman, AL), April 17–18, 2027. Static site served from `main`
(custom domain in `CNAME`); plain HTML, CSS and JS, no build step. Paths are **absolute** (`/assets/...`).
Publish (push to `main`) after testing; Pages takes a minute or two, longer when GitHub's queue is slow. After pushing,
check it went live (`gh run list -L 3`, or `curl` the changed file): on 5 Nov 2026 a deploy failed with a GitHub 500
and the site stayed on the old version until the next push. Fix: `gh run rerun <id>` or push again.

**Keep this file current.** Whenever a session changes the site, its hosting, DNS, accounts or workflow, update the
matching section here in the same commit, so the next session can start from this file alone.

| Path | What |
|---|---|
| `index.html`, `artisans/`, `become-a-sponsor/`, … | The public pages. Styles: `assets/bf.css` (colours, fonts, buttons) + `assets/site.css` (header, footer, dark mode). `artisans/` opens with the St. Bernard concessions box (`#concessions`, `.bf-eats`) above the directory |
| `become-an-exhibitor/` | Exhibitor info, rules (`#bf-rules`), and the **payment gate**: two Yes/No questions before the Blackbaud form appears (`assets/bf.js`) |
| `become-an-exhibitor/apply/` | **The vendor application** (`assets/apply.js`, `apply.css`). Replaced the Google Form (Oct 2026) |
| `team/` | **Festival team tools** behind the team password: Vendor Desk (`assets/team.js`, `team.css`) and the Map tab (`assets/team-map.js`). The Desk's Craft chips use `CRAFTS` (the form's categories); free-text crafts from the old sheet or "Something else" are sorted by the first craft word in them, else Other. **Payments** (amount due, each payment with how/date/note, balance) live in the sealed team record (`rec.due`, `rec.payments`, cents); the usual fee is `BOOTH_FEE`/`POWER_FEE` in `team.js` (update with the exhibitor page). Paying in full marks the vendor Paid; "Owes a balance" lists partial payers. Online booth payments come in automatically from the office Mac (see "Blackbaud payments" below). **Sort** menu: received newest/oldest first, by last name (`surnameKey`: last word of the contact's name, keeping de/van/St. etc., dropping Jr./III), by business name, by status; remembered per browser (`bf-desk-sort`). **Edit details** (vendor panel): the sealed application stays as the vendor sent it (`v.orig`); the team's corrections live in the sealed team record (`rec.edit`, only fields that differ; `EDIT` lists the editable ones) and are laid over it as `v.d` (`applyEdits`, also after every `saveRecord`). History logs `{edited: [labels]}`; the panel shows "What the vendor sent" |
| `ticket-tshirts/` | **Sweepstakes ticket order form** (`assets/tickets.js`, `tickets.css`; reuses `apply.css` field styles). Sheets of 6 tickets for $25 plus an optional gift, paid through Blackbaud Checkout. See "Ticket orders" below. T-shirts are not sold online yet |
| `map/` | **Public festival map** (`assets/map-public.js`); `?booth=12` highlights a vendor's booth |
| `assets/map.js`, `map.css` | The map engine shared by the team map, the public map, the poster and the picture |
| `assets/map-start.json` | Last year's layout (57 booths square on the grid, stands, tents, stage, 15 building names), used once when the team starts the map |
| `images/map-*.webp` | Br. Nicholas's campus drawing: `map-campus` (whole campus, 2 px/ft; the white page around it painted lawn green `#5a7443`, walkways kept), `map-festival` (grounds in detail), `map-festival-print` (3x, posters) |
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
- `orderNote` (sync key): the office Mac's note to the office when a ticket order is paid. Only the total, sheet count, gift amount and status; sent to its own Notices list (Desk → Settings, script property `NOTIFY_ORDERS`, falling back to `NOTIFY` until saved). Subjects are marked [Ticket order] / [Vendor application].
- The team password was created by the user on 30 Oct 2026. Notification addresses are set in the Desk's Settings tab.
- The festival year rolls over automatically each May (`SEASON` in `vault.js`). Each year, update the dates, fees and
  deadline written in the pages (exhibitor page, the form's header, `map/`, the poster subtitle in `team-map.js`).

## Blackbaud payments (booth fees paid online)

- The Blackbaud form on `become-an-exhibitor/` is an RE NXT **event registration** form. Payments land in Raiser's
  Edge as participants of the year's event ("43rd Bloomin' Festival - 2027", event ID 21; fees "Vendor" $275 and
  "Vendor Electricity Fee" $25), each fee payment pointing at a gift (origin "Online event registration").
- This static site can't hold Blackbaud keys, and the mailbox must never hold the Blackbaud sign-in or anything
  readable. The SKY API sign-in lives only on the office Mac in `~/betterBB` (repo of the development office).
- **Automatic (main path):** `python3 -m bbreport booth-sync` on the Mac (every 30 min by the launchd agent
  `com.betterbb.boothsync`, file in `betterBB/config/launchd/`) reads the payments (read-only), seals them with the
  festival's **public** key exactly like an application (`betterBB/reporting/bbreport/seal.py`, pure Python, checked
  against `vault.js`), and sends them with `putPayments` and its own **sync key**. The mailbox keeps only the latest
  sealed copy (`payments.json`), the key's SHA-256 (`SYNC_HASH`), and the times/reason of the last check
  (`SYNC_OK_AT`, `SYNC_TRIED_AT`, `SYNC_ERROR`, e.g. "Blackbaud sign-in expired"). The Mac pins the festival public key
  at setup and refuses to send if the mailbox ever shows a different one.
- Setup, once: redeploy `Code.gs` (actions `syncKey`, `getPayments`, `putPayments`; `dump` also returns `payments`),
  run `python3 -m bbreport booth-sync --setup` on the Mac (saves `data/bf_sync.json`, prints the key), paste the key in
  the Desk's **Settings → Blackbaud payments from the office Mac**, then install the launchd agent. "Disconnect the
  Mac" there clears the key. **Done 5 Nov 2026:** the sync is running, including the paper-application vendors the
  office adds to the event.
- **The Desk** (`checkBlackbaud` in `team.js`) opens the sealed payments when the Vendors tab loads and on
  **Check now**, matches each to that festival year's applications by email, then by name (business or contact), and
  adds new ones (`{how: 'Online (Blackbaud)', ref: <RE gift ID>}`) through `saveRecord`/`addPayments`. The line above
  the Craft chips shows when the Mac last checked (red after 3 hours: asleep, off, or its Blackbaud sign-in expired),
  how many were added, and the ones not matched, each with an **"Add as a new vendor"** form (below); unmatched
  online payments also keep a tucked-away vendor picker ("Already in the Desk?") for a vendor who paid with another email.
- `addPayments` never records a `ref` twice, and links a Blackbaud payment to a hand-typed "Online (Blackbaud)"
  payment of the same amount without a `ref` (it gets the `ref` and a note) instead of counting it twice. Payments not
  made online (entered in RE by staff) come in as "Other" with a note.
- **Paying by mail (paper application):** the office attaches these vendors to the event but enters no gift (a booth
  check isn't a donation), so RE has no amount. betterBB sends every participant with no payment and either no fees
  or a Vendor fee (not sponsors) as a row `{mail: true, amount: null, ref: 'participant-<RE participant ID>'}`, with
  the participant's email or else the constituent record's. The Desk doesn't invent a payment: it notes
  `rec.mail = {ref, date, fees, by, at}` once, shows a "✉ By mail" badge and a note in Payments, and preselects How
  "Mail (paper application)" so the team records the check when it arrives. Unmatched ones (a paper vendor with no
  application in the Desk) get only the **"Add as a new vendor"** form, no vendor picker: the team confirmed
  (6 Nov 2026) that paper vendors are always new to the Desk (`addFromBlackbaud`): business name, craft and booth spaces typed by the team, name and email
  from Blackbaud, sealed and saved through `importMany` (so `legacy: true`, `source` "Paper application (added from
  Blackbaud)", `legacyStamp` = the Blackbaud ref, list badge "Paper"), then the Blackbaud row applied to it. The rest
  of a paper application (phone, address) isn't in Blackbaud: the team fills it in with **Edit details**.
- **Fallback:** `python3 -m bbreport booth-payments` writes `betterBB/data/out/booth-payments-<event>.csv` for
  **Settings → Import payments (CSV)** (`preparePayments`; same matching, with a preview). That file is real data:
  never copy it into this repo.

## Ticket orders (sweepstakes sheets on `ticket-tshirts/`)

- The page loads Blackbaud's checkout script (`https://pay.blackbaud.com/scripts/checkout`) and opens Blackbaud's
  card pop-up; the site never sees card numbers. Payment configuration: St. Bernard Preparatory School merchant
  account ("Blackbaud Merchant Services - Annual Appeal", **live**: real charges).
- **Deliberate exception to "nothing personal leaves the browser":** the buyer's name, email, phone and address are
  sent over HTTPS to the development office's betterBB server on the office Mac (`https://br.taile138aa.ts.net`,
  Tailscale Funnel), because the gift has to be recorded in Raiser's Edge. They are never sent to the mailbox or kept
  in this repo or the browser. The Mac must be on for orders to work; if it isn't, the form says to call the office.
- Flow: `POST /give/web/start` (server works out the amount; the browser's total is display only) → Blackbaud pop-up
  → `POST /give/web/complete` (server captures exactly that amount, then creates a Donation gift in RE on fund 206 /
  appeal 106 and adds the buyer to event 21 with the fee "Sweepstakes sheet (6 tickets)" (fee ID 84) × sheets, the
  gift applied to it). Buyers not matched to exactly one RE record by email + last name wait on the office page
  (`/online-gifts`) for staff. Code: `betterBB/reporting/bbreport/give.py`; settings:
  `betterBB/config/give-bloomin-2026.json`. CORS allows only bloominfestival.com.
- Price/tickets per sheet live in both `tickets.js` (display) and the betterBB config (what's charged): change both.
- These buyers are event 21 participants, so the booth sync skips anyone the ticket form added.
- Each paid order emails the Desk's ticket-order Notices list through `orderNote` (live since 5 Nov 2026). Buyer
  thank-you emails are off until Microsoft 365 sending is set up on the betterBB side (needs the school's IT).
- Planned: a T-shirt section on the same page (photos, size pickers, one order summary) once the shirts exist.

## Open items (as of 6 Nov 2026)

- **Amount due defaults** to `BOOTH_FEE` × spaces + `POWER_FEE`, so a double booth defaults to $550. That was an
  assumption; the team can change any vendor's amount due. Confirm it with the festival team.
- **Address on old-sheet imports:** before the fix on 4 Nov 2026, the CSV import put the email in Address ("Email
  Address" matched first). Vendors imported before then still show their email as their address. Re-importing skips
  them, so fix them by hand if needed.
- The payments and Craft chips were tested only with fake vendors, not checked on the live Desk with real data. Ask
  the team whether anything looks off.

## The map

- Coordinates are **feet** on Br. Nicholas's page 1 (1 drawing unit = 1 ft, checked against OpenStreetMap building
  outlines and the football field). His page 2 (the grounds, with trees and lamps) is laid on top at
  `BASE.festival` in `map.js`. Booths are 12 × 12 ft; "two spaces" makes 24 × 12.
- **The grid** (map version 2, Nov 2026): booths stand square on a 12 ft grid over the whole campus; its origin is
  `doc.settings.grid` ({x, y}, 0-12 ft; the start layout's is 10.78, 9.4, chosen to move last year's booths least).
  With "Snap to grid" on, the grid lines show and booths snap their edges to them; in Edit mode tents, stands, the stage,
  labels and areas snap their edges too, and icon markers sit in the middle of a cell. Booths can be resized or turned
  only in Edit mode. The old booth spots and the statue ring are gone: `migrate()` in `team-map.js` moved maps started
  before then over once (`settings.v = 2`).
- **Building names** are `kind: 'building'` items (`BUILDINGS` in `map.js`, names from last year's Google Slides map).
  Gym and Retreat Center weren't on that map; their places are a best guess for the user to check.
- **Demo vendors** ("More" → "Add demo vendors") live only in the map document (`doc.demo`), never in the mailbox or the
  published map. "Remove demo vendors" deletes them and frees their booths.
- Both maps have a full-screen button (`BFMap.fullscreen`: the browser's full screen, or `.bfm-full` covering the window).
- Script and style links on `team/` and `map/` carry `?v=N`: bump N when you change those files.
- The team's map document is sealed and saved with `putMap` (optimistic `rev`; on a conflict the browser takes the
  other person's version and re-applies its own changes). **Publish** writes `public-map.json` (plain): booth layout,
  site elements, and vendors' business names/crafts/websites only if "Show vendors' names" is on. Never contact details.
- Colours come from Br. Nicholas's drawing (`PAL` in `map.js`); icons are drawn in `ICONS` (add more there).

## Testing

There is no test folder in the repo (tests use real vendor exports, which must never be committed). Test with
Playwright against the real `mailbox/Code.gs` running on stand-in Google services (a small Node `vm` harness:
DriveApp/PropertiesService/CacheService/LockService/Utilities/ContentService/MailApp in memory), routing the
`script.google.com` URL to it and serving the repo for `http://localhost:8766`. For the Blackbaud payments, make the
fake rows with betterBB's `booth_rows` (fake participants and gifts) so they match the real export; to test the
automatic path, run betterBB's real `booth.sync()` (with `SYNC_FILE` pointed at a scratch file and a fake `pull`)
against the harness mailbox through a small local HTTP bridge (call Python asynchronously: a blocking call stalls the
bridge). Check desktop (1440) and phone (390),
light and dark, no console errors, no sideways scroll, no button text running off its button. Serve the repo for real
(`python3 -m http.server 8766`): otherwise Chrome's favicon request shows up as a console error. The site has no
favicon, so a favicon 404 is expected. Never run a test that submits to the **live** mailbox: it would
email the team and use up an application number.

## Old Google tools

The old Google Form and response sheets are no longer linked. Applications from the sheet can be brought into the Desk
(Settings → Import, CSV), locked in the browser. The user may close the Google Form and set the sheets to Restricted.

## Hosting, domain and DNS (moved off WordPress, 29–30 Oct 2026)

- **Live address:** `https://bloominfestival.com`. The custom domain in GitHub Pages (and `CNAME`) is the **bare
  domain**; GitHub redirects `www` → bare and `http` → `https`. "Enforce HTTPS" is on. Don't remove and re-add the
  custom domain unless the certificate is broken: each time restarts GitHub's certificate request (up to an hour, and
  once it stuck for a day). Changing the domain also commits to `CNAME`, so pull before pushing.
- **Registrar and DNS: GoDaddy** (nameservers `ns09`/`ns10.domaincontrol.com`). Only **Matt** (St. Bernard IT) has the
  GoDaddy login; the user asks him for DNS changes (or for GoDaddy Delegate Access). Records as of 2 Nov 2026:
  `@` A `185.199.108.153` `.109.153` `.110.153` `.111.153`; `@` AAAA `2606:50c0:8000::153` … `8003::153`;
  `www` CNAME `munkachy.github.io`; MX `smtp.secureserver.net` (0) and `mailstore1.secureserver.net` (10);
  TXT `v=spf1 a mx ptr include:secureserver.net ~all`. The domain's email isn't really used: the site's contacts are
  `festivals@stbernardprep.com` and `ahowze@stbernardprep.com`.
- **Before 29 Oct** the DNS sat in a Cloudflare account nobody here can reach (probably set up in Sept 2022 by
  High Level Marketing, who built the first site, and used by the WordPress host **Superpath**). The old site sent an
  HSTS header (`max-age` 90 days, `includeSubDomains`) and permanently redirected bare → `www`. Consequences that may
  still show up for a while: a visitor whose browser kept the old redirect can hit "too many redirects" (fix: clear
  the site's data in the browser, or a private window). Not on the HSTS preload list.
- **Campus network:** Matt can add records on the St. Bernard internal DNS to test changes on campus only. That zone
  was removed after the move; campus now uses the public DNS.
- **Superpath** (old WordPress hosting) is being cancelled; nothing on the new site depends on it. All images and PDFs
  the site uses are in this repo.
- **Moving the repo** to an official St. Bernard GitHub account later: transfer it (Settings → Transfer ownership);
  the A/AAAA records stay; change only the `www` CNAME to the new `<account>.github.io`, then check Settings → Pages.
- Check from a cloud session with `curl` (send a browser User-Agent) and `https://dns.google/resolve?name=…&type=…`.
  The session's proxy can make HTTPS checks flaky; repeat a few times before concluding anything.

## People

This file is public (Pages serves it at `/CLAUDE.md`, and the repo is public): roles and first names only, no contact details.

- **The user** (Br. Augustine, St. Bernard Abbey) owns this repo and the GitHub Pages settings.
- **Matt** (St. Bernard IT): GoDaddy and campus DNS. Busy; short, specific requests work best.
- **The Vice President** (Rachael): not technical; explain in plain words.

## Related repo: munkachy/work

`munkachy/work`, branch `claude/happy-lovelace-6g0twv`, folder `bloominfestival/`, holds the original redesign this
site was copied from: `site/` (first static version, relative paths), `src/` and `tools/` (build scripts),
`original-text/` (text of the old WordPress pages), `wordpress/` (the redesign as Custom HTML blocks and an XML import,
from when the plan was to update WordPress), `theme/`, and `backups/2026-10-19/` (full WordPress export: 36 pages,
3 posts, menus; media are only links to the old host). This repo has moved on since; edit **here**, not there.

## Rules for every Claude session (Br. Augustine, 11 Nov 2026)

These override Claude Code's default habits.

- **No watching, polling or waking up later.** After opening a pull request, do **not** subscribe to its activity
  (`subscribe_pr_activity`) and do not wait on it: Br. Augustine merges it, or asks for changes himself. Don't set
  reminders or scheduled check-ins (`send_later`, `ScheduleWakeup`, scheduled tasks, `/loop`), don't run `Monitor`
  or sleep-and-recheck loops, and don't keep checking CI, deploys or other sessions. Where a step needs a check
  (say, that a deploy went live), check **once**, report what you saw, and end the turn. Tokens spent waiting are wasted.
- **Never type a password, key or token into a command.** Approving a command with "don't ask again" saves it word
  for word in `.claude/settings.local.json`. Read secrets from a file or the environment
  (`LECTIONARY_PASSWORD="$(cat ~/.psalter-pw)" python3 …`, keys in `.env`), so a saved rule holds only the file name.
  When asked to approve, prefer a pattern (`Bash(python3 -m bbreport:*)`) over one exact command.
- `.claude/settings.local.json` and `CLAUDE.local.md` are personal and never committed (they're in `.gitignore`).
