import { css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

// CSS custom property tokens — defined on :host of lobby-app (root),
// inherited by all child shadow roots since custom props pierce shadow DOM.
export const THEME_VARS = css`
    :host {
        --bg:           #f5f5f5;
        --surface:      #ffffff;
        --border:       #dddddd;
        --border-light: #f0f0f0;
        --text:         #212121;
        --text-muted:   #757575;
        --text-dim:     #555555;
        --text-faint:   #bbbbbb;
        --btn-bg:       #ffffff;
        --btn-border:   #cccccc;
        --btn-hover:    #f0f0f0;
        --btn-active:   #e0e0e0;
        --table-head:   #f5f5f5;
        --banner-warn-bg:      #fff3cd;
        --banner-warn-border:  #ffc107;
        --banner-warn-text:    #595959;
        --banner-decline-bg:   #f8d7da;
        --banner-decline-border: #f5c6cb;
        --banner-decline-text: #721c24;
        --modal-bg:     #ffffff;
        --modal-cancel: #f8f9fa;
        --link:         #0055cc;
    }
    @media (prefers-color-scheme: dark) {
        :host {
            --bg:           #1a1a1a;
            --surface:      #2a2a2a;
            --border:       #444444;
            --border-light: #333333;
            --text:         #e0e0e0;
            --text-muted:   #aaaaaa;
            --text-dim:     #aaaaaa;
            --text-faint:   #555555;
            --btn-bg:       #3a3a3a;
            --btn-border:   #555555;
            --btn-hover:    #444444;
            --btn-active:   #505050;
            --table-head:   #333333;
            --banner-warn-bg:      #3a2e00;
            --banner-warn-border:  #ffc107;
            --banner-warn-text:    #cccccc;
            --banner-decline-bg:   #3a0a0e;
            --banner-decline-border: #7a3a3e;
            --banner-decline-text: #f5c6cb;
            --modal-bg:     #2a2a2a;
            --modal-cancel: #3a3a3a;
            --link:         #6ba3f5;
        }
    }
    :host([theme="dark"]) {
        --bg:           #1a1a1a;
        --surface:      #2a2a2a;
        --border:       #444444;
        --border-light: #333333;
        --text:         #e0e0e0;
        --text-muted:   #aaaaaa;
        --text-dim:     #aaaaaa;
        --text-faint:   #555555;
        --btn-bg:       #3a3a3a;
        --btn-border:   #555555;
        --btn-hover:    #444444;
        --btn-active:   #505050;
        --table-head:   #333333;
        --banner-warn-bg:      #3a2e00;
        --banner-warn-border:  #ffc107;
        --banner-warn-text:    #cccccc;
        --banner-decline-bg:   #3a0a0e;
        --banner-decline-border: #7a3a3e;
        --banner-decline-text: #f5c6cb;
        --modal-bg:     #2a2a2a;
        --modal-cancel: #3a3a3a;
        --link:         #6ba3f5;
    }
    :host([theme="light"]) {
        --bg:           #f5f5f5;
        --surface:      #ffffff;
        --border:       #dddddd;
        --border-light: #f0f0f0;
        --text:         #212121;
        --text-muted:   #757575;
        --text-dim:     #555555;
        --text-faint:   #bbbbbb;
        --btn-bg:       #ffffff;
        --btn-border:   #cccccc;
        --btn-hover:    #f0f0f0;
        --btn-active:   #e0e0e0;
        --table-head:   #f5f5f5;
        --banner-warn-bg:      #fff3cd;
        --banner-warn-border:  #ffc107;
        --banner-warn-text:    #595959;
        --banner-decline-bg:   #f8d7da;
        --banner-decline-border: #f5c6cb;
        --banner-decline-text: #721c24;
        --modal-bg:     #ffffff;
        --modal-cancel: #f8f9fa;
        --link:         #0055cc;
    }
`;

export const SHARED_STYLES = css`
    button { cursor: pointer; padding: 0.15rem 0.4rem; border: 1px solid var(--btn-border); border-radius: 4px; background: var(--btn-bg); color: var(--text); font-size: 0.75rem; transition: background-color 0.2s, opacity 0.2s; }
    button:hover { background-color: var(--btn-hover); }
    button:active { background-color: var(--btn-active); }
    button:focus-visible { outline: 2px solid #007bff; outline-offset: 2px; }
    .btn-challenge { background: #0d6efd; color: #fff; border-color: #0d6efd; }
    .btn-challenge:hover { background: #0b5ed7; border-color: #0a58ca; }
    .btn-accept    { background: #198754; color: #fff; border-color: #198754; }
    .btn-accept:hover { background: #157347; border-color: #146c43; }
    .btn-decline   { background: #bb2d3b; color: #fff; border-color: #bb2d3b; }
    .btn-decline:hover { background: #a52834; border-color: #9b2531; }
    .btn-leave     { background: #6c757d; color: #fff; border-color: #6c757d; }
    .btn-leave:hover { background: #5a6268; border-color: #545b62; }
`;

export const USER_LIST_STYLES = css`
    :host { display: block; }
    ul { list-style: none; margin: 0; padding: 0; max-height: 160px; overflow-y: auto; }
    li { display: flex; justify-content: space-between; align-items: center; padding: 0.15rem 0; border-bottom: 1px solid var(--border-light); gap: 0.25rem; }
    li:last-child { border-bottom: none; }
    .user-info { display: flex; flex-direction: column; }
    .user-name { font-weight: 500; font-size: 0.85rem; color: var(--text); }
    .user-status { font-size: 0.7rem; color: var(--text-muted); }
    .actions { display: flex; gap: 0.2rem; flex-shrink: 0; }
    .empty { padding: 1rem; text-align: center; color: var(--text-muted); font-style: italic; font-size: 0.8rem; }
`;

export const CHALLENGE_BANNER_STYLES = css`
    :host { display: block; }
    .banner { background: var(--banner-warn-bg); border: 1px solid var(--banner-warn-border); border-radius: 6px; padding: 0.4rem 0.6rem; display: flex; flex-direction: column; gap: 0.3rem; }
    .banner .row { display: flex; gap: 0.3rem; justify-content: flex-end; }
    .details { font-size: 0.72rem; color: var(--banner-warn-text); display: flex; flex-wrap: wrap; gap: 0.4rem; }
`;

export const SENT_CHALLENGE_BANNER_STYLES = css`
    :host { display: block; }
    .banner { border-radius: 6px; padding: 0.4rem 0.6rem; display: flex; flex-direction: column; gap: 0.3rem; border: 1px solid; }
    .pending { background: var(--banner-warn-bg); border-color: var(--banner-warn-border); color: var(--text); }
    .declined { background: var(--banner-decline-bg); border-color: var(--banner-decline-border); color: var(--banner-decline-text); }
    .row { display: flex; gap: 0.3rem; align-items: center; justify-content: space-between; }
    .details { font-size: 0.72rem; }
`;

export const CHALLENGE_MODAL_STYLES = css`
    :host { display: block; }
    .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .modal { background: var(--modal-bg); color: var(--text); border-radius: 8px; padding: 1rem; min-width: 220px; display: flex; flex-direction: column; gap: 0.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); }
    h3 { margin: 0; font-size: 0.95rem; }
    .rules { display: flex; flex-direction: column; gap: 0.3rem; }
    button.rule { text-align: left; padding: 0.35rem 0.6rem; font-size: 0.82rem; display: flex; align-items: center; gap: 0.4rem; }
    button.rule img { width: 28px; height: 28px; display: block; }
    button.cancel { background: var(--modal-cancel); color: var(--text); border-color: var(--btn-border); }
    .icon-wrap { position: relative; width: 28px; height: 28px; flex-shrink: 0; }
    .icon-wrap img { width: 28px; height: 28px; display: block; }
    .badge { position: absolute; bottom: 0; right: 0; background: #b02030; color: #fff; font-size: 0.55rem; font-weight: bold; border-radius: 3px; padding: 0 2px; line-height: 1.3; }
`;

export const USER_BADGE_STYLES = css`
    :host { display: inline-flex; align-items: center; align-self: center; }
    .badge {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 2px 10px 2px 7px; border-radius: 4px;
        background: #2a2a2a; border: 1px solid rgba(255,255,255,0.12);
        cursor: pointer; font-size: 0.8rem; color: #eee; transition: filter 0.15s;
    }
    .badge:hover { filter: brightness(1.3); }
    .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: var(--dot-color, #888); }
    input { width: 90px; background: transparent; border: none; border-bottom: 1px solid #aaa; color: inherit; font-size: inherit; outline: none; padding: 0; }
`;

export const SOLO_PANEL_STYLES = css`
    :host { display: block; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.25rem; }
    button { border: none; background: none; cursor: pointer; padding: 0.2rem; opacity: 0.7; border-radius: 4px; }
    button:hover { opacity: 1; background: var(--btn-hover); }
    .icon-wrap { position: relative; display: block; }
    img { display: block; width: 48px; height: 48px; margin: auto; }
    .badge { position: absolute; bottom: 0; right: 0; background: #b02030; color: #fff; font-size: 0.5rem; font-weight: bold; border-radius: 3px; padding: 0 2px; line-height: 1.3; }
`;

export const INFO_PANEL_STYLES = css`
    :host { display: block; overflow-y: auto; font-size: 0.75rem; color: var(--text); }
    .tbl { display: inline-block; vertical-align: top; border: 1px solid var(--border); border-radius: 4px; margin: 0.25rem; overflow: hidden; }
    table { border-collapse: collapse; width: auto; }
    th, td { border: 1px solid var(--border); padding: 0.15rem 0.3rem; text-align: left; }
    th { display: none; }
    caption { font-size: 0.8rem; font-weight: 600; text-align: center; padding: 0.2rem 0; color: var(--text-dim); }
    a { color: var(--link); text-decoration: none; }
    .date { text-align: right; }
    .loading { color: var(--text-muted); }
`;

export const PLAYER_PANEL_STYLES = css`
    :host { display: flex; flex-direction: column; height: 100%; }
    .panel-header { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.25rem; }
    .panel-title { font-weight: bold; font-size: 0.8rem; color: var(--text-dim); text-align: center; flex: 1; }
    .user-name { font-size: 0.75rem; font-weight: 500; white-space: nowrap; color: var(--text); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #dc3545; flex-shrink: 0; }
    .dot.on { background: #198754; }
`;

export const LOBBY_APP_STYLES = [THEME_VARS, css`
    :host { display: flex; flex-direction: column; min-height: 100%; font-family: sans-serif; font-size: 0.85rem; box-sizing: border-box; padding: 0.5rem; gap: 0.2rem; background: var(--bg); color: var(--text); overflow-y: auto; scrollbar-width: none; }
    :host::-webkit-scrollbar { display: none; }
    h1 { font-size: 0.85rem; color: var(--text-dim); text-align: center; margin: 0; letter-spacing: 0.1em; text-transform: uppercase; flex-shrink: 0; }
    h1 a { color: inherit; text-decoration: none; }
    h1 a:hover { text-decoration: underline; }
    .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem; overflow: hidden; }
    .panel-title { font-weight: bold; margin-bottom: 0.25rem; font-size: 0.8rem; color: var(--text-dim); text-align: center; }
    .main-row { display: flex; gap: 0.2rem; flex-shrink: 0; }
    .main-row .solo { flex: 0 0 auto; }
    .main-row .players { flex: 1; display: flex; flex-direction: column; }
    .info-row { display: flex; flex-direction: column; }
    .info-row .panel { overflow: visible; }
`];

export const BURGER_MENU_STYLES = css`
    .topbar { position: relative; display: flex; align-items: center; flex-shrink: 0; }
    .topbar h1 { flex: 1; }
    .burger { background: none; border: none; font-size: 1.1rem; cursor: pointer; padding: 0.1rem 0.3rem; color: var(--text-muted); line-height: 1; }
    .burger:hover { color: var(--text); background: none; }
    .menu { position: absolute; top: 100%; right: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem 0.6rem; z-index: 50; display: flex; align-items: center; gap: 0.5rem; font-size: 0.78rem; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
    .menu label { color: var(--text); cursor: pointer; display: flex; align-items: center; gap: 0.3rem; }
`;