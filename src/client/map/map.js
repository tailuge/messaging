// The map page is a mostly-static document with an inline Leaflet script; this module adds
// only the shared site header so it matches the other game pages (reveal, lobby) without
// rewriting the page as a Lit app. Importing the component registers <app-topbar>, which the
// page then uses as a plain element.
import "../topbar.js";
import { logUsage } from "../logusage.js";

logUsage("map");
import { userStore } from "../user-store.js";
import { soloUrl } from "../utils.js";

// Build the game URL for a map club. Mirrors the params revealGameUrl/soloUrl use so that
// userName, userId, lod, flip and all custom.* keys come from the user's stored settings.
// custom.emoji defaults to the Japan flag, overriding whatever the user has stored, so the
// wall plaque portrait shows 🇯🇵 regardless of the player's locale — unless the club passes
// its own `emoji` (from data-emoji) to use instead. An optional `tableSize` is forwarded as
// a real game option; it is not shown in any list — it lives only in this launch URL.
export function mapGameUrl({ raceTo, clubId, clubJapaneseName, emoji, tableSize } = {}) {
    const custom = { ...userStore.getCustom(), emoji: emoji || "\u{1F1EF}\u{1F1F5}" };
    const options = {
        raceTo,
        club: clubId,
        clubName: clubJapaneseName,
    };
    if (tableSize) options.tableSize = tableSize;

    return soloUrl(
        { ruletype: "threecushion", options },
        userStore.clientId,
        userStore.userName,
        userStore.lod,
        userStore.flip,
        custom
    );
}

// Expose on window so the inline <script> (which runs before this deferred module) can call
// it once the module has loaded. select() is also called from the return-club handler at the
// bottom of the inline script, which runs synchronously — at that point the module is already
// resolved, so window.mapGameUrl is available.
window.mapGameUrl = mapGameUrl;
