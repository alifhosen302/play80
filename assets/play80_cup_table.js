// Perspective camera above the near edge. All lengths below are in table units.
function createCupTable(host) {
  host.innerHTML = '<div class="royalTable"><canvas width="540" height="345" aria-label="Three inverted gold cups on a purple velvet table"></canvas></div>';
  const stage = host.firstElementChild;
  const canvas = stage.firstElementChild;
  const ctx = canvas.getContext('2d');
  const slots = [-132, 0, 132];
  const cups = slots.map((x, id) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.cup = id;
    button.disabled = true;
    stage.append(button);
    return {id, x, z:0, lift:0, button};
  });
  let ball = 1;
  cups[ball].lift = 49;
  function project(x, y, z) {
    const k = 620 / (620 - z * .92 - y * .39);
    return [270 + x*k, 232 + (z*.39 - y*.92)*k];
  }
  function path(points, fill, stroke, width=1) {
    ctx.beginPath();
    points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    if (fill) {ctx.closePath(); ctx.fillStyle=fill; ctx.fill();}
    if (stroke) {ctx.strokeStyle=stroke; ctx.lineWidth=width; ctx.stroke();}
  }
  function ellipse(x,y,rx,ry,fill) {
    ctx.fillStyle=fill; ctx.beginPath(); ctx.ellipse(x,y,rx,ry,0,0,2*Math.PI);ctx.fill();
  }
  function gradient(x1,y1,x2,y2,stops) {
    const g=ctx.createLinearGradient(x1,y1,x2,y2);
    stops.forEach(([p,c])=>g.addColorStop(p,c));
    return g;
  }
  const velvet=gradient(0,0,0,345,[[0,'#18091e'],[.48,'#461545'],[1,'#0b0617']]);
  const felt=gradient(0,145,0,300,[[0,'#341037'],[.55,'#69265f'],[1,'#351332']]);
  const wood=gradient(0,240,0,323,[[0,'#87502a'],[.48,'#331128'],[.77,'#71362a'],[1,'#230e22']]);
  const corners=[[-224,-118],[224,-118],[224,102],[-224,102]];
  function board() {
    ctx.fillStyle=velvet;ctx.fillRect(0,0,540,345);
    // Embroidered ogee lattice on the velvet wall.
    ctx.strokeStyle='#a66a614a';ctx.lineWidth=1.2;
    for(let row=0;row<4;row++) for(let col=-1;col<9;col++) {
      const x=col*76+(row%2)*38, y=row*59-40;
      ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+4,y+29,x+34,y+28,x+38,y+59);
      ctx.bezierCurveTo(x+42,y+28,x+72,y+29,x+76,y);ctx.stroke();
      ellipse(x+38,y+34,2,4,'#d49a5559');
    }
    const surface=corners.map(([x,z])=>project(x,0,z));
    const base=corners.map(([x,z])=>project(x,-17,z));
    path([surface[3],surface[2],base[2],base[3]],wood,'#cb924e',1.8);
    path(surface,felt,'#ebbe71',3);
    const seam=corners.map(([x,z])=>project(x*.974,.2,z*.94));
    path([...seam,seam[0]],null,'#ba875c',1);
  }
  function drawBall(cup) {
    const [x,y]=project(cup.x,15,cup.z);
    const r=15*(project(cup.x+1,15,cup.z)[0]-x);
    const sheen=ctx.createRadialGradient(x-r*.35,y-r*.45,0,x,y,r);
    [[0,'#fff2cf'],[.16,'#ff8b77'],[.39,'#fa2836'],[.77,'#bb031e'],[1,'#550619']].forEach(([p,c])=>sheen.addColorStop(p,c));
    ellipse(x,y,r,r,sheen);
  }
  function drawCup(c) {
    // Turned brass profile, from the flared open mouth to the closed foot.
    const tilt=-.64*c.lift/49;
    function vertex(radius,h,a) {
      const z=radius*Math.sin(a);
      return project(c.x+radius*Math.cos(a),c.lift+h*Math.cos(tilt)-z*Math.sin(tilt),
        c.z+h*Math.sin(tilt)+z*Math.cos(tilt));
    }
    const ring=(r,h)=>Array.from({length:65},(_,i)=>vertex(r,h,Math.PI*2*i/64));
    const palette=[[0,'#78421b'],[.12,'#ce9044'],[.23,'#fff3b1'],[.38,'#dfad54'],[.57,'#aa6426'],[.76,'#edbb62'],[.94,'#99531d'],[1,'#613216']];
    const [left]=vertex(48,12,Math.PI), [right]=vertex(48,12,0);
    const gold=gradient(left,0,right,0,palette);
    // Draw the closed silhouette first, then its raised bands and engravings.
    const profile=[[48,0],[49,4],[48,8],[45,11],[34,68],[35,72],[33,76],[30,78]];
    const rings=profile.map(([r,h])=>ring(r,h));
    for(let i=0;i<rings.length-1;i++) {
      const low=rings[i],high=rings[i+1];
      path([...low.slice(0,33),...high.slice(0,33).reverse()],gold);
      path(high,gold);
      path(low.slice(0,33),null,i===0?'#f7cc75':'#a66a2d',1);
    }
    // Engraving follows the conical surface around the front hemisphere.
    const floral=(a,h)=>vertex(45-(h-11)*11/57+.45,h,a);
    for(let i=0;i<9;i++) {
      const a=(i+.5)*Math.PI/9;
      for(const dir of [-1,1]) {
        const leaf=[];
        for(let j=0;j<=24;j++) {
          const t=j*Math.PI*2/24;
          leaf.push(floral(a+dir*(.067*(1-Math.cos(t))+.036*Math.sin(t)),34+9*(1-Math.cos(t))-4*Math.sin(t)));
        }
        path(leaf,null,'#834916',1.4);
      }
      path([floral(a,22),floral(a,54),floral(a+.026,58)],null,'#fff0a2',1);
    }
    for(const [r,h] of [[46,13],[44,18],[36,62],[35,66],[34,73]]) {
      path(ring(r,h).slice(0,33),null,'#ffe3a0',1.5);
    }
    path(rings.at(-1),'#e6ac52','#fff0aa',1);
    if(c.lift>24) {
      // The lifted cup tips away to expose its shadowed hollow mouth.
      const mouth=ring(47,0);
      if(mouth[16][1]<mouth[48][1]) path(mouth,'#472612','#f6c56f',2);
    }
  }
  function render() {
    const pixelWidth=Math.max(540,Math.min(1080,Math.round(stage.clientWidth*(window.devicePixelRatio||1))));
    if(canvas.width!==pixelWidth){canvas.width=pixelWidth;canvas.height=Math.round(pixelWidth*345/540);}
    ctx.setTransform(canvas.width/540,0,0,canvas.height/345,0,0);
    board();
    for(const c of cups){
      const [x,y]=project(c.x,0,c.z);
      ellipse(x+4,y+3,44,12,'#16081c85');
    }
    for(const c of [...cups].sort((a,b)=>a.z-b.z)) {
      if(c.id===ball && c.lift>0) drawBall(c);
      drawCup(c);
      const [x,y]=project(c.x,0,c.z);
      c.button.style.left=(x/540*100)+'%';
      c.button.style.top=((y-37)/345*100)+'%';
      c.button.setAttribute('aria-label','Cup '+(Math.max(0,slots.indexOf(c.x))+1));
    }
  }
  function animate(ms,valid,frame) {
    return new Promise(resolve=>{
      let start;
      function tick(now){
        if(!valid()||!stage.isConnected){resolve(false);return;}
        start??=now;
        const t=Math.min(1,(now-start)/ms);
        frame(t*t*(3-2*t));render();
        if(t===1)resolve(true);else requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }
  render();
  return {
    async shuffle(id,valid,pick) {
      ball=id;cups.forEach(c=>{c.lift=c.id===ball?49:0;});
      if(!await animate(860,valid,()=>{}))return false;
      if(!await animate(340,valid,t=>{cups[ball].lift=49*(1-t);}))return false;
      for(let round=0;round<6;round++) {
        const a=pick(3),b=(a+1+pick(2))%3;
        const first=cups[a],second=cups[b],x=first.x,end=second.x;
        if(!await animate(560,valid,t=>{
          first.x=x+(end-x)*t;second.x=end+(x-end)*t;
          first.z=66*Math.sin(Math.PI*t);second.z=-first.z;
        }))return false;
        first.x=end;second.x=x;first.z=second.z=0;
      }
      cups.forEach(c=>{c.button.disabled=false;});render();return true;
    },
    reveal(guess,valid) {
      cups.forEach(c=>{c.button.disabled=true;});
      animate(360,valid,t=>{cups[ball].lift=49*t;cups[guess].lift=49*t;});
      return slots.indexOf(cups[ball].x)+1;
    }
  };
}
