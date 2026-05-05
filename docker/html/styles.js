import { css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

export const SHARED_STYLES = css`
    button { cursor: pointer; padding: 0.15rem 0.4rem; border: 1px solid #ccc; border-radius: 4px; background: #fff; font-size: 0.75rem; transition: background-color 0.2s, opacity 0.2s; }
    button:hover { background-color: #f0f0f0; }
    button:active { background-color: #e0e0e0; }
    button:focus-visible { outline: 2px solid #007bff; outline-offset: 2px; }
    .btn-challenge { background: #007bff; color: #fff; border-color: #007bff; }
    .btn-challenge:hover { background: #0069d9; border-color: #0062cc; }
    .btn-spectate  { background: #fd7e14; color: #fff; border-color: #fd7e14; }
    .btn-spectate:hover { background: #e36e0b; border-color: #d6660a; }
    .btn-chat      { background: #6c757d; color: #fff; border-color: #6c757d; }
    .btn-chat:hover { background: #5a6268; border-color: #545b62; }
    .btn-accept    { background: #28a745; color: #fff; border-color: #28a745; }
    .btn-accept:hover { background: #218838; border-color: #1e7e34; }
    .btn-decline   { background: #dc3545; color: #fff; border-color: #dc3545; }
    .btn-decline:hover { background: #c82333; border-color: #bd2130; }
    .btn-leave     { background: #6c757d; color: #fff; border-color: #6c757d; }
    .btn-leave:hover { background: #5a6268; border-color: #545b62; }
`;

export const USER_LIST_STYLES = css`
    :host { display: block; }
    ul { list-style: none; margin: 0; padding: 0; max-height: 160px; overflow-y: auto; }
    li { display: flex; justify-content: space-between; align-items: center; padding: 0.15rem 0; border-bottom: 1px solid #f0f0f0; gap: 0.25rem; }
    li:last-child { border-bottom: none; }
    .user-info { display: flex; flex-direction: column; }
    .user-name { font-weight: 500; font-size: 0.85rem; }
    .user-status { font-size: 0.7rem; color: #888; }
    .actions { display: flex; gap: 0.2rem; flex-shrink: 0; }
`;

export const CHALLENGE_BANNER_STYLES = css`
    :host { display: block; }
    .banner { background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 0.4rem 0.6rem; display: flex; flex-direction: column; gap: 0.3rem; }
    .row { display: flex; gap: 0.3rem; }
    .details { font-size: 0.72rem; color: #666; display: flex; flex-wrap: wrap; gap: 0.4rem; }
`;

export const SENT_CHALLENGE_BANNER_STYLES = css`
    :host { display: block; }
    .banner { border-radius: 6px; padding: 0.4rem 0.6rem; display: flex; flex-direction: column; gap: 0.3rem; border: 1px solid; }
    .pending { background: #fff3cd; border-color: #ffc107; }
    .declined { background: #f8d7da; border-color: #f5c6cb; color: #721c24; }
    .timeout { background: #e2e3e5; border-color: #d6d8db; color: #383d41; }
    .row { display: flex; gap: 0.3rem; align-items: center; justify-content: space-between; }
    .details { font-size: 0.72rem; }
`;

export const CHAT_BANNER_STYLES = css`
    :host { display: block; }
    .banner { background: #e1f5fe; border: 1px solid #81d4fa; border-radius: 6px; padding: 0.4rem 0.6rem; display: flex; flex-direction: column; gap: 0.3rem; }
    .row { display: flex; gap: 0.3rem; align-items: center; }
    input { flex: 1; padding: 0.2rem 0.4rem; border: 1px solid #ccc; border-radius: 4px; font-size: 0.8rem; }
`;

export const CHALLENGE_MODAL_STYLES = css`
    :host { display: block; }
    .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .modal { background: #fff; border-radius: 8px; padding: 1rem; min-width: 220px; display: flex; flex-direction: column; gap: 0.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); }
    h3 { margin: 0; font-size: 0.95rem; }
    .rules { display: flex; flex-direction: column; gap: 0.3rem; }
    button.rule { text-align: left; padding: 0.35rem 0.6rem; font-size: 0.82rem; display: flex; align-items: center; gap: 0.4rem; }
    button.rule img { width: 28px; height: 28px; display: block; }
    button.cancel { background: #f8f9fa; color: #333; border-color: #ccc; }
    .icon-wrap { position: relative; width: 28px; height: 28px; flex-shrink: 0; }
    .icon-wrap img { width: 28px; height: 28px; display: block; }
    .badge { position: absolute; bottom: 0; right: 0; background: #dc3545; color: #fff; font-size: 0.55rem; font-weight: bold; border-radius: 3px; padding: 0 2px; line-height: 1.3; }
`;

export const LOBBY_APP_STYLES = css`
    :host { display: flex; flex-direction: column; height: 100vh; font-family: sans-serif; font-size: 0.85rem; box-sizing: border-box; padding: 0.5rem; gap: 0.4rem; background: #f5f5f5; }
    .status-bar { display: flex; align-items: center; gap: 0.5rem; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #dc3545; flex-shrink: 0; }
    .dot.on { background: #28a745; }
    .panel { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 0.4rem; }
    .panel-title { font-weight: bold; margin-bottom: 0.25rem; font-size: 0.8rem; color: #555; }
`;
