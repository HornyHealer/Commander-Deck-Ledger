# Commander Deck Ledger

Track Commander decks: every swap, every cut, every card you've printed, and a bin for spare copies.

## How the site is organized

| Path | What it is |
| --- | --- |
| `index.html` | The page shell |
| `css/style.css` | All styling |
| `js/app.js` | All of the app's code |
| `data/cards.json` | The built-in card list (name, mana cost, type, color identity, commander-eligible) |
| `data/example-deck.json` | The "Try an example deck" deck |
| `tests/` | Automatic tests |

Each visitor's decks are saved in their own browser. Nothing is sent to a server.

## Publishing

Every push to `main` runs the automatic tests on GitHub. The site is published to GitHub Pages only if they pass. See `.github/workflows/test-and-deploy.yml`.

## Running the tests on your computer

```
npm install
npx playwright install chromium
npm test
```

Card data and images come from [Scryfall](https://scryfall.com). Commander Deck Ledger is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
