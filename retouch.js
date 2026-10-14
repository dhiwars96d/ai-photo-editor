/* RETOUCH.JS — Offline Retouch v4 */
(() => {
  "use strict";
  let originalSrc="", resultUrl="", previousResultUrl="", showingBefore=false, busy=false, tapMode=false;
  let scale=1, panX=0, panY=0, pointers=new Map(), gesture=null;
  const $=id=>document.getElementById(id);

  function say(t){if($("rtMessage"))$("rtMessage").textContent=t;const s=$("status");if(s){s.textContent=t;s.style.display="block";}}
  function revoke(u){if(u&&u.startsWith("blob:"))URL.revokeObjectURL(u);}
  function clearHistory(){revoke(previousResultUrl);previousResultUrl="";}
  function clearResult(){revoke(resultUrl);clearHistory();resultUrl="";}
  function image(src){return new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(Error("Image load failed"));i.src=src;});}

  function styles(){
    if($("rtV4Style"))return;
    const s=document.createElement("style");s.id="rtV4Style";
    s.textContent=`
    #retouchV4Backdrop{position:fixed;inset:0;z-index:9998;display:none;align-items:flex-end;justify-content:center;background:transparent;pointer-events:none}
    #retouchV4{pointer-events:auto;box-sizing:border-box;width:100%;max-width:560px;max-height:43dvh;overflow:auto;overscroll-behavior:contain;padding:10px 14px calc(12px + env(safe-area-inset-bottom));background:#fff8fc;color:#30232b;border-radius:20px 20px 0 0;box-shadow:0 -8px 30px #0003;font-family:inherit}
    #retouchV4 *{box-sizing:border-box}#retouchV4 .rtHead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
    #retouchV4 .rtTitle{font-size:18px;font-weight:700}#retouchV4 .rtSub{color:#786874;font-size:12px;line-height:1.4;margin:0 0 10px}
    #retouchV4 button{font:inherit;font-size:13px;border:1px solid #ebc5d8;background:white;color:#382934;border-radius:11px;padding:9px 10px;min-height:38px;touch-action:manipulation}
    #retouchV4 button.primary{background:#e84f99;color:white;border-color:#e84f99;font-weight:600}#retouchV4 button.active{background:#382934;color:white}
    #retouchV4 button:disabled{opacity:.55}#retouchV4 .rtLabel{display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px}
    #retouchV4 input[type=range]{width:100%;accent-color:#e84f99;margin:0 0 5px}
    #retouchV4 .rtButtons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:8px}
    #retouchV4 .rtButtons button{width:100%}#retouchV4 #rtMessage{font-size:12px;color:#79566b;line-height:1.35;margin:8px 0 0;overflow-wrap:anywhere}
    #retouchV4Backdrop.rtTapMode{background:transparent}
    @media(min-width:700px){#retouchV4{border-radius:20px 20px 0 0}}`;
    document.head.appendChild(s);
  }

  function createPanel(){
    styles();let back=$("retouchV4Backdrop");
    if(back){back.style.display="flex";return;}
    back=document.createElement("div");back.id="retouchV4Backdrop";
    back.innerHTML=`<section id="retouchV4" role="dialog" aria-label="Offline Retouch">
      <div style="width:36px;height:4px;border-radius:5px;background:#e8cada;margin:0 auto 9px"></div>
      <div class="rtHead"><div class="rtTitle">✨ Offline Retouch</div><button id="rtClose" type="button">Close ✕</button></div>
      <p class="rtSub">Auto Retouch से त्वचा स्मूद करें। Tap to Remove चालू करके दाग पर टैप करें।</p>
      <div class="rtLabel"><label for="rtStrength">Skin smoothing</label><strong id="rtStrengthValue">45%</strong></div>
      <input id="rtStrength" type="range" min="10" max="70" value="45">
      <div class="rtButtons">
        <button class="primary" id="rtApply">Auto Retouch</button><button id="rtCompare">Before / After</button>
        <button id="rtTapMode">Tap to Remove: OFF</button><button id="rtUndo">Undo</button>
        <button id="rtReset">Reset</button><button id="rtZoomReset">Reset Zoom</button>
        <button class="primary" id="rtDownload" style="grid-column:1/-1">Download Retouched Photo</button>
      </div><p id="rtMessage" aria-live="polite">Strength चुनें और Auto Retouch दबाएँ।</p></section>`;
    document.body.appendChild(back);
    $("rtClose").onclick=closePanel;
    $("rtStrength").addEventListener("input",()=>$("rtStrengthValue").textContent=$("rtStrength").value+"%");
    $("rtApply").onclick=applyRetouch;$("rtCompare").onclick=compare;$("rtTapMode").onclick=toggleTapMode;
    $("rtUndo").onclick=undo;$("rtReset").onclick=reset;$("rtZoomReset").onclick=resetZoom;$("rtDownload").onclick=download;
    back.addEventListener("click",e=>{if(e.target===back)closePanel();});
    installGestures();
  }

  function open(){
    const p=$("preview");
    if(!p||!p.src||!p.complete||!p.naturalWidth){say("पहले फोटो चुनें और लोड होने दें।");return;}
    if(!resultUrl||(p.src!==resultUrl&&p.src!==originalSrc)){originalSrc=p.src;clearResult();showingBefore=false;}
    else if(!originalSrc)originalSrc=p.src;
    createPanel();$("retouchV4Backdrop").style.display="flex";say("Auto Retouch करें या Tap to Remove चालू करें।");
  }
  function closePanel(){const p=$("preview");if(showingBefore&&p&&resultUrl)p.src=resultUrl;showingBefore=false;setTapMode(false);if($("retouchV4Backdrop"))$("retouchV4Backdrop").style.display="none";resetZoom();}
  function keepUndo(){clearHistory();previousResultUrl=resultUrl;}
  function updateCompare(){if($("rtCompare"))$("rtCompare").textContent=showingBefore?"Show After":"Before / After";}

  async function applyRetouch(){
    if(busy||!originalSrc)return;busy=true;$("rtApply").disabled=true;setTapMode(false);say("फोटो प्रोसेस हो रही है…");
    try{
      const img=await image(originalSrc),f=Math.min(1,1400/Math.max(img.naturalWidth,img.naturalHeight));
      const w=Math.max(1,Math.round(img.naturalWidth*f)),h=Math.max(1,Math.round(img.naturalHeight*f));
      const c=document.createElement("canvas");c.width=w;c.height=h;const x=c.getContext("2d",{willReadFrequently:true});if(!x)throw Error("Canvas unavailable");
      x.drawImage(img,0,0,w,h);const pix=x.getImageData(0,0,w,h);
      const bc=document.createElement("canvas");bc.width=w;bc.height=h;const b=bc.getContext("2d",{willReadFrequently:true});if(!b)throw Error("Blur unavailable");
      b.filter="blur(4px)";b.drawImage(c,0,0);b.filter="none";const blur=b.getImageData(0,0,w,h).data,d=pix.data,str=Number($("rtStrength").value)/100;
      for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],bl=d[i+2];if(!(r>70&&g>30&&r>=g*.88&&r>=bl*1.04&&r-bl>12))continue;
        const diff=(Math.abs(r-blur[i])+Math.abs(g-blur[i+1])+Math.abs(bl-blur[i+2]))/3;if(diff>65)continue;
        const a=str*(diff>10?.95:.70);d[i]=r*(1-a)+blur[i]*a;d[i+1]=g*(1-a)+blur[i+1]*a;d[i+2]=bl*(1-a)+blur[i+2]*a;}
      x.putImageData(pix,0,0);keepUndo();resultUrl=c.toDataURL("image/jpeg",.95);$("preview").src=resultUrl;showingBefore=false;updateCompare();say("Auto Retouch पूरा हुआ। अब Tap to Remove इस्तेमाल करें।");
    }catch(e){console.error(e);say("Retouch नहीं हो पाया। दूसरी फोटो पर कोशिश करें.");}
    finally{busy=false;$("rtApply").disabled=false;}
  }
  function compare(){const p=$("preview");if(!p||!originalSrc||!resultUrl){say("पहले Auto Retouch चलाएँ।");return;}showingBefore=!showingBefore;p.src=showingBefore?originalSrc:resultUrl;updateCompare();if(showingBefore)setTapMode(false);}
  function undo(){if(busy)return;if(!previousResultUrl){say("Undo करने के लिए पिछला बदलाव नहीं है।");return;}const cur=resultUrl;resultUrl=previousResultUrl;previousResultUrl="";revoke(cur);$("preview").src=resultUrl;showingBefore=false;updateCompare();say("पिछला बदलाव Undo हो गया।");}
  function reset(){if(busy)return;setTapMode(false);if($("preview")&&originalSrc)$("preview").src=originalSrc;clearResult();showingBefore=false;updateCompare();resetZoom();say("मूल फोटो वापस आ गई।");}
  function download(){if(!resultUrl){say("पहले Auto Retouch चलाएँ।");return;}const a=document.createElement("a");a.href=resultUrl;a.download="retouched-photo.jpg";document.body.appendChild(a);a.click();a.remove();}

  function setTapMode(on){
    tapMode=on;const b=$("rtTapMode"),p=$("preview"),back=$("retouchV4Backdrop");
    if(b){b.textContent=on?"Tap to Remove: ON":"Tap to Remove: OFF";b.classList.toggle("active",on);}
    if(p){p.style.cursor=on?"crosshair":"";p.style.touchAction=on?"none":"";}
    if(back)back.classList.toggle("rtTapMode",on);
  }
  async function toggleTapMode(){
    if(busy)return;if(!resultUrl){say("पहले Auto Retouch चलाएँ।");return;}if(showingBefore){say("पहले Show After दबाएँ।");return;}
    setTapMode(!tapMode);resetZoom();
    if(!tapMode){say("Tap to Remove बंद है।");return;}
    say("चेहरे पर टैप करें। दो उँगलियों से zoom और एक उँगली से drag करें।");
    try{
      if(!("FaceDetector" in window))return;
      const detector=new window.FaceDetector({fastMode:true,maxDetectedFaces:1}),img=await image(resultUrl),faces=await detector.detect(img);
      if(!tapMode||!faces.length)return;
      const box=faces[0].boundingBox,p=$("preview"),r=p.getBoundingClientRect(),s=Math.min(r.width/img.naturalWidth,r.height/img.naturalHeight);
      const faceW=box.width*s;scale=Math.max(1.7,Math.min(3,r.width*.48/Math.max(1,faceW)));
      panX=r.width/2-(box.x+box.width/2)*s*scale;panY=r.height*.36-(box.y+box.height/2)*s*scale;applyTransform();
      say("Face zoom हुआ। दो उँगलियों से और zoom करें, दाग पर टैप करें।");
    }catch(e){console.info("Automatic face detection unavailable",e);}
  }

  function installGestures(){
    const p=$("preview");if(!p||p.dataset.rtV4Gestures)return;p.dataset.rtV4Gestures="1";p.style.transformOrigin="0 0";
    p.addEventListener("pointerdown",e=>{if(!tapMode)return;e.preventDefault();try{p.setPointerCapture(e.pointerId);}catch(_){}pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});gesture=snapshot();},{passive:false});
    p.addEventListener("pointermove",e=>{if(!tapMode||!pointers.has(e.pointerId))return;e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});moveGesture();},{passive:false});
    const end=e=>{if(!tapMode||!pointers.has(e.pointerId))return;e.preventDefault();const start=gesture;const pt=pointers.get(e.pointerId);const isTap=pointers.size===1&&start&&start.count===1&&Math.hypot(pt.x-start.x,pt.y-start.y)<12;pointers.delete(e.pointerId);gesture=snapshot();if(isTap)removeAtTap(e.clientX,e.clientY).catch(err=>{console.error(err);say("इस जगह को retouch नहीं कर पाए।");});};
    p.addEventListener("pointerup",end,{passive:false});p.addEventListener("pointercancel",end,{passive:false});
    p.addEventListener("touchmove",e=>{if(tapMode)e.preventDefault();},{passive:false});
    p.addEventListener("click",e=>{if(tapMode){e.preventDefault();e.stopPropagation();}},true);
  }
  function snapshot(){const a=[...pointers.values()];if(!a.length)return null;if(a.length===1)return{count:1,x:a[0].x,y:a[0].y,startX:a[0].x,startY:a[0].y,scale,panX,panY};
    return{count:2,cx:(a[0].x+a[1].x)/2,cy:(a[0].y+a[1].y)/2,dist:Math.max(1,Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y)),scale,panX,panY};}
  function moveGesture(){if(!gesture)return;const a=[...pointers.values()],p=$("preview"),r=p.getBoundingClientRect();if(a.length===1&&gesture.count===1){panX=gesture.panX+a[0].x-gesture.x;panY=gesture.panY+a[0].y-gesture.y;}
    else if(a.length>=2&&gesture.count===2){const cx=(a[0].x+a[1].x)/2,cy=(a[0].y+a[1].y)/2,dist=Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y),ns=Math.max(1,Math.min(5,gesture.scale*dist/gesture.dist));
      const lx=gesture.cx-r.left,ly=gesture.cy-r.top;panX=cx-r.left-(lx-gesture.panX)*ns/gesture.scale;panY=cy-r.top-(ly-gesture.panY)*ns/gesture.scale;scale=ns;}else{gesture=snapshot();return;}applyTransform();}
  function applyTransform(){const p=$("preview");if(p){p.style.transformOrigin="0 0";p.style.transform=`translate(${panX}px,${panY}px) scale(${scale})`;}}
  function resetZoom(){scale=1;panX=0;panY=0;pointers.clear();gesture=null;const p=$("preview");if(p)p.style.transform="";}

  async function removeAtTap(clientX,clientY){
    if(busy||!resultUrl||showingBefore){say("पहले retouched फोटो दिखाएँ।");return;}busy=true;
    try{
      const p=$("preview"),img=await image(resultUrl),r=p.getBoundingClientRect();
      // Map tap from transformed preview coordinates back into image pixels.
      const bx=clientX-r.left-panX,by=clientY-r.top-panY;
      const fit=Math.min((p.offsetWidth||r.width)/img.naturalWidth,(p.offsetHeight||r.height)/img.naturalHeight);
      const rw=img.naturalWidth*fit,rh=img.naturalHeight*fit;
      const x=Math.round((bx-((p.offsetWidth-rw)/2))/(fit*scale)),y=Math.round((by-((p.offsetHeight-rh)/2))/(fit*scale));
      if(x<0||y<0||x>=img.naturalWidth||y>=img.naturalHeight){say("फोटो के अंदर दाग पर टैप करें।");return;}
      const w=img.naturalWidth,h=img.naturalHeight,rad=Math.max(6,Math.min(30,Math.round(w*.012)));
      const c=document.createElement("canvas");c.width=w;c.height=h;const ctx=c.getContext("2d",{willReadFrequently:true});if(!ctx)throw Error("Canvas unavailable");ctx.drawImage(img,0,0);
      const l=Math.max(0,x-rad*2),t=Math.max(0,y-rad*2),rr=Math.min(w,x+rad*2+1),bb=Math.min(h,y+rad*2+1),pw=rr-l,ph=bb-t,patch=ctx.getImageData(l,t,pw,ph);
      let sr=0,sg=0,sb=0,n=0;
      for(let yy=0;yy<ph;yy++)for(let xx=0;xx<pw;xx++){const gx=l+xx,gy=t+yy,d=Math.hypot(gx-x,gy-y);if(d<rad*1.15||d>rad*1.9)continue;const i=(yy*pw+xx)*4;sr+=patch.data[i];sg+=patch.data[i+1];sb+=patch.data[i+2];n++;}
      if(!n){say("दूसरी जगह टैप करें।");return;}sr/=n;sg/=n;sb/=n;
      const data=ctx.getImageData(0,0,w,h),d=data.data;
      for(let yy=Math.max(0,y-rad);yy<=Math.min(h-1,y+rad);yy++)for(let xx=Math.max(0,x-rad);xx<=Math.min(w-1,x+rad);xx++){const dist=Math.hypot(xx-x,yy-y);if(dist>rad)continue;const i=(yy*w+xx)*4,a=.82*Math.pow(1-dist/rad,1.5);d[i]=d[i]*(1-a)+sr*a;d[i+1]=d[i+1]*(1-a)+sg*a;d[i+2]=d[i+2]*(1-a)+sb*a;}
      ctx.putImageData(data,0,0);keepUndo();resultUrl=c.toDataURL("image/jpeg",.95);p.src=resultUrl;showingBefore=false;updateCompare();applyTransform();say("इस जगह को retouch किया। दूसरे दाग पर भी टैप कर सकते हैं।");
    }finally{busy=false;}
  }
  window.Retouch={open};
})();
