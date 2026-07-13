import { LitElement } from 'lit';
import { isVercel } from './utils.js';

const genId = (userName) => {
    const prefix = (userName || 'user').slice(0, 4);
    const sep = /Tauri/i.test(navigator.userAgent) ? '-t-' : '-';
    return prefix + sep + Math.random().toString(36).slice(2, 7);
};

class UserStore extends EventTarget {
    constructor() {
        super();
        const p = new URLSearchParams(window.location.search);
        const urlId = (p.get('userId') || '').trim();
        const urlName = (p.get('userName') || '').trim();

        if (isVercel) {
            localStorage.removeItem('userId');
            localStorage.removeItem('userName');
        }

        const storedId = (localStorage.getItem('userId') || '').trim();
        const storedName = (localStorage.getItem('userName') || '').trim();
        
        if (urlId.length > 2) {
            this.clientId = urlId;
            this.isForcedId = true;
        } else {
            const isTestHarness = window.self !== window.top && 
                                (location.hostname === 'localhost' || location.hostname === '127.0.0.1') &&
                                window.name.includes('-');
            
            if (isTestHarness) {
                this.clientId = window.name;
                this.isForcedId = true;
                if (!urlName) this.userName = window.name.split('-')[0];
            } else {
                const nameForPrefix = urlName || storedName || '';
                const prefixMatch = !nameForPrefix || storedId.split('-')[0].slice(0, 4) === nameForPrefix.slice(0, 4);
                this.clientId = storedId.length > 2 && !storedId.startsWith('user-') && prefixMatch ? storedId : genId(nameForPrefix);
                this.isForcedId = false;
                if (this.clientId !== storedId) localStorage.setItem('userId', this.clientId);
            }
        }

        this.userName = urlName || this.userName || storedName || 'Anonymous';
        this.lod = localStorage.getItem('lod') || '2';
        this.flip = localStorage.getItem('flip') === 'true';
        this.useProxy = localStorage.getItem('useProxy') === 'true';

        console.log('UserStore identity:', this.userName, this.clientId);
    }

    setUseProxy(val) {
        this.useProxy = !!val;
        localStorage.setItem('useProxy', this.useProxy);
        this.dispatchEvent(new Event('change'));
        window.location.reload();
    }

set(clientId, userName) {
        this.clientId = clientId.trim().length > 2 ? clientId.trim() : genId(userName);
        this.userName = userName.trim();
        localStorage.setItem('userId', this.clientId);
        localStorage.setItem('userName', this.userName);
        this.dispatchEvent(new Event('change'));
    }

    setLod(val) {
        this.lod = val;
        localStorage.setItem('lod', val);
        this.dispatchEvent(new Event('change'));
    }

    setFlip(val) {
        this.flip = !!val;
        localStorage.setItem('flip', this.flip);
        this.dispatchEvent(new Event('change'));
    }
}

export const userStore = new UserStore();

export class StoreElement extends LitElement {
    connectedCallback() {
        super.connectedCallback();
        this._storeListener = () => this.requestUpdate();
        userStore.addEventListener('change', this._storeListener);
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        userStore.removeEventListener('change', this._storeListener);
    }
}
