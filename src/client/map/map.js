// The map page is a mostly-static document with an inline Leaflet script; this module adds
// only the shared site header so it matches the other game pages (reveal, lobby) without
// rewriting the page as a Lit app. Importing the component registers <app-topbar>, which the
// page then uses as a plain element.
import "../topbar.js";
