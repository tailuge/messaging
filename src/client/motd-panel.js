import { LitElement, html, css } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

const EN_MESSAGES = [
    'This game is free to play and open source on <a href="https://github.com/tailuge/billiards" target="_blank">GitHub</a>',
    'Choose graphics settings in options menu top right.',
    'Masse trick shot replay: <a href="https://scoreboard-tailuge.vercel.app/api/replay/534?lod=4">here</a>.',
    '<a href="https://scoreboard-tailuge.vercel.app/api/replay/575?lod=4">Aim</a> dont <a href="https://scoreboard-tailuge.vercel.app/api/replay/578?lod=4">think</a>.',
    'You can change your name by clicking on your user badge at the top right of the screen.',
    'You can flip aim direction in options menu top right.',
    'Invite a friend to play, share link in settings panel.',
    'Draw lines for three cushion and positional play instruction with mouse right-click.',
    'Do you know <a href="https://www.youtube.com/watch?v=ArNBvY1uEUo" target="_blank">Three Cushion</a> billiards rules? The ultimate game.',
    'Thank you for playing snooker, pool and three cushion at <a href="https://github.com/tailuge/billiards" target="_blank">tailuge/billiards</a>.',
    'Snooker century when?'
];

const KO_MESSAGES = [
    '이 게임은 무료로 플레이할 수 있으며 <a href="https://github.com/tailuge/billiards" target="_blank">GitHub</a>에서 오픈 소스로 제공됩니다',
    '오른쪽 상단 옵션 메뉴에서 그래픽 설정을 선택하세요.',
    '이 프로젝트는 입소문으로 성장합니다. 재미있게 즐기셨다면 다른 당구 선수에게도 알려주세요.',
    '3쿠션 동호회나 온라인 커뮤니티를 알고 계신가요? 이 웹사이트를 함께 공유해 주세요.',
    '새로운 플레이어가 늘어날수록 온라인에서 상대를 더 쉽게 만날 수 있습니다. 널리 알려주셔서 감사합니다!',
    '무료 온라인 3쿠션 커뮤니티를 함께 만들어 주세요. 동호회나 친구들에게 이 게임을 소개해 보세요.',
    '화면 우측 상단의 사용자 이름을 클릭하여 변경할 수 있습니다.'
];

const isKorean = new URLSearchParams(window.location.search).get('lang') === 'ko' || navigator.language.startsWith('ko');

const MESSAGES = isKorean ? KO_MESSAGES : EN_MESSAGES;

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
        this.msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    }

    render() {
        return html`${unsafeHTML(this.msg)}`;
    }
}

customElements.define('motd-panel', MotdPanel);
