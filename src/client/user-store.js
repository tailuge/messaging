import { LitElement } from 'lit';
import { genId, isVercel } from './utils.js';

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
            this.clientId = storedId.length > 2 ? storedId : genId();
            this.isForcedId = false;
            if (this.clientId !== storedId) localStorage.setItem('userId', this.clientId);
        }

        this.userName = urlName || storedName || 'Anonymous';
        this.lod = localStorage.getItem('lod') || '2';
        this.flip = localStorage.getItem('flip') === 'true';
        this.useProxy = localStorage.getItem('useProxy') === 'true';
    }

    setUseProxy(val) {
        this.useProxy = !!val;
        localStorage.setItem('useProxy', this.useProxy);
        this.dispatchEvent(new Event('change'));
        window.location.reload();
    }

set(clientId, userName) {
        this.clientId = clientId.trim().length > 2 ? clientId.trim() : genId();
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
