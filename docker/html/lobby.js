"use strict";(()=>{var D=globalThis,z=D.ShadowRoot&&(D.ShadyCSS===void 0||D.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,ee=Symbol(),Ie=new WeakMap,M=class{constructor(e,t,s){if(this._$cssResult$=!0,s!==ee)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=t}get styleSheet(){let e=this.o,t=this.t;if(z&&e===void 0){let s=t!==void 0&&t.length===1;s&&(e=Ie.get(t)),e===void 0&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),s&&Ie.set(t,e))}return e}toString(){return this.cssText}},Ce=r=>new M(typeof r=="string"?r:r+"",void 0,ee),g=(r,...e)=>{let t=r.length===1?r[0]:e.reduce((s,i,n)=>s+(a=>{if(a._$cssResult$===!0)return a.cssText;if(typeof a=="number")return a;throw Error("Value passed to 'css' function must be a 'css' function result: "+a+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(i)+r[n+1],r[0]);return new M(t,r,ee)},Te=(r,e)=>{if(z)r.adoptedStyleSheets=e.map(t=>t instanceof CSSStyleSheet?t:t.styleSheet);else for(let t of e){let s=document.createElement("style"),i=D.litNonce;i!==void 0&&s.setAttribute("nonce",i),s.textContent=t.cssText,r.appendChild(s)}},te=z?r=>r:r=>r instanceof CSSStyleSheet?(e=>{let t="";for(let s of e.cssRules)t+=s.cssText;return Ce(t)})(r):r;var{is:lt,defineProperty:ct,getOwnPropertyDescriptor:ht,getOwnPropertyNames:dt,getOwnPropertySymbols:pt,getPrototypeOf:ut}=Object,Y=globalThis,Ae=Y.trustedTypes,gt=Ae?Ae.emptyScript:"",bt=Y.reactiveElementPolyfillSupport,k=(r,e)=>r,se={toAttribute(r,e){switch(e){case Boolean:r=r?gt:null;break;case Object:case Array:r=r==null?r:JSON.stringify(r)}return r},fromAttribute(r,e){let t=r;switch(e){case Boolean:t=r!==null;break;case Number:t=r===null?null:Number(r);break;case Object:case Array:try{t=JSON.parse(r)}catch{t=null}}return t}},Pe=(r,e)=>!lt(r,e),Le={attribute:!0,type:String,converter:se,reflect:!1,useDefault:!1,hasChanged:Pe};Symbol.metadata??=Symbol("metadata"),Y.litPropertyMetadata??=new WeakMap;var y=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??=[]).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,t=Le){if(t.state&&(t.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((t=Object.create(t)).wrapped=!0),this.elementProperties.set(e,t),!t.noAccessor){let s=Symbol(),i=this.getPropertyDescriptor(e,s,t);i!==void 0&&ct(this.prototype,e,i)}}static getPropertyDescriptor(e,t,s){let{get:i,set:n}=ht(this.prototype,e)??{get(){return this[t]},set(a){this[t]=a}};return{get:i,set(a){let c=i?.call(this);n?.call(this,a),this.requestUpdate(e,c,s)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??Le}static _$Ei(){if(this.hasOwnProperty(k("elementProperties")))return;let e=ut(this);e.finalize(),e.l!==void 0&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(k("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(k("properties"))){let t=this.properties,s=[...dt(t),...pt(t)];for(let i of s)this.createProperty(i,t[i])}let e=this[Symbol.metadata];if(e!==null){let t=litPropertyMetadata.get(e);if(t!==void 0)for(let[s,i]of t)this.elementProperties.set(s,i)}this._$Eh=new Map;for(let[t,s]of this.elementProperties){let i=this._$Eu(t,s);i!==void 0&&this._$Eh.set(i,t)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){let t=[];if(Array.isArray(e)){let s=new Set(e.flat(1/0).reverse());for(let i of s)t.unshift(te(i))}else e!==void 0&&t.push(te(e));return t}static _$Eu(e,t){let s=t.attribute;return s===!1?void 0:typeof s=="string"?s:typeof e=="string"?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise(e=>this.enableUpdating=e),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(e=>e(this))}addController(e){(this._$EO??=new Set).add(e),this.renderRoot!==void 0&&this.isConnected&&e.hostConnected?.()}removeController(e){this._$EO?.delete(e)}_$E_(){let e=new Map,t=this.constructor.elementProperties;for(let s of t.keys())this.hasOwnProperty(s)&&(e.set(s,this[s]),delete this[s]);e.size>0&&(this._$Ep=e)}createRenderRoot(){let e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return Te(e,this.constructor.elementStyles),e}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this._$EO?.forEach(e=>e.hostConnected?.())}enableUpdating(e){}disconnectedCallback(){this._$EO?.forEach(e=>e.hostDisconnected?.())}attributeChangedCallback(e,t,s){this._$AK(e,s)}_$ET(e,t){let s=this.constructor.elementProperties.get(e),i=this.constructor._$Eu(e,s);if(i!==void 0&&s.reflect===!0){let n=(s.converter?.toAttribute!==void 0?s.converter:se).toAttribute(t,s.type);this._$Em=e,n==null?this.removeAttribute(i):this.setAttribute(i,n),this._$Em=null}}_$AK(e,t){let s=this.constructor,i=s._$Eh.get(e);if(i!==void 0&&this._$Em!==i){let n=s.getPropertyOptions(i),a=typeof n.converter=="function"?{fromAttribute:n.converter}:n.converter?.fromAttribute!==void 0?n.converter:se;this._$Em=i;let c=a.fromAttribute(t,n.type);this[i]=c??this._$Ej?.get(i)??c,this._$Em=null}}requestUpdate(e,t,s,i=!1,n){if(e!==void 0){let a=this.constructor;if(i===!1&&(n=this[e]),s??=a.getPropertyOptions(e),!((s.hasChanged??Pe)(n,t)||s.useDefault&&s.reflect&&n===this._$Ej?.get(e)&&!this.hasAttribute(a._$Eu(e,s))))return;this.C(e,t,s)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(e,t,{useDefault:s,reflect:i,wrapped:n},a){s&&!(this._$Ej??=new Map).has(e)&&(this._$Ej.set(e,a??t??this[e]),n!==!0||a!==void 0)||(this._$AL.has(e)||(this.hasUpdated||s||(t=void 0),this._$AL.set(e,t)),i===!0&&this._$Em!==e&&(this._$Eq??=new Set).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(t){Promise.reject(t)}let e=this.scheduleUpdate();return e!=null&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),this._$Ep){for(let[i,n]of this._$Ep)this[i]=n;this._$Ep=void 0}let s=this.constructor.elementProperties;if(s.size>0)for(let[i,n]of s){let{wrapped:a}=n,c=this[i];a!==!0||this._$AL.has(i)||c===void 0||this.C(i,void 0,n,c)}}let e=!1,t=this._$AL;try{e=this.shouldUpdate(t),e?(this.willUpdate(t),this._$EO?.forEach(s=>s.hostUpdate?.()),this.update(t)):this._$EM()}catch(s){throw e=!1,this._$EM(),s}e&&this._$AE(t)}willUpdate(e){}_$AE(e){this._$EO?.forEach(t=>t.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&=this._$Eq.forEach(t=>this._$ET(t,this[t])),this._$EM()}updated(e){}firstUpdated(e){}};y.elementStyles=[],y.shadowRootOptions={mode:"open"},y[k("elementProperties")]=new Map,y[k("finalized")]=new Map,bt?.({ReactiveElement:y}),(Y.reactiveElementVersions??=[]).push("2.1.2");var ce=globalThis,Me=r=>r,G=ce.trustedTypes,ke=G?G.createPolicy("lit-html",{createHTML:r=>r}):void 0,je="$lit$",$=`lit$${Math.random().toFixed(9).slice(2)}$`,Be="?"+$,mt=`<${Be}>`,w=document,U=()=>w.createComment(""),R=r=>r===null||typeof r!="object"&&typeof r!="function",he=Array.isArray,ft=r=>he(r)||typeof r?.[Symbol.iterator]=="function",ie=`[ 	
\f\r]`,N=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,Ne=/-->/g,Ue=/>/g,E=RegExp(`>|${ie}(?:([^\\s"'>=/]+)(${ie}*=${ie}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),Re=/'/g,Oe=/"/g,De=/^(?:script|style|textarea|title)$/i,de=r=>(e,...t)=>({_$litType$:r,strings:e,values:t}),l=de(1),Mt=de(2),kt=de(3),v=Symbol.for("lit-noChange"),b=Symbol.for("lit-nothing"),He=new WeakMap,S=w.createTreeWalker(w,129);function ze(r,e){if(!he(r)||!r.hasOwnProperty("raw"))throw Error("invalid template strings array");return ke!==void 0?ke.createHTML(e):e}var yt=(r,e)=>{let t=r.length-1,s=[],i,n=e===2?"<svg>":e===3?"<math>":"",a=N;for(let c=0;c<t;c++){let o=r[c],d,p,h=-1,f=0;for(;f<o.length&&(a.lastIndex=f,p=a.exec(o),p!==null);)f=a.lastIndex,a===N?p[1]==="!--"?a=Ne:p[1]!==void 0?a=Ue:p[2]!==void 0?(De.test(p[2])&&(i=RegExp("</"+p[2],"g")),a=E):p[3]!==void 0&&(a=E):a===E?p[0]===">"?(a=i??N,h=-1):p[1]===void 0?h=-2:(h=a.lastIndex-p[2].length,d=p[1],a=p[3]===void 0?E:p[3]==='"'?Oe:Re):a===Oe||a===Re?a=E:a===Ne||a===Ue?a=N:(a=E,i=void 0);let m=a===E&&r[c+1].startsWith("/>")?" ":"";n+=a===N?o+mt:h>=0?(s.push(d),o.slice(0,h)+je+o.slice(h)+$+m):o+$+(h===-2?c:m)}return[ze(r,n+(r[t]||"<?>")+(e===2?"</svg>":e===3?"</math>":"")),s]},O=class r{constructor({strings:e,_$litType$:t},s){let i;this.parts=[];let n=0,a=0,c=e.length-1,o=this.parts,[d,p]=yt(e,t);if(this.el=r.createElement(d,s),S.currentNode=this.el.content,t===2||t===3){let h=this.el.content.firstChild;h.replaceWith(...h.childNodes)}for(;(i=S.nextNode())!==null&&o.length<c;){if(i.nodeType===1){if(i.hasAttributes())for(let h of i.getAttributeNames())if(h.endsWith(je)){let f=p[a++],m=i.getAttribute(h).split($),B=/([.?@])?(.*)/.exec(f);o.push({type:1,index:n,name:B[2],strings:m,ctor:B[1]==="."?ne:B[1]==="?"?ae:B[1]==="@"?oe:T}),i.removeAttribute(h)}else h.startsWith($)&&(o.push({type:6,index:n}),i.removeAttribute(h));if(De.test(i.tagName)){let h=i.textContent.split($),f=h.length-1;if(f>0){i.textContent=G?G.emptyScript:"";for(let m=0;m<f;m++)i.append(h[m],U()),S.nextNode(),o.push({type:2,index:++n});i.append(h[f],U())}}}else if(i.nodeType===8)if(i.data===Be)o.push({type:2,index:n});else{let h=-1;for(;(h=i.data.indexOf($,h+1))!==-1;)o.push({type:7,index:n}),h+=$.length-1}n++}}static createElement(e,t){let s=w.createElement("template");return s.innerHTML=e,s}};function C(r,e,t=r,s){if(e===v)return e;let i=s!==void 0?t._$Co?.[s]:t._$Cl,n=R(e)?void 0:e._$litDirective$;return i?.constructor!==n&&(i?._$AO?.(!1),n===void 0?i=void 0:(i=new n(r),i._$AT(r,t,s)),s!==void 0?(t._$Co??=[])[s]=i:t._$Cl=i),i!==void 0&&(e=C(r,i._$AS(r,e.values),i,s)),e}var re=class{constructor(e,t){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=t}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){let{el:{content:t},parts:s}=this._$AD,i=(e?.creationScope??w).importNode(t,!0);S.currentNode=i;let n=S.nextNode(),a=0,c=0,o=s[0];for(;o!==void 0;){if(a===o.index){let d;o.type===2?d=new H(n,n.nextSibling,this,e):o.type===1?d=new o.ctor(n,o.name,o.strings,this,e):o.type===6&&(d=new le(n,this,e)),this._$AV.push(d),o=s[++c]}a!==o?.index&&(n=S.nextNode(),a++)}return S.currentNode=w,i}p(e){let t=0;for(let s of this._$AV)s!==void 0&&(s.strings!==void 0?(s._$AI(e,s,t),t+=s.strings.length-2):s._$AI(e[t])),t++}},H=class r{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(e,t,s,i){this.type=2,this._$AH=b,this._$AN=void 0,this._$AA=e,this._$AB=t,this._$AM=s,this.options=i,this._$Cv=i?.isConnected??!0}get parentNode(){let e=this._$AA.parentNode,t=this._$AM;return t!==void 0&&e?.nodeType===11&&(e=t.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,t=this){e=C(this,e,t),R(e)?e===b||e==null||e===""?(this._$AH!==b&&this._$AR(),this._$AH=b):e!==this._$AH&&e!==v&&this._(e):e._$litType$!==void 0?this.$(e):e.nodeType!==void 0?this.T(e):ft(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==b&&R(this._$AH)?this._$AA.nextSibling.data=e:this.T(w.createTextNode(e)),this._$AH=e}$(e){let{values:t,_$litType$:s}=e,i=typeof s=="number"?this._$AC(e):(s.el===void 0&&(s.el=O.createElement(ze(s.h,s.h[0]),this.options)),s);if(this._$AH?._$AD===i)this._$AH.p(t);else{let n=new re(i,this),a=n.u(this.options);n.p(t),this.T(a),this._$AH=n}}_$AC(e){let t=He.get(e.strings);return t===void 0&&He.set(e.strings,t=new O(e)),t}k(e){he(this._$AH)||(this._$AH=[],this._$AR());let t=this._$AH,s,i=0;for(let n of e)i===t.length?t.push(s=new r(this.O(U()),this.O(U()),this,this.options)):s=t[i],s._$AI(n),i++;i<t.length&&(this._$AR(s&&s._$AB.nextSibling,i),t.length=i)}_$AR(e=this._$AA.nextSibling,t){for(this._$AP?.(!1,!0,t);e!==this._$AB;){let s=Me(e).nextSibling;Me(e).remove(),e=s}}setConnected(e){this._$AM===void 0&&(this._$Cv=e,this._$AP?.(e))}},T=class{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,t,s,i,n){this.type=1,this._$AH=b,this._$AN=void 0,this.element=e,this.name=t,this._$AM=i,this.options=n,s.length>2||s[0]!==""||s[1]!==""?(this._$AH=Array(s.length-1).fill(new String),this.strings=s):this._$AH=b}_$AI(e,t=this,s,i){let n=this.strings,a=!1;if(n===void 0)e=C(this,e,t,0),a=!R(e)||e!==this._$AH&&e!==v,a&&(this._$AH=e);else{let c=e,o,d;for(e=n[0],o=0;o<n.length-1;o++)d=C(this,c[s+o],t,o),d===v&&(d=this._$AH[o]),a||=!R(d)||d!==this._$AH[o],d===b?e=b:e!==b&&(e+=(d??"")+n[o+1]),this._$AH[o]=d}a&&!i&&this.j(e)}j(e){e===b?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}},ne=class extends T{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===b?void 0:e}},ae=class extends T{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==b)}},oe=class extends T{constructor(e,t,s,i,n){super(e,t,s,i,n),this.type=5}_$AI(e,t=this){if((e=C(this,e,t,0)??b)===v)return;let s=this._$AH,i=e===b&&s!==b||e.capture!==s.capture||e.once!==s.once||e.passive!==s.passive,n=e!==b&&(s===b||i);i&&this.element.removeEventListener(this.name,this,s),n&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){typeof this._$AH=="function"?this._$AH.call(this.options?.host??this.element,e):this._$AH.handleEvent(e)}},le=class{constructor(e,t,s){this.element=e,this.type=6,this._$AN=void 0,this._$AM=t,this.options=s}get _$AU(){return this._$AM._$AU}_$AI(e){C(this,e)}};var vt=ce.litHtmlPolyfillSupport;vt?.(O,H),(ce.litHtmlVersions??=[]).push("3.3.2");var Ye=(r,e,t)=>{let s=t?.renderBefore??e,i=s._$litPart$;if(i===void 0){let n=t?.renderBefore??null;s._$litPart$=i=new H(e.insertBefore(U(),n),n,void 0,t??{})}return i._$AI(r),i};var pe=globalThis,u=class extends y{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){let e=super.createRenderRoot();return this.renderOptions.renderBefore??=e.firstChild,e}update(e){let t=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=Ye(t,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return v}};u._$litElement$=!0,u.finalized=!0,pe.litElementHydrateSupport?.({LitElement:u});var $t=pe.litElementPolyfillSupport;$t?.({LitElement:u});(pe.litElementVersions??=[]).push("4.2.2");var _t=g`
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
`,qt=g`
    :host { font-family: 'Exo', sans-serif; font-weight: 200; }
`,I=g`
    :host { font-family: 'Exo', sans-serif; font-weight: 200; }
    button { cursor: pointer; padding: 0.15rem 0.4rem; border: 1px solid var(--btn-border); border-radius: 4px; background: var(--btn-bg); color: var(--text); font: inherit; font-size: 0.75rem; transition: background-color 0.2s, opacity 0.2s; }
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
`,Ge=g`
    :host { display: block; }
    ul { list-style: none; margin: 0; padding: 0; max-height: 160px; overflow-y: auto; scrollbar-width: none; }
    ul::-webkit-scrollbar { display: none; }
    li { display: flex; justify-content: space-between; align-items: center; padding: 0.15rem 0; border-bottom: 1px solid var(--border-light); gap: 0.25rem; }
    li:last-child { border-bottom: none; }
    .user-info { display: flex; flex-direction: column; }
    .user-name { font-weight: 500; font-size: 0.85rem; color: var(--text); }
    .user-status { font-size: 0.7rem; color: var(--text-muted); }
    .actions { display: flex; gap: 0.2rem; flex-shrink: 0; }
    .empty { padding: 1rem; text-align: center; color: var(--text-muted); font-style: italic; font-size: 0.8rem; }
`,Fe=g`
    :host { display: block; }
    .banner { background: var(--banner-warn-bg); border: 1px solid var(--banner-warn-border); border-radius: 6px; padding: 0.4rem 0.6rem; display: flex; flex-direction: column; gap: 0.3rem; }
    .banner .row { display: flex; gap: 0.3rem; justify-content: flex-end; }
    .details { font-size: 0.72rem; color: var(--banner-warn-text); display: flex; flex-wrap: wrap; gap: 0.4rem; }
`,We=g`
    :host { display: block; }
    .banner { border-radius: 6px; padding: 0.4rem 0.6rem; display: flex; flex-direction: column; gap: 0.3rem; border: 1px solid; }
    .pending { background: var(--banner-warn-bg); border-color: var(--banner-warn-border); color: var(--text); }
    .declined { background: var(--banner-decline-bg); border-color: var(--banner-decline-border); color: var(--banner-decline-text); }
    .row { display: flex; gap: 0.3rem; align-items: center; justify-content: space-between; }
    .details { font-size: 0.72rem; }
`,F=g`
    :host { display: block; }
    .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .modal { background: var(--modal-bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; min-width: 220px; display: flex; flex-direction: column; gap: 0.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); }
    h3 { margin: 0; font-size: 0.95rem; text-align: center; }
    .rules { display: flex; flex-direction: column; gap: 0.3rem; }
    button.rule { text-align: left; padding: 0.35rem 0.6rem; font-size: 0.82rem; display: flex; align-items: center; gap: 0.4rem; }
    button.rule img { width: 28px; height: 28px; display: block; }
    button.cancel { background: var(--modal-cancel); color: var(--text); border-color: var(--btn-border); }
    .icon-wrap { position: relative; width: 28px; height: 28px; flex-shrink: 0; }
    .icon-wrap img { width: 28px; height: 28px; display: block; }
    .badge { position: absolute; bottom: 0; right: 0; background: #b02030; color: #fff; font-size: 0.55rem; font-weight: bold; border-radius: 3px; padding: 0 2px; line-height: 1.3; }
`,qe=g`
    :host { display: inline-flex; align-items: center; align-self: center; font-family: 'Exo', sans-serif; font-weight: 200; }
    .badge {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 2px 10px 2px 7px; border-radius: 4px;
        background: #2a2a2a; border: 1px solid rgba(255,255,255,0.12);
        cursor: pointer; font-size: 0.8rem; color: #eee; transition: filter 0.15s;
    }
    .badge:hover { filter: brightness(1.3); }
    .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: var(--dot-color, #888); }
    input { width: 90px; background: transparent; border: none; border-bottom: 1px solid #aaa; color: inherit; font-size: inherit; outline: none; padding: 0; }
`,Ve=g`
    :host { display: block; font-family: 'Exo', sans-serif; font-weight: 200; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.25rem; }
    button { border: none; background: none; cursor: pointer; padding: 0.2rem; opacity: 0.7; border-radius: 4px; }
    button:hover { opacity: 1; background: var(--btn-hover); }
    .icon-wrap { position: relative; display: block; }
    img { display: block; width: 48px; height: 48px; margin: auto; }
    .badge { position: absolute; bottom: 0; right: 0; background: #b02030; color: #fff; font-size: 0.5rem; font-weight: bold; border-radius: 3px; padding: 0 2px; line-height: 1.3; }
`,Je=g`
    :host { display: block; overflow-y: auto; font-family: 'Exo', sans-serif; font-weight: 200; font-size: 0.75rem; color: var(--text); }
    .tbl { display: inline-block; vertical-align: top; border: 1px solid var(--border); border-radius: 4px; margin: 0.25rem; overflow: hidden; }
    table { border-collapse: collapse; width: auto; }
    th, td { border-bottom: 1px solid var(--border); padding: 0.15rem 0.3rem; text-align: left; }
    th { display: none; }
    caption { font-size: 0.8rem; font-weight: 600; text-align: center; padding: 0.2rem 0; color: var(--text-dim); }
    a { color: var(--link); text-decoration: none; }
    .date { text-align: right; }
    .loading { color: var(--text-muted); }
`,Ke=g`
    :host { display: flex; flex-direction: column; height: 100%; }
    .panel-header { display: flex; align-items: center; justify-content: center; gap: 0.4rem; margin-bottom: 0.25rem; }
    .panel-title { font-weight: bold; font-size: 0.8rem; color: var(--text-dim); }
    .user-name { font-size: 0.75rem; font-weight: 500; white-space: nowrap; color: var(--text); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #dc3545; flex-shrink: 0; }
    .dot.on { background: #198754; }
`,Ze=[_t,g`
    :host { display: flex; flex-direction: column; min-height: 100%; font-family: 'Exo', sans-serif; font-weight: 200; font-size: 0.85rem; box-sizing: border-box; padding: 0.5rem; gap: 0.2rem; background: var(--bg); color: var(--text); overflow-y: auto; scrollbar-width: none; }
    :host::-webkit-scrollbar { display: none; }
    h1 { font-size: 0.85rem; color: var(--text-dim); text-align: center; margin: 0; letter-spacing: 0.1em; text-transform: uppercase; flex-shrink: 0; }
    h1 a { color: inherit; text-decoration: none; }
    h1 a:hover { text-decoration: underline; }
    .topbar { display: flex; align-items: center; flex-shrink: 0; gap: 0.3rem; }
    .topbar h1 { flex: 1; }
    .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem; overflow: hidden; }
    .panel-title { font-weight: bold; margin-bottom: 0.25rem; font-size: 0.8rem; color: var(--text-dim); text-align: center; }
    .main-row { display: flex; gap: 0.2rem; flex-shrink: 0; }
    .main-row .solo { flex: 0 0 auto; }
    .main-row .players { flex: 1; display: flex; flex-direction: column; }
    .info-row { display: flex; flex-direction: column; }
    .info-row .panel { overflow: visible; }
`];var ue=class extends EventTarget{clientId=localStorage.getItem("clientId")||"";userName=localStorage.getItem("userName")||"Anonymous";set(e,t){this.clientId=e,this.userName=t,localStorage.setItem("clientId",e),localStorage.setItem("userName",t),this.dispatchEvent(new Event("change"))}},A=new ue,_=class extends u{connectedCallback(){super.connectedCallback(),this._storeListener=()=>this.requestUpdate(),A.addEventListener("change",this._storeListener)}disconnectedCallback(){super.disconnectedCallback(),A.removeEventListener("change",this._storeListener)}};var xt=[{label:"Nine Ball",img:"assets/nineball.png",ruletype:"nineball"},{label:"Snooker 6r",img:"assets/snooker.png",ruletype:"snooker",options:{reds:"6"}},{label:"Snooker",img:"assets/snooker.png",ruletype:"snooker",options:{reds:"15"}},{label:"3-Cushion",img:"assets/threecushion.png",ruletype:"threecushion",options:{raceTo:"3"}},{label:"3-Cushion 11",img:"assets/threecushion.png",ruletype:"threecushion",options:{raceTo:"11"}},{label:"3-Cushion 21",img:"assets/threecushion.png",ruletype:"threecushion",options:{raceTo:"21"}},{label:"Trickshot",img:"assets/practice.png",url:"https://billiards.tailuge.workers.dev/practice"},{label:"Research",img:"assets/research.png",url:"https://billiards.tailuge.workers.dev/diagrams/three"},{label:"Eight Ball",img:"assets/eightball.png",ruletype:"eightball"}],Et=(r,e,t)=>{if(r.url)return`${r.url}?clientId=${encodeURIComponent(e)}&userName=${encodeURIComponent(t)}`;let s=`https://billiards.tailuge.workers.dev/?ruletype=${r.ruletype}&clientId=${encodeURIComponent(e)}&userName=${encodeURIComponent(t)}`;return r.options&&Object.entries(r.options).forEach(([i,n])=>s+=`&${i}=${encodeURIComponent(n)}`),s},ge=class extends _{static styles=Ve;render(){let{clientId:e,userName:t}=A;return l`<div class="grid">${xt.map(s=>l`
            <button title=${s.label} aria-label="Play ${s.label}"
                @click=${()=>{window.location.href=Et(s,e,t)}}>
                <span class="icon-wrap">
                    <img src=${s.img} alt=${s.label} />
                    ${s.options?l`<span class="badge">${Object.values(s.options)[0]}</span>`:""}
                </span>
            </button>`)}
        </div>`}};customElements.define("solo-panel",ge);var j="https://scoreboard-tailuge.vercel.app",Qe=r=>{let e=Math.floor((Date.now()-r)/1e3);if(e<60)return`${e}s ago`;let t=Math.floor(e/60);if(t<60)return`${t}m ago`;let s=Math.floor(t/60);return s<24?`${s}h ago`:`${Math.floor(s/24)}d ago`},Xe={connected:!1,users:[],challenges:{},currentMatch:null};function et(r,e){let t={...r.challenges},s=i=>i.challengerId===e.myId?i.challengeeId:i.challengerId;switch(e.type){case"CONNECTED":return{...r,connected:e.payload};case"USERS_UPDATE":return{...r,users:e.payload};case"CHALLENGE_SENT":return{...r,challenges:{...t,[e.payload.challengeeId]:{...e.payload,status:"pending"}}};case"CHALLENGE_MSG":{let i=e.payload,n=s(i);if(i.type==="offer")(!t[i.challengerId]||t[i.challengerId].tableId!==i.tableId)&&(t[i.challengerId]={...i,status:"pending"});else if(i.type==="accept"&&!r.currentMatch){let a=t[n],c=i.options||(a?.tableId===i.tableId?a.options:void 0);return delete t[n],{...r,challenges:t,currentMatch:{tableId:i.tableId,ruleType:i.ruleType,options:c,isFirst:i.challengerId===e.myId}}}else i.type==="decline"?t[i.challengeeId]&&(t[i.challengeeId]={...t[i.challengeeId],status:"declined"}):i.type==="cancel"&&delete t[s(i)];return{...r,challenges:t}}case"CHALLENGE_DISMISS":return delete t[e.payload],{...r,challenges:t};case"MATCH_SET":return{...r,currentMatch:e.payload};case"MATCH_LEAVE":return{...r,currentMatch:null};default:return r}}function tt(r="",e=""){return r.includes("github")?{emoji:"\u{1F419}",title:"github"}:r.includes("vercel")?{emoji:"\u{1F465}",title:"vercel"}:r.includes("render")?{emoji:"\u{1F464}",title:"vercel"}:r.includes("localhost")?{emoji:"\u{1F3E0}",title:"localhost"}:{spectator:{emoji:"\u{1F52D}",title:"spectator"},replay:{emoji:"\u{1F440}",title:"replay"},bot:{emoji:"\u{1F916}",title:"bot"},nineball:{emoji:"\u2468",title:"nineball"},eightball:{emoji:"\u{1F3B1}",title:"eightball"},snooker:{emoji:"\u{1F534}",title:"snooker"},threecushion:{emoji:"\u2462",title:"threecushion"}}[e]??{emoji:"\u{1F3AE}",title:"external"}}var W=r=>r==="BOT"?"\u{1F916}":r?[...r.toUpperCase()].map(e=>String.fromCodePoint(127397+e.charCodeAt(0))).join(""):"\u{1F310}",be=({tableId:r,userId:e,userName:t,ruleType:s,isFirst:i,options:n,bot:a})=>{let c=`https://billiards.tailuge.workers.dev/?websocketserver=wss://billiards.onrender.com/ws&tableId=${r}&userName=${encodeURIComponent(t)}&clientId=${e}&ruletype=${s}`;return i&&(c+="&first=true"),a&&(c+=`&bot=${encodeURIComponent(a)}`),n&&Object.entries(n).forEach(([o,d])=>c+=`&${encodeURIComponent(o)}=${encodeURIComponent(d)}`),c},q=r=>({eightball:"\u{1F3B1}",snooker:"\u{1F534}",threecushion:"\u2782",nineball:"\u24FD"})[r]??"\u{1F3B1}",me=r=>["\u{1F3C6}","\u{1F948}","\u{1F949}","\u{1F396}\uFE0F"][r]??"";var st={ATTRIBUTE:1,CHILD:2,PROPERTY:3,BOOLEAN_ATTRIBUTE:4,EVENT:5,ELEMENT:6},it=r=>(...e)=>({_$litDirective$:r,values:e}),V=class{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,t,s){this._$Ct=e,this._$AM=t,this._$Ci=s}_$AS(e,t){return this.update(e,t)}update(e,t){return this.render(...t)}};var rt="important",St=" !"+rt,nt=it(class extends V{constructor(r){if(super(r),r.type!==st.ATTRIBUTE||r.name!=="style"||r.strings?.length>2)throw Error("The `styleMap` directive must be used in the `style` attribute and must be the only part in the attribute.")}render(r){return Object.keys(r).reduce((e,t)=>{let s=r[t];return s==null?e:e+`${t=t.includes("-")?t:t.replace(/(?:^(webkit|moz|ms|o)|)(?=[A-Z])/g,"-$&").toLowerCase()}:${s};`},"")}update(r,[e]){let{style:t}=r.element;if(this.ft===void 0)return this.ft=new Set(Object.keys(e)),this.render(e);for(let s of this.ft)e[s]==null&&(this.ft.delete(s),s.includes("-")?t.removeProperty(s):t[s]=null);for(let s in e){let i=e[s];if(i!=null){this.ft.add(s);let n=typeof i=="string"&&i.endsWith(St);s.includes("-")||n?t.setProperty(s,n?i.slice(0,-11):i,n?rt:""):t[s]=i}}return v}});var fe=class extends u{static properties={url:{type:String},color:{type:String}};static styles=g`
        :host {
            display: inline-block;
            vertical-align: middle;
            margin: 0;
            padding: 0;
            line-height: 0;
        }
        .pill {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 16px;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.15s ease-in-out;
            border: 1px solid rgba(255, 255, 255, 0.1);
            margin: 0;
            padding: 0;
        }
        .pill:hover {
            filter: brightness(1.25);
            transform: scale(1.08);
        }
        svg {
            width: 14px;
            height: 14px;
            fill: white;
        }
    `;render(){return l`
            <div
                class="pill"
                style=${nt({backgroundColor:this.color||"#4a90d9"})}
                @click=${()=>window.open(this.url,"_blank")}
                role="button">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
        `}};customElements.define("replay-button",fe);var ye=class extends u{static styles=Je;connectedCallback(){super.connectedCallback(),fetch(`${j}/api/summary`,{mode:"cors"}).then(e=>e.json()).then(e=>{this._data=e,this.requestUpdate()}).catch(()=>{this._err=!0,this.requestUpdate()})}render(){if(this._err)return l`<span class="loading">Could not load scores.</span>`;if(!this._data)return l`<span class="loading">Loading…</span>`;let{hiscores:e,topPlayers:t,recentMatches:s}=this._data,i=Object.keys(e);return l`
            ${i.map(n=>l`
                <div class="tbl"><table><caption>${q(n)} High Scores</caption>
                <tr><th>Name</th><th>Score</th><th></th></tr>
                    ${e[n].slice(0,4).map((a,c)=>l`<tr><td>${me(c)} ${a.name}</td><td>${a.score}</td><td><replay-button url="${j}/api/rank/${a.id}?ruletype=${n}"></replay-button></td></tr>`)}
                </table></div>
            `)}
            ${i.map(n=>l`
                <div class="tbl"><table><caption>${q(n)} Top Players</caption>
                <tr><th>Name</th><th>Rating</th><th>W</th><th>L</th></tr>
                    ${t[n].slice(0,4).map((a,c)=>l`<tr>
                        <td><a href="${j}/player/${encodeURIComponent(a.name)}?ruleType=${n}">${me(c)} ${a.name}</a></td>
                        <td>${Math.round(a.rating)}</td>
                    </tr>`)}
                </table></div>
            `)}
            <div class="tbl"><table><caption>Recent Matches</caption>
            <tr><th>Rule</th><th>Match</th><th>Date</th><th></th></tr>
                ${s.map(n=>l`<tr>
                    <td>${q(n.ruleType)}</td><td>${n.loser?"\u{1F396}\uFE0F":""}${n.winner}${n.loser?` vs ${n.loser}`:""}</td>
                    <td class="date">${Qe(n.timestamp)}${n.locationCountry?` ${n.locationCity??""} ${W(n.locationCountry)}`:""}</td>
                    <td>${n.hasReplay?l`<replay-button url="${j}/api/match-replay?id=${n.id}"></replay-button>`:""}</td>
                </tr>`)}
            </table></div>`}};customElements.define("info-panel",ye);var L={PRESENCE_PUBLISH:"/publish/presence/lobby",PRESENCE_SUBSCRIBE:"/subscribe/presence/lobby",TABLE_PUBLISH:r=>`/publish/table/${r}`,TABLE_SUBSCRIBE:r=>`/subscribe/table/${r}`},J=class{constructor(e){if(this.server=e.replace(/\/$/,""),!this.server.includes("://"))if(typeof window<"u"){let t=window.location.protocol;this.server=`${t}//${this.server}`}else this.server=`http://${this.server}`}getWsUrl(e){return this.server.replace(/^http/,"ws")+e}getHttpUrl(e){return this.server+e}async publish(e,t,s={}){let i=this.getHttpUrl(e),n=await fetch(i,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t),keepalive:s.keepalive});if(!n.ok)throw new Error(`Publish failed: ${n.status}`);return n}async publishPresence(e,t){return this.publish(L.PRESENCE_PUBLISH,{...e,messageType:"presence"},t)}async publishChallenge(e,t){return this.publish(L.PRESENCE_PUBLISH,{...e,messageType:"challenge"},t)}async publishChat(e,t){return this.publish(L.PRESENCE_PUBLISH,{...e,messageType:"chat"},t)}async publishTable(e,t,s,i){return this.publish(L.TABLE_PUBLISH(e),{...t,senderId:s},i)}subscribePresence(e){return this.subscribe(L.PRESENCE_SUBSCRIBE,e)}subscribeTable(e,t){return this.subscribe(L.TABLE_SUBSCRIBE(e),t)}subscribe(e,t){let s=this.getWsUrl(e),i=null,n=!1,a=0,c=3e4,o=null,d=!0,p={stop:()=>{n=!0,o&&(clearTimeout(o),o=null),i&&(i.close(),i=null)},ready:null},h;p.ready=new Promise(m=>{h=m});let f=()=>{if(!n){if(i&&i.readyState<=WebSocket.OPEN){h();return}i=new globalThis.WebSocket(s),i.onmessage=m=>{t(m.data)},i.onopen=()=>{let m=!d;d=!1,a=0,o&&(clearTimeout(o),o=null),h(),m&&p.onReconnect&&p.onReconnect()},i.onclose=()=>{if(!n){let m=Math.min(Math.pow(2,a)*1e3,c);a++,o=setTimeout(f,m),o.unref?.()}},i.onerror=()=>{i?.close()}}};return f(),p}};function at(r,e){return r.userId!==e&&!r.tableId&&!r.seek}function K(r){if(!r||r.trim()==="")return null;try{return JSON.parse(r)}catch(e){return console.error("Failed to parse Nchan message:",e),null}}var P=class{constructor(e,t,s,i){this.nchan=e;this.tableId=t;this.userId=s;this.lobby=i;this.subscription=null;this.isJoined=!1;this.messageListeners=[];this.spectatorListeners=[];this.opponentLeftListeners=[];this.opponentLeft=!1;this.opponentSeen=!1;if(this.lobby){let n=a=>this.handleLobbyUsersChange(a);this.lobby.onUsersChange(n),this.lobbyUnsubscribe=()=>{this.lobby?.offUsersChange(n)}}}async join(){this.isJoined||(this.subscription=this.nchan.subscribeTable(this.tableId,e=>{this.handleIncomingMessage(e)}),await this.subscription.ready,this.isJoined=!0)}async publish(e,t){await this.nchan.publishTable(this.tableId,{type:e,data:t},this.userId)}onMessage(e){this.messageListeners.push(e)}onOpponentLeft(e){this.opponentLeftListeners.push(e),this.opponentLeft&&e()}onSpectatorChange(e){this.spectatorListeners.push(e)}async leave(e={}){if(!e.isTeardown)try{await this.nchan.publishTable(this.tableId,{type:"table:leave",data:{}},this.userId),await new Promise(t=>setTimeout(t,100))}catch(t){console.error("Error leaving table:",t)}this.lobby&&await this.lobby.updatePresence({tableId:void 0}),this.subscription?.stop(),this.messageListeners=[],this.spectatorListeners=[],this.opponentLeftListeners=[],this.lobbyUnsubscribe?.(),this.isJoined=!1}handleIncomingMessage(e){let t=K(e);!t||!t.type||(t.type==="table:leave"&&t.senderId!==this.userId&&this.notifyOpponentLeft(),this.messageListeners.forEach(s=>s(t)))}handleLobbyUsersChange(e){let s=e.filter(i=>i.tableId===this.tableId).find(i=>i.userId!==this.userId);s&&(this.opponentSeen=!0),this.opponentSeen&&!s&&this.notifyOpponentLeft()}notifyOpponentLeft(){this.opponentLeft||(this.opponentLeft=!0,this.opponentLeftListeners.forEach(e=>e()))}};function ot(){return"xxxxxxxx".replace(/x/g,()=>Math.floor(Math.random()*16).toString(16))}var Z=class{constructor(e){this.pendingOffers=new Map;this.onEmit=e}processMessage(e,t){let s=[e.challengerId,e.challengeeId].sort().join(":");if(e.type==="offer"){if(e.challengeeId===t){this.clearInteraction(s);let i=setTimeout(()=>{this.onEmit(e),this.pendingOffers.delete(s)},250);i&&typeof i=="object"&&"unref"in i&&i.unref(),this.pendingOffers.set(s,i)}}else this.clearInteraction(s),(e.type==="cancel"?e.challengeeId===t:e.challengerId===t)&&this.onEmit(e)}clearInteraction(e){let t=this.pendingOffers.get(e);t&&(clearTimeout(t),this.pendingOffers.delete(e))}clear(){for(let e of this.pendingOffers.values())clearTimeout(e);this.pendingOffers.clear()}};var Q=class{constructor(e,t,s={}){this.nchan=e;this.currentUser=t;this.options=s;this.users=new Map;this.listeners=[];this.challengeListeners=[];this.chatListeners=[];this.pendingChallenges=[];this.subscription=null;this.isJoined=!1;this.presenceMessageCount=0;this.heartbeatInterval=s.heartbeatInterval||6e4,this.pruneInterval=s.pruneInterval||3e4,this.staleTtl=s.staleTtl||9e4,this.deduplicator=new Z(i=>{this.pendingChallenges.push(i),this.challengeListeners.forEach(n=>n(i))})}onChat(e){this.chatListeners.push(e)}async sendChat(e,t){await this.nchan.publishChat({senderId:this.currentUser.userId,recipientId:e,text:t})}async join(){this.isJoined||(this.subscription=this.nchan.subscribePresence(e=>{this.handleIncomingMessage(e)}),this.subscription.onReconnect=()=>{this.resumeHeartbeat(),this.options.onReconnect?this.options.onReconnect():this.nchan.publishPresence(this.currentUser).catch(e=>{console.error("Failed to re-broadcast presence on reconnect:",e)})},await this.subscription.ready,await this.nchan.publishPresence(this.currentUser),this.startHeartbeat(),this.startPruning(),this.isJoined=!0)}pauseHeartbeat(){this.stopHeartbeat()}resumeHeartbeat(){this.startHeartbeat()}startHeartbeat(){this.stopHeartbeat(),this.heartbeatTimer=setInterval(async()=>{try{await this.syncPresence({type:"heartbeat"})}catch(e){console.error("Failed to send heartbeat:",e)}},this.heartbeatInterval),this.heartbeatTimer.unref?.()}stopHeartbeat(){this.heartbeatTimer&&(clearInterval(this.heartbeatTimer),this.heartbeatTimer=void 0)}startPruning(){this.stopPruning(),this.pruneTimer=setInterval(()=>{let e=Date.now(),t=!1;for(let[s,i]of this.users.entries()){if(s===this.currentUser.userId)continue;let n=i.meta.ts;e-n>this.staleTtl&&(this.users.delete(s),t=!0)}t&&this.notifyListeners()},this.pruneInterval),this.pruneTimer.unref?.()}stopPruning(){this.pruneTimer&&(clearInterval(this.pruneTimer),this.pruneTimer=void 0)}onUsersChange(e){this.listeners.push(e),e(this.getUsersList())}offUsersChange(e){this.listeners=this.listeners.filter(t=>t!==e)}async updatePresence(e){this.currentUser={...this.currentUser,...e},await this.syncPresence()}async syncPresence(e={}){if(this.presenceMessageCount++,this.presenceMessageCount>=120){await this.leave();return}await this.nchan.publishPresence({...this.currentUser,...e})}async challenge(e,t,s,i){let n=ot();return await this.nchan.publishChallenge({type:"offer",challengerId:this.currentUser.userId,challengerName:this.currentUser.userName,challengeeId:e,ruleType:t,tableId:n,rematch:s,options:i}),n}async acceptChallenge(e,t,s,i,n){await this.nchan.publishChallenge({type:"accept",challengerId:e,challengerName:n??e,challengeeId:this.currentUser.userId,ruleType:t,tableId:s,options:i}),await this.updatePresence({tableId:s});let a=new P(this.nchan,s,this.currentUser.userId,this);return await a.join(),a}async declineChallenge(e,t,s){await this.nchan.publishChallenge({type:"decline",challengerId:e,challengerName:s??e,challengeeId:this.currentUser.userId,ruleType:t})}async cancelChallenge(e,t){await this.nchan.publishChallenge({type:"cancel",challengerId:this.currentUser.userId,challengerName:this.currentUser.userName,challengeeId:e,ruleType:t})}onChallenge(e){this.challengeListeners.push(e),this.pendingChallenges.forEach(t=>e(t))}async leave(e={}){this.stopHeartbeat(),this.stopPruning(),this.subscription?.stop();try{await this.nchan.publishPresence({...this.currentUser,type:"leave"},{keepalive:e.isTeardown})}catch(t){console.error("Error leaving lobby:",t)}this.users.clear(),this.pendingChallenges=[],this.deduplicator.clear(),this.presenceMessageCount=0,this.notifyListeners(),this.isJoined=!1,this.options.onLeave?.()}handleIncomingMessage(e){let t=K(e);t&&(t.messageType==="presence"?this.handlePresenceUpdate(t):t.messageType==="challenge"?this.handleChallenge(t):t.messageType==="chat"&&this.handleChat(t))}handlePresenceUpdate(e){e.type==="leave"?this.users.delete(e.userId):this.users.set(e.userId,e),this.notifyListeners()}handleChallenge(e){this.deduplicator.processMessage(e,this.currentUser.userId)}handleChat(e){e.recipientId===this.currentUser.userId&&this.chatListeners.forEach(t=>t(e))}notifyListeners(){let e=this.getUsersList();this.listeners.forEach(t=>t(e))}getUsersList(){return Array.from(this.users.values()).sort((e,t)=>e.userName.localeCompare(t.userName))}};var X=class{constructor(e){this.activeLobbies=[];this.lobbyInstances=new Map;this.activeTables=[];this.lobbyConfigs=new Map;this.isStopping=!1;this.isStarted=!1;this.listenersAttached=!1;this.resumePromise=null;this.stopPromise=null;this.joiningLobbies=new Map;this.handlePageHide=()=>{this.stop({isTeardown:!0})};this.handlePageShow=async e=>{e.persisted&&await this.resumeSession()};this.handleVisibilityChange=async()=>{document.visibilityState==="hidden"?this.activeLobbies.forEach(e=>e.pauseHeartbeat()):document.visibilityState==="visible"&&await this.resumeSession()};this.nchan=new J(e.baseUrl)}start(){typeof window<"u"&&!this.listenersAttached&&(window.addEventListener("pagehide",this.handlePageHide),window.addEventListener("pageshow",this.handlePageShow),document.addEventListener("visibilitychange",this.handleVisibilityChange),this.listenersAttached=!0),!this.isStarted&&(this.isStarted=!0)}async stop(e={}){return this.stopPromise?this.stopPromise:(this.stopPromise=(async()=>{this.isStopping=!0;try{this.isStarted=!1;let t=[...this.activeLobbies];this.activeLobbies=[],await Promise.all(t.map(i=>i.leave(e)));let s=[...this.activeTables];this.activeTables=[],await Promise.all(s.map(i=>i.leave(e)))}finally{this.isStopping=!1,this.stopPromise=null}})(),this.stopPromise)}async joinLobby(e,t){if(this.start(),this.joiningLobbies.has(e.userId))return this.joiningLobbies.get(e.userId);let s=(async()=>{try{let i=this.lobbyInstances.get(e.userId),n,a={...t,onReconnect:()=>{this.resumeSession().catch(o=>console.error("Session resume failed after lobby reconnect:",o)),t?.onReconnect?.()},onLeave:()=>{let o=n??i;if(o){let d=this.activeLobbies.indexOf(o);d!==-1&&this.activeLobbies.splice(d,1)}}};if(this.lobbyConfigs.set(e.userId,{user:e,options:t}),i)return i.currentUser=e,await i.join(),i.resumeHeartbeat(),this.activeLobbies.includes(i)||this.activeLobbies.push(i),i;let c=new Q(this.nchan,e,a);return n=c,await c.join(),this.lobbyInstances.set(e.userId,c),this.activeLobbies.push(c),c}finally{this.joiningLobbies.delete(e.userId)}})();return this.joiningLobbies.set(e.userId,s),s}async leaveLobby(e){let t=this.activeLobbies.findIndex(s=>s.currentUser.userId===e);t!==-1&&(await this.activeLobbies[t].leave(),this.activeLobbies.splice(t,1)),this.lobbyInstances.delete(e),this.lobbyConfigs.delete(e)}async joinTable(e,t){let s=this.activeTables.find(a=>a.tableId===e);if(s)return await s.join(),s;let i=this.activeLobbies.find(a=>a.currentUser.userId===t);if(!i)throw new Error(`Cannot join table: No active lobby found for user ${t}`);let n=new P(this.nchan,e,t,i);return await n.join(),this.activeTables.push(n),await i.updatePresence({tableId:e}),n}async resumeSession(){return this.resumePromise?this.resumePromise:(this.resumePromise=(async()=>{try{if(this.stopPromise&&await this.stopPromise,!this.isStarted&&this.lobbyConfigs.size>0){this.isStarted=!0;let e=Array.from(this.lobbyConfigs.values());await Promise.all(e.map(t=>this.joinLobby(t.user,t.options)));return}await Promise.all(this.activeLobbies.map(async e=>{e.resumeHeartbeat();try{await e.syncPresence()}catch(t){console.error("Failed to refresh presence during session resume:",t)}}))}finally{this.resumePromise=null}})(),this.resumePromise)}};var wt=[{userId:"bot-clawbreak",userName:"ClawBreak",isBot:!0,meta:{country:"BOT"}},{userId:"bot-thefarjaw",userName:"TheFarJaw",isBot:!0,meta:{country:"BOT"}}],x=(r,e,t)=>r.dispatchEvent(new CustomEvent(e,{detail:t,bubbles:!0,composed:!0})),ve=class extends u{static properties={users:{type:Array},myId:{type:String},tableId:{type:String},isChallengePending:{type:Boolean}};static styles=[I,Ge];render(){let e=(this.users||[]).filter(t=>t.userId!==this.myId);return e.length===0?l`<div class="empty">No other players online yet. Invite a friend!</div>`:l`<ul>${e.map(t=>this._row(t))}</ul>`}_row(e){let t=e.isBot||at(e,this.myId)?l`<button class="btn-challenge" aria-label="Challenge ${e.userName}" ?disabled=${this.isChallengePending} @click=${()=>x(this,"challenge",e.userId)}>Challenge</button>`:l``;return l`
            <li>
                <div class="user-info">
                    <span class="user-name">${W(e.meta?.country)} ${e.userName} ${tt(e.meta?.origin??"",e.tableId??"").emoji}</span>
                </div>
                <div class="actions">${t}</div>
            </li>`}},$e=class extends u{static properties={challenge:{type:Object},sent:{type:Object}};static styles=[I,Fe,We];render(){return this.challenge?this._incoming(this.challenge):this.sent?this._sent(this.sent):l``}_incoming(e){let t=Object.entries(e.options??{}).map(([s,i])=>`${s}: ${i}`);return l`
            <div class="banner">
                <strong>Challenge from ${e.challengerName}</strong>
                <div class="details"><span>📋 ${e.ruleType}</span>${t.map(s=>l`<span>${s}</span>`)}</div>
                <div class="row">
                    <button class="btn-accept" @click=${()=>x(this,"accept")}>Accept</button>
                    <button class="btn-decline" @click=${()=>x(this,"decline")}>Decline</button>
                </div>
            </div>`}_sent(e){let t=e.status==="pending";return l`
            <div class="banner ${e.status}">
                <div class="row">
                    <strong>${t?`\u23F3 Waiting for ${e.recipientName}\u2026`:`\u274C ${e.recipientName} declined.`}</strong>
                    ${t?l`<button class="btn-leave" @click=${()=>x(this,"cancel")}>Cancel</button>`:l`<button @click=${()=>x(this,"dismiss")}>✕</button>`}
                </div>
                <div class="details">📋 ${e.ruleType}</div>
            </div>`}},_e=class r extends u{static properties={userId:{type:String},userName:{type:String}};static styles=[I,F];static RULES=[{id:"eightball",label:"Eight Ball",img:"assets/eightball.png"},{id:"nineball",label:"Nine Ball",img:"assets/nineball.png"},{id:"threecushion",label:"Three Cushion",img:"assets/threecushion.png"},{id:"threecushion",label:"Three Cushion (11)",img:"assets/threecushion.png",options:{raceTo:"11"}},{id:"threecushion",label:"Three Cushion (21)",img:"assets/threecushion.png",options:{raceTo:"21"}},{id:"snooker",label:"Snooker",img:"assets/snooker.png"},{id:"snooker",label:"Snooker (6 reds)",img:"assets/snooker.png",options:{reds:"6"}}];render(){return this.userId?l`
            <div class="backdrop" @click=${e=>e.target===e.currentTarget&&x(this,"cancel")}>
                <div class="modal" role="dialog" aria-modal="true" aria-label="Select game type">
                    <h3>Challenge ${this.userName}</h3>
                    <div class="rules">
                        ${r.RULES.map(e=>l`
                            <button class="rule btn-challenge" @click=${()=>x(this,"confirm",{ruleType:e.id,options:e.options})}>
                                <span class="icon-wrap">
                                    <img src=${e.img} alt=${e.label} />
                                    ${e.options?l`<span class="badge">${Object.values(e.options)[0]}</span>`:""}
                                </span>
                                ${e.label}
                            </button>`)}
                    </div>
                    <button class="cancel" @click=${()=>x(this,"cancel")}>Cancel</button>
                </div>
            </div>`:l``}},xe=class extends u{static styles=[I,Ke];#t={...Xe};#s=null;#d=null;#e;#i;#c;#h;#r=null;constructor(){super();let e=new URLSearchParams(location.search);this.#e=e.get("clientId")||localStorage.getItem("clientId")||"user-"+Math.random().toString(36).slice(2,7),this.#i=e.get("userName")||localStorage.getItem("userName")||"Anonymous";let t="https://billiards-network.onrender.com";(location.hostname==="localhost"||location.hostname==="127.0.0.1")&&(t=`${location.protocol==="https:"?"https:":"http:"}//${location.host}`),this.#h=new X({baseUrl:t})}connectedCallback(){super.connectedCallback(),this._onUserChanged=e=>{this.#e=e.detail.userId,this.#i=e.detail.userName,this.#s?.leave(),this.#s=null,this._connect().catch(t=>console.error("Lobby reconnect failed:",t))},document.addEventListener("user-name-changed",this._onUserChanged),this._connect().catch(e=>console.error("Lobby connect failed:",e))}disconnectedCallback(){super.disconnectedCallback(),document.removeEventListener("user-name-changed",this._onUserChanged),this.#s?.leave()}dispatch(e){this.#t=et(this.#t,{...e,myId:this.#e}),this.requestUpdate()}get#p(){return this.#t.connected}get#u(){return this.#t.users}get#o(){return this.#t.currentMatch?.tableId}get#g(){return this.#t.currentMatch?.ruleType||"standard"}get#b(){return!!this.#t.currentMatch?.isFirst}get#m(){return this.#t.currentMatch?.options}get#l(){return Object.values(this.#t.challenges).find(e=>e.challengeeId===this.#e&&e.status==="pending")}get#n(){return Object.values(this.#t.challenges).find(e=>e.challengerId===this.#e)}get#a(){return[...this.#u,...wt]}async _connect(){this.#c=Date.now(),this.#s=await this.#h.joinLobby({messageType:"presence",type:"join",userId:this.#e,userName:this.#i}),this.dispatch({type:"CONNECTED",payload:!0}),this.#s.onUsersChange(e=>this.dispatch({type:"USERS_UPDATE",payload:e})),this.#s.onChallenge(e=>{(e.meta?.ts?new Date(e.meta.ts).getTime():1/0)<this.#c||(this.dispatch({type:"CHALLENGE_MSG",payload:e}),e.type==="challenge"&&e.challengeeId===this.#e&&document.hidden&&Notification.permission==="granted"&&new Notification("Challenge received!",{body:`${e.challengerName} challenged you to ${e.ruleType}`,icon:"assets/golden-cup.png"}))})}async#f(e,t,s){let i=this.#a.find(a=>a.userId===e);if(i?.isBot){let a="bot-"+Math.random().toString(36).slice(2,8);window.location.href=be({tableId:a,userId:this.#e,userName:this.#i,ruleType:t,isFirst:!0,options:s,bot:i.userName});return}let n=await this.#s.challenge(e,t,void 0,s);this.dispatch({type:"CHALLENGE_SENT",payload:{challengerId:this.#e,challengeeId:e,recipientName:i?.userName||e,ruleType:t,options:s,tableId:n}})}async#y(){let e=this.#n;e?.status==="pending"&&(await this.#s.cancelChallenge(e.challengeeId,e.ruleType),this.dispatch({type:"CHALLENGE_DISMISS",payload:e.challengeeId}))}async#v(){let e=this.#l;this.#d=await this.#s.acceptChallenge(e.challengerId,e.ruleType,e.tableId,e.options,e.challengerName),this.dispatch({type:"MATCH_SET",payload:{tableId:e.tableId,ruleType:e.ruleType,options:e.options,isFirst:!1}})}async#$(){let e=this.#l;await this.#s.declineChallenge(e.challengerId,e.ruleType,e.challengerName),this.dispatch({type:"CHALLENGE_DISMISS",payload:e.challengerId})}#_(){let e=this.#n;e&&this.dispatch({type:"CHALLENGE_DISMISS",payload:e.challengeeId})}render(){if(this.#o){let t=be({tableId:this.#o,userId:this.#e,userName:this.#i,ruleType:this.#g,isFirst:this.#b,options:this.#m});return window.location.href=t,l``}let e=this.#r;return l`
            <div class="panel-header">
                <span class="dot ${this.#p?"on":""}"></span>
                <span class="panel-title">Play Online (${this.#a.filter(t=>t.userId!==this.#e).length})</span>
            </div>
            <challenge-banner
                .challenge=${this.#l}
                .sent=${this.#n}
                @accept=${()=>this.#v()}
                @decline=${()=>this.#$()}
                @cancel=${()=>this.#y()}
                @dismiss=${()=>this.#_()}>
            </challenge-banner>
            <user-list
                .users=${this.#a}
                myId=${this.#e}
                tableId=${this.#o||""}
                .isChallengePending=${this.#n?.status==="pending"}
                @challenge=${t=>{let s=this.#a.find(i=>i.userId===t.detail);this.#r={userId:t.detail,userName:s?.userName??t.detail},this.requestUpdate()}}>
            </user-list>
            <challenge-modal
                .userId=${e?.userId??null}
                .userName=${e?.userName??""}
                @confirm=${t=>{this.#f(e.userId,t.detail.ruleType,t.detail.options),this.#r=null}}
                @cancel=${()=>{this.#r=null,this.requestUpdate()}}>
            </challenge-modal>`}};customElements.define("user-list",ve);customElements.define("challenge-banner",$e);customElements.define("challenge-modal",_e);customElements.define("online-panel",xe);var It=()=>"id"+Math.random().toString(16).slice(2,8);function Ct(){let r=new URLSearchParams(location.search),e=r.get("clientId"),t=r.get("userName");if(e)return{clientId:e,userName:t||"Anonymous",dotColor:"#f5c518"};let s=!!localStorage.getItem("clientId"),i=localStorage.getItem("clientId")||(()=>{let a=It();return localStorage.setItem("clientId",a),a})(),n=localStorage.getItem("userName")||"Anonymous";return{clientId:i,userName:n,dotColor:s?"#4caf50":"#888"}}var Ee=class extends _{static properties={_name:{state:!0},_editing:{state:!0},_dotColor:{state:!0}};static styles=qe;constructor(){super();let{clientId:e,userName:t,dotColor:s}=Ct();this._clientId=e,this._name=t,this._dotColor=s,this._editing=!1}_startEdit(){this._editing=!0}_commit(e){let t=e.target.value.trim().slice(0,12)||"Anonymous";this._name=t,this._editing=!1,A.set(this._clientId,t),this.dispatchEvent(new CustomEvent("user-name-changed",{bubbles:!0,composed:!0,detail:{userId:this._clientId,userName:t}}))}_onKey(e){e.key==="Enter"&&e.target.blur(),e.key==="Escape"&&(this._editing=!1)}render(){return l`
            <div class="badge" style="--dot-color:${this._dotColor}" @click=${this._editing?null:this._startEdit}>
                <span class="dot"></span>
                ${this._editing?l`<input autofocus maxlength="12" .value=${this._name}
                                @blur=${this._commit} @keydown=${this._onKey}
                                @click=${e=>e.stopPropagation()}>`:this._name}
            </div>`}};customElements.define("user-badge",Ee);var Se=class extends _{static properties={_open:{state:!0},_notifEnabled:{state:!0}};static styles=[I,F,g`
        .burger { background: none; border: none; font-size: 1.1rem; cursor: pointer; padding: 0.1rem 0.3rem; color: var(--text-muted); line-height: 1; }
        .burger:hover { color: var(--text); background: none; }
        .row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: var(--text); }
        label { cursor: pointer; display: flex; align-items: center; gap: 0.3rem; }
        a { color: var(--link); text-decoration: none; font-size: 0.82rem; }
        a:hover { text-decoration: underline; }
    `];constructor(){super(),this._open=!1,this._theme=document.documentElement.getAttribute("theme")||"light",this._notifEnabled=Notification.permission==="granted"}_toggle(e){e.stopPropagation(),this._open=!this._open}_close(){this._open=!1}_setTheme(e){let t=e.target.checked?"dark":"light";this._theme=t,document.documentElement.setAttribute("theme",t),localStorage.setItem("theme",t),this.dispatchEvent(new CustomEvent("theme-changed",{detail:t,bubbles:!0,composed:!0}))}_share(){navigator.share?navigator.share({title:document.title,url:location.href}):navigator.clipboard.writeText(location.href)}async _toggleNotifications(e){if(e.target.checked){let t=await Notification.requestPermission();this._notifEnabled=t==="granted"}else this._notifEnabled=!1;this.requestUpdate()}render(){return l`
            <button class="burger" aria-label="Settings" aria-expanded="${this._open}" @click=${this._toggle}>&#9776;</button>
            ${this._open?l`
                <div class="backdrop" @click=${e=>e.target===e.currentTarget&&this._close()}>
                    <div class="modal" role="dialog" aria-modal="true" aria-label="Settings">
                        <h3>Settings</h3>
                        <div class="row">
                            <label>
                                <input type="checkbox" .checked=${this._theme==="dark"} @change=${this._setTheme}>
                                Dark mode
                            </label>
                        </div>
                        <div class="row">
                            <label>
                                <input type="checkbox" .checked=${this._notifEnabled} @change=${this._toggleNotifications}>
                                Enable notifications
                            </label>
                        </div>
                        <div class="row"><a href="https://github.com/tailuge/billiards" target="_blank" rel="noopener">Support</a></div>
                        <div class="row"><a href="https://scoreboard-tailuge.vercel.app/usage.html" target="_blank" rel="noopener">Usage</a></div>
                        <div class="row"><a href="#" @click=${e=>{e.preventDefault(),this._share()}}>Share</a></div>
                        <button class="cancel" @click=${this._close}>Close</button>
                    </div>
                </div>`:""}
        `}};customElements.define("settings-modal",Se);var we=class extends u{static properties={_theme:{type:String,reflect:!0,attribute:"theme"}};static styles=Ze;constructor(){super(),this._theme=document.documentElement.getAttribute("theme")||"light"}get _ctrl(){return this.shadowRoot.querySelector("online-panel")}render(){return l`
            <div class="topbar">
                <h1><a href="https://github.com/tailuge/billiards" target="_blank" rel="noopener">Billiards</a></h1>
                <user-badge></user-badge>
                <settings-modal @theme-changed=${e=>{this._theme=e.detail}}></settings-modal>
            </div>
            <div class="main-row">
                <div class="solo">
                    <div class="panel">
                        <div class="panel-title">Solo Practice</div>
                        <solo-panel></solo-panel>
                    </div>
                </div>
                <div class="players panel"><online-panel></online-panel></div>
            </div>
            <div class="info-row"><div class="panel"><info-panel></info-panel></div></div>
        `}};customElements.define("lobby-app",we);})();
/*! Bundled license information:

@lit/reactive-element/css-tag.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/reactive-element.js:
lit-html/lit-html.js:
lit-element/lit-element.js:
lit-html/directive.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/is-server.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/directives/style-map.js:
  (**
   * @license
   * Copyright 2018 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)
*/
