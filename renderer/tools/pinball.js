/* --- 핀볼: 전원 동시 투하 + 좁은 골목 몸싸움 ---
   좁은 골(40px) 앞에서 문지기 막대와 구슬들이 엉키며 순서가 갈림.
   마지막에 골인한 구슬의 주인이 당첨. (이름*5 = 구슬 5개)
   연출: 골인 이펙트 / 남은 구슬 ≤3 글로우 / 마지막 1개 슬로모션 / 우승 꽃가루 */
const PKW=540,PKH=470,PK_GAP=26;
let pk=null;
function pkInit(names){
  const uniq=[...new Set(names)];
  const order=[...names].sort(()=>Math.random()-.5);
  const balls=order.map((nm,i)=>({
    nm,col:BRAND[uniq.indexOf(nm)%BRAND.length],
    x:60+Math.random()*(PKW-120),y:-20-i*34,
    vx:(Math.random()-.5)*60,vy:0,r:11,done:false,slow:0
  }));
  const pegs=[];
  for(let r=0;r<5;r++){              // 핀 줄여서 범퍼가 주인공
    const cnt=6+(r%2);
    for(let c=0;c<cnt;c++)pegs.push({x:(PKW/(cnt+1))*(c+1),y:96+r*40,r:5});
  }
  // 큰 범퍼(통통 강하게 튕기는 원형 장애물)
  const bumpers=[
    {x:PKW*0.5, y:158,r:21},
    {x:PKW*0.26,y:252,r:18},
    {x:PKW*0.74,y:252,r:18},
  ];
  const paddles=[
    {cx:PKW*0.30,cy:330,len:80,a:Math.random()*6,w:1.9,flash:0},
    {cx:PKW*0.70,cy:330,len:80,a:Math.random()*6,w:-2.2,flash:0},
    {cx:PKW/2,  cy:414,len:84,a:Math.random()*6,w:1.5,flash:0}, // 골 문지기
  ];
  return {balls,pegs,paddles,bumpers,arrived:[],fx:[],popTimer:2};
}
function collideCircle(b,cx,cy,cr,rest){
  let nx=b.x-cx,ny=b.y-cy;const d=Math.hypot(nx,ny),min=b.r+cr;
  if(d===0||d>=min)return false;
  nx/=d;ny/=d;
  b.x+=nx*(min-d);b.y+=ny*(min-d);
  const vn=b.vx*nx+b.vy*ny;
  if(vn<0){b.vx-=(1+rest)*vn*nx;b.vy-=(1+rest)*vn*ny;}
  return true;
}
function collideSeg(b,x1,y1,x2,y2,rest){
  const dx=x2-x1,dy=y2-y1,len2=dx*dx+dy*dy||1;
  let t=((b.x-x1)*dx+(b.y-y1)*dy)/len2;t=Math.max(0,Math.min(1,t));
  const px=x1+dx*t,py=y1+dy*t;
  let nx=b.x-px,ny=b.y-py;const d=Math.hypot(nx,ny);
  if(d===0||d>=b.r)return false;
  nx/=d;ny/=d;
  b.x+=nx*(b.r-d);b.y+=ny*(b.r-d);
  const vn=b.vx*nx+b.vy*ny;
  if(vn<0){b.vx-=(1+rest)*vn*nx;b.vy-=(1+rest)*vn*ny;}
  return true;
}
function pkFx(type,x,y,col,nm){pk.fx.push({type,x,y,col,nm,life:1,vy:type==='txt'?-46:0});}
function pkStep(dt){
  const G=410,REST=0.66;
  pk.paddles.forEach(p=>{p.a+=p.w*dt;p.flash=Math.max(0,p.flash-dt);});
  pk.bumpers.forEach(p=>{p.flash=Math.max(0,(p.flash||0)-dt);});
  for(const b of pk.balls){
    if(b.done)continue;
    b.vy+=G*dt;
    b.vx*=0.997;b.vy*=0.998;
    const cap=Math.hypot(b.vx,b.vy);
    if(cap>620){b.vx*=620/cap;b.vy*=620/cap;}
    b.x+=b.vx*dt;b.y+=b.vy*dt;
    if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx)*REST;}
    if(b.x>PKW-b.r){b.x=PKW-b.r;b.vx=-Math.abs(b.vx)*REST;}
    for(const p of pk.pegs){
      if(collideCircle(b,p.x,p.y,p.r,0.7)&&Math.hypot(b.vx,b.vy)>220)
        pkFx('spark',p.x,p.y,b.col);
    }
    for(const p of pk.bumpers){
      if(p.flash===undefined)p.flash=0;
      let nx=b.x-p.x,ny=b.y-p.y;const d=Math.hypot(nx,ny),min=b.r+p.r;
      if(d>0&&d<min){
        nx/=d;ny/=d;b.x=p.x+nx*min;b.y=p.y+ny*min;
        const vn=b.vx*nx+b.vy*ny;
        if(vn<0){
          b.vx-=2.1*vn*nx;b.vy-=2.1*vn*ny;   // 탄성↑ 시원하게 튕김
          // 범퍼는 펑! 하고 차내는 느낌 — 법선 방향으로 추가 가속
          b.vx+=nx*90;b.vy+=ny*90;
        }
        p.flash=0.18;
        pkFx('ring',p.x,p.y,'#F68C1F');pkFx('spark',b.x,b.y,b.col);
      }
    }
    collideSeg(b,0,362,PKW/2-PK_GAP,440,0.42);
    collideSeg(b,PKW,362,PKW/2+PK_GAP,440,0.42);
    collideSeg(b,PKW/2-PK_GAP,440,PKW/2-PK_GAP,PKH,0.3);
    collideSeg(b,PKW/2+PK_GAP,440,PKW/2+PK_GAP,PKH,0.3);
    for(const p of pk.paddles){
      const hx2=Math.cos(p.a)*p.len/2,hy2=Math.sin(p.a)*p.len/2;
      if(collideSeg(b,p.cx-hx2,p.cy-hy2,p.cx+hx2,p.cy+hy2,0.5)){
        const rx=b.x-p.cx,ry=b.y-p.cy;
        b.vx+=-ry*p.w*0.7;b.vy+=rx*p.w*0.7;
        p.flash=0.14;
      }
    }
    if(b.y>PKH-10){
      b.done=true;pk.arrived.push(b);
      pkFx('ring',PKW/2,PKH-16,b.col);
      pkFx('txt',PKW/2,PKH-40,b.col,b.nm+' 골인!');
    }
    const sp=Math.hypot(b.vx,b.vy);
    if(sp<12&&b.y>0){b.slow+=dt;if(b.slow>1.2){b.vx+=(Math.random()-.5)*200;b.vy-=140;b.slow=0;}}else b.slow=0;
  }
  const bs=pk.balls.filter(b=>!b.done&&b.y>-12);
  for(let i=0;i<bs.length;i++)for(let j=i+1;j<bs.length;j++){
    const a=bs[i],c=bs[j];let dx=c.x-a.x,dy=c.y-a.y;
    const d=Math.hypot(dx,dy),min=a.r+c.r;
    if(d>0&&d<min){
      dx/=d;dy/=d;const pen=(min-d)/2;
      a.x-=dx*pen;a.y-=dy*pen;c.x+=dx*pen;c.y+=dy*pen;
      const rel=(c.vx-a.vx)*dx+(c.vy-a.vy)*dy;
      if(rel<0){a.vx+=rel*dx*.9;a.vy+=rel*dy*.9;c.vx-=rel*dx*.9;c.vy-=rel*dy*.9;}
    }
  }
  // 이펙트 수명
  pk.fx.forEach(f=>{f.life-=dt*(f.type==='txt'?0.8:1.8);if(f.type==='txt')f.y+=f.vy*dt;});
  pk.fx=pk.fx.filter(f=>f.life>0);
  // 🎢 반전요소: 2초마다 바닥 근처 공 하나를 위로 "팡" 쏘아올림 → 순위 뒤집힘
  pk.popTimer-=dt;
  if(pk.popTimer<=0){
    pk.popTimer=2;
    const cand=pk.balls.filter(b=>!b.done&&b.y>405);
    if(cand.length){
      const b=cand[Math.floor(Math.random()*cand.length)];
      b.vy=-(360+Math.random()*180); b.vx+=(Math.random()-.5)*240;
      pkFx('ring',b.x,b.y,'#F68C1F'); pkFx('txt',b.x,b.y-20,b.col,'팡!');
      beep(1);
    }
  }
}
// 핀볼 카메라 (줌/팬) — 두근두근 연출
let pkCam={zoom:1,tx:0,ty:0,tz:1,ttx:0,tty:0};
function pkCamUpdate(dt){
  const alive=pk.balls.filter(b=>!b.done);
  let tz=1,fx=PKW/2,fy=PKH/2;
  if(alive.length===1){
    // 마지막 1구슬: 강하게 줌인 추적
    tz=2.1;fx=alive[0].x;fy=alive[0].y;
  }else if(alive.length>=1){
    // 골 근처(아래쪽)에 구슬이 모이면 살짝 줌인
    const low=alive.filter(b=>b.y>300);
    if(low.length){tz=1.35;fx=low.reduce((a,b)=>a+b.x,0)/low.length;fy=360;}
  }
  pkCam.tz=tz;
  // 목표 중심 → 변환 오프셋 (화면 중앙에 fx,fy 오게)
  pkCam.ttx=PKW/2-fx*tz;pkCam.tty=PKH/2-fy*tz;
  // 부드럽게 보간
  const k=Math.min(1,dt*4.5);
  pkCam.zoom+=(pkCam.tz-pkCam.zoom)*k;
  pkCam.tx+=(pkCam.ttx-pkCam.tx)*k;
  pkCam.ty+=(pkCam.tty-pkCam.ty)*k;
  // 경계 클램프 (줌인 시 화면 밖 빈공간 방지)
  const z=pkCam.zoom;
  pkCam.tx=Math.min(0,Math.max(PKW-PKW*z,pkCam.tx));
  pkCam.ty=Math.min(0,Math.max(PKH-PKH*z,pkCam.ty));
}
function pkDraw(){
  gx.setTransform(1,0,0,1,0,0);
  gx.clearRect(0,0,PKW,PKH);
  // 카메라 변환 적용
  gx.setTransform(pkCam.zoom,0,0,pkCam.zoom,pkCam.tx,pkCam.ty);
  const bg=gx.createLinearGradient(0,0,0,PKH);
  bg.addColorStop(0,'#0d1218');bg.addColorStop(1,'#161f2a');
  gx.fillStyle=bg;gx.fillRect(0,0,PKW,PKH);
  // 사이드 레일
  gx.strokeStyle='rgba(246,140,31,.35)';gx.lineWidth=4;
  gx.beginPath();gx.moveTo(2,0);gx.lineTo(2,360);gx.stroke();
  gx.beginPath();gx.moveTo(PKW-2,0);gx.lineTo(PKW-2,360);gx.stroke();
  const alive=pk.balls.filter(b=>!b.done);
  const line=(x1,y1,x2,y2)=>{gx.beginPath();gx.moveTo(x1,y1);gx.lineTo(x2,y2);gx.stroke();};
  // 깔때기
  gx.strokeStyle='#3a4654';gx.lineWidth=5;gx.lineCap='round';
  line(0,362,PKW/2-PK_GAP,440);line(PKW,362,PKW/2+PK_GAP,440);
  line(PKW/2-PK_GAP,440,PKW/2-PK_GAP,PKH-3);line(PKW/2+PK_GAP,440,PKW/2+PK_GAP,PKH-3);
  gx.fillStyle='rgba(246,140,31,.16)';gx.fillRect(PKW/2-PK_GAP+3,442,PK_GAP*2-6,PKH-445);
  gx.fillStyle='#F68C1F';gx.font='bold 10px "Malgun Gothic"';gx.textAlign='center';gx.textBaseline='middle';
  gx.fillText('GOAL',PKW/2,PKH-14);
  // 핀
  gx.fillStyle='#5b6878';
  pk.pegs.forEach(p=>{gx.beginPath();gx.arc(p.x,p.y,p.r,0,7);gx.fill();});
  // 범퍼
  pk.bumpers.forEach(p=>{
    gx.beginPath();gx.arc(p.x,p.y,p.r,0,7);
    gx.fillStyle=p.flash>0?'#fff':'#D9760F';gx.fill();
    gx.lineWidth=3;gx.strokeStyle='#F68C1F';gx.stroke();
    gx.fillStyle=p.flash>0?'#D9760F':'#ffd9ad';
    gx.beginPath();gx.arc(p.x,p.y,p.r*0.45,0,7);gx.fill();
  });
  // 회전 막대 (맞으면 번쩍)
  pk.paddles.forEach(p=>{
    const hx2=Math.cos(p.a)*p.len/2,hy2=Math.sin(p.a)*p.len/2;
    gx.strokeStyle=p.flash>0?'#ffffff':'#F68C1F';gx.lineWidth=7;gx.lineCap='round';
    gx.beginPath();gx.moveTo(p.cx-hx2,p.cy-hy2);gx.lineTo(p.cx+hx2,p.cy+hy2);gx.stroke();
    gx.fillStyle='#fff';gx.beginPath();gx.arc(p.cx,p.cy,4.5,0,7);gx.fill();
  });
  // 이펙트
  for(const f of pk.fx){
    if(f.type==='spark'){
      gx.globalAlpha=f.life;gx.fillStyle=f.col;
      gx.beginPath();gx.arc(f.x,f.y,3+(1-f.life)*4,0,7);gx.fill();gx.globalAlpha=1;
    }else if(f.type==='ring'){
      gx.globalAlpha=f.life;gx.strokeStyle=f.col;gx.lineWidth=3;
      gx.beginPath();gx.arc(f.x,f.y,8+(1-f.life)*36,0,7);gx.stroke();gx.globalAlpha=1;
    }else if(f.type==='txt'){
      gx.globalAlpha=Math.min(1,f.life*1.4);
      gx.font='bold 14px "Malgun Gothic"';gx.textAlign='center';gx.textBaseline='middle';
      gx.lineWidth=3;gx.strokeStyle='rgba(0,0,0,.7)';gx.strokeText(f.nm,f.x,f.y);
      gx.fillStyle='#fff';gx.fillText(f.nm,f.x,f.y);gx.globalAlpha=1;
    }else if(f.type==='confetti'){
      gx.globalAlpha=Math.min(1,f.life);gx.fillStyle=f.col;
      gx.fillRect(f.x-3,f.y-3,6,6);gx.globalAlpha=1;
    }
  }
  // 구슬 (남은 ≤3 글로우)
  for(const b of pk.balls){
    if(b.done||b.y<-10)continue;
    if(alive.length<=3){gx.shadowColor=b.col;gx.shadowBlur=16;}
    const grad=gx.createRadialGradient(b.x-3,b.y-3,1,b.x,b.y,b.r);
    grad.addColorStop(0,'#ffffff');grad.addColorStop(.25,b.col);grad.addColorStop(1,b.col);
    gx.beginPath();gx.arc(b.x,b.y,b.r,0,7);gx.fillStyle=grad;gx.fill();
    gx.shadowBlur=0;
    gx.strokeStyle='rgba(0,0,0,.35)';gx.lineWidth=1;gx.stroke();
    const lbl=b.nm, fsz=lbl.length>=4?7:(lbl.length===3?8.5:10);
    gx.font='bold '+fsz+'px "Malgun Gothic"';gx.textAlign='center';gx.textBaseline='middle';
    gx.lineWidth=2.5;gx.strokeStyle='rgba(0,0,0,.7)';
    gx.strokeText(lbl,b.x,b.y);
    gx.fillStyle='#fff';gx.fillText(lbl,b.x,b.y);
  }
  // ===== 여기부터 화면 고정 UI (카메라 변환 해제) =====
  gx.setTransform(1,0,0,1,0,0);
  // 마지막 1개 — 두근두근 배너
  if(alive.length===1&&pk.arrived.length){
    const pulse=0.7+0.3*Math.sin(performance.now()/120);
    gx.globalAlpha=pulse;
    gx.font='bold 22px "Malgun Gothic"';gx.textAlign='center';gx.textBaseline='middle';
    gx.lineWidth=4;gx.strokeStyle='rgba(0,0,0,.75)';
    gx.strokeText('🔥 마지막 구슬: '+alive[0].nm+' 🔥',PKW/2,42);
    gx.fillStyle='#F68C1F';gx.fillText('🔥 마지막 구슬: '+alive[0].nm+' 🔥',PKW/2,42);
    gx.globalAlpha=1;
  }else{
    gx.fillStyle='#9fb0bf';gx.font='12px "Malgun Gothic"';gx.textAlign='left';gx.textBaseline='alphabetic';
    gx.fillText('남은 구슬 '+alive.length,10,20);
    if(pk.arrived.length){
      gx.textAlign='right';
      gx.fillText('골인: '+pk.arrived.slice(-3).map(b=>b.nm).join(' → '),PKW-10,20);
    }
  }
}
function dropPlinko(){
  pk=pkInit(gameNames);
  pkCam={zoom:1,tx:0,ty:0,tz:1,ttx:0,tty:0}; // 카메라 초기화
  let last=performance.now();const t0=last;let first=true;
  const tick=now=>{
    const alive=pk.balls.filter(b=>!b.done).length;
    // 첫 프레임은 dt를 표준값으로 고정 (시작 시 느려지는 현상 방지)
    let dt=first?0.016:(now-last)/1000;first=false;
    dt=Math.min(0.032,dt);last=now;
    pkStep(dt/2);pkStep(dt/2);
    pkCamUpdate(dt);
    pkDraw();renderPkRank();
    // 마지막 1명이 남으면 질질 끌지 않고 종료 (그 1명이 당첨)
    if(alive>1&&now-t0<150000){gameAnim=requestAnimationFrame(tick);}
    else{
      const rem=pk.balls.filter(b=>!b.done);
      let w;
      if(rem.length===1){rem[0].done=true;pk.arrived.push(rem[0]);w=rem[0];}
      else{w=pk.arrived.at(-1)||(rem.length?rem[rem.length-1]:null);}
      renderPkRank(true);
      if(w){
        // 꽃가루
        for(let i=0;i<70;i++)pk.fx.push({type:'confetti',x:PKW/2+(Math.random()-.5)*PKW,y:-10-Math.random()*120,col:BRAND[i%BRAND.length],life:2.5,vy:0});
        let fl=performance.now();
        const fin=fn=>{
          const fdt=Math.min(0.032,(fn-fl)/1000);fl=fn;
          // 당첨 후 부드럽게 줌아웃
          pkCam.zoom+=(1-pkCam.zoom)*Math.min(1,fdt*4);
          pkCam.tx+=(0-pkCam.tx)*Math.min(1,fdt*4);
          pkCam.ty+=(0-pkCam.ty)*Math.min(1,fdt*4);
          pk.fx.forEach(f=>{if(f.type==='confetti'){f.y+=170*fdt;f.x+=Math.sin(f.y/22)*1.4;f.life-=fdt*0.7;}});
          pk.fx=pk.fx.filter(f=>f.life>0);
          pkDraw();
          gx.setTransform(1,0,0,1,0,0);
          gx.fillStyle='rgba(22,28,36,.82)';gx.fillRect(0,PKH/2-58,PKW,116);
          gx.fillStyle='#F68C1F';gx.font='bold 36px "Malgun Gothic"';gx.textAlign='center';gx.textBaseline='middle';
          gx.fillText('🎉 '+w.nm,PKW/2,PKH/2-8);
          gx.fillStyle='#fff';gx.font='14px "Malgun Gothic"';
          gx.fillText('마지막 골인 — 당첨!',PKW/2,PKH/2+30);
          if(pk.fx.length)gameAnim=requestAnimationFrame(fin);
        };
        gameAnim=requestAnimationFrame(fin);
        gRes.textContent='🎉 마지막 골인: '+w.nm+'!';
      }
      beep();gGo.disabled=false;
    }
  };
  gameAnim=requestAnimationFrame(tick);
}
