# Commander Deck Ledger

[![Test and deploy](https://github.com/HornyHealer/Commander-Deck-Ledger/actions/workflows/test-and-deploy.yml/badge.svg)](https://github.com/HornyHealer/Commander-Deck-Ledger/actions/workflows/test-and-deploy.yml)

Track Commander decks: every swap, every cut, every card you've printed, and a bin for spare copies.

## How the site is organized

| Path | What it is |
| --- | --- |
| `index.html` | The page shell |
| `css/style.css` | All styling |
| `js/app.js` | All of the app's code |
| `data/cards.json` | The card list, built from Scryfall: name, mana cost, type, color identity, Commander legality, Game Changer status, partner rules and Scryfall's permanent card ID |
| `scripts/build-cards.mjs` | Builds `data/cards.json` from Scryfall's bulk data |
| `data/example-deck.json` | The "Try an example deck" deck |
| `tests/` | Automatic tests |

Each visitor's decks are saved in their own browser. Nothing is sent to a server.

## Card list updates

Every Tuesday GitHub rebuilds the card list from Scryfall and commits it if anything changed. To update it right away, open the **Actions** tab, choose **Test and deploy**, and click **Run workflow**.

Decks store each card's permanent Scryfall ID, so a card that gets renamed keeps working.

## Publishing

Every push to `main` runs the automatic tests on GitHub. The site is published to GitHub Pages only if they pass. See `.github/workflows/test-and-deploy.yml`.

## Running the tests on your computer

```
npm install
npx playwright install chromium
npm test
```

Card data and images come from [Scryfall](https://scryfall.com). Commander Deck Ledger is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
