import { LitElement } from 'lit';

class UserStore extends EventTarget {
    clientId = localStorage.getItem('userId') || '';
    userName = localStorage.getItem('userName') || 'Anonymous';
    lod = localStorage.getItem('lod') || '1';

    set(clientId, userName) {
        this.clientId = clientId;
        this.userName = userName;
        localStorage.setItem('userId', clientId);
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
