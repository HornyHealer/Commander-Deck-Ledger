# Commander Deck Ledger

[![Test and deploy](https://github.com/HornyHealer/Commander-Deck-Ledger/actions/workflows/test-and-deploy.yml/badge.svg)](https://github.com/HornyHealer/Commander-Deck-Ledger/actions/workflows/test-and-deploy.yml)

Track Commander decks: every swap, every cut, every card you own, cards on the way, and a bin for spare copies.

## How the site is organized

| Path | What it is |
| --- | --- |
| `index.html` | The page shell |
| `manifest.webmanifest`, `icons/`, `sw.js` | Install-as-an-app details and the offline copy |
| `css/style.css` | All styling |
| `js/app.js` | All of the app's code |
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

Sign-in and sync use Firebase (Google sign-in plus a Firestore database). The settings live in `js/firebase-config.js`; set `window.LEDGER_FIREBASE = null` there to turn accounts off. Those values are public by design. The data is protected by the rules in `firestore.rules`, which must be pasted into the Firebase console (Firestore Database → Rules). Each person's decks are stored at `users/{their id}/decks/{deck id}` and their card bin at `users/{their id}/meta/bin`. The first time someone signs in, the decks saved in that browser move into their account.

## Card list updates

Every Tuesday GitHub rebuilds the card list from Scryfall and commits it if anything changed. To update it right away, open the **Actions** tab, choose **Test and deploy**, and click **Run workflow**.

Decks store each card's permanent Scryfall ID, so a card that gets renamed keeps working.

## Incoming cards

When cards are on the way (printed, bought or borrowed), stage the swap on the bench and press **Save as incoming** instead of **Save change**. The deck list stays as it is, so it keeps matching what's in the box: outgoing cards show a Leaving tag and the change waits in an Incoming strip above the list. Any incoming card you already have a copy of shows a **From** picker (the card bin and every other deck holding it) with a **Grab** button: the copy moves into this deck straight away and leaves the incoming list, both decks' history shows the move, and undoing it from either deck puts everything back. Press **Arrived** when the cards are in hand to apply the swap and add the new cards to the deck's owned list. A deck can have several incoming changes at once, and an arrival can be undone from History.

Every card in a deck's list counts as owned, however you got it (printed, bought or traded), so **Save change** adds new cards to the owned list right away. When creating a deck, cards you don't have yet go in the optional **Still waiting on** box and start out as an incoming change. Decks from older versions of the site that had cards not marked as owned are converted automatically: those cards move into an incoming change.

In the saved data the owned list is still stored as `printed`, so older backups and synced decks keep working.

## Archidekt links

In **New deck** and **Check a list**, paste an Archidekt deck link and press **Fetch** (or Enter) to fill in the deck list. Browsers can't read Archidekt's deck data from another site, so a small Cloudflare Worker (`worker/`, at `cdl-archidekt.deckledger.workers.dev`) fetches it and returns the plain-text list; the maybeboard and sideboard are left out and commanders are tagged. It only accepts Archidekt links and only answers this site. The deck must be public or unlisted on Archidekt. Archidekt's deck data isn't an official public API, so if they change it the Fetch button may stop working until the Worker is updated; pasting a list always works.

The Worker deploys automatically when anything in `worker/` changes, using the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets, and then fetches a real deck to check it works. It runs on Cloudflare's free plan.

In **New deck**, a "Your collection" section sorts the list's cards into In the card bin, In other decks and Not owned, each with Swap decks / Incoming / Owned buttons (the same as creating a deck from Check a list). Not owned starts as Owned for someone's first deck and Incoming after that.

## Check a list

**Check a list** (top of the page) takes any pasted deck list and sorts each card by where you already own it: free in the card bin first, then owned in another deck, and finally the cards you'd need to get. Basic lands are counted but not checked. You can copy the need-to-get list or the owned list, or create a deck straight from it. When creating, a small "From your check" section has one row of buttons per group, always in the order Swap decks, Incoming, Owned (where they apply), and every group starts on **Incoming**:

| Group | Choices |
| --- | --- |
| In the card bin | **Incoming** (wait for another copy) or **Owned** (taken out of the bin) |
| In other decks | **Swap decks** (moved out of that deck, logged in both decks' history and undoable from either), **Incoming** or **Owned** (the other deck keeps it too) |
| Not owned | **Incoming** or **Owned** |

Each row's cards are behind a **Show cards** toggle. With Swap decks chosen, a card that's in more than one of your decks gets a picker for which deck it comes from.

## Bracket and roles

The bracket shown on each deck is the lowest Commander Bracket its cards allow: Game Changers (none in brackets 1–2, up to three in bracket 3), mass land denial (brackets 4–5 only) and extra turns (none in bracket 1). Combos and how fast a deck wins aren't judged, so it's a starting point for the conversation with your table.

Roles (ramp, draw, removal, wipes, tutors) are suggested from each card's text by `js/card-rules.js`. Win conditions and protection are set by hand, and any card's roles can be changed on the deck page; those choices are saved with the deck.

## Publishing

Every push to `main` runs the automatic tests on GitHub. The site is published to GitHub Pages only if they pass. See `.github/workflows/test-and-deploy.yml`.

## Phones and installing

On phones and narrow windows the swap bench is a bar pinned to the bottom of the screen; tap it to slide the full bench up. Touch screens get bigger, always-visible buttons and no dragging (every drag has a button: the scissors to cut, the arrow to bring a card back).

The site can be installed as an app (`manifest.webmanifest`, `icons/`). The browser offers an **Install as an app** button at the bottom of the page; on iPhone use Share → Add to Home Screen. `sw.js` keeps a copy of the site so it opens without a connection; it always tries the network first, so updates show up right away.

## Running the tests on your computer

```
npm install
npx playwright install chromium
npm test
```

Card data and images come from [Scryfall](https://scryfall.com). Commander Deck Ledger is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
