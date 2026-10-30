import { LitElement, html, css } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { i18n } from './i18n.js';

const EN_MESSAGES = [
    'This game is free to play and open source on <a href="https://github.com/tailuge/billiards" target="_blank">GitHub</a>',
    'Choose graphics settings in options menu top right.',
    'Masse trick shot replay: <a href="https://scoreboard-tailuge.vercel.app/api/replay/534?lod=4" rel="nofollow">here</a>.',
    'You can change your name by clicking on your user badge at the top right of the screen.',
    'You can flip aim direction in options menu top right.',
    'Invite a friend to play, share link in settings panel.',
    'Draw lines for three cushion and positional play instruction with mouse right-click.',
    'Do you know <a href="https://www.youtube.com/watch?v=ArNBvY1uEUo" target="_blank">Three Cushion</a> billiards rules? The ultimate game.',
    'Thank you for playing snooker, pool and three cushion at <a href="https://github.com/tailuge/billiards" target="_blank">tailuge/billiards</a>.',
    'Snooker century when?',
    'Try the snooker and three cushion <a href="./exam/index.html">exams</a>.'
];

const KO_MESSAGES = [
    '이 게임은 무료로 플레이할 수 있으며 <a href="https://github.com/tailuge/billiards" target="_blank">GitHub</a>에서 오픈 소스로 제공됩니다',
    '오른쪽 상단 옵션 메뉴에서 그래픽 설정을 선택하세요.',
    '이 프로젝트는 입소문으로 성장합니다. 재미있게 즐기셨다면 다른 당구 선수에게도 알려주세요.',
    '3쿠션 동호회나 온라인 커뮤니티를 알고 계신가요? 이 웹사이트를 함께 공유해 주세요.',
    '새로운 플레이어가 늘어날수록 온라인에서 상대를 더 쉽게 만날 수 있습니다. 널리 알려주셔서 감사합니다!',
    '무료 온라인 3쿠션 커뮤니티를 함께 만들어 주세요. 동호회나 친구들에게 이 게임을 소개해 보세요.',
    '화면 우측 상단의 사용자 이름을 클릭하여 변경할 수 있습니다.',
    '사구 <a href="./exam/sagu.html">시험</a> 훈련을 해보세요.'
];

// The MOTD follows the shared locale (i18n), not its own guess: `?locale=ko`,
// the saved language picker choice, and the browser language all end up here,
// so the panel can never disagree with the rest of the UI. English is the
// fallback for every locale that has no MOTD translation.
const messagesFor = (lang) => (lang === 'ko' ? KO_MESSAGES : EN_MESSAGES);

class MotdPanel extends LitElement {
    static styles = css`
        :host {
            display: block;
            text-align: center;
            font-size: 0.75rem;
            color: var(--text-muted);
        }
        a {
            color: var(--link);
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
    `;

    constructor() {
        super();
        // Fixed per load so the message does not reshuffle on re-render, e.g.
        // when the language is switched in place.
        this._pick = Math.random();
    }

    connectedCallback() {
        super.connectedCallback();
        this._i18nUnsub = i18n.onChange(() => this.requestUpdate());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._i18nUnsub?.();
    }

    render() {
        const messages = messagesFor(i18n.lang);
        const msg = messages[Math.min(messages.length - 1, Math.floor(this._pick * messages.length))];
        return html`${unsafeHTML(msg)}`;
    }
}

customElements.define('motd-panel', MotdPanel);
