function DFTpll(p=genSineWave(3.3,1,1,512)[1],A=512,s=512,I=3,u=0,P=.05,c=.5){var l=0,_=0,f=0,h=0,x=1/s,T=1/A,i=I,g=P,W=c*g*g;const n=2*Math.PI;for(var a=0,m=new Array(s).fill(0),o=new Array(s).fill(0),q=new Array(s).fill(0),w=new Array(s).fill(0),r=0;r<s;r++){var v=n*i*T*r;l=l+(p[r]-u)*Math.cos(v),_=_-(p[r]-u)*Math.sin(v);var y=Math.sin(v+a);f=f+y*Math.cos(v+a),h=h-y*Math.sin(v+a);let M=l*f+_*h,t=-l*h+_*f,e=0;M!==0?e=Math.atan(t/M):t<0?e=-Math.PI/2:t>0?e=Math.PI/2:e=0,i+=e*W,a+=e*g,a>n?a-=n:a<0&&(a+=n);var D=Math.sqrt(M*M+t*t);m[r]=D*x,o[r]=i,q[r]=a,w[r]=e}return{mixed:m,freq_guesses:o,phase_guesses:q,phase_errs:w}}
