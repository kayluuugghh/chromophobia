import { useEffect, useRef, useState } from "react";
import Meyda from "meyda";
import './Canvas.css';

export default function Canvas() {
  const canvasRef = useRef(null);
  const meydaRef = useRef(null);
  const featuresRef = useRef({
    rms: 0, energy: 0, mfcc: Array(13).fill(0),
    spectralCentroid: 0, zcr: 0, perceptualSpread: 0,
    flux: 0, _prevMfcc: Array(13).fill(0),
    bassSmooth: 0,
    fluidVelX: 0, fluidVelY: 0, fluidPhase: 0,
    polePosX: [0.2, 0.5, 0.8, 0.35, 0.65, 0.5],
    polePosY: [0.3, 0.7, 0.3, 0.6,  0.4,  0.5],
    poleVelX: [0,0,0,0,0,0],
    poleVelY: [0,0,0,0,0,0],
    ripplePhase: 0,
    rippleAmp: 0,
  });

  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(0);

  const startCapture = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) {
        setError('No audio track found. Enable "Share system audio".');
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      stream.getVideoTracks().forEach(t => t.stop());
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      meydaRef.current = Meyda.createMeydaAnalyzer({
        audioContext: audioCtx,
        source,
        bufferSize: 512,
        featureExtractors: ["rms", "energy", "mfcc", "spectralCentroid", "zcr", "perceptualSpread"],
        callback: (features) => {
          if (!features) return;
          const f = featuresRef.current;
          f.rms              = features.rms              ?? f.rms;
          f.energy           = features.energy           ?? f.energy;
          f.spectralCentroid = features.spectralCentroid ?? f.spectralCentroid;
          f.zcr              = features.zcr              ?? f.zcr;
          f.perceptualSpread = features.perceptualSpread ?? f.perceptualSpread;
          if (features.mfcc) {
            const cur = features.mfcc.slice(0, 13);
            const diff = cur.reduce((sum, v, i) => sum + Math.abs(v - f._prevMfcc[i]), 0);
            f.flux      = diff / 13;
            f._prevMfcc = cur;
            f.mfcc      = cur;
            const rawBass = (Math.abs(cur[0]) + Math.abs(cur[1]) + Math.abs(cur[2])) / 3;
            f.bassSmooth = f.bassSmooth * 0.7 + (rawBass / 40) * 0.3;
          }
        },
      });
      meydaRef.current.start();
      stream.getAudioTracks()[0].addEventListener("ended", () => {
        meydaRef.current?.stop();
        setListening(false);
      });
      setListening(true);
    } catch (e) {
      setError(e.name === "NotAllowedError" ? "Screen share denied." : `Error: ${e.message}`);
    }
  };

  const stopCapture = () => {
    meydaRef.current?.stop();
    meydaRef.current = null;
    featuresRef.current = {
      rms: 0, energy: 0, mfcc: Array(13).fill(0),
      spectralCentroid: 0, zcr: 0, perceptualSpread: 0,
      flux: 0, _prevMfcc: Array(13).fill(0),
      bassSmooth: 0,
      fluidVelX: 0, fluidVelY: 0, fluidPhase: 0,
      polePosX: [0.2, 0.5, 0.8, 0.35, 0.65, 0.5],
      polePosY: [0.3, 0.7, 0.3, 0.6,  0.4,  0.5],
      poleVelX: [0,0,0,0,0,0],
      poleVelY: [0,0,0,0,0,0],
      ripplePhase: 0,
      rippleAmp: 0,
    };
    setListening(false);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width  = canvas.offsetWidth  * devicePixelRatio;
    canvas.height = canvas.offsetHeight * devicePixelRatio;
    const gl = canvas.getContext("webgl");
    if (!gl) return;

    gl.getExtension("OES_texture_float");

    const vsSrc = `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() {
        v_uv = a_pos * 0.5 + 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

    function compileShader(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error("Shader error:", gl.getShaderInfoLog(s));
        console.error("Source:", src);
      }
      return s;
    }
    function makeProgram(fsSrc) {
      const p = gl.createProgram();
      gl.attachShader(p, compileShader(gl.VERTEX_SHADER, vsSrc));
      gl.attachShader(p, compileShader(gl.FRAGMENT_SHADER, fsSrc));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error("Link failed:", gl.getProgramInfoLog(p));
        console.error("Fragment source:", fsSrc);
      }
      return p;
    }
    function bindQuad(prog) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const aPos = gl.getAttribLocation(prog, "a_pos");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    }

    let perfNow = 0;

    function setCommonUniforms(prog) {
      const f = featuresRef.current;
      gl.uniform1f(gl.getUniformLocation(prog, "u_time"),     perfNow * 0.001);
      gl.uniform2f(gl.getUniformLocation(prog, "u_res"),      canvas.width, canvas.height);
      gl.uniform1f(gl.getUniformLocation(prog, "u_rms"),      Math.min(f.rms * 5, 1));
      gl.uniform1f(gl.getUniformLocation(prog, "u_energy"),   Math.min(f.energy / 100, 1));
      gl.uniform1f(gl.getUniformLocation(prog, "u_centroid"), Math.min(f.spectralCentroid / 4000, 1));
      gl.uniform1f(gl.getUniformLocation(prog, "u_flux"),     Math.min(f.flux / 8, 1));
      gl.uniform1f(gl.getUniformLocation(prog, "u_zcr"),      Math.min(f.zcr / 100, 1));
      gl.uniform1f(gl.getUniformLocation(prog, "u_spread"),   Math.min(f.perceptualSpread / 10, 1));
      gl.uniform1f(gl.getUniformLocation(prog, "u_bass"),     Math.min(f.bassSmooth * 3, 1));
      gl.uniform1f(gl.getUniformLocation(prog, "u_velX"),     f.fluidVelX);
      gl.uniform1f(gl.getUniformLocation(prog, "u_velY"),     f.fluidVelY);
      gl.uniform1f(gl.getUniformLocation(prog, "u_phase"),    f.fluidPhase);
      gl.uniform1fv(gl.getUniformLocation(prog, "u_mfcc"),
        new Float32Array(f.mfcc.map(v => Math.min(Math.max(v / 40, 0), 1))));
    }

    // ════════════════════════════════════════════════════════════════════
    // MAIN SHADER — modes 0–4
    // ════════════════════════════════════════════════════════════════════
    const mainFsSrc = `
      #define PI      3.14159265
      #define N_STARS 48
      #define N_POLES 6
      precision mediump float;

      uniform float u_time;
      uniform vec2  u_res;
      uniform float u_rms;
      uniform float u_energy;
      uniform float u_mfcc[13];
      uniform int   u_mode;
      uniform float u_centroid;
      uniform float u_flux;
      uniform float u_zcr;
      uniform float u_spread;
      uniform float u_bass;
      uniform float u_velX;
      uniform float u_velY;
      uniform float u_phase;
      uniform float u_poleData[12];
      uniform float u_poleStr[6];
      uniform float u_ripplePhase;
      uniform float u_rippleAmp;
      varying vec2  v_uv;

      float rand(vec2 co) {
        return fract(sin(dot(co, vec2(12.9898,78.233)))*43758.5453);
      }
      float noise(vec2 p) {
        vec2 i=floor(p), f=fract(p);
        f=f*f*(3.0-2.0*f);
        return mix(mix(rand(i),rand(i+vec2(1,0)),f.x),
                   mix(rand(i+vec2(0,1)),rand(i+vec2(1,1)),f.x),f.y);
      }
      float fbm(vec2 p) {
        float v=0.0,a=0.5;
        for(int k=0;k<5;k++){v+=a*noise(p);p*=2.1;a*=0.5;}
        return v;
      }
      float fbm3(vec2 p) {
        float v=0.0,a=0.5;
        for(int k=0;k<3;k++){v+=a*noise(p);p*=2.1;a*=0.5;}
        return v;
      }
      vec3 hsv2rgb(vec3 c) {
        vec4 K=vec4(1.0,2.0/3.0,1.0/3.0,3.0);
        return c.z*mix(K.xxx,clamp(abs(fract(c.xxx+K.xyz)*6.0-K.www)-K.xxx,0.0,1.0),c.y);
      }
      float getMFCC(int i) {
        if(i==0)return u_mfcc[0];  if(i==1)return u_mfcc[1];
        if(i==2)return u_mfcc[2];  if(i==3)return u_mfcc[3];
        if(i==4)return u_mfcc[4];  if(i==5)return u_mfcc[5];
        if(i==6)return u_mfcc[6];  if(i==7)return u_mfcc[7];
        if(i==8)return u_mfcc[8];  if(i==9)return u_mfcc[9];
        if(i==10)return u_mfcc[10]; if(i==11)return u_mfcc[11];
        return u_mfcc[12];
      }

      // Flat pole array accessors — avoids vec2 array indexing issues
      vec2 getPole(int i) {
        if(i==0) return vec2(u_poleData[0],  u_poleData[1]);
        if(i==1) return vec2(u_poleData[2],  u_poleData[3]);
        if(i==2) return vec2(u_poleData[4],  u_poleData[5]);
        if(i==3) return vec2(u_poleData[6],  u_poleData[7]);
        if(i==4) return vec2(u_poleData[8],  u_poleData[9]);
        return       vec2(u_poleData[10], u_poleData[11]);
      }
      float getPoleStr(int i) {
        if(i==0) return u_poleStr[0]; if(i==1) return u_poleStr[1];
        if(i==2) return u_poleStr[2]; if(i==3) return u_poleStr[3];
        if(i==4) return u_poleStr[4]; return u_poleStr[5];
      }
      float poleSign(int i) {
        if(i==0||i==2||i==4) return 1.0; return -1.0;
      }

      // Magnetic field vector at p (aspect-corrected space)
      vec2 magField(vec2 p) {
        vec2 field=vec2(0.0);
        float ar=u_res.x/u_res.y;
        for(int i=0;i<N_POLES;i++){
          vec2 poleP=getPole(i)*vec2(ar,1.0);
          vec2 diff=p-poleP;
          float d2=dot(diff,diff)+0.005;
          float d=sqrt(d2);
          field+=poleSign(i)*getPoleStr(i)*diff/(d2*d);
        }
        return field;
      }

      vec2 starHome(int i) {
        float fi=float(i);
        return vec2(rand(vec2(fi*0.137,1.0)),rand(vec2(fi*0.251,2.0)));
      }
      vec2 starPos(int i, vec2 asp, float pull) {
        float fi=float(i);
        vec2 home=starHome(i)*asp;
        float orbitR=0.03+rand(vec2(fi,3.0))*0.06;
        float orbitS=(0.30+rand(vec2(fi,4.0))*0.50)*(1.0+u_zcr*1.5);
        float phase=fi*0.4;
        float fluxJolt=u_flux*0.04*sin(fi*2.7+u_time*8.0);
        vec2 orbit=vec2(
          sin(u_time*orbitS+phase)*(orbitR+fluxJolt),
          cos(u_time*orbitS*0.7+phase*1.3)*(orbitR+fluxJolt));
        vec2 center=asp*0.5;
        vec2 expanded=home+(home-center)*u_spread*0.4;
        return expanded+orbit+(center-expanded)*pull;
      }
      float lineDist(vec2 p, vec2 a, vec2 b) {
        vec2 ab=b-a, ap=p-a;
        return length(ap-ab*clamp(dot(ap,ab)/dot(ab,ab),0.0,1.0));
      }

      void main() {
        vec2 uv=v_uv;
        vec3 color=vec3(0.0);

        // ── Mode 0: Spectrum Analyzer ───────────────────────────────
        if(u_mode==0){
          float yMir=abs(uv.y-0.5)*2.0;
          float barW=1.0/13.0;
          int band=0; float bandPos=0.0;
          for(int b=0;b<13;b++){
            float lo=float(b)*barW;
            if(uv.x>=lo&&uv.x<lo+barW){band=b;bandPos=(uv.x-lo)/barW;}
          }
          float h=clamp(getMFCC(band),0.0,1.0);
          float inBar=step(0.08,bandPos)*step(bandPos,0.92);
          float hue=float(band)/13.0*0.72;
          float bodyBrt=(0.3+0.7*(yMir/max(h,0.001)))*step(yMir,h)*inBar;
          color+=hsv2rgb(vec3(hue,0.85,bodyBrt));
          float flare=pow(max(0.0,1.0-abs(yMir-h)*40.0),2.0)*inBar;
          color+=hsv2rgb(vec3(hue,0.4,flare*(0.8+u_rms*1.5)));
          float gdist=abs(yMir-h)*u_res.y*0.5;
          color+=hsv2rgb(vec3(hue,0.6,exp(-gdist*gdist*0.00005)*h*(0.3+u_rms*0.6)));
          color+=hsv2rgb(vec3(hue,0.2,smoothstep(0.012,0.0,abs(yMir-h-0.02-u_rms*0.01))*inBar*h));
          color+=vec3(step(0.995,fract(yMir*5.0))*0.06);
          color+=vec3(0.04+0.03*(1.0-yMir));

        // ── Mode 1: Constellation ───────────────────────────────────
        }else if(u_mode==1){
          vec2 asp=vec2(u_res.x/u_res.y,1.0);
          vec2 p=uv*asp;
          float pull=u_rms*0.35+u_energy*0.1;
          float nebHue=0.70-u_centroid*0.35;
          float nebScale=2.5+u_spread*2.0;
          float nebSpeed=0.015+u_flux*0.06;
          float neb=fbm(uv*nebScale+u_time*nebSpeed)*0.10
                   +fbm(uv*nebScale*1.7-u_time*nebSpeed*0.6)*0.05;
          color=vec3(0.01+u_centroid*0.02,0.01,0.04+u_centroid*0.01)
               +hsv2rgb(vec3(nebHue,0.8,neb));
          vec3 starAccum=vec3(0.0), lineAccum=vec3(0.0);
          for(int i=0;i<N_STARS;i++){
            vec2 sp=starPos(i,asp,pull);
            float fi=float(i);
            int bIdx=i-(i/13)*13;
            float bVal=getMFCC(bIdx);
            float sz=0.004+bVal*0.014+u_rms*0.010+u_flux*0.008;
            float hue=float(bIdx)/13.0*0.75+0.05+u_centroid*0.15;
            float sat=0.85-u_zcr*0.45;
            float d=distance(p,sp);
            float core=exp(-d*d/(sz*sz*0.5));
            float halo=exp(-d*d/(sz*sz*9.0))*(0.3+u_flux*0.4);
            float twinkle=0.75+0.25*sin(u_time*(1.5+rand(vec2(fi,5.0))*3.0+u_zcr*4.0)+fi*1.7);
            starAccum+=hsv2rgb(vec3(fract(hue),sat,clamp((core+halo)*twinkle,0.0,1.0)));
            vec2 sh1=starHome(i);
            for(int j=0;j<N_STARS;j++){
              if(j<=i) continue;
              vec2 sh2=starHome(j);
              float sd=distance(sh1,sh2);
              float thresh=0.18+u_spread*0.08;
              if(sd>thresh) continue;
              vec2 sp2=starPos(j,asp,pull);
              int bIdx2=j-(j/13)*13;
              float hue2=float(bIdx2)/13.0*0.75+0.05+u_centroid*0.15;
              float ld=lineDist(p,sp,sp2);
              float la=exp(-ld*ld*(2500.0+u_rms*1500.0))
                      *(0.10+u_energy*0.20+u_flux*0.35)
                      *(1.0-sd/thresh);
              lineAccum+=hsv2rgb(vec3(fract((hue+hue2)*0.5+u_centroid*0.05),
                                      0.6-u_zcr*0.3,la));
            }
          }
          color+=lineAccum+starAccum;

        // ── Mode 2: Fluid Lava Lamp ─────────────────────────────────
        }else if(u_mode==2){
          vec2 p=uv;
          p.x*=u_res.x/u_res.y;
          vec2 drift=vec2(u_velX,u_velY)*0.3;
          float viscosity=1.0-u_energy*0.5;
          float baseSpeed=0.018*viscosity;
          vec2 p1=p*1.8+drift+vec2(u_phase*0.7,u_phase*0.4);
          float density1=fbm(p1+vec2(sin(u_time*baseSpeed)*0.4,u_time*baseSpeed*2.0));
          vec2 p2=p*2.6-drift*0.7+vec2(-u_phase*0.5,u_phase*0.3);
          float density2=fbm3(p2+vec2(u_time*baseSpeed*1.3,sin(u_time*baseSpeed*0.8)*0.3));
          vec2 p3=p*4.2+vec2(u_velX*0.5,u_phase*1.1+u_time*baseSpeed*3.0);
          float density3=fbm3(p3);
          float buoyancy=(density1*0.55+density2*0.30+density3*0.15)-0.5;
          float rise=buoyancy*(0.3+u_rms*0.7);
          vec2 bp=p+vec2(u_velX*0.1,-rise*0.15);
          float bd=fbm(bp*1.8+vec2(u_phase*0.7,u_phase*0.4+u_time*baseSpeed*2.0))*0.55
                  +fbm3(bp*2.6+vec2(u_time*baseSpeed*1.3,0.0))*0.30
                  +fbm3(bp*4.2+vec2(0.0,u_phase*1.1+u_time*baseSpeed*3.0))*0.15;
          float mfccD=0.0;
          for(int k=0;k<13;k++){
            float fk=float(k);
            float blobY=fk/13.0;
            float blobX=0.5+sin(u_time*baseSpeed*0.5+fk*0.8)*0.35;
            float blob=exp(-(abs(uv.y-blobY)*abs(uv.y-blobY)*18.0
                            +abs(uv.x-blobX)*abs(uv.x-blobX)*8.0));
            mfccD+=getMFCC(k)*blob*0.25;
          }
          float temp=clamp(bd+mfccD,0.0,1.0);
          float hue=mix(0.05+temp*0.08, 0.50+temp*0.12, u_centroid);
          float brt=pow(temp,1.6)*(0.85+u_rms*0.4);
          vec3 coreColor=mix(hsv2rgb(vec3(hue,0.8+0.2*sin(temp*PI),brt)),
                             vec3(1.0,0.97,0.92),pow(temp,4.0)*0.6);
          float dx2=fbm((bp+vec2(0.005,0))*1.8)-fbm((bp-vec2(0.005,0))*1.8);
          float dy2=fbm((bp+vec2(0,0.005))*1.8)-fbm((bp-vec2(0,0.005))*1.8);
          float shimmer=smoothstep(0.3,0.8,length(vec2(dx2,dy2))*80.0)*0.25*(0.5+u_energy*0.5);
          color=hsv2rgb(vec3(fract(hue+0.5),0.6,0.03+u_energy*0.02))
               +coreColor+hsv2rgb(vec3(fract(hue+0.08),0.4,shimmer));
          color*=1.0-smoothstep(0.3,0.9,length((uv-0.5)*vec2(1.0,1.2)));

        // ── Mode 3: Aurora Plasma ───────────────────────────────────
        }else if(u_mode==3){
          vec2 p=(uv-0.5);
          p.x*=u_res.x/u_res.y;
          float hueShift=u_mfcc[0]*0.15+u_mfcc[1]*0.08+u_mfcc[2]*0.05;
          float speed1=u_time*(0.18+u_energy*0.25);
          float speed2=u_time*(0.11+u_rms*0.40);
          float speed3=u_time*0.07;
          vec2 warp=vec2(fbm(p*2.5+vec2(speed1,speed3)),
                         fbm(p*2.5+vec2(speed3,speed2)));
          vec2 warped=p+warp*(0.35+u_rms*0.6);
          float pl=fbm(warped*3.0+vec2(speed1*0.8,speed2*0.5))*0.50
                  +fbm(warped*2.2-vec2(speed2*0.6,speed1*0.3)+u_mfcc[3]*0.1)*0.35
                  +fbm(warped*4.5+vec2(speed3,speed1*0.2))*0.15;
          float brt=pow(pl,1.4)*(0.7+u_energy*0.5+u_rms*0.8);
          brt+=pow(abs(sin(pl*12.0+speed1)),8.0)*(0.3+u_rms*0.7);
          brt+=pow(abs(sin(pl*22.0-speed2+u_mfcc[4]*0.3)),12.0)*0.2;
          brt*=smoothstep(0.0,0.6,1.0-uv.y*0.6)*smoothstep(0.0,0.15,uv.y);
          color=hsv2rgb(vec3(fract(0.45+pl*0.4+hueShift+sin(u_time*0.3)*0.05),
                             0.75+u_rms*0.25,clamp(brt,0.0,1.0)));
          color*=1.0-smoothstep(0.5,1.2,length(p*vec2(0.9,1.3)));

        // ── Mode 4: Ferrofluid ──────────────────────────────────────
        }else if(u_mode==4){
          vec2 asp=vec2(u_res.x/u_res.y,1.0);
          vec2 p=uv*asp;

          // Magnetic field
          vec2  field    = magField(p);
          float fieldMag = length(field);
          vec2  fieldDir = field/(fieldMag+0.001);

          // Surface height — surface tension from ZCR
          float tension  = 0.5+u_zcr*0.8;
          float surfaceH = pow(clamp(fieldMag*0.08,0.0,1.0),tension);

          // Spike columns via angular quantisation of field direction
          float angle      = atan(fieldDir.y,fieldDir.x);
          float spikeCount = 12.0+u_energy*8.0;
          float spikeAngle = PI/spikeCount;
          float quantAngle = floor(angle/spikeAngle+0.5)*spikeAngle;
          float angularDist= abs(mod(angle-quantAngle+PI,2.0*PI)-PI);
          float spikeWidth = 0.08+u_rms*0.06;
          float inSpike    = smoothstep(spikeWidth,0.0,angularDist);
          float spikeH     = surfaceH*inSpike*(0.6+u_rms*0.6);

          // Bass ripple radiating from center
          float distC  = length(p-asp*0.5);
          float ripple = sin(distC*18.0-u_ripplePhase*6.0)
                        *u_rippleAmp*exp(-distC*2.5);
          spikeH=clamp(spikeH+ripple*0.3,0.0,1.0);

          float totalH=spikeH+clamp(dot(field,field)*0.0003,0.0,0.15);

          // Surface normal from field direction (field lines ⊥ isopotential)
          float normalTilt=0.25+spikeH*0.5;
          vec3 normal=normalize(vec3(
            -fieldDir.x*normalTilt,
            -fieldDir.y*normalTilt,
            1.0-normalTilt*0.5
          ));

          // Lighting: key + rim + specular
          vec3  keyDir =normalize(vec3(-0.5,0.8,1.0));
          float keyDiff=max(dot(normal,keyDir),0.0);
          vec3  rimDir =normalize(vec3(1.0,-0.3,0.4));
          float rimDiff=pow(max(dot(normal,rimDir),0.0),3.0);
          vec3  halfVec=normalize(keyDir+vec3(0.0,0.0,1.0));
          float spec   =pow(max(dot(normal,halfVec),0.0),40.0+u_energy*60.0);

          // Color: centroid shifts blue-steel → amber-gold
          float hue=fract(mix(0.55,0.12,u_centroid)+u_flux*0.2+totalH*0.08);

          color =hsv2rgb(vec3(hue,0.4+u_centroid*0.3,0.06+totalH*0.12));
          color+=hsv2rgb(vec3(hue,0.7,0.15+keyDiff*0.5))*spikeH;
          color+=hsv2rgb(vec3(fract(hue+0.5),0.5,rimDiff*0.6))*spikeH;
          color+=vec3(0.9,0.95,1.0)*spec*(0.4+u_rms*0.8)*spikeH;
          color+=hsv2rgb(vec3(fract(hue+0.15),0.6,pow(spikeH,4.0)*0.8))*(0.5+u_rms*0.5);

          // Meniscus at spike base
          color+=hsv2rgb(vec3(fract(hue+0.08),0.3,
                              smoothstep(0.04,0.0,abs(spikeH-0.12))*0.15));

          // Vignette
          color*=1.0-smoothstep(0.35,0.85,length((uv-0.5)*1.3));
        }

        gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);
      }
    `;

    // ════════════════════════════════════════════════════════════════════
    // RD SIMULATION SHADER
    // ════════════════════════════════════════════════════════════════════
    const rdSimFsSrc = `
      precision mediump float;
      uniform sampler2D u_tex;
      uniform vec2  u_res;
      uniform float u_feed;
      uniform float u_kill;
      uniform float u_rms;
      uniform float u_flux;
      uniform float u_energy;
      uniform float u_bass;
      uniform float u_time;
      uniform float u_mfcc[13];
      varying vec2 v_uv;

      float getMFCC(int i){
        if(i==0)return u_mfcc[0];  if(i==1)return u_mfcc[1];
        if(i==2)return u_mfcc[2];  if(i==3)return u_mfcc[3];
        if(i==4)return u_mfcc[4];  if(i==5)return u_mfcc[5];
        if(i==6)return u_mfcc[6];  if(i==7)return u_mfcc[7];
        if(i==8)return u_mfcc[8];  if(i==9)return u_mfcc[9];
        if(i==10)return u_mfcc[10]; if(i==11)return u_mfcc[11];
        return u_mfcc[12];
      }
      float cymaticsField(vec2 uv){
        vec2 p=uv-0.5; p.x*=u_res.x/u_res.y;
        float r=length(p), a=atan(p.y,p.x);
        float freq=6.0+u_rms*14.0+u_bass*8.0;
        float wave=0.0;
        for(int k=0;k<13;k++){
          float fk=float(k), amp=getMFCC(k);
          wave+=amp*(sin(r*freq*(1.0+fk*0.3)-u_time*0.4)*0.6
                    +cos(float(k+1)*a+u_time*0.1*fk)*0.4);
        }
        return wave/13.0;
      }
      void main(){
        vec2 px=1.0/u_res, uv=v_uv;
        float warpAmt=u_bass*0.012;
        vec2 warp1=vec2(sin(uv.y*6.0+u_time*1.3),cos(uv.x*6.0+u_time*0.9))*warpAmt;
        vec2 warp2=vec2(cos(uv.y*4.0-u_time*0.7),sin(uv.x*4.0+u_time*1.1))*warpAmt*0.5;
        vec2 w=uv+warp1+warp2;
        vec2 c =texture2D(u_tex,w).rg;
        vec2 n =texture2D(u_tex,w+vec2(0,px.y)).rg;
        vec2 s =texture2D(u_tex,w-vec2(0,px.y)).rg;
        vec2 e =texture2D(u_tex,w+vec2(px.x,0)).rg;
        vec2 ww=texture2D(u_tex,w-vec2(px.x,0)).rg;
        vec2 ne=texture2D(u_tex,w+px).rg;
        vec2 nw=texture2D(u_tex,w+vec2(-px.x,px.y)).rg;
        vec2 se=texture2D(u_tex,w+vec2(px.x,-px.y)).rg;
        vec2 sw=texture2D(u_tex,w-px).rg;
        vec2 lap=(n+s+e+ww)*0.2+(ne+nw+se+sw)*0.05-c;
        float A=c.r, B=c.g;
        float wave=cymaticsField(uv);
        float nodalness=1.0-smoothstep(0.0,0.08,abs(wave));
        float spatialFeed=u_feed+nodalness*u_feed*1.2;
        float spatialKill=u_kill+u_flux*0.004;
        float ABB=A*B*B;
        float newA=A+(1.0+u_bass*0.8)*lap.r-ABB+spatialFeed*(1.0-A);
        float newB=B+(0.5+getMFCC(2)*0.1)*lap.g+ABB-(spatialKill+spatialFeed)*B;
        float dist=length(uv-0.5);
        float ringRadius=fract(u_time*0.18+u_bass*0.4);
        newB=min(newB+smoothstep(0.04+u_bass*0.03,0.0,abs(dist-ringRadius))*u_bass*0.5,1.0);
        newB=min(newB+u_rms*u_rms*nodalness*0.3,1.0);
        float fluxWash=u_flux*wave*wave*0.15;
        newA=min(newA+fluxWash,1.0);
        newB=max(newB-fluxWash*0.5,0.0);
        gl_FragColor=vec4(clamp(newA,0.0,1.0),clamp(newB,0.0,1.0),0.0,1.0);
      }
    `;

    // ════════════════════════════════════════════════════════════════════
    // RD DISPLAY SHADER
    // ════════════════════════════════════════════════════════════════════
    const rdDisplayFsSrc = `
      precision mediump float;
      uniform sampler2D u_tex;
      uniform float u_time;
      uniform float u_centroid;
      uniform float u_rms;
      uniform float u_energy;
      uniform float u_bass;
      uniform float u_mfcc[13];
      varying vec2 v_uv;

      vec3 hsv2rgb(vec3 c){
        vec4 K=vec4(1.0,2.0/3.0,1.0/3.0,3.0);
        return c.z*mix(K.xxx,clamp(abs(fract(c.xxx+K.xyz)*6.0-K.www)-K.xxx,0.0,1.0),c.y);
      }
      float getMFCC(int i){
        if(i==0)return u_mfcc[0];  if(i==1)return u_mfcc[1];
        if(i==2)return u_mfcc[2];  if(i==3)return u_mfcc[3];
        if(i==4)return u_mfcc[4];  if(i==5)return u_mfcc[5];
        if(i==6)return u_mfcc[6];  if(i==7)return u_mfcc[7];
        if(i==8)return u_mfcc[8];  if(i==9)return u_mfcc[9];
        if(i==10)return u_mfcc[10]; if(i==11)return u_mfcc[11];
        return u_mfcc[12];
      }
      void main(){
        float shakeAmt=u_bass*0.008;
        vec2 shake=vec2(sin(u_time*23.7)*shakeAmt,cos(u_time*17.3)*shakeAmt);
        float zoom=1.0+u_bass*0.04;
        vec2 sampleUV=(v_uv-0.5)/zoom+0.5+shake;
        vec2 ab=texture2D(u_tex,sampleUV).rg;
        float A=ab.r, B=ab.g;
        float hue=fract(u_centroid*0.6+u_time*0.03+(A-B)*0.3);
        float sat=0.85+B*0.15;
        float brt=pow(clamp(B*2.5,0.0,1.0),0.7)*(0.6+u_energy*0.5+u_rms*0.4);
        float front=1.0-smoothstep(0.0,0.08,abs(A-B-0.1));
        float hueShift=u_bass*0.15;
        vec3 col=hsv2rgb(vec3(fract(hue+hueShift),sat,brt))
                +hsv2rgb(vec3(fract(hue+0.5+hueShift),0.4,front*(0.5+u_rms*0.8)));
        vec2 p=v_uv-0.5; p.x*=1.777;
        float r=length(p), a=atan(p.y,p.x);
        float freq=6.0+u_rms*14.0+u_bass*8.0;
        float wave=0.0;
        for(int k=0;k<13;k++){
          float fk=float(k), amp=getMFCC(k);
          wave+=amp*(sin(r*freq*(1.0+fk*0.3)-u_time*0.4)*0.6
                    +cos(float(k+1)*a+u_time*0.1*fk)*0.4);
        }
        wave/=13.0;
        col+=hsv2rgb(vec3(fract(hue+0.25),0.5,
                          (1.0-smoothstep(0.0,0.018,abs(wave)))*(0.18+u_bass*0.25)));
        float dist=length(v_uv-0.5);
        float ringRadius=fract(u_time*0.18+u_bass*0.4);
        col+=hsv2rgb(vec3(fract(hue+0.1),0.7,
                          smoothstep(0.06,0.0,abs(dist-ringRadius))*u_bass*0.6));
        gl_FragColor=vec4(clamp(col,0.0,1.0),1.0);
      }
    `;

    const mainProg   = makeProgram(mainFsSrc);
    const rdSimProg  = makeProgram(rdSimFsSrc);
    const rdDispProg = makeProgram(rdDisplayFsSrc);

    // Cached ferrofluid uniform locations
    const ferroLoc = {
      poleData:    gl.getUniformLocation(mainProg, "u_poleData"),
      poleStr:     gl.getUniformLocation(mainProg, "u_poleStr"),
      ripplePhase: gl.getUniformLocation(mainProg, "u_ripplePhase"),
      rippleAmp:   gl.getUniformLocation(mainProg, "u_rippleAmp"),
    };

    // ── RD ping-pong ─────────────────────────────────────────────────
    const RD_W=512, RD_H=512;
    function makeRDTex(){
      const tex=gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
      const data=new Uint8Array(RD_W*RD_H*4);
      for(let i=0;i<RD_W*RD_H;i++){
        data[i*4+0]=255; data[i*4+1]=0;
        if(Math.random()<0.003){data[i*4+0]=100;data[i*4+1]=200;}
        data[i*4+3]=255;
      }
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,RD_W,RD_H,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
      return tex;
    }
    function makeRDFBO(tex){
      const fbo=gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      return fbo;
    }
    const rdTexA=makeRDTex(), rdTexB=makeRDTex();
    const rdFboA=makeRDFBO(rdTexA), rdFboB=makeRDFBO(rdTexB);
    let rdPing={tex:rdTexA,fbo:rdFboA}, rdPong={tex:rdTexB,fbo:rdFboB};
    let rdFeed=0.055, rdKill=0.062;

    const rdSim={
      tex:    gl.getUniformLocation(rdSimProg,"u_tex"),
      res:    gl.getUniformLocation(rdSimProg,"u_res"),
      feed:   gl.getUniformLocation(rdSimProg,"u_feed"),
      kill:   gl.getUniformLocation(rdSimProg,"u_kill"),
      rms:    gl.getUniformLocation(rdSimProg,"u_rms"),
      flux:   gl.getUniformLocation(rdSimProg,"u_flux"),
      energy: gl.getUniformLocation(rdSimProg,"u_energy"),
      bass:   gl.getUniformLocation(rdSimProg,"u_bass"),
      time:   gl.getUniformLocation(rdSimProg,"u_time"),
      mfcc:   gl.getUniformLocation(rdSimProg,"u_mfcc"),
    };
    const rdDisp={
      tex:      gl.getUniformLocation(rdDispProg,"u_tex"),
      time:     gl.getUniformLocation(rdDispProg,"u_time"),
      centroid: gl.getUniformLocation(rdDispProg,"u_centroid"),
      rms:      gl.getUniformLocation(rdDispProg,"u_rms"),
      energy:   gl.getUniformLocation(rdDispProg,"u_energy"),
      bass:     gl.getUniformLocation(rdDispProg,"u_bass"),
      mfcc:     gl.getUniformLocation(rdDispProg,"u_mfcc"),
    };

    let rafId, lastT=0;

    function draw(t){
      perfNow=t;
      const dt=Math.min((t-lastT)*0.001,0.05);
      lastT=t;
      const f=featuresRef.current;
      const mfccArr=new Float32Array(f.mfcc.map(v=>Math.min(Math.max(v/40,0),1)));
      const bass=Math.min(f.bassSmooth*3,1);
      const energy=Math.min(f.energy/100,1);
      const rms=Math.min(f.rms*5,1);

      // ── Fluid state ───────────────────────────────────────────────
      const viscDecay=0.92-energy*0.15;
      f.fluidVelX=Math.max(-0.08,Math.min(0.08,
        f.fluidVelX*viscDecay+(Math.sin(t*0.0007)*0.01+bass*0.05)*dt));
      f.fluidVelY=Math.max(-0.08,Math.min(0.08,
        f.fluidVelY*viscDecay+(-(0.02+energy*0.08))*dt));
      f.fluidPhase+=dt*(0.04+energy*0.12);

      // ── Ferrofluid pole update ────────────────────────────────────
      const N=6;
      for(let i=0;i<N;i++){
        const b1=mfccArr[Math.min(i*2,12)];
        const b2=mfccArr[Math.min(i*2+1,12)];
        const orbitR=0.15+b1*0.25;
        const orbitS=0.12+b2*0.18;
        const phase=i*(Math.PI*2/N);
        const tx=0.5+Math.sin(t*0.001*orbitS+phase)*orbitR;
        const ty=0.5+Math.cos(t*0.001*orbitS*0.7+phase*1.3)*orbitR*0.7;
        const spring=0.8, damp=0.85;
        f.poleVelX[i]=(f.poleVelX[i]+(tx-f.polePosX[i])*spring*dt)*damp;
        f.poleVelY[i]=(f.poleVelY[i]+(ty-f.polePosY[i])*spring*dt)*damp;
        f.polePosX[i]=Math.max(0.05,Math.min(0.95,f.polePosX[i]+f.poleVelX[i]));
        f.polePosY[i]=Math.max(0.05,Math.min(0.95,f.polePosY[i]+f.poleVelY[i]));
      }

      // ── Ripple update ─────────────────────────────────────────────
      f.ripplePhase+=dt*(0.5+bass*2.0);
      f.rippleAmp=Math.max(0,f.rippleAmp*0.92+bass*0.35*dt*20);

      const modeNow=mode;

      if(modeNow===5){
        rdFeed+=(0.03+energy*0.04-rdFeed)*0.05;
        rdKill+=(0.055+Math.min(f.zcr/100,1)*0.015-rdKill)*0.05;

        gl.useProgram(rdSimProg);
        bindQuad(rdSimProg);
        gl.viewport(0,0,RD_W,RD_H);
        gl.uniform2f(rdSim.res,RD_W,RD_H);
        gl.uniform1f(rdSim.feed,rdFeed);
        gl.uniform1f(rdSim.kill,rdKill);
        gl.uniform1f(rdSim.rms,rms);
        gl.uniform1f(rdSim.flux,Math.min(f.flux/8,1));
        gl.uniform1f(rdSim.energy,energy);
        gl.uniform1f(rdSim.bass,bass);
        gl.uniform1f(rdSim.time,t*0.001);
        gl.uniform1fv(rdSim.mfcc,mfccArr);

        for(let step=0;step<6;step++){
          gl.bindFramebuffer(gl.FRAMEBUFFER,rdPong.fbo);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D,rdPing.tex);
          gl.uniform1i(rdSim.tex,0);
          gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
          const tmp=rdPing; rdPing=rdPong; rdPong=tmp;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER,null);
        gl.viewport(0,0,canvas.width,canvas.height);
        gl.useProgram(rdDispProg);
        bindQuad(rdDispProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D,rdPing.tex);
        gl.uniform1i(rdDisp.tex,0);
        gl.uniform1f(rdDisp.time,t*0.001);
        gl.uniform1f(rdDisp.centroid,Math.min(f.spectralCentroid/4000,1));
        gl.uniform1f(rdDisp.rms,rms);
        gl.uniform1f(rdDisp.energy,energy);
        gl.uniform1f(rdDisp.bass,bass);
        gl.uniform1fv(rdDisp.mfcc,mfccArr);
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);

      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);
        gl.viewport(0,0,canvas.width,canvas.height);
        gl.useProgram(mainProg);
        bindQuad(mainProg);
        setCommonUniforms(mainProg);
        gl.uniform1i(gl.getUniformLocation(mainProg,"u_mode"),modeNow);

        if(modeNow===4){
          const poleFlat=new Float32Array(N*2);
          const strFlat=new Float32Array(N);
          for(let i=0;i<N;i++){
            poleFlat[i*2]  =f.polePosX[i];
            poleFlat[i*2+1]=f.polePosY[i];
            strFlat[i]=0.004+(mfccArr[Math.min(i*2,12)]*0.008);
          }
          gl.uniform1fv(ferroLoc.poleData,   poleFlat);
          gl.uniform1fv(ferroLoc.poleStr,    strFlat);
          gl.uniform1f(ferroLoc.ripplePhase, f.ripplePhase);
          gl.uniform1f(ferroLoc.rippleAmp,   f.rippleAmp);
        }

        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      }

      rafId=requestAnimationFrame(draw);
    }

    rafId=requestAnimationFrame(draw);
    return ()=>{
      cancelAnimationFrame(rafId);
      gl.deleteTexture(rdTexA); gl.deleteTexture(rdTexB);
      gl.deleteFramebuffer(rdFboA); gl.deleteFramebuffer(rdFboB);
    };
  },[mode]);

  return (
    <div className="canvasContainer">
      <canvas id="glCanvas" ref={canvasRef}/>
      {error && <p>{error}</p>}
      {!listening ? (
        <button onClick={startCapture}>Share screen audio</button>
      ) : (
        <div>
          <p>Capturing system audio via Meyda</p>
          <button onClick={stopCapture}>Stop</button>
          <select value={mode} onChange={e=>setMode(Number(e.target.value))}>
            <option value={0}>Spectrum Analyzer</option>
            <option value={1}>Constellation</option>
            <option value={2}>Fluid Lava Lamp</option>
            <option value={3}>Aurora Plasma</option>
            <option value={4}>Ferrofluid</option>
            <option value={5}>Cymatics + Reaction-Diffusion</option>
          </select>
        </div>
      )}
      <p>Check "Share system audio" in the browser dialog</p>
    </div>
  );
}