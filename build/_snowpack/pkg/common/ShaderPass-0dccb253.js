import{S as a,fG as r}from"./three.module-f256b224.js";import{P as s}from"./Pass-35d0974f.js";var e=function(t,i){s.call(this),this.textureID=i!==void 0?i:"tDiffuse",t instanceof a?(this.uniforms=t.uniforms,this.material=t):t&&(this.uniforms=r.clone(t.uniforms),this.material=new a({defines:Object.assign({},t.defines),uniforms:this.uniforms,vertexShader:t.vertexShader,fragmentShader:t.fragmentShader})),this.fsQuad=new s.FullScreenQuad(this.material)};e.prototype=Object.assign(Object.create(s.prototype),{constructor:e,render:function(t,i,f){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=f.texture),this.fsQuad.material=this.material,this.renderToScreen?(t.setRenderTarget(null),this.fsQuad.render(t)):(t.setRenderTarget(i),this.clear&&t.clear(t.autoClearColor,t.autoClearDepth,t.autoClearStencil),this.fsQuad.render(t))}});export{e as S};
