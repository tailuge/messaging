import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import eightball from "../assets/eightball.png";
import nineball from "../assets/nineball.png";
import snooker from "../assets/snooker.png";
import threecushion from "../assets/threecushion.png";
import practice from "../assets/practice.png";

const games = [
  { label: "Eight Ball", img: eightball },
  { label: "Nine Ball", img: nineball },
  { label: "Snooker", img: snooker },
  { label: "Three Cushion", img: threecushion },
  { label: "Practice", img: practice },
];

function Lobby() {
  return (
    <main style={{ fontFamily: "sans-serif", textAlign: "center", padding: "2rem" }}>
      <h1>Hello World</h1>
      <p>Choose a game to play:</p>
      <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
        {games.map(({ label, img }) => (
          <button
            key={label}
            onClick={() => alert(`Selected: ${label}`)}
            style={{ border: "none", background: "none", cursor: "pointer", padding: "0.5rem" }}
            aria-label={label}
          >
            <img src={img} alt={label} width={80} height={80} style={{ display: "block" }} />
            <span style={{ fontSize: "0.85rem" }}>{label}</span>
          </button>
        ))}
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Lobby />
  </StrictMode>
);
