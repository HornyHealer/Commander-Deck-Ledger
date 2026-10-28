// Reads a card's rules text for the deck ledger. Shared by the card-list builder
// (scripts/build-cards.mjs, in Node) and the website's on-the-spot Scryfall lookups (js/app.js).
(function (root) {
  "use strict";

  // Bits stored in each card record's "flags" number.
  const FLAG = {
    COMMANDER: 1,      // can be a commander
    BANNED: 2,         // banned in Commander
    GAME_CHANGER: 4,   // on the Commander Brackets Game Changers list
    NOT_LEGAL: 8,      // not legal in Commander (Un-sets, digital-only, ...)
    EXTRA_TURN: 16,    // gives extra turns
    LAND_DENIAL: 32,   // mass land denial, as the Commander Brackets define it
    RAMP: 64,          // suggested roles, read from the card's text
    DRAW: 128,
    REMOVAL: 256,
    WIPE: 512,
    TUTOR: 1024,
  };

  const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15 };
  const stripReminders = t => String(t || "").replace(/\([^)]*\)/g, "");

  function pairCode(text, typeLine) {
    const t = String(text || "");
    let m;
    if ((m = t.match(/\bPartner with ([^\n(]+?)\s*(?:\(|$)/m))) return "PW:" + m[1].trim();
    if ((m = t.match(/^Partner\s*[—-]\s*([^\n(]+?)\s*(?:\(|$)/m))) return "PV:" + m[1].trim();
    if (/^Partner\s*(?:\(|$)/m.test(t)) return "P";
    if (/^Friends forever\b/m.test(t)) return "FF";
    if (/\bChoose a Background\b/i.test(t)) return "CB";
    if (/\bDoctor's companion\b/i.test(t)) return "DC";
    const tl = String(typeLine || "");
    if (/\bBackground\b/.test(tl.split(" // ")[0])) return "BG";
    if (/\bTime Lord Doctor\b/.test(tl)) return "TD";
    return "";
  }

  function copyLimit(text) {
    const t = String(text || "");
    if (/A deck can have any number of cards named/i.test(t)) return -1;
    const m = t.match(/A deck can have up to (\w+) cards named/i);
    if (m) return NUMBER_WORDS[m[1].toLowerCase()] || parseInt(m[1], 10) || 0;
    return 0;
  }

  const LAND_DENIAL = [
    /\b(destroy|exile) all (?:[a-z]+, )*(?:[a-z]+,? and )?(?:nonbasic )?lands\b(?! you control)/i, // Armageddon, Ruination, Jokulhaups
    /\breturn all lands to their owners' hands\b/i,                                                   // Sunder
    /\beach player sacrifices (?:all|four|five|six|seven|x|half the) [^.]*\blands\b/i,                // Wildfire
    /\bnonbasic lands are (?:Mountains|Islands|Swamps|Forests|Plains)\b/i,                            // Blood Moon
    /\blands don't untap\b/i,                                                                         // Rising Waters, Back to Basics
    /\bcan't untap more than (?:one|two) (?:lands?|permanents?)\b/i,                                  // Winter Orb, Static Orb
    /\bif a land is tapped for mana, it produces\b/i,                                                 // Contamination
  ];
  const TUTOR_LAND = /\bland card|\bbasic\b|\b(?:Plains|Island|Swamp|Mountain|Forest|Gate|Desert) card/i;

  // Flags that come from the card's text: extra turns, land denial and suggested roles.
  function textFlags(text, typeCode) {
    const t = stripReminders(text);
    let f = 0;
    if (/\btakes? an extra turn\b|\btakes? (?:two|three|x) extra turns\b/i.test(t)) f |= FLAG.EXTRA_TURN;
    if (LAND_DENIAL.some(re => re.test(t))) f |= FLAG.LAND_DENIAL;
    if (typeCode !== "L" && (
      /\badd (?:\{[^}]+\})+/i.test(t) ||
      /\badd (?:one|two|three|x|that much|an amount of) mana\b/i.test(t) ||
      /\bsearch your library for [^.]*\bland cards?\b[^.]*\bonto the battlefield/i.test(t) ||
      /\bput (?:a|up to \w+) land cards? from your hand onto the battlefield/i.test(t) ||
      /\bcreate [^.]*\bTreasure tokens?\b/i.test(t))) f |= FLAG.RAMP;
    if (/\bdraws? (?:a|an additional|one|two|three|four|five|six|seven|x|that many|\d+) cards?\b|\bdraws? cards equal to\b/i.test(t)) f |= FLAG.DRAW;
    if (/\b(?:destroy|exile) (?:up to \w+ )?(?:another )?target (?!land\b)[^.]*?\b(?:creature|artifact|enchantment|planeswalker|permanent|battle)s?\b/i.test(t) ||
      /\bdeals? (?:\d+|x) damage to (?:any target|target creature|target planeswalker|target creature or planeswalker)/i.test(t) ||
      /\bcounter target (?:spell|creature spell|noncreature spell|instant|sorcery|artifact|enchantment)/i.test(t) ||
      /\breturn target (?:nonland permanent|creature|permanent)[^.]*\bto its owner's hand/i.test(t) ||
      /\b(?:target|each) (?:player|opponent) sacrifices (?:a|an|two|three) (?:creature|nonland permanent|permanent|artifact|enchantment)/i.test(t) ||
      /\btarget creature (?:an opponent controls )?gets -(?:\d+|x)\/-(?:\d+|x)/i.test(t)) f |= FLAG.REMOVAL;
    if (/\b(?:destroy|exile) all (?:other )?(?:nontoken )?(?:creatures|nonland permanents|permanents|artifacts|enchantments|planeswalkers)\b/i.test(t) ||
      /\ball (?:other )?creatures get -(?:\d+|x)\/-(?:\d+|x)/i.test(t) ||
      /\beach creature gets -/i.test(t) ||
      /\bdeals? (?:\d+|x) damage to each creature\b/i.test(t) ||
      /\breturn all (?:nonland permanents|creatures) to their owners' hands\b/i.test(t) ||
      /\beach player sacrifices (?:all|\w+) creatures?\b/i.test(t)) f |= FLAG.WIPE;
    const searches = t.match(/\bsearch your library for [^.]*/gi) || [];
    if (searches.some(s => !TUTOR_LAND.test(s))) f |= FLAG.TUTOR;
    return f;
  }

  const api = { FLAG, pairCode, copyLimit, textFlags, stripReminders };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CardRules = api;
})(typeof window !== "undefined" ? window : globalThis);
