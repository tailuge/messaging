import { LitElement } from 'lit';
import { genId } from './utils.js';

class UserStore extends EventTarget {
    constructor() {
        super();
        const p = new URLSearchParams(window.location.search);
        const urlId = (p.get('userId') || '').trim();
        const urlName = p.get('userName');

        const storedId = (localStorage.getItem('userId') || '').trim();
        
        if (urlId.length > 2) {
            this.clientId = urlId;
            this.isForcedId = true;
        } else {
            this.clientId = storedId.length > 2 ? storedId : genId();
            this.isForcedId = false;
            if (this.clientId !== storedId) localStorage.setItem('userId', this.clientId);
        }

        this.userName = urlName || localStorage.getItem('userName') || 'Anonymous';
        this.lod = localStorage.getItem('lod') || '2';
    }

    set(clientId, userName) {
        this.clientId = clientId.trim().length > 2 ? clientId.trim() : genId();
        this.userName = userName;
        localStorage.setItem('userId', this.clientId);
        localStorage.setItem('userName', userName);
        this.dispatchEvent(new Event('change'));
    }

    setLod(val) {
        this.lod = val;
        localStorage.setItem('lod', val);
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
