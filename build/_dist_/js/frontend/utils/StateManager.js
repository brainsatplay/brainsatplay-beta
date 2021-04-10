import{ObjectListener as f}from"./ObjectListener.js";export class StateManager{constructor(t={},e="FRAMERATE"){this.data=t,this.data.stateUpdateInterval=e,this.pushToState={},this.prev=Object.assign({},this.data),this.listener=new f;const n=()=>{this.listener.listeners.forEach((o,r)=>{o.interval=this.data.stateUpdateInterval})};this.listener.addListener("interval",this.data,"stateUpdateInterval",n,e);const d=()=>{if(Object.keys(this.pushToState).length>0){Object.assign(this.prev,this.data),Object.assign(this.data,this.pushToState);for(const o of Object.getOwnPropertyNames(this.pushToState))delete this.pushToState[o]}};this.listener.addListener("push",this.pushToState,"__ANY__",d,e)}addToState(t,e,n=null,d=!1){if(this.data[t]=e,n!==null)return this.addSecondaryKeyResponse(t,n,d)}getState(){return JSON.parse(JSON.stringifyFast(this.data))}setState(t={}){return Object.assign(this.pushToState,t),this.pushToState}setPrimaryKeyResponse(t=null,e=null,n=!1){e!==null&&(this.listener.hasKey(t)?this.listener.onchange(t,e):t!==null&&this.listener.addListener(t,this.data,t,e,this.data.stateUpdateInterval,n))}addSecondaryKeyResponse(t=null,e=null,n=!1){if(e!==null)return this.listener.hasKey(t)?this.listener.addFunc(t,e):t!==null?(this.listener.addListener(t,this.data,t,()=>{},this.data.stateUpdateInterval,n),this.listener.addFunc(t,e)):this.listener.addFunc("state",e)}removeSecondaryKeyResponse(t=null,e=null){t!==null?this.listener.hasKey(t)&&this.listener.removeFuncs(t,e):console.error("provide key")}clearAllKeyResponses(t=null){this.listener.hasKey(t)&&this.listener.remove(t)}subscribe(t,e){if(this.data[t]===void 0)this.addToState(k,null,e);else return this.addSecondaryKeyResponse(t,e)}unsubscribe(t,e=null){e!==null?this.removeSecondaryKeyResponse(t,e):console.error("Specify a subcription function index")}unsubscribeAll(t){this.clearAllKeyResponses(t)}}JSON.stringifyFast===void 0&&(JSON.stringifyFast=function(){const a=new Map,t=[],e=["this"];function n(){a.clear(),t.length=0,e.length=1}function d(r,i){var s=t.length-1,l=t[s];if(l[r]===i||s===0)e.push(r),t.push(i);else for(;s-->=0;)if(l=t[s],l[r]===i){s+=2,t.length=s,e.length=s,--s,t[s]=i,e[s]=r;break}}function o(r,i){let s=i;if(s!==null&&typeof i=="object"){let l=a.get(s),u=i.constructor.name;if(l)return"[Circular Reference]"+l;if(u==="Array"&&i.length>20)s=i.slice(i.length-20),a.set(s,e.join("."));else if(u!=="Number"&&u!=="String"&&u!=="Boolean")s="instanceof_"+u,a.set(s,e.join("."));else if(typeof s=="object"){let c={};for(const h in s)Array.isArray(s[h])?c[h]=s[h].slice(s[h].length-20):c[h]=s[h]}else a.set(s,e.join("."))}return s}return function(i,s){try{return t.push(i),JSON.stringify(i,o,s)}finally{n()}}}());
