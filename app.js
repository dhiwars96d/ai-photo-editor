let Client=null;
let handle_file=null;
const fileInput=document.getElementById("fileInput"),addPhoto=document.getElementById("addPhoto"),preview=document.getElementById("preview"),placeholder=document.getElementById("placeholder"),statusBox=document.getElementById("status"),downloadButton=document.getElementById("downloadButton"),adjustmentsToggle=document.getElementById("adjustmentsToggle"),adjustmentsPanel=document.getElementById("adjustmentsPanel"),adjustmentsChevron=document.getElementById("adjustmentsChevron"),adjustmentsFrame=document.getElementById("adjustmentsFrame"),smoothControl=document.getElementById("smoothControl"),smoothSlider=document.getElementById("smoothSlider"),smoothValue=document.getElementById("smoothValue");
let selectedFile=null,editedBlob=null,adjustmentBaseBlob=null,adjustmentTimer=null,smoothTimer=null;
const hairMenu=document.getElementById("hairMenu");
const hairGrow=document.getElementById("hairGrow");
const hairColor=document.getElementById("hairColor");
const hairColorPanel=document.getElementById("hairColorPanel");

const adjustmentIds=["brightness","contrast","warmth","saturation","sharpness","temperature","vibrance","tint","shadows","clarity"],adjustmentValues={};adjustmentIds.forEach(id=>adjustmentValues[id]=0);
function showSmoothControl(){smoothControl.classList.add("show")}function hideSmoothControl(){smoothControl.classList.remove("show")}function resetSmoothSlider(){smoothSlider.value=50;smoothValue.textContent="50"}
adjustmentsToggle.addEventListener("click",()=>{const o=adjustmentsPanel.classList.toggle("open");adjustmentsToggle.classList.toggle("open",o);adjustmentsChevron.textContent=o?"⌄":"›"});
function sendAdjustmentState(){if(adjustmentsFrame.contentWindow)adjustmentsFrame.contentWindow.postMessage({type:"setValues",values:{...adjustmentValues}},window.location.origin)}
window.addEventListener("message",async e=>{if(e.source!==adjustmentsFrame.contentWindow)return;const d=e.data||{};if(d.type==="adjustmentReady"){sendAdjustmentState();return}if(d.type==="adjustmentChange"){if(!adjustmentIds.includes(d.id))return;adjustmentValues[d.id]=Number(d.value)||0;if(!adjustmentBaseBlob)return;clearTimeout(adjustmentTimer);adjustmentTimer=setTimeout(async()=>{try{showStatus("Applying adjustment...");await applyAdjustments()}catch(x){console.error(x);showStatus("Adjustment failed. Please try again.")}},120);return}if(d.type==="resetAdjustments"){resetAdjustmentValues();if(!adjustmentBaseBlob)return;editedBlob=adjustmentBaseBlob;preview.src=URL.createObjectURL(adjustmentBaseBlob);preview.style.display="block";placeholder.style.display="none";downloadButton.style.display="block";showStatus("Adjustments reset ✓")}});
addPhoto.addEventListener("click",function(){
  fileInput.click();
});
fileInput.addEventListener("change",()=>{const f=fileInput.files&&fileInput.files[0];if(!f)return;if(!f.type.startsWith("image/")){showStatus("Please select an image file.");return}selectedFile=f;editedBlob=null;adjustmentBaseBlob=f;preview.src=URL.createObjectURL(f);preview.style.display="block";placeholder.style.display="none";downloadButton.style.display="none";statusBox.style.display="none";hideSmoothControl();resetSmoothSlider();resetAdjustmentValues()});
function showStatus(t){statusBox.textContent=t;statusBox.style.display="block"}
const HOCKMAN_SPACE="Hockman/real-esrgan-upscaler";
let hockmanAppPromise=null;

async function getHockmanApp(){
  if(!hockmanAppPromise){
    hockmanAppPromise=(async()=>{
      showStatus("Loading Enhance AI...");

      const gradio=await import(
        "https://cdn.jsdelivr.net/npm/@gradio/client@2.7.0/+esm"
      );

      Client=gradio.Client;
      handle_file=gradio.handle_file;

      return await Client.connect(HOCKMAN_SPACE,{
        events:["data","status"],
        status_callback:(s)=>{
          if(!s)return;

          if(s.status==="sleeping"){
            showStatus("Waking Enhance AI...");
          }
          else if(s.status==="building"){
            showStatus("Enhance AI is starting...");
          }
          else if(s.status==="running"){
            showStatus("Enhance AI is ready...");
          }
          else if(s.status==="error" || s.status==="space_error"){
            showStatus("Enhance AI Space error. Please try again.");
          }
        }
      });
    })().catch(err=>{
      hockmanAppPromise=null;
      throw err;
    });
  }

  return await hockmanAppPromise;
}

async function runHockmanX2(file){
  showStatus("Connecting to Enhance AI...");
  const app=await getHockmanApp();

  showStatus("Uploading photo to Enhance AI...");
  const image=handle_file(file);

  showStatus("Enhancing photo...");
  const job=app.submit("/process_and_get_output",{img:image});

  let finalData=null;

  for await(const m of job){
    if(m.type==="status"){
      const s=m.status||{};
      if(s.stage==="pending"){
        const pos=Number.isFinite(s.position)?` (${s.position} in queue)`:"";
        showStatus("Enhance AI is waiting"+pos+"...");
      }else if(s.stage==="generating"){
        showStatus("AI is enhancing your photo...");
      }else if(s.stage==="error"){
        throw new Error(s.message||"Enhance AI processing failed");
      }
    }

    if(m.type==="data" && m.data){
      finalData=m.data;
    }
  }

  if(!finalData || !finalData[0]){
    throw new Error("No image returned from Enhance AI");
  }

  const output=finalData[0];
  let outputURL=output?.url||output?.path||output;

  if(typeof outputURL!=="string"){
    throw new Error("Enhance AI returned an invalid image result");
  }

  if(outputURL.startsWith("/")){
    outputURL="https://hockman-real-esrgan-upscaler.hf.space"+outputURL;
  }

  if(outputURL.startsWith("http://")){
    outputURL="https://"+outputURL.slice(7);
  }

  const response=await fetch(outputURL);
  if(!response.ok){
    throw new Error("Could not download Enhance AI result");
  }

  return await response.blob();
}

function loadImage(file){return new Promise((resolve,reject)=>{const i=new Image(),u=URL.createObjectURL(file);i.onload=()=>{URL.revokeObjectURL(u);resolve(i)};i.onerror=()=>{URL.revokeObjectURL(u);reject(new Error("Could not load image"))};i.src=u})}

/* Stronger local Smooth Skin */
async function smoothSkin(file,intensity=50){
const img=await loadImage(file);
const w=img.naturalWidth,h=img.naturalHeight;
const canvas=document.createElement("canvas");
canvas.width=w;canvas.height=h;
const ctx=canvas.getContext("2d",{willReadFrequently:true});
ctx.drawImage(img,0,0,w,h);
const original=ctx.getImageData(0,0,w,h);

const scale=Math.min(1,900/w);
const sw=Math.max(1,Math.round(w*scale));
const sh=Math.max(1,Math.round(h*scale));
const work=document.createElement("canvas");
work.width=sw;work.height=sh;
const wc=work.getContext("2d",{willReadFrequently:true});
wc.drawImage(img,0,0,sw,sh);

const s1=document.createElement("canvas");
s1.width=sw;s1.height=sh;
const c1=s1.getContext("2d");
c1.filter="blur(5px)";c1.drawImage(work,0,0);

const s2=document.createElement("canvas");
s2.width=sw;s2.height=sh;
const c2=s2.getContext("2d");
c2.filter="blur(3px)";c2.drawImage(s1,0,0);

const s3=document.createElement("canvas");
s3.width=sw;s3.height=sh;
const c3=s3.getContext("2d");
c3.filter="blur(1.5px)";c3.drawImage(s2,0,0);

const blurred=document.createElement("canvas");
blurred.width=w;blurred.height=h;
const bc=blurred.getContext("2d",{willReadFrequently:true});
bc.drawImage(s3,0,0,w,h);

/* Edge-safe face mask */
const mask=document.createElement("canvas");
mask.width=w;mask.height=h;
const mc=mask.getContext("2d",{willReadFrequently:true});

const fx=w*.50,fy=h*.465;
const fw=w*.405,fh=h*.475;

const g=mc.createRadialGradient(fx,fy,fw*.18,fx,fy,fw*1.02);
g.addColorStop(0,"rgba(255,255,255,1)");
g.addColorStop(.48,"rgba(255,255,255,.98)");
g.addColorStop(.68,"rgba(255,255,255,.82)");
g.addColorStop(.82,"rgba(255,255,255,.48)");
g.addColorStop(.93,"rgba(255,255,255,.16)");
g.addColorStop(1,"rgba(255,255,255,0)");
mc.fillStyle=g;
mc.beginPath();
mc.ellipse(fx,fy,fw,fh,0,0,Math.PI*2);
mc.fill();

mc.globalCompositeOperation="destination-out";
function cut(x,y,rx,ry){
mc.beginPath();
mc.ellipse(x,y,rx,ry,0,0,Math.PI*2);
mc.fill();
}

/* Eyes */
cut(w*.405,h*.395,w*.092,h*.045);
cut(w*.595,h*.395,w*.092,h*.045);

/* Eyebrows */
cut(w*.405,h*.345,w*.105,h*.026);
cut(w*.595,h*.345,w*.105,h*.026);

/* Nose */
cut(w*.50,h*.505,w*.078,h*.135);

/* Larger mouth protection */
cut(w*.50,h*.625,w*.145,h*.060);

/* Lower-lip/chin transition */
cut(w*.50,h*.675,w*.18,h*.055);

/* Side lower-chin protection */
cut(w*.34,h*.695,w*.105,h*.065);
cut(w*.66,h*.695,w*.105,h*.065);

mc.globalCompositeOperation="source-over";

/* Blur the mask edge itself to remove visible boundaries */
const softMask=document.createElement("canvas");
softMask.width=w;softMask.height=h;
const smc=softMask.getContext("2d",{willReadFrequently:true});
smc.filter="blur(8px)";
smc.drawImage(mask,0,0);

const md=smc.getImageData(0,0,w,h).data;
const bd=bc.getImageData(0,0,w,h).data;
const src=original.data;
const res=ctx.createImageData(w,h);
const dst=res.data;

const si=Math.max(1,Math.min(100,Number(intensity)||50));
const f=si/100;
const base=.08+Math.pow(f,.72)*.92;

for(let i=0;i<src.length;i+=4){
const mv=md[i+3]/255;
if(mv<=.003){
dst[i]=src[i];dst[i+1]=src[i+1];dst[i+2]=src[i+2];dst[i+3]=255;
continue;
}
const r=src[i],gg=src[i+1],b=src[i+2];
const br=bd[i],bg=bd[i+1],bb=bd[i+2];
const diff=Math.abs(r-br)+Math.abs(gg-bg)+Math.abs(b-bb);
let st=base*mv;
if(diff>95)st*=.36;
else if(diff>70)st*=.52;
else if(diff>48)st*=.72;
else if(diff>30)st*=.88;
st=Math.min(.94,st);
dst[i]=Math.round(r*(1-st)+br*st);
dst[i+1]=Math.round(gg*(1-st)+bg*st);
dst[i+2]=Math.round(b*(1-st)+bb*st);
dst[i+3]=255;
}
ctx.putImageData(res,0,0);
return await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.94));
}

function showSmoothResult(b){if(!b)return;editedBlob=b;preview.src=URL.createObjectURL(b);preview.style.display="block";placeholder.style.display="none";downloadButton.style.display="block";showStatus("Smooth Skin applied ✓")}

smoothSlider.addEventListener("input",()=>{
if(!selectedFile)return;
const v=Number(smoothSlider.value);
smoothValue.textContent=v;
clearTimeout(smoothTimer);
smoothTimer=setTimeout(async()=>{
try{
showStatus("Applying Skin Smooth "+v+"%...");
showSmoothResult(await smoothSkin(selectedFile,v))
}catch(e){
console.error(e);
showStatus("Smooth Skin failed. Please try again.")
}
},120)
});

function showResult(b){editedBlob=b;adjustmentBaseBlob=b;preview.src=URL.createObjectURL(b);preview.style.display="block";placeholder.style.display="none";downloadButton.style.display="block";resetAdjustmentValues()}

downloadButton.addEventListener("click",()=>{
if(!editedBlob)return;
const u=URL.createObjectURL(editedBlob),a=document.createElement("a");
a.href=u;
a.download="AI-Edited-Photo.jpg";
document.body.appendChild(a);
a.click();
a.remove();
setTimeout(()=>URL.revokeObjectURL(u),1000)
});

function clamp(v){return Math.max(0,Math.min(255,v))}

function rgbToHsv(r,g,b){
r/=255;g/=255;b/=255;
const max=Math.max(r,g,b),min=Math.min(r,g,b);
let h=0,s=0;
const v=max,d=max-min;
if(max!==0)s=d/max;
if(d!==0){
if(max===r)h=(g-b)/d+(g<b?6:0);
else if(max===g)h=(b-r)/d+2;
else h=(r-g)/d+4;
h/=6
}
return{h,s,v}
}

function hsvToRgb(h,s,v){
let r,g,b;
const i=Math.floor(h*6),f=h*6-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s);
switch(i%6){
case 0:r=v;g=t;b=p;break;
case 1:r=q;g=v;b=p;break;
case 2:r=p;g=v;b=t;break;
case 3:r=p;g=q;b=v;break;
case 4:r=t;g=p;b=v;break;
default:r=v;g=p;b=q
}
return{r:r*255,g:g*255,b:b*255}
}

async function applyAdjustments(){
if(!adjustmentBaseBlob)return;
const img=await loadImage(adjustmentBaseBlob),mw=1400,scale=Math.min(1,mw/img.naturalWidth),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale)),canvas=document.createElement("canvas");
canvas.width=w;canvas.height=h;
const ctx=canvas.getContext("2d",{willReadFrequently:true});
ctx.drawImage(img,0,0,w,h);
const id=ctx.getImageData(0,0,w,h),d=id.data,brightness=+adjustmentValues.brightness,contrast=+adjustmentValues.contrast,warmth=+adjustmentValues.warmth,saturation=+adjustmentValues.saturation,temperature=+adjustmentValues.temperature,vibrance=+adjustmentValues.vibrance,tint=+adjustmentValues.tint,shadows=+adjustmentValues.shadows,sharpness=+adjustmentValues.sharpness,clarity=+adjustmentValues.clarity,cf=(259*(contrast+255))/(255*(259-contrast));

for(let i=0;i<d.length;i+=4){
let r=d[i],g=d[i+1],b=d[i+2],ba=brightness*2.55;
r+=ba;g+=ba;b+=ba;
r=cf*(r-128)+128;g=cf*(g-128)+128;b=cf*(b-128)+128;
const wa=warmth*.65;
r+=wa;b-=wa;g+=wa*.1;
const ta=temperature*.55;
r+=ta*.75;g+=ta*.08;b-=ta*.9;
const tia=tint*.6;
r+=tia;b+=tia;g-=tia;
const lum=.2126*r+.7152*g+.0722*b,sf=Math.max(0,Math.min(1,(145-lum)/145)),sha=shadows*1.25*sf;
r+=sha;g+=sha;b+=sha;
let hsv=rgbToHsv(clamp(r),clamp(g),clamp(b));
hsv.s=Math.max(0,Math.min(1,hsv.s*(saturation>=0?1+saturation/100:1+saturation/120)));
const va=vibrance/100;
if(va>0)hsv.s=Math.min(1,hsv.s+va*(1-hsv.s)*.75);
else hsv.s=Math.max(0,hsv.s+va*.35);
const rgb=hsvToRgb(hsv.h,hsv.s,hsv.v);
d[i]=clamp(rgb.r);d[i+1]=clamp(rgb.g);d[i+2]=clamp(rgb.b)
}

ctx.putImageData(id,0,0);

if(sharpness!==0||clarity!==0){
const oc=document.createElement("canvas");
oc.width=w;oc.height=h;
const ocx=oc.getContext("2d");

ocx.drawImage(canvas,0,0);

if(sharpness!==0){
const amount=Math.max(-1,Math.min(1,sharpness/100));

ocx.filter=amount>0
?`contrast(${100+amount*25}%)`
:`brightness(${100+amount*8}%)`;

ocx.drawImage(canvas,0,0);
}

if(clarity!==0){
const amount=Math.max(-1,Math.min(1,clarity/100));

ocx.filter=amount>0
?`contrast(${100+amount*18}%)`
:`brightness(${100+amount*5}%)`;

ocx.globalAlpha=Math.abs(amount)*0.35;
ocx.drawImage(canvas,0,0);
ocx.globalAlpha=1;
}

ctx.clearRect(0,0,w,h);
ctx.drawImage(oc,0,0,w,h);
}

editedBlob=await new Promise(resolve=>{
canvas.toBlob(resolve,"image/jpeg",.94);
});

preview.src=URL.createObjectURL(editedBlob);
preview.style.display="block";
placeholder.style.display="none";
downloadButton.style.display="block";
}

function resetAdjustmentValues(){
adjustmentIds.forEach(id=>{
adjustmentValues[id]=0;
});

if(adjustmentsFrame&&adjustmentsFrame.contentWindow){
adjustmentsFrame.contentWindow.postMessage(
{
type:"setValues",
values:{...adjustmentValues}
},
window.location.origin
);
}
}

document.querySelectorAll(".tool").forEach(tool=>{
tool.addEventListener("click",async()=>{
if(!selectedFile){
showStatus("Please select a photo first.");
return;
}

const type=tool.dataset.tool;

if(type==="smooth"){
hairMenu.style.display="none";
showSmoothControl();
return;
}

hideSmoothControl();

if(type==="enhance"){
hairMenu.style.display="none";
try{
showStatus("Starting Enhance AI...");
const b=await runHockmanX2(selectedFile);
showResult(b);
showStatus("AI Enhance complete ✓");
}catch(e){
console.error(e);
showStatus("Enhance failed: "+(e.message||"Please try again."));
}
return;
}

if(type==="hair"){
hideSmoothControl();
hairMenu.style.display="flex";
showStatus("Hair menu opened.");
return;
}

if(type==="retouch"){
hairMenu.style.display="none";
showStatus("Retouch tool is coming soon.");
return;
}
});
});
hairGrow.addEventListener("click",()=>{
showStatus("Hair Grow selected.");
});

hairColor.addEventListener("click",()=>{
hairMenu.style.display="none";
hairColorPanel.style.display="block";
showStatus("Hair Color selected.");
});
let selectedHairColor="#111111";
let selectedHairIntensity=50;

function applyHairColorLocal(){
  if(!selectedFile)return;

  loadImage(selectedFile).then(async img=>{

    const canvas=document.createElement("canvas");
    canvas.width=img.naturalWidth;
    canvas.height=img.naturalHeight;

    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    ctx.drawImage(img,0,0);

    const imageData=ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );

    const data=imageData.data;
    const w=canvas.width;
    const h=canvas.height;

    /* Selected color */
    const hex=selectedHairColor.replace("#","");

    const cr=parseInt(hex.substring(0,2),16);
    const cg=parseInt(hex.substring(2,4),16);
    const cb=parseInt(hex.substring(4,6),16);

    const intensity=Math.max(
      0,
      Math.min(1,selectedHairIntensity/100)
    );

    /*
      Smooth mask helper.
      यह hard circular boundary को avoid करता है.
    */
    function smoothstep(a,b,v){
      const t=Math.max(
        0,
        Math.min(1,(v-a)/(b-a))
      );

      return t*t*(3-2*t);
    }

    /*
      Face protection area.
      Face के अंदर hair color नहीं लगाया जाएगा.
    */
    const faceX=w*0.50;
    const faceY=h*0.43;

    const faceRX=w*0.205;
    const faceRY=h*0.245;

    /*
      Selected color की brightness.
      इससे original hair brightness preserve करने में मदद मिलेगी.
    */
    const targetLum=
      (.2126*cr)+
      (.7152*cg)+
      (.0722*cb) || 1;


    for(let y=0;y<h;y++){

      const ny=y/h;

      for(let x=0;x<w;x++){

        const nx=x/w;

        const i=(y*w+x)*4;

        const r=data[i];
        const g=data[i+1];
        const b=data[i+2];


        /*
          Pixel brightness / saturation
        */
        const maxC=Math.max(r,g,b);
        const minC=Math.min(r,g,b);

        const brightness=
          (r+g+b)/3;

        const saturation=
          maxC===0
            ? 0
            : (maxC-minC)/maxC;


        /*
          IMPORTANT:
          यह अब पूरा ellipse color नहीं करेगा.

          यह सिर्फ hair खोजने के लिए
          search region है.
        */

        /* Top hair region */
        const dx=(nx-0.5)/0.34;
        const dy=(ny-0.27)/0.34;

        const cap=
          1-(dx*dx+dy*dy);

        const capMask=
          smoothstep(
            -0.16,
            0.12,
            cap
          );


        /*
          Left / right falling hair.
        */
        const sideY=
          smoothstep(0.28,0.42,ny) *
          (1-smoothstep(0.78,0.90,ny));


        const leftSide=
          (1-smoothstep(0.28,0.43,nx)) *
          smoothstep(0.10,0.23,nx) *
          sideY;


        const rightSide=
          smoothstep(0.57,0.72,nx) *
          (1-smoothstep(0.77,0.90,nx)) *
          sideY;


        /*
          केवल search boundary.
        */
        const spatialMask=
          Math.max(
            capMask,
            leftSide,
            rightSide
          );


        if(spatialMask<0.015){
          continue;
        }


        /*
          FACE PROTECTION
        */
        const fdx=
          (nx-0.5)/0.205;

        const fdy=
          (ny-0.43)/0.245;

        const faceCore=
          fdx*fdx+
          fdy*fdy;


        if(faceCore<1.0){
          continue;
        }


        /*
          SKIN DETECTION

          Skin-like warm pixels को hair नहीं मानेंगे.
        */
        const skinHue=
          (r>g*1.035) &&
          (g>b*1.025) &&
          (r-g>7) &&
          (g-b>3);


        const skinBrightness=
          smoothstep(
            28,
            105,
            brightness
          );


        const skinPenalty=
          skinHue
            ? 0.88*skinBrightness
            : 0;


        /*
          Background protection.

          बहुत ज्यादा saturated pixels को
          hair मानने से रोकता है.
        */
        const colorfulBackground=
          smoothstep(
            0.22,
            0.55,
            saturation
          ) *
          smoothstep(
            45,
            115,
            brightness
          );


        /*
          HAIR CONFIDENCE

          Dark pixels को ज्यादा weight.
          लेकिन search area अकेले पर्याप्त नहीं है.
        */
        const darkHair=
          smoothstep(
            205,
            92,
            brightness
          );


        const neutralHair=
          1-
          0.82*colorfulBackground;


        let mask=
          spatialMask *
          darkHair *
          neutralHair *
          (1-skinPenalty) *
          intensity;


        /*
          बहुत weak pixels को छोड़ दें.
        */
        if(mask<0.025){
          continue;
        }


        /*
          Original hair brightness preserve करें.
          इससे flat paint जैसा result नहीं आएगा.
        */
        const sourceLum=
          (.2126*r)+
          (.7152*g)+
          (.0722*b) || 1;


        const lumRatio=
          Math.max(
            0.42,
            Math.min(
              1.35,
              sourceLum/targetLum
            )
          );


        const tr=
          Math.max(
            0,
            Math.min(
              255,
              cr*lumRatio
            )
          );


        const tg=
          Math.max(
            0,
            Math.min(
              255,
              cg*lumRatio
            )
          );


        const tb=
          Math.max(
            0,
            Math.min(
              255,
              cb*lumRatio
            )
          );


        /*
          Blend selected color with
          original hair pixel.
        */
        data[i]=Math.round(
          r*(1-mask)+
          tr*mask
        );

        data[i+1]=Math.round(
          g*(1-mask)+
          tg*mask
        );

        data[i+2]=Math.round(
          b*(1-mask)+
          tb*mask
        );

      }
    }


    ctx.putImageData(
      imageData,
      0,
      0
    );


    const blob=
      await new Promise(resolve=>{

        canvas.toBlob(
          resolve,
          "image/jpeg",
          0.94
        );

      });


    if(!blob){
      throw new Error(
        "Could not create the edited image."
      );
    }


    editedBlob=blob;

    /*
      आगे Adjustments लगाने के लिए
      colored result को base बनाएं.
    */
    adjustmentBaseBlob=blob;


    preview.src=
      URL.createObjectURL(blob);

    preview.style.display="block";

    placeholder.style.display="none";

    downloadButton.style.display="block";

    showStatus(
      "Hair Color applied ✓"
    );


  }).catch(e=>{

    console.error(e);

    showStatus(
      "Hair Color failed. Please try again."
    );

  });
                               }


document.querySelectorAll(".hairColorOption").forEach(option=>{

  option.addEventListener("click",()=>{

    selectedHairColor=option.dataset.color;

    const slider=document.getElementById(
      "hairIntensitySlider"
    );

    selectedHairIntensity=Number(slider.value);

    applyHairColorLocal();

  });

});


const hairIntensitySlider=
  document.getElementById("hairIntensitySlider");

const hairIntensityValue=
  document.getElementById("hairIntensityValue");


hairIntensitySlider.addEventListener("input",()=>{

  selectedHairIntensity=
    Number(hairIntensitySlider.value);

  hairIntensityValue.textContent=
    selectedHairIntensity;

  if(selectedHairColor){
    applyHairColorLocal();
  }

});
    
showSmoothControl();
hideSmoothControl();
