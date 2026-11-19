/* --- 핀볼: 긴 코스를 따라 내려가는 구슬 레이스 ---
   세로로 긴 코스(화면 3장 분량)를 카메라가 따라가며 보여준다. 오른쪽 미니맵에 전체 위치 표시.
   코스: ①핀·범퍼 → ②지그재그 선반 → ③촘촘한 핀·범퍼 → ④풍차 → ⑤회전 막대·깔때기·골 문지기
   당첨 규칙(pk.k번째 골인): 마지막 골인(기본) / 첫 번째 골인 / N번째 골인 — 설정 패널의 '당첨'에서 선택.
   (이름*5 = 구슬 5개)
   긴장 연출(dropPlinko): 3·2·1 카운트다운 → 승부처(마지막 규칙: 남은 구슬 ≤3 / 그 외: 다음 골인이 당첨)에서
   심장박동·붉은 가장자리·배너, 골 앞 슬로모션, 문지기 '세이프!', 승부가 갈리는 순간 정지+플래시 후 발표 */
const PKW=540,PKH=470,PK_GAP=26;
const PKWH=1410,PKOY=PKWH-PKH; // 코스 전체 높이 · 맨 아래 구간(깔때기)의 시작 y
// 구슬 색: 서로 뚜렷이 구분되는 색부터 (BRAND는 앞 3개가 모두 주황 계열이라 막판 대결에서 누가 누군지 헷갈렸다)
const PKCOL=['#F68C1F','#5b8def','#34c759','#e05544','#a78bfa','#ffd166','#4dd0e1','#f06292','#aed581','#ff8a65'];
let pk=null;
// 당첨 규칙 읽기 → { k: 몇 번째 골인이 당첨인지, isLast, label }
function pkRule(total){
  const r=$('pkRule')?$('pkRule').value:'last';
  let k=total;
  if(r==='first')k=1;
  else if(r==='nth')k=Math.min(total,Math.max(1,parseInt($('pkNth').value)||1));
  const label=k===total?'마지막 골인':k===1?'첫 번째 골인':k+'번째 골인';
  return {k,isLast:k===total,label};
}
function pkInit(names){
  const uniq=[...new Set(names)];
  const order=shuffled(names); // 공정한 섞기 (sort 랜덤은 순서가 쏠림)
  const balls=order.map((nm,i)=>({
    nm,col:PKCOL[uniq.indexOf(nm)%PKCOL.length],
    x:60+Math.random()*(PKW-120),y:-20-i*34,
    vx:(Math.random()-.5)*60,vy:0,r:11,done:false,slow:0
  }));
  const pegs=[];
  const pegRows=(y0,rows,gap,base)=>{
    for(let r=0;r<rows;r++){const cnt=base+(r%2);for(let c=0;c<cnt;c++)pegs.push({x:(PKW/(cnt+1))*(c+1),y:y0+r*gap,r:5});}
  };
  pegRows(96,5,40,6);    // ① 맨 위 핀
  pegRows(700,4,45,7);   // ③ 촘촘한 핀
  pegRows(1150,2,42,6);  // ④ 풍차 아래 핀
  // 큰 범퍼(통통 강하게 튕기는 원형 장애물)
  const bumpers=[
    {x:PKW*0.5, y:158,r:21},{x:PKW*0.26,y:252,r:18},{x:PKW*0.74,y:252,r:18},
    {x:PKW*0.18,y:895,r:18},{x:PKW*0.5,y:895,r:20},{x:PKW*0.82,y:895,r:18},
  ];
  // 고정 벽(선분): ② 지그재그 선반 3단 + ⑤ 깔때기·골 통로
  const segs=[
    {x1:0,y1:330,x2:370,y2:385,rest:0.3,shelf:true},
    {x1:PKW,y1:440,x2:170,y2:495,rest:0.3,shelf:true},
    {x1:0,y1:550,x2:370,y2:605,rest:0.3,shelf:true},
    {x1:0,y1:PKOY+362,x2:PKW/2-PK_GAP,y2:PKOY+440,rest:0.42},
    {x1:PKW,y1:PKOY+362,x2:PKW/2+PK_GAP,y2:PKOY+440,rest:0.42},
    {x1:PKW/2-PK_GAP,y1:PKOY+440,x2:PKW/2-PK_GAP,y2:PKWH,rest:0.3},
    {x1:PKW/2+PK_GAP,y1:PKOY+440,x2:PKW/2+PK_GAP,y2:PKWH,rest:0.3},
  ];
  const wa=Math.random()*6;
  const keeper={cx:PKW/2,cy:PKOY+414,len:84,a:Math.random()*6,w:1.5,flash:0}; // 골 문지기
  const paddles=[
    {cx:455,cy:420,len:70,a:Math.random()*6,w:2.4,flash:0},   // ② 선반 틈의 회전 막대
    {cx:85, cy:530,len:70,a:Math.random()*6,w:-2.4,flash:0},
    {cx:455,cy:640,len:70,a:Math.random()*6,w:2.0,flash:0},
    {cx:PKW/2,cy:1040,len:170,a:wa,w:1.15,flash:0},           // ④ 풍차(십자)
    {cx:PKW/2,cy:1040,len:170,a:wa+Math.PI/2,w:1.15,flash:0},
    {cx:PKW*0.30,cy:PKOY+330,len:80,a:Math.random()*6,w:1.9,flash:0}, // ⑤
    {cx:PKW*0.70,cy:PKOY+330,len:80,a:Math.random()*6,w:-2.2,flash:0},
    keeper,
  ];
  const rule=pkRule(balls.length);
  return {balls,pegs,paddles,bumpers,segs,keeper,arrived:[],fx:[],popTimer:2,
    k:rule.k,isLast:rule.isLast,label:rule.label,winner:null,tense:false,
    started:false,count:0,lastCount:0,ts:1,hb:0,pulse:0,shake:0,flash:0,finalT:null};
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
    b.saveT=Math.max(0,(b.saveT||0)-dt);
    b.vy+=G*dt;
    b.vx*=0.997;b.vy*=0.998;
    const cap=Math.hypot(b.vx,b.vy);
    if(cap>620){b.vx*=620/cap;b.vy*=620/cap;}
    b.x+=b.vx*dt;b.y+=b.vy*dt;
    if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx)*REST;}
    if(b.x>PKW-b.r){b.x=PKW-b.r;b.vx=-Math.abs(b.vx)*REST;}
    for(const p of pk.pegs){
      if(Math.abs(b.y-p.y)>20)continue;
      if(collideCircle(b,p.x,p.y,p.r,0.7)&&Math.hypot(b.vx,b.vy)>220)
        pkFx('spark',p.x,p.y,b.col);
    }
    for(const p of pk.bumpers){
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
    for(const s of pk.segs)collideSeg(b,s.x1,s.y1,s.x2,s.y2,s.rest);
    for(const p of pk.paddles){
      if(Math.abs(b.y-p.cy)>p.len/2+14)continue;
      const hx2=Math.cos(p.a)*p.len/2,hy2=Math.sin(p.a)*p.len/2;
      if(collideSeg(b,p.cx-hx2,p.cy-hy2,p.cx+hx2,p.cy+hy2,0.5)){
        const rx=b.x-p.cx,ry=b.y-p.cy;
        b.vx+=-ry*p.w*0.7;b.vy+=rx*p.w*0.7;
        p.flash=0.14;
        // 승부처에서 골 문지기가 골 앞 구슬을 위로 쳐내면 '세이프!'
        if(p===pk.keeper&&pk.tense&&b.vy<-140&&b.y>PKOY+385&&!b.saveT){
          b.saveT=1.2;pkFx('txt',b.x,b.y-24,'#fff','세이프!');tone(1500,.07,.12);
        }
      }
    }
    if(b.y>PKWH-10){
      b.done=true;pk.arrived.push(b);
      pkFx('ring',PKW/2,PKWH-16,b.col);
      pkFx('txt',PKW/2,PKWH-40,b.col,b.nm+' 골인!');
      // 승부와 직결되는 골인은 크게: 화면 흔들림 + 높은 음
      const left=pk.balls.filter(x=>!x.done).length;
      if(pk.isLast?left<=3:(pk.arrived.length>=pk.k-1&&pk.arrived.length<=pk.k)){
        pk.shake=.3;pk.pulse=1;tone(pk.isLast?([1320,1320,990,740][left]||740):(pk.arrived.length===pk.k?1320:880),.22,.2);
      }
    }
    const sp=Math.hypot(b.vx,b.vy);
    if(sp<12&&b.y>0){b.slow+=dt;if(b.slow>1.2){b.vx+=(Math.random()-.5)*200;b.vy-=140;b.slow=0;}}else b.slow=0;
  }
  const bs=pk.balls.filter(b=>!b.done&&b.y>-12);
  for(let i=0;i<bs.length;i++)for(let j=i+1;j<bs.length;j++){
    const a=bs[i],c=bs[j];let dx=c.x-a.x,dy=c.y-a.y;
    if(dy>24||dy<-24)continue;
    const d=Math.hypot(dx,dy),min=a.r+c.r;
    if(d>0&&d<min){
      dx/=d;dy/=d;const pen=(min-d)/2;
      a.x-=dx*pen;a.y-=dy*pen;c.x+=dx*pen;c.y+=dy*pen;
      const rel=(c.vx-a.vx)*dx+(c.vy-a.vy)*dy;
      if(rel<0){a.vx+=rel*dx*.9;a.vy+=rel*dy*.9;c.vx-=rel*dx*.9;c.vy-=rel*dy*.9;}
    }
  }
  // 이펙트 수명 (꽃가루는 당첨 연출 루프가 따로 관리)
  pk.fx.forEach(f=>{if(f.type==='confetti')return;f.life-=dt*(f.type==='txt'?0.8:1.8);if(f.type==='txt')f.y+=f.vy*dt;});
  pk.fx=pk.fx.filter(f=>f.life>0);
  // 🎢 반전요소: 골 앞 구슬 하나를 주기적으로 위로 "팡" 쏘아올림 → 순위 뒤집힘 (승부처엔 더 자주)
  pk.popTimer-=dt;
  if(pk.popTimer<=0){
    pk.popTimer=pk.tense?1.3:2;
    const cand=pk.balls.filter(b=>!b.done&&b.y>PKOY+405);
    if(cand.length){
      const b=cand[Math.floor(Math.random()*cand.length)];
      b.vy=-(360+Math.random()*180); b.vx+=(Math.random()-.5)*240;
      pkFx('ring',b.x,b.y,'#F68C1F'); pkFx('txt',b.x,b.y-20,b.col,'팡!');
      beep(1);
    }
  }
}
// 카메라: 긴 코스에서 '승부가 갈리는 곳'을 따라간다
//  · 마지막 골인 규칙 → 아직 남아 있는 구슬들(뒤처진 쪽이 주인공)
//  · 첫 번째/N번째 규칙 → 선두 구슬
let pkCam={zoom:1,tx:0,ty:0,tz:1,ttx:0,tty:0};
function pkCamUpdate(dt){
  const alive=pk.balls.filter(b=>!b.done),vis=alive.filter(b=>b.y>-10);
  let tz=1,fx=PKW/2,fy=PKH/2;
  if(pk.finalT!==null&&!pk.isLast){tz=1.7;fx=PKW/2;fy=PKWH-70;} // 당첨 골인 순간: 골문 클로즈업
  else if(vis.length){
    const lead=vis.reduce((a,b)=>b.y>a.y?b:a);
    const my=vis.reduce((a,b)=>a+b.y,0)/vis.length,mx=vis.reduce((a,b)=>a+b.x,0)/vis.length;
    if(pk.isLast){
      if(alive.length===1){tz=2.1;fx=alive[0].x;fy=alive[0].y;}
      else if(alive.length<=3){
        const spread=lead.y-vis.reduce((a,b)=>Math.min(a,b.y),1e9);
        if(spread<200){tz=1.35;fx=mx;}
        fy=my;
      }else fy=my;
    }else{
      fy=lead.y-30;
      if(pk.tense&&lead.y>PKOY+250){tz=1.35;fx=lead.x;fy=lead.y;}
    }
  }
  pkCam.tz=tz;
  // 목표 중심 → 변환 오프셋 (화면 중앙에 fx,fy 오게)
  pkCam.ttx=PKW/2-fx*tz;pkCam.tty=PKH/2-fy*tz;
  // 부드럽게 보간
  const k=Math.min(1,dt*4.5);
  pkCam.zoom+=(pkCam.tz-pkCam.zoom)*k;
  pkCam.tx+=(pkCam.ttx-pkCam.tx)*k;
  pkCam.ty+=(pkCam.tty-pkCam.ty)*k;
  // 경계 클램프 (코스 밖 빈공간 방지)
  const z=pkCam.zoom;
  pkCam.tx=Math.min(0,Math.max(PKW-PKW*z,pkCam.tx));
  pkCam.ty=Math.min(0,Math.max(PKH-PKWH*z,pkCam.ty));
}
// 승부처 배너에 띄울 구슬들: 마지막 규칙=남은 구슬, 그 외=골에 가장 가까운 선두 3개
function pkSpotlight(alive){
  if(pk.finalT!==null&&pk.winner)return [pk.winner];
  if(pk.isLast)return alive;
  return alive.filter(b=>b.y>0).sort((a,b)=>b.y-a.y).slice(0,3);
}
function pkDraw(){
  gBase();
  gx.clearRect(0,0,PKW,PKH);
  // 카메라 변환 적용 (화면 배율 GDPR 포함)
  const shx=pk.shake>0?(Math.random()-.5)*pk.shake*22:0,shy=pk.shake>0?(Math.random()-.5)*pk.shake*22:0; // 화면 흔들림
  gx.setTransform(pkCam.zoom*GDPR,0,0,pkCam.zoom*GDPR,(pkCam.tx+shx)*GDPR,(pkCam.ty+shy)*GDPR);
  const bg=gx.createLinearGradient(0,0,0,PKWH);
  bg.addColorStop(0,'#0d1218');bg.addColorStop(1,'#161f2a');
  gx.fillStyle=bg;gx.fillRect(-20,-20,PKW+40,PKWH+40);
  // 사이드 레일
  gx.strokeStyle='rgba(246,140,31,.35)';gx.lineWidth=4;
  gx.beginPath();gx.moveTo(2,0);gx.lineTo(2,PKOY+360);gx.stroke();
  gx.beginPath();gx.moveTo(PKW-2,0);gx.lineTo(PKW-2,PKOY+360);gx.stroke();
  const alive=pk.balls.filter(b=>!b.done);
  // 고정 벽: 선반·깔때기
  gx.lineCap='round';
  pk.segs.forEach(s=>{
    gx.strokeStyle=s.shelf?'#4a5a6c':'#3a4654';gx.lineWidth=s.shelf?6:5;
    gx.beginPath();gx.moveTo(s.x1,s.y1);gx.lineTo(s.x2,s.y2);gx.stroke();
  });
  gx.fillStyle='rgba(246,140,31,.16)';gx.fillRect(PKW/2-PK_GAP+3,PKOY+442,PK_GAP*2-6,PKH-445);
  gx.fillStyle='#F68C1F';gx.font='bold 10px "Malgun Gothic"';gx.textAlign='center';gx.textBaseline='middle';
  gx.fillText('GOAL',PKW/2,PKWH-14);
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
  // 이펙트 (꽃가루는 화면 고정이라 아래에서 따로 그림)
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
    }
  }
  const tense=pk.started&&pk.count<=0&&(pk.tense||pk.finalT!==null)&&alive.length>=1;
  // 구슬 (승부처에선 글로우)
  for(const b of pk.balls){
    if(b.done||b.y<-10)continue;
    if(tense&&(pk.isLast||b.y>PKOY+200)){gx.shadowColor=b.col;gx.shadowBlur=16;}
    const grad=gx.createRadialGradient(b.x-3,b.y-3,1,b.x,b.y,b.r);
    grad.addColorStop(0,'#ffffff');grad.addColorStop(.25,b.col);grad.addColorStop(1,b.col);
    gx.beginPath();gx.arc(b.x,b.y,b.r,0,7);gx.fillStyle=grad;gx.fill();
    gx.shadowBlur=0;
    gx.strokeStyle='rgba(0,0,0,.35)';gx.lineWidth=1;gx.stroke();
    // 구슬(지름 22px)에 안 들어가는 긴 이름은 앞 3글자만 — 전체 이름은 오른쪽 결과 목록에 나온다
    const lbl=b.nm.length>4?b.nm.slice(0,3):b.nm, fsz=lbl.length>=4?7:(lbl.length===3?8.5:10);
    gx.font='bold '+fsz+'px "Malgun Gothic"';gx.textAlign='center';gx.textBaseline='middle';
    gx.lineWidth=2.5;gx.strokeStyle='rgba(0,0,0,.7)';
    gx.strokeText(lbl,b.x,b.y);
    gx.fillStyle='#fff';gx.fillText(lbl,b.x,b.y);
  }
  // ===== 여기부터 화면 고정 UI (카메라 변환 해제) =====
  gBase();
  // 꽃가루
  for(const f of pk.fx){
    if(f.type!=='confetti')continue;
    gx.globalAlpha=Math.max(0,Math.min(1,f.life));gx.fillStyle=f.col;
    gx.fillRect(f.x-3,f.y-3,6,6);gx.globalAlpha=1;
  }
  // 미니맵: 코스 전체에서 구슬들이 어디쯤인지 (밝은 구간 = 지금 화면)
  {
    const mx=PKW-11,my=72,mh=PKH-92;
    gx.fillStyle='rgba(255,255,255,.08)';gx.fillRect(mx-2,my,4,mh);
    const z=pkCam.zoom,vy=(-pkCam.ty/z)/PKWH,vh=(PKH/z)/PKWH;
    gx.fillStyle='rgba(255,255,255,.22)';gx.fillRect(mx-3,my+vy*mh,6,Math.max(6,vh*mh));
    gx.fillStyle='#F68C1F';gx.fillRect(mx-4,my+mh,8,3);
    for(const b of alive){
      const t=Math.max(0,Math.min(1,b.y/PKWH));
      gx.beginPath();gx.arc(mx,my+t*mh,2.6,0,7);gx.fillStyle=b.col;gx.fill();
    }
  }
  // 승부처: 가장자리가 심장박동에 맞춰 붉게 조여든다
  if(tense){
    const vg=gx.createRadialGradient(PKW/2,PKH/2,PKH*0.30,PKW/2,PKH/2,PKH*0.80);
    vg.addColorStop(0,'rgba(224,85,68,0)');vg.addColorStop(1,'rgba(224,85,68,'+(0.10+0.24*pk.pulse)+')');
    gx.fillStyle=vg;gx.fillRect(0,0,PKW,PKH);
  }
  if(pk.flash>0){gx.fillStyle='rgba(255,255,255,'+(pk.flash*0.75)+')';gx.fillRect(0,0,PKW,PKH);}
  if(pk.count>0){
    // 시작 카운트다운
    gx.fillStyle='rgba(13,18,24,.5)';gx.fillRect(0,0,PKW,PKH);
    const c=Math.ceil(pk.count),fr=pk.count-Math.floor(pk.count); // fr: 1→0 으로 줄며 숫자가 작아짐
    gx.save();gx.translate(PKW/2,PKH/2);gx.scale(0.8+fr*0.6,0.8+fr*0.6);
    gx.font='900 120px "Segoe UI","Malgun Gothic"';gx.textAlign='center';gx.textBaseline='middle';
    gx.lineWidth=8;gx.strokeStyle='rgba(0,0,0,.6)';gx.strokeText(c,0,0);
    gx.fillStyle='#F68C1F';gx.fillText(c,0,0);gx.restore();
    gx.fillStyle='#cdd8e2';gx.font='bold 15px "Malgun Gothic"';gx.textAlign='center';gx.textBaseline='middle';
    gx.fillText(pk.label+'이 당첨!',PKW/2,PKH/2+92);
  }else if(tense){
    // 승부처 배너
    let title;
    if(pk.finalT!==null)title=pk.isLast?'🏆 마지막 구슬!':'🏆 '+pk.label+'!';
    else if(pk.isLast)title=alive.length===3?'🔥 최후의 3인':alive.length===2?'⚔️ 최후의 대결':'🏆 마지막 구슬!';
    else title=pk.k===1?'🏁 첫 골인이 당첨! — 선두':'🎯 다음 골인이 당첨! — 선두';
    const spot=pkSpotlight(alive),uniq=[];
    spot.forEach(b=>{if(!uniq.some(u=>u.nm===b.nm))uniq.push(b);});
    gx.fillStyle='rgba(13,18,24,.74)';gx.fillRect(0,0,PKW,62);
    gx.fillStyle='rgba(246,140,31,.9)';gx.fillRect(0,62,PKW,2);
    gx.textBaseline='middle';gx.textAlign='center';
    gx.font='bold 12px "Malgun Gothic"';gx.fillStyle='#ffd9ad';gx.fillText(title,PKW/2,15);
    const sep=(pk.isLast&&alive.length===2&&pk.finalT===null)?'  vs  ':'   ';
    gx.font='bold '+(20+pk.pulse*3)+'px "Malgun Gothic"';
    const parts=uniq.map(b=>b.nm.length>7?b.nm.slice(0,7)+'…':b.nm);
    let total=0;parts.forEach((p,i)=>{total+=gx.measureText(p).width+(i?gx.measureText(sep).width:0);});
    let x=PKW/2-total/2;gx.textAlign='left';
    parts.forEach((p,i)=>{
      if(i){gx.fillStyle='#7c8894';gx.fillText(sep,x,41);x+=gx.measureText(sep).width;}
      gx.lineWidth=3;gx.strokeStyle='rgba(0,0,0,.7)';gx.strokeText(p,x,41);
      gx.fillStyle=uniq[i].col;gx.fillText(p,x,41);x+=gx.measureText(p).width;
    });
  }else{
    gx.fillStyle='rgba(13,18,24,.55)';gx.fillRect(0,0,PKW,30);
    gx.fillStyle='#9fb0bf';gx.font='12px "Malgun Gothic"';gx.textAlign='left';gx.textBaseline='alphabetic';
    gx.fillText('남은 구슬 '+alive.length,10,20);
    gx.textAlign='right';gx.fillStyle='#ffd9ad';
    gx.fillText('🎯 '+pk.label+' 당첨'+(pk.started&&!pk.isLast?' · 골인 '+pk.arrived.length+'/'+pk.k:''),PKW-22,20);
  }
}
function dropPlinko(){
  // 직전 판의 당첨 연출(꽃가루·배너) 루프가 아직 돌고 있으면 새 판 위에 예전 당첨자 배너가 덮였다 → 먼저 끊는다
  cancelAnimationFrame(gameAnim);
  _pkRankN=-1;
  pk=pkInit(gameNames);
  pkCam={zoom:1,tx:0,ty:0,tz:1,ttx:0,tty:0}; // 카메라 초기화
  pk.started=true;pk.count=3;pk.lastCount=4;
  let last=performance.now(),t0=last,first=true;
  const tick=now=>{
    // 첫 프레임은 dt를 표준값으로 고정 (시작 시 느려지는 현상 방지)
    let dt=first?0.016:(now-last)/1000;first=false;
    dt=Math.max(0,Math.min(0.032,dt));last=now;
    pk.shake=Math.max(0,pk.shake-dt);pk.pulse=Math.max(0,pk.pulse-dt*2.4);pk.flash=Math.max(0,pk.flash-dt*1.5);
    // ① 카운트다운 3·2·1
    if(pk.count>0){
      const c=Math.ceil(pk.count);
      if(c!==pk.lastCount){pk.lastCount=c;tone(660,.12,.18);}
      pk.count-=dt;
      if(pk.count<=0){tone(1320,.32,.2);t0=now;}
      pkDraw();gameAnim=requestAnimationFrame(tick);return;
    }
    const aliveBalls=pk.balls.filter(b=>!b.done),alive=aliveBalls.length;
    // 승부가 났는가: 마지막 규칙 = 하나만 남음 / 그 외 = k번째가 골인함
    const decided=pk.isLast?alive<=1:pk.arrived.length>=pk.k;
    if(!decided&&now-t0<240000){
      // 승부처: 마지막 규칙 = 3개 이하 남음 / 그 외 = 다음 골인이 곧 당첨이고 선두가 마지막 구간에 들어섬
      pk.tense=pk.isLast?alive<=3:(pk.k-pk.arrived.length===1&&aliveBalls.some(b=>b.y>PKOY+120));
      // ② 슬로모션: 승부처에서 골 바로 앞이면 크게 느려진다
      let target=1;
      if(pk.tense)target=aliveBalls.some(b=>b.y>PKOY+405)?0.42:(pk.isLast?0.8:0.9);
      pk.ts+=(target-pk.ts)*Math.min(1,dt*6);
      const sdt=dt*pk.ts;
      pkStep(sdt/2);pkStep(sdt/2);
      // ③ 심장박동 (마지막 둘, 또는 골 코앞이면 더 빨라짐)
      if(pk.tense){
        pk.hb-=dt;
        if(pk.hb<=0){
          const fast=pk.isLast?alive===2:aliveBalls.some(b=>b.y>PKOY+380);
          pk.hb=fast?0.5:0.78;pk.pulse=1;tone(95,.12,.3);tone(78,.14,.24,.14);
        }
      }
      pkCamUpdate(dt);
      pkDraw();renderPkRank();
      gameAnim=requestAnimationFrame(tick);
    }else if(pk.finalT===null&&decided){
      // ④ 승부가 갈린 순간: 화면 정지에 가까운 초슬로모션 + 플래시 + 클로즈업
      pk.winner=pk.isLast?(aliveBalls[0]||pk.arrived.at(-1)):pk.arrived[pk.k-1];
      pk.tense=true;
      pk.finalT=1.25;pk.flash=1;pk.shake=.4;pk.pulse=1;
      tone(196,.55,.26);tone(392,.5,.2,.1);tone(784,.45,.14,.2);
      renderPkRank();pkDraw();
      gameAnim=requestAnimationFrame(tick);
    }else if(pk.finalT>0){
      pk.finalT-=dt;pk.pulse=Math.max(pk.pulse,.55);
      pkStep(dt*0.06);pkCamUpdate(dt);pkDraw();
      gameAnim=requestAnimationFrame(tick);
    }
    else{
      // 마지막 규칙: 남은 하나를 결과 목록 끝에 올린다
      if(pk.isLast){const rem=pk.balls.filter(b=>!b.done);if(rem.length===1){rem[0].done=true;pk.arrived.push(rem[0]);}}
      // (제한 시간 초과 등으로 승자가 안 정해졌으면 규칙에 가장 가까운 구슬로)
      const w=pk.winner||pk.arrived[pk.k-1]||pk.arrived.at(-1)||pk.balls.find(b=>!b.done)||null;
      pk.winner=w;pk.tense=false;
      renderPkRank(true);
      if(w){
        // 꽃가루 (화면 고정 좌표)
        for(let i=0;i<70;i++)pk.fx.push({type:'confetti',x:PKW/2+(Math.random()-.5)*PKW,y:-10-Math.random()*120,col:BRAND[i%BRAND.length],life:2.5,vy:0});
        let fl=performance.now();
        const endTy=PKH-PKWH; // 줌아웃하며 골문이 보이는 맨 아래 화면으로
        const fin=fn=>{
          const fdt=Math.max(0,Math.min(0.032,(fn-fl)/1000));fl=fn;
          pkCam.zoom+=(1-pkCam.zoom)*Math.min(1,fdt*4);
          pkCam.tx+=(0-pkCam.tx)*Math.min(1,fdt*4);
          pkCam.ty+=(endTy-pkCam.ty)*Math.min(1,fdt*4);
          pk.fx.forEach(f=>{if(f.type==='confetti'){f.y+=170*fdt;f.x+=Math.sin(f.y/22)*1.4;f.life-=fdt*0.7;}});
          pk.fx=pk.fx.filter(f=>f.life>0);
          pkDraw();
          gBase();
          gx.fillStyle='rgba(22,28,36,.82)';gx.fillRect(0,PKH/2-58,PKW,116);
          gx.fillStyle='#F68C1F';gx.font='bold 36px "Malgun Gothic"';gx.textAlign='center';gx.textBaseline='middle';
          gx.fillText('🎉 '+w.nm,PKW/2,PKH/2-8);
          gx.fillStyle='#fff';gx.font='14px "Malgun Gothic"';
          gx.fillText(pk.label+' — 당첨!',PKW/2,PKH/2+30);
          if(pk.fx.some(f=>f.type==='confetti'))gameAnim=requestAnimationFrame(fin);
        };
        gameAnim=requestAnimationFrame(fin);
        gRes.textContent='🎉 '+pk.label+': '+w.nm+'!';
      }
      beep();gGo.disabled=false;
    }
  };
  gameAnim=requestAnimationFrame(tick);
}
