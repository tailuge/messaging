// The map page is a mostly-static document with an inline Leaflet script; this module adds
// only the shared site header so it matches the other game pages (reveal, lobby) without
// rewriting the page as a Lit app. Importing the component registers <app-topbar>, which the
// page then uses as a plain element.
import "../topbar.js";
import { logUsage } from "../logusage.js";

logUsage("map");
import { userStore } from "../user-store.js";

// Build the game URL for a map club. Mirrors the params revealGameUrl/soloUrl use so that
// userName, userId, lod, flip and all custom.* keys come from the user's stored settings.
// custom.emoji is always forced to the Japan flag, overriding whatever the user has stored,
// so the wall plaque portrait shows 🇯🇵 regardless of the player's locale.
export function mapGameUrl({ raceTo, clubId, clubJapaneseName }) {
    const BASE = (() => {
        const local = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        return local ? `http://${window.location.hostname}:8080/` : "https://billiards.tailuge.workers.dev/";
    })();

    const custom = { ...userStore.getCustom(), emoji: "\u{1F1EF}\u{1F1F5}" };

    // Flatten custom.* into &custom.key=value pairs (matches the logic in utils.js appendCustom).
    const customParams = Object.entries(custom)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `custom.${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

    let url =
        `${BASE}?ruletype=threecushion` +
        `&raceTo=${raceTo}` +
        `&club=${encodeURIComponent(clubId)}` +
        `&clubName=${encodeURIComponent(clubJapaneseName)}` +
        `&userId=${encodeURIComponent(userStore.clientId)}` +
        `&userName=${encodeURIComponent(userStore.userName)}` +
        `&lod=${userStore.lod}`;

    if (userStore.flip) url += "&flip=true";
    if (customParams) url += `&${customParams}`;

    return url;
}

// Expose on window so the inline <script> (which runs before this deferred module) can call
// it once the module has loaded. select() is also called from the return-club handler at the
// bottom of the inline script, which runs synchronously — at that point the module is already
// resolved, so window.mapGameUrl is available.
window.mapGameUrl = mapGameUrl;
