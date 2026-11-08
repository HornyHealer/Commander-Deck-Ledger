# Commander Deck Ledger

[![Test and deploy](https://github.com/HornyHealer/Commander-Deck-Ledger/actions/workflows/test-and-deploy.yml/badge.svg)](https://github.com/HornyHealer/Commander-Deck-Ledger/actions/workflows/test-and-deploy.yml)

Track Commander decks: every swap, every cut, every card you own, cards on the way, and a bin for spare copies.

## How the site is organized

| Path | What it is |
| --- | --- |
| `index.html` | The page shell |
| `manifest.webmanifest`, `icons/`, `sw.js` | Install-as-an-app details and the offline copy |
| `css/style.css` | All styling |
| `js/src/` | The app's code, in 17 files by area (sync, deck screens, stats, sharing, popups and so on). They're joined in name order into `js/app.js` by `node scripts/build-app.mjs` and share one scope. `js/app.js` is generated and not kept in the repository; the tests and the deploy build it. |
| `js/card-rules.js` | Reads card text for partner rules, copy limits, extra turns, mass land denial and suggested roles; shared by the site and the card-list builder |
| `js/firebase-config.js` | Firebase settings for accounts and sync |
| `firestore.rules` | Database security rules to paste into Firebase |
| `data/cards.json` | The card list, built from Scryfall: name, mana cost, type, color identity, Commander legality, Game Changer status, partner rules, bracket and role flags, and Scryfall's permanent card ID |
| `scripts/build-cards.mjs` | Builds `data/cards.json` from Scryfall's bulk data |
| `worker/` | The Cloudflare Worker behind the Archidekt **Fetch** button (deployed by `.github/workflows/worker.yml`) |
| `data/example-deck.json` | The "Try an example deck" deck |
| `tests/` | Automatic tests |

Signed out, each visitor's decks are saved in their own browser. Signed in with Google, they're saved to that person's account and sync between devices.

## Accounts (Firebase)

Sign-in and sync use Firebase (Google sign-in plus a Firestore database). The settings live in `js/firebase-config.js`; set `window.LEDGER_FIREBASE = null` there to turn accounts off. Those values are public by design. The data is protected by the rules in `firestore.rules`, which must be pasted into the Firebase console (Firestore Database → Rules). Each person's data is stored under `users/{their id}/`. Firestore allows at most 1 MB per record, so long histories and big collections are saved in pieces:

| Record | Holds |
|---|---|
| `decks/{deck id}` | The deck, plus `hist`: the list of its history pieces in order and how many changes they hold |
| `decks/{deck id}/history/c…` | Up to 500 history entries each (fewer if they're large) |
| `meta/bin` | The card bin's change number and `sigs`, the list of its 5 sections |
| `bin/c…` | One section of the card bin; a card's section comes from its permanent Scryfall ID |

A piece is named after its contents, so it never changes once saved. A change saves the new pieces and the main record together in one batch, then removes the pieces nothing uses any more, so a typical change costs 2–3 writes. Other devices only show a new version once every piece it lists has arrived.

**App Check.** With `appCheckKey` set in `js/firebase-config.js` (a reCAPTCHA key, public like the other values), the site proves to Firebase that requests come from it, invisibly, so scripts can't use up the free quota. If App Check can't load, the site carries on without it; Firebase only refuses unchecked requests once enforcement is turned on in the console (Security → App Check).

**Limits.** `firestore.rules` caps each account at: 500 different cards in a deck's list, 2,000 on its owned list, about 20,000 history changes per deck (40 pieces of 500), and 30,000 card bin entries (5 sections of up to 7,000). The rules also refuse anything stored outside these places. The site checks the same limits before saving; if something is over one, it shows "Not saved" and a warning saying what to trim instead of sending a write that would be refused. The rules are tested against Firebase's own emulator on every change (`tests/db-rules/`, the `rules` job), and the site only deploys if they pass. After changing `firestore.rules`, paste it into the Firebase console again.

To keep reads down, opening the site reads one record per deck plus the bin (6 records); a deck's history is only read when that deck is opened, when undoing a move with it, or when making a backup. A change to a deck whose history hasn't been read here (such as taking a card from it for another deck) is kept in the deck record's `log` and folded into the pieces the next time a device that has read it saves. Accounts saved the older all-in-one way are read as before and rewritten in pieces automatically the first time they load. The first time someone signs in, the decks saved in that browser move into their account.

## Card list updates

Every Tuesday GitHub rebuilds the card list from Scryfall and commits it if anything changed. To update it right away, open the **Actions** tab, choose **Test and deploy**, and click **Run workflow**.

Decks store each card's permanent Scryfall ID, so a card that gets renamed keeps working.

## Incoming cards

When cards are on the way (printed, bought or borrowed), stage the swap on the bench and press **Save as incoming** instead of **Save change**. The deck list stays as it is, so it keeps matching what's in the box: outgoing cards show a Leaving tag and the change waits in an Incoming strip above the list. Any incoming card you already have a copy of shows a **From** picker (the card bin and every other deck holding it) with a **Grab** button: the copy moves into this deck straight away and leaves the incoming list, both decks' history shows the move, and undoing it from either deck puts everything back. Press **Arrived** when the cards are in hand to apply the swap and add the new cards to the deck's owned list. A deck can have several incoming changes at once, and an arrival can be undone from History.

Every card in a deck's list counts as owned, however you got it (printed, bought or traded), so **Save change** adds new cards to the owned list right away. When creating a deck, cards you don't have yet go in the optional **Still waiting on** box and start out as an incoming change. Decks from older versions of the site that had cards not marked as owned are converted automatically: those cards move into an incoming change.

In the saved data the owned list is still stored as `printed`, so older backups and synced decks keep working.

## Archidekt links

In **New deck** and **Deck check**, paste an Archidekt deck link and press **Fetch** (or Enter) to fill in the deck list. Browsers can't read Archidekt's deck data from another site, so a small Cloudflare Worker (`worker/`, at `cdl-archidekt.deckledger.workers.dev`) fetches it and returns the plain-text list; the maybeboard and sideboard are left out and commanders are tagged. It only accepts Archidekt links and only answers this site. The deck must be public or unlisted on Archidekt. Archidekt's deck data isn't an official public API, so if they change it the Fetch button may stop working until the Worker is updated; pasting a list always works.

The Worker deploys automatically when anything in `worker/` changes, using the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets, and then fetches a real deck to check it works. It runs on Cloudflare's free plan.

In **New deck**, a "Your collection" section sorts the list's cards into In the card bin, In other decks and Not owned, each with buttons for where the cards come from (the same as creating a deck from Check a list). Not owned starts as Add to Collection for someone's first deck and New Incoming after that.

## Update from Archidekt

On a deck page, **Update from Archidekt** compares the deck with its Archidekt list and puts only the differences on the swap bench (cuts in Taking out, additions in Putting in), where you decide what to keep before saving. If the deck has an Archidekt link saved it fetches straight away; otherwise it asks for one, and **Save link & put changes on the bench** stores the link with the deck. Cards already incoming aren't added twice. A pasted list still works under **Or paste a list instead**.

## Deck check

**Deck check** (top of the page) takes any pasted deck list and sorts each card by where you already own it: free in the card bin first, then owned in another deck, and finally the cards you'd need to get. Basic lands are counted but not checked. You can copy the need-to-get list or the owned list, or create a deck straight from it. When creating, a small "Your collection" section has one row of buttons per group, and every group starts on **New Incoming**:

| Group | Buttons |
| --- | --- |
| In the card bin | **New Incoming** (wait for a new copy) or **Use Owned** (taken out of the bin) |
| In other decks | **Swap from Decks** (moved out of that deck, logged in both decks' history and undoable from either), **New Incoming** or **Add to Collection** (the other deck keeps its copy too) |
| Not owned | **New Incoming** or **Add to Collection** |

Each row's cards are behind a **Show cards** toggle. With Swap from Decks chosen, a card that's in more than one of your decks gets a picker for which deck it comes from.

## Combos

The **Combos** button on a deck page asks [Commander Spellbook](https://commanderspellbook.com) which combos the deck already has and which are one card away (naming the missing card), with the one-card-away list tucked behind a **Show possible combos** button. Each combo shows its cards with their pictures (click or tap one to see it bigger), what it does, how it works and a link to its Commander Spellbook page. The request goes through the same Cloudflare Worker as the Archidekt import (`POST /combos`) and is only made when someone presses the button. Two-card combos found this way count toward the deck's bracket estimate until the deck list changes; the button shows how many combos the last check found.

## The top bar

New deck (on the main page), Deck check and All owned cards sit on the left; the sync status, the light/dark switch and your account sit on the right. Deck check, All owned cards and light/dark are icons whose names slide out on hover (the page you're on keeps its name showing). On a phone they're one even row of icons with short labels.

## The deck page

- The Update, Combos and Edit details buttons are icons; hover (or tab to) one and its name slides out.
- A card's cut and role buttons appear when you hover its row; on a phone, tap the row.
- **History** holds three parts: Changes, Removed (cards cut from the deck) and Owned (cards you own for it).
- Lists and their search sit on a dark grey panel (white in light mode), slightly see-through, so the moving backdrop stays in the background.

## Sharing a deck

Signed in, every deck has a read-only link, and it's the deck's own address (`…/#share-` and 22 random characters), so you can copy it from the address bar or with **Copy link** under Sharing in the deck's Edit details (the pencil). When you open it, you get your deck as usual. Anyone else, signed in or not, sees the commander, description, list, Stats and the combos you last checked, and can copy the list or add it to their own decks. They can't change yours. History, owned cards and your card bin aren't shared.

- The copy lives at `shares/{id}` in Firestore. `firestore.rules` lets anyone read one share by its id but not list them, and only the person who shared it can change or remove it.
- The copy updates a moment after the deck's list, name, description or combos change (owned-card changes don't rewrite it).
- **Edit details → Make private** removes the copy, and the old link stops working; **Share it again** makes a new link. Deleting a deck removes its link too.
- Share links work anywhere an Archidekt link does: New deck, Deck check and Update from Archidekt. A deck added from a share link keeps it, so Update pulls in your friend's later changes.
- Signed out, decks stay in your browser and their address is `#deck-…`, which only works for you.

## Bracket and roles

The bracket shown on each deck is the lowest Commander Bracket its cards allow: Game Changers (none in brackets 1–2, up to three in bracket 3), mass land denial (brackets 4–5 only) and extra turns (none in bracket 1). Combos and how fast a deck wins aren't judged, so it's a starting point for the conversation with your table.

Roles (ramp, draw, removal, wipes, tutors) are suggested from each card's text by `js/card-rules.js`. Win conditions and protection are set by hand, and any card's roles can be changed on the deck page; those choices are saved with the deck.

## Look and motion

The site opens on a dark "Defragmenting" screen (in `index.html`, so it shows before any code loads) that stays until the decks are in, for at least about a second. It then breaks into dark blocks that drop out while the page glitches in. Switching views, opening a popup, switching a deck tab, opening or closing a fold (the card bin, the bracket and rules panels, the phone swap bench, combo and stats details) and each card image finishing loading play a short Marathon-style glitch, sized to just the part that changed: blocks dropping out in random order, red and cyan copies cut into horizontal slices sliding together, and scan lines (`playGlitch` and `glitchImage` in `js/src/10-glitch.js`). All of it is skipped on devices set to reduce motion, and the automatic tests run with reduced motion except `tests/motion.spec.js`, which tests the effects.

## Stats tab

Each deck has a **Stats** tab:

- **Colors**: for each of the deck's colors, its share of the colored mana symbols in your spells (hybrid symbols count half for each color; both halves of split cards count) beside its share of what your lands make. A land that makes two colors counts for both; fetch lands count for the basic types they search for, and "any basic land" fetches count for all of the deck's colors. When a color's land share is more than 10 points below its symbol share, it's flagged as having few sources.
- **Mana curve**: spells by mana value (0 to 7+), each bar split by card type, not counting lands or the commander, with the average mana value. The chart colors are a fixed, colorblind-checked order (`--series-1` to `--series-8`); "Counts by type" opens a table with the exact numbers.
- **Sample hand**: seven random cards from the deck (not the commander; click or tap one to see it bigger), with New hand, Mulligan (London rule: draw seven, put one on the bottom per mulligan; the first mulligan is free, as in multiplayer Commander) and Draw a card.

Land colors come from the card list: each land's record ends with the colors it makes (`landColors` in `js/card-rules.js`, from Scryfall's `produced_mana`, or the basic types a fetch land finds).

## Library tools

Above the decks (once there are two or more): a search box that finds decks by name, commander or description, or by a card in a deck's current list (every word has to match; punctuation is ignored, so "nghathrod" finds Captain N'ghathrod; matching cards are listed on the tile; Escape clears it), and a sort menu (last changed, deck name, commander, or bracket from high to low), remembered in that browser. The pin button on each tile keeps a deck at the top whatever the sort. A pin syncs with the account but isn't a change to the deck: it doesn't move "last change" or add to the history.

## Backdrop, light/dark and the top bar

- **Backdrop** (`js/backdrop.js`): a canvas behind the page inside a console frame, at a quiet strength: a grid of squares with a slow wave of lighter and darker squares rolling from the bottom right to the top left, chip blocks and traces with a braided band and short "weave worms" crawling along them, and terminal readouts that type out fresh text (using your deck names) over faint rails. On wide screens the readouts sit in the side margins; otherwise one runs low on the left and only shows where the page isn't. It redraws 20 times a second, stops while the tab is hidden, and draws one still frame with reduced motion. Its colours are the `--bd-*` tokens in `css/style.css`.
- **Light and dark**: the switch in the top bar overrides the device setting and is remembered in that browser (`cdl-theme`); `index.html` applies it before the page draws. Light mode uses white, lilac purple, mint teal and black (after the Sekiguchi Genetics palette); its glitch effects split into purple and teal instead of red and cyan.
- **Phones**: the top bar is one even row of icon buttons with short labels.
- **Card bin**: folded away under its heading so the decks are the focus; opening it is remembered (`cdl-bin-open`). The tests start with it open.

## Keeping things current

- **Dependabot** (`.github/dependabot.yml`) checks once a month for new versions of the steps the workflows use and of the test tools, and opens one grouped pull request for each. The tests run on it automatically; merge it when they pass. Nothing changes until it's merged, and a proposal never deploys anything by itself.
- **By hand, now and then:**
  - The Firebase version the site loads from Google: `FB` in `js/src/07-sync.js` and the list in `sw.js` (12.19.0, the newest 12.x as of November 2026). Firebase 13 is a major version; upgrade it on its own and test sign-in, sync and App Check.
  - The versions the `rules` job installs (`firebase-tools`, `@firebase/rules-unit-testing`, `firebase`).
  - The Node version in the workflows (22, supported until April 2027).
- GitHub stopped supporting the older Node 20 that workflow steps used to run on; every step now runs on Node 24.

## Publishing

Every push to `main` runs the automatic tests on GitHub. The site is published to GitHub Pages only if they pass. See `.github/workflows/test-and-deploy.yml`.

## Phones and installing

On phones and narrow windows the swap bench is a bar pinned to the bottom of the screen; tap it to slide the full bench up. Touch screens get bigger, always-visible buttons and no dragging (every drag has a button: the scissors to cut, the arrow to bring a card back).

The site can be installed as an app (`manifest.webmanifest`, `icons/`). The browser offers an **Install as an app** button at the bottom of the page; on iPhone use Share → Add to Home Screen. `sw.js` keeps a copy of the site so it opens without a connection; it always tries the network first, so updates show up right away.

## Daily health check

Every day at 15:41 UTC, `.github/workflows/health.yml` opens the live site in a real browser (`tests/live/health.spec.js`) and checks that: the site and card list load; Firebase loads and still lists the site as an authorized sign-in domain; the database is up and refuses anyone not signed in; Archidekt Fetch works; and the combo finder works. If anything fails it opens a GitHub issue labeled `health-check` (so GitHub emails you) and comments on it each day it's still broken; it closes the issue by itself once a check passes. Run it any time from the Actions tab → **Daily health check** → **Run workflow**. Tick **practice failure** there to see what an alert looks like; the next normal run closes it.

## Error reports

When something goes wrong in a visitor's browser on the real site (a crash, Firebase not loading, a sign-in or sync error, the Archidekt import or combo finder failing unexpectedly), the site sends a short report to the Cloudflare Worker: the error message, where it happened, the page, the browser, whether it's the installed app or signed in, and the site version. Never deck contents, names or emails. At most 5 per visit, each error once. The Worker keeps them for 30 days in a small database that's part of Cloudflare's free plan (`worker/src/reports.mjs`), counting repeats of the same error.

The daily health check collects new reports (`scripts/error-reports.mjs`) and posts them as a table on the **Error reports from the site** issue, so GitHub emails you; quiet days post nothing. The Worker only hands reports to this repo's own workflow, which proves who it is with GitHub's signed token, so there's no password to manage. Close the issue once you've read it; a new one opens with the next reports. Ticking **practice failure** on a manual run also sends one practice report.

## Running the tests on your computer

```
npm install
npx playwright install chromium
npm test
```

Card data and images come from [Scryfall](https://scryfall.com). Commander Deck Ledger is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
