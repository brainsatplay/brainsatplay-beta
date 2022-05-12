
import { LitElement, html, css } from 'lit';
import { Tab } from './Tab';

export type MainProps = {

}

export class Main extends LitElement {

  tabs: any[];

  static get styles() {
    return css`

    :host {
      width: 100%;
      height: 100%;
      box-sizing: border-box;
    }

    :host * {
      font-family: sans-serif;
      box-sizing: border-box;
      font-color: #424242;
    }

    #tabs {
      background: rgb(25,25,25);
      overflow-y: hidden;
      overflow-x: scroll;
      display: flex;
      align-items: center;
    }

    .tab {
      color: white;
      border: 0px;
      border-right: 1px solid rgb(25,25,25);
      padding: 6px 20px;
      text-align: center;
      font-size: 80%;
      background: rgb(50,50,50);
      cursor: pointer;
    }

    .tab:hover {
      background: rgb(60,60,60);
    }

    .tab:active {
      background: rgb(75,75,75);
    }
    `;
  }
    
    static get properties() {
      return {
        
      };
    }

    constructor(props: MainProps = {target: {}, header: 'Object'}) {
      super();
    }

    addTab = (tab,i) => {
      if (i !== 0) tab.style.display = 'none' // Hide tabs other than the first
      return html`<button class="tab" @click=${() => {

        // Toggle between Tabs
        if (tab.style.display === 'none') {
          this.tabs.forEach(t => (t != tab) ? t.style.display = 'none' : t.style.display = '') // hide other tabs
        }

      }}>${tab.label ?? `Tab ${i}`}</button>`
    }
    
    render() {

      this.tabs = []
      for(var i=0; i<this.children.length; i++){        
        const child = this.children[i]
        if (child instanceof Tab) this.tabs.push(child)
      }

      return html`
      <div id="tabs">
        ${this.tabs.map(this.addTab)}
      </div>
      <section>
        <slot></slot>
      </section>
    `
    }
  }
  
  customElements.define('visualscript-main', Main);