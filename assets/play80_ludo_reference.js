// Coordinates use the approved portrait artwork. Match state supplies all movable pieces.
(() => {
  const game = document.getElementById('ludoGameplay');
  const stage = document.createElement('div');
  stage.id = 'ludoReference';
  const canvas = document.createElement('canvas');
  canvas.width = 691;
  canvas.height = 1020;
  canvas.setAttribute('aria-hidden', 'true');
  stage.append(canvas);
  game.prepend(stage);
  const ctx = canvas.getContext('2d');
  const art = new Image();
  const origin = 275;
  const homes = [
    [44,499,289,727,121,548], [403,499,646,727,479,548],
    [403,840,646,1068,479,888], [44,840,289,1068,121,888]
  ];
  const cellsX = [44,80,121,162,205,247,289,327,365,403,445,487,528,569,610,646];
  const cellsY = [499,534,572,609,647,685,727,765,803,840,875,914,952,990,1029,1068];
  let hitAreas = [];
  let lastMatch;
  let shownDice;
  function patch(x,y,w,h,dx=x,dy=y,dw=w,dh=h) {
    ctx.drawImage(art,x,y-origin,w,h,dx,dy,dw,dh);
  }
  function label(str,x,y,width,size) {
    ctx.font = 'bold '+size+'px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff7f4';
    ctx.fillText(str,x,y,width);
  }
  function hit(name,x,y,w,h,action,disabled=false) {
    hitAreas.push({name,x,y,w,h,action,disabled});
  }
  function controls() {
    const old = Array.from(stage.querySelectorAll('button'));
    hitAreas.forEach(({name,x,y,w,h,action,disabled},i) => {
      const b = old[i] || document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label',name);
      b.disabled = disabled;
      b.style.cssText = 'left:'+x/691*100+'%;top:'+(y-origin)/1020*100+'%;width:'+w/691*100+'%;height:'+h/1020*100+'%';
      b.onclick = action;
      if (!old[i]) stage.append(b);
    });
    old.slice(hitAreas.length).forEach(b=>b.remove());
  }
  // Trace the lacquered pawn, leaving the white home socket on the board.
  const contour = new Path2D('M -1 -12 C 13 -13 16 2 7 10 L 12 25 Q 20 29 20 36 C 19 49 -19 48 -20 37 Q -21 29 -12 25 L -7 10 C -17 2 -13 -12 -1 -12 Z');
  function pawn(color,x,y,scale) {
    const [,,,,sx,sy] = homes[color];
    ctx.save();
    ctx.translate(x,y); ctx.scale(scale,scale); ctx.clip(contour);
    patch(sx-23,sy-14,46,65,-23,-14);
    ctx.restore();
  }
  function cleanTrack() {
    // Copy unoccupied tiles of the same lane or track over the sample game's pieces.
    const repair = (sx,sy,sw,sh,x,y,w,h) => patch(sx,sy,sw,sh,x,y,w,h);
    repair(290,649,36,34,290,674,36,51);
    repair(367,649,34,34,367,674,34,51);
    repair(164,729,38,34,82,728,37,36);
    repair(164,767,38,34,207,766,38,35);
    repair(164,729,38,34,207,755,38,10);
    repair(446,805,39,32,570,804,39,34);
    repair(446,805,39,32,611,804,32,34);
    repair(446,766,39,35,570,795,74,8);
    repair(290,877,35,32,290,910,36,40);
    repair(290,649,36,34,290,715,36,12);
    repair(367,649,34,34,367,715,34,12);
    repair(446,805,39,32,567,806,6,32);
    repair(446,766,39,35,570,796,74,7);
    repair(164,729,38,34,89,727,22,7);
  }
  function drawHomes() {
    homes.forEach(([x,y,right,bottom],seat)=>{
      const color=ludo.colorIndices[seat], [sx,sy,sr,sb]=homes[color];
      patch(sx,sy,sr-sx,sb-sy,x,y,right-x,bottom-y);
      // The centre strip of the ivory tray contains its uninterrupted vertical shading.
      for(const offset of [73,165]) {
        for(const row of [0,1]) {
          const id=(offset===165?1:0)+row*2;
          if(ludo.players.includes(seat)&&ludo.pawns[seat][id]<0)continue;
          const px=x+offset+(seat===1||seat===2?3:4), py=y+49+row*81;
          patch(sx+109,sy+36+row*81,17,74,px-30,py-13,60,74);
        }
      }
      const original=['Alif302','Player 3','Player 2','Player 4'][color];
      const nickname = ludo.players.includes(seat)?ludoLabel(seat):('Player '+[1,3,2,4][seat]);
      if(nickname!==original){
        patch(sx+83,sb-31,8,27,x+76,bottom-31,94,27);
        label(nickname,(x+right)/2,bottom-17,94,16);
      }
    });
  }
  function drawPieces() {
    const groups = new Map();
    for(const seat of ludo.players) ludo.pawns[seat].forEach((step,id)=>{
      if(step===56)return;
      const [r,c]=ludoPos(seat,id),key=r+','+c;
      if(!groups.has(key)) groups.set(key,[]);
      groups.get(key).push({seat,id,step,r,c});
    });
    for(const pieces of groups.values()) pieces.forEach(({seat,id,step,r,c},index)=>{
      const atHome=step<0, [, , , ,hx,hy]=homes[seat];
      const w=cellsX[c+1]-cellsX[c], h=cellsY[r+1]-cellsY[r];
      let x=atHome?hx+(id%2)*92:cellsX[c]+w/2;
      let y=atHome?hy+Math.floor(id/2)*81:cellsY[r]+h*.29;
      let scale=atHome?1:.65;
      if(pieces.length>1){scale=.4;x+=(index%2-.5)*w*.46;y+=(Math.floor(index/2)-.5)*h*.4;}
      const movable=!ludo.complete&&!ludo.moving&&turnPlayer()===seat&&ludo.die>0&&ludoActions(seat).includes(id)&&!(ludo.mode==='bot'&&seat===2);
      if(movable){ctx.save();ctx.shadowColor='#fff196';ctx.shadowBlur=12;}
      if(!atHome||movable)pawn(ludo.colorIndices[seat],x,y,scale);
      if(movable)ctx.restore();
      hit(ludoLabel(seat)+' token '+(id+1),x-24*scale,y-15*scale,48*scale,64*scale,()=>moveLudoPawn(seat,id),!movable);
    });
  }
  function dice(seat,top) {
    if(seat===undefined)return;
    const x=top?40:478,y=top?390:1084,w=top?168:168,h=top?94:86;
    const active=seat===turnPlayer()&&!ludo.complete;
    // Use the illuminated and resting trays from the reference at either dock.
    const sx=active?40:478,sy=active?390:1084,sh=active?94:86;
    patch(sx,sy,w,sh,x,y,w,h);
    const px=x+(active?44:43), py=y+(active?30:25);
    if(ludo.colorIndices[seat] !== (active?0:2)){
      patch(sx+72,sy+15,7,sh-27,x+14,y+12,57,h-23);
      pawn(ludo.colorIndices[seat],px,py,.98);
    }
    const dx=x+(active?82:83),dy=y+(active?16:11);
    const value=shownDice[seat];
    if(value!==(active?5:4)){
      patch(active?123:562,active?430:1121,8,13,dx+5,dy+4,50,50);
      for(const point of LUDO_DICE_PIP_POS[value]){
        const j=point-1;patch(131,416,15,15,dx+8+(j%3)*14,dy+8+Math.floor(j/3)*14,14,14);
      }
    }
    hit(ludoLabel(seat)+' roll dice',x,y,w,h,()=>ludoRoll(),!active||!!ludo.die||ludo.moving||(ludo.mode==='bot'&&seat===2));
  }
  function paint() {
    if(!art.naturalWidth||game.classList.contains('hidden'))return;
    if(lastMatch!==ludo){lastMatch=ludo;shownDice=[5,5,4,4];}
    if(ludo.die)shownDice[turnPlayer()]=ludo.die;
    hitAreas=[];
    ctx.setTransform(1,0,0,1,0,-origin);
    patch(0,origin,691,1020);
    cleanTrack();
    for(let seat=0;seat<4;seat++){
      if(ludo.colorIndices[seat]===seat)continue;
      ctx.fillStyle=ludoColor(seat).hex;
      for(const [r,c] of LUDO_LANES[seat]){
        ctx.fillRect(cellsX[c]+1,cellsY[r]+1,cellsX[c+1]-cellsX[c]-2,cellsY[r+1]-cellsY[r]-2);
      }
    }
    drawHomes();drawPieces();
    for(const seat of ludo.players){
      const n=ludo.pawns[seat].filter(step=>step===56).length;
      if(n)label(String(n),[312,345,378,345][seat],[784,749,784,819][seat],24,17);
    }
    for(const [seats,top] of [[[0,1],true],[[2,3],false]]){
      const seat=seats.includes(turnPlayer())?turnPlayer():seats.find(p=>ludo.players.includes(p));
      dice(seat,top);
    }
    hit('Sound',356,335,117,50,()=>$('ludoSfxToggle').click());
    if(!ludoSfxEnabled){ctx.fillStyle='#442056';ctx.fillRect(373,345,88,29);label('Muted',416,360,85,17);}
    hit('Quick rules',485,335,53,50,()=>$('ludoRulesBtn').click());
    hit('Exit',549,335,105,50,()=>$('ludoExit').click());
    patch(425,1198,42,45,100,1198,421,45);
    const parts=$('ludoTurn').textContent.split(' • ');
    label(parts[0],parts.length>1?184:312,1221,parts.length>1?198:408,17);
    if(parts.length>1)label('⚄  '+parts.slice(1).join(' • '),396,1221,222,17);
    controls();
    stage.classList.add('ready');
  }
  let frame=0;
  function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;paint();});}
  for(const el of [game,$('ludoBoard'),$('ludoTurn'),$('ludoSfxToggle')]){
    const isGame=el===game;
    new MutationObserver(schedule).observe(el,isGame?{attributes:true,attributeFilter:['class']}:{childList:true,subtree:true});
  }
  art.onload=schedule;
  art.src='ludo-reference.webp';
})();
