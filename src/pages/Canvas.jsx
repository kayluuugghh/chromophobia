import { useEffect, useRef, useState, useCallback } from "react";
import Meyda from "meyda";
import '../assets/css/Canvas.css';
import CustomBtn from "../features/CustomBtn";

// ── WebSocket server address (must match server.py) ──────────────────────────
const WS_URL      = "ws://localhost:8765";
const WS_SEND_MS  = 500;   // how often to send features for mood classification
const MOOD_COLORS = {
  Happy:     "#f5c518",
  Energetic: "#f0603a",
  Sad:       "#4a9eff",
  Angry:     "#e03b3b",
};

export default function Canvas() {
  const canvasRef   = useRef(null);
  const meydaRef    = useRef(null);
  const wsRef       = useRef(null);
  const sendTimerRef= useRef(null);

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
    chroma: Array(12).fill(0),
  });

  const [listening,   setListening]   = useState(false);
  const [error,       setError]       = useState(null);

  //sets default visual to option 4 (cymantics)
  const [mode,        setMode]        = useState(4);

  // ── Mood state ─────────────────────────────────────────────────────────────
  const [mood,        setMood]        = useState(null);  // instant classifier mood
  const [avgMood,     setAvgMood]     = useState(null);  // 10-min rolling average mood
  const avgMoodRef = useRef(null);  // mirror of avgMood readable inside rAF without re-mounting
  const [confidence,  setConfidence]  = useState(0);
  const [scores,      setScores]      = useState({});
  const [avgScores,   setAvgScores]   = useState({});    // 10-min averaged scores per mood
  const [wsStatus,    setWsStatus]    = useState("disconnected");
  const [moodHistory, setMoodHistory] = useState([]);    // [{mood, time}] — avg mood transitions


  const scoreWindowRef = useRef([]);
  const WINDOW_MS = 3 * 60 * 1000; 

  // Compute the 10-min average scores and return the dominant mood
  const computeAvg = (window) => {
    if (!window.length) return { avgScores: {}, avgMood: null };
    const sums = {};
    for (const { scores: s } of window) {
      for (const [m, v] of Object.entries(s)) {
        sums[m] = (sums[m] ?? 0) + v;
      }
    }
    const n = window.length;
    const averaged = Object.fromEntries(Object.entries(sums).map(([m, v]) => [m, v / n]));
    const dominant = Object.entries(averaged).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { avgScores: averaged, avgMood: dominant };
  };

  // ── WebSocket helpers ──────────────────────────────────────────────────────
  const connectWS = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) return; // already open/connecting

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen  = () => setWsStatus("connected");
    ws.onerror = () => setWsStatus("error");
    ws.onclose = () => setWsStatus("disconnected");

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.error) { console.warn("Mood server:", data.error); return; }

        const now = Date.now();
        const incomingScores = data.scores || {};

        // 1. Push snapshot into rolling window, evict entries older than 10 min
        scoreWindowRef.current.push({ ts: now, scores: incomingScores });
        scoreWindowRef.current = scoreWindowRef.current.filter(e => now - e.ts <= WINDOW_MS);

        // 2. Compute 10-min average
        const { avgScores: newAvgScores, avgMood: newAvgMood } = computeAvg(scoreWindowRef.current);

        // 3. Update instant mood display
        setMood(data.mood);
        setConfidence(data.confidence);
        setScores(incomingScores);

        // 4. Update averaged scores display
        setAvgScores(newAvgScores);

        // 5. avgMood drives the visuals — track transitions for history
        setAvgMood(prev => {
          if (prev !== newAvgMood && newAvgMood) {
            setMoodHistory(h => [...h.slice(-9), { mood: newAvgMood, time: new Date() }]);
          }
          return newAvgMood;
        });
        avgMoodRef.current = newAvgMood;

      } catch { /* ignore malformed */ }
    };
  }, []);

  const disconnectWS = useCallback(() => {
    clearInterval(sendTimerRef.current);
    wsRef.current?.close();
    wsRef.current = null;
    setWsStatus("disconnected");
    setMood(null);
    setAvgMood(null);
    avgMoodRef.current = null;
    scoreWindowRef.current = [];
    setScores({});
    setAvgScores({});
    setMoodHistory([]);
  }, []);

  // ── Start periodic feature sending once WS + Meyda are both live ──────────
  const startSending = useCallback(() => {
    clearInterval(sendTimerRef.current);
    sendTimerRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const f = featuresRef.current;

      // Derive chroma_major / chroma_minor from the 12-bin chroma array
      const chroma = f.chroma;
      ws.send(JSON.stringify({
        chroma,
        mfcc:             f.mfcc,
        spectralCentroid: f.spectralCentroid,
        rms:              f.rms,
        zcr:              f.zcr,
      }));
    }, WS_SEND_MS);
  }, []);

  // ── Screen-audio capture ───────────────────────────────────────────────────
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
      const source   = audioCtx.createMediaStreamSource(stream);

      meydaRef.current = Meyda.createMeydaAnalyzer({
        audioContext: audioCtx,
        source,
        bufferSize: 512,
        featureExtractors: [
          "rms", "energy", "mfcc", "spectralCentroid",
          "zcr", "perceptualSpread",
          "chroma",          // ← needed for mood classification
        ],
        callback: (features) => {
          if (!features) return;
          const f = featuresRef.current;
          f.rms              = features.rms              ?? f.rms;
          f.energy           = features.energy           ?? f.energy;
          f.spectralCentroid = features.spectralCentroid ?? f.spectralCentroid;
          f.zcr              = features.zcr              ?? f.zcr;
          f.perceptualSpread = features.perceptualSpread ?? f.perceptualSpread;

          if (features.chroma) {
            f.chroma = Array.from(features.chroma);
          }

          if (features.mfcc) {
            const cur  = features.mfcc.slice(0, 13);
            const diff = cur.reduce((sum, v, i) => sum + Math.abs(v - f._prevMfcc[i]), 0);
            f.flux      = diff / 13;
            f._prevMfcc = cur;
            f.mfcc      = cur;
            const rawBass = (Math.abs(cur[0]) + Math.abs(cur[1]) + Math.abs(cur[2])) / 3;
            f.bassSmooth  = f.bassSmooth * 0.7 + (rawBass / 40) * 0.3;
          }
        },
      });

      meydaRef.current.start();

      stream.getAudioTracks()[0].addEventListener("ended", () => {
        meydaRef.current?.stop();
        setListening(false);
        disconnectWS();
      });

      setListening(true);

      // Connect WS and start sending
      connectWS();
      startSending();

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
      chroma: Array(12).fill(0),
    };
    disconnectWS();
    setListening(false);
  };

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(sendTimerRef.current);
      wsRef.current?.close();
    };
  }, []);

  // ── WebGL render loop (unchanged from original) ────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
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
      // mood
      gl.uniform3f(moodLoc.main.color,     smoothMoodR, smoothMoodG, smoothMoodB);
      gl.uniform1f(moodLoc.main.intensity, smoothMoodI);
      const moodIdMap = { Happy:1, Energetic:2, Sad:3, Angry:4 };
      gl.uniform1i(moodLoc.main.id, avgMoodRef.current ? (moodIdMap[avgMoodRef.current] ?? 0) : 0);
    }

    const mainFsSrc = `
      #define PI      3.14159265
      #define N_STARS 24
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
      uniform vec3  u_moodColor;
      uniform float u_moodIntensity;
      uniform int   u_moodId;        // 0=none 1=Happy 2=Energetic 3=Sad 4=Angry
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
          float fi=float(band)/13.0;

          // ── Per-mood hue palette & bar character ──────────────────────────
          float hue;
          float sat;
          float bgBrt;
          float glowMult;

          if(u_moodId==1){
            // Happy: warm yellows→oranges, wide bright bars, sunshine glow
            hue = 0.08 + fi*0.10;             // yellow to orange-yellow
            sat = 0.90;
            bgBrt = 0.06 + 0.04*(1.0-yMir);  // warm cream background
            glowMult = 2.2;
          } else if(u_moodId==2){
            // Energetic: electric cyan→magenta full spectrum, tall spiky bars
            hue = fi*1.0;                     // full rainbow sweep
            sat = 1.0;
            bgBrt = 0.02;                     // dark bg, high contrast
            glowMult = 3.0;
          } else if(u_moodId==3){
            // Sad: desaturated blue-indigo, shorter softer bars
            hue = 0.58 + fi*0.12;             // blue to indigo
            sat = 0.50 - fi*0.15;             // desaturates toward treble
            h *= 0.65;                        // bars feel heavy, drooping
            bgBrt = 0.03 + 0.02*(1.0-uv.y);  // dark blue-grey gradient
            glowMult = 0.6;
          } else if(u_moodId==4){
            // Angry: blood reds, hard clipping, jagged flicker
            hue = 0.0 + fi*0.05;             // red to deep orange
            sat = 1.0;
            // Flicker: quantise height to create a jagged aggressive look
            h = floor(h*8.0)/8.0;
            bgBrt = 0.04;
            glowMult = 2.5;
          } else {
            hue = fi*0.72;
            sat = 0.85;
            bgBrt = 0.04+0.03*(1.0-yMir);
            glowMult = 1.0;
          }

          float bodyBrt=(0.3+0.7*(yMir/max(h,0.001)))*step(yMir,h)*inBar;
          color+=hsv2rgb(vec3(fract(hue),sat,bodyBrt));

          // Tip flare
          float flare=pow(max(0.0,1.0-abs(yMir-h)*40.0),2.0)*inBar;
          color+=hsv2rgb(vec3(fract(hue),sat*0.4,flare*(0.8+u_rms*1.5)*glowMult*0.5));

          // Vertical glow bloom
          float gdist=abs(yMir-h)*u_res.y*0.5;
          color+=hsv2rgb(vec3(fract(hue),sat*0.6,exp(-gdist*gdist*0.00005)*h*(0.3+u_rms*0.6)*glowMult*0.4));

          // Top edge highlight line
          color+=hsv2rgb(vec3(fract(hue),0.2,smoothstep(0.012,0.0,abs(yMir-h-0.02-u_rms*0.01))*inBar*h));

          // Scanlines (Angry gets harsh grid lines, others subtle)
          float scanAlpha = (u_moodId==4) ? 0.12 : 0.06;
          color+=vec3(step(0.995,fract(yMir*5.0))*scanAlpha);

          // Background gradient tinted by mood
          color+=u_moodColor*bgBrt*u_moodIntensity + vec3(bgBrt*(1.0-u_moodIntensity));

        }else if(u_mode==1){
          vec2 asp=vec2(u_res.x/u_res.y,1.0);
          vec2 p=uv*asp;
          float pull=u_rms*0.35+u_energy*0.1;

          // ── Per-mood nebula background ─────────────────────────────────────
          float nebScale, nebSpeed, nebHue, nebSat, nebBrt;
          float starSatBase, starHueBase, starHueRange;
          float lineBrightMult, twinkleAmp, connectionThresh;

          if(u_moodId==1){
            // Happy: warm golden nebula, stars cluster together, lots of connections
            nebHue=0.10; nebSat=0.7; nebScale=3.0; nebSpeed=0.025+u_flux*0.05;
            nebBrt=0.18;
            starHueBase=0.06; starHueRange=0.18; starSatBase=0.80;
            lineBrightMult=1.8; twinkleAmp=0.40; connectionThresh=0.26;
          } else if(u_moodId==2){
            // Energetic: electric blue-cyan nebula, stars scatter wide, rapid twinkle
            nebHue=0.55; nebSat=0.9; nebScale=4.5; nebSpeed=0.06+u_flux*0.12;
            nebBrt=0.12;
            starHueBase=0.45; starHueRange=0.35; starSatBase=1.0;
            lineBrightMult=2.5; twinkleAmp=0.50; connectionThresh=0.20;
            pull *= 0.3; // stars spread out more
          } else if(u_moodId==3){
            // Sad: deep indigo nebula, few dim stars, sparse thin lines, slow drift
            nebHue=0.68; nebSat=0.6; nebScale=2.0; nebSpeed=0.008+u_flux*0.02;
            nebBrt=0.08;
            starHueBase=0.60; starHueRange=0.10; starSatBase=0.40;
            lineBrightMult=0.3; twinkleAmp=0.08; connectionThresh=0.12;
            pull *= 1.8; // stars cluster at center, huddled
          } else if(u_moodId==4){
            // Angry: dark crimson nebula, stars pulse hard, jagged bright lines
            nebHue=0.02; nebSat=0.85; nebScale=5.0; nebSpeed=0.04+u_flux*0.10;
            nebBrt=0.10;
            starHueBase=0.0; starHueRange=0.08; starSatBase=1.0;
            lineBrightMult=3.0; twinkleAmp=0.60; connectionThresh=0.22;
          } else {
            nebHue=0.70-u_centroid*0.35; nebSat=0.8; nebScale=2.5+u_spread*2.0;
            nebSpeed=0.015+u_flux*0.06; nebBrt=0.15;
            starHueBase=0.05; starHueRange=0.75; starSatBase=0.85;
            lineBrightMult=1.0; twinkleAmp=0.25; connectionThresh=0.18+u_spread*0.08;
          }

          float neb=fbm(uv*nebScale+u_time*nebSpeed)*0.10
                   +fbm(uv*nebScale*1.7-u_time*nebSpeed*0.6)*0.05;

          // Background: dark sky tinted by mood
          vec3 bgBase = (u_moodId==0)
            ? vec3(0.01+u_centroid*0.02,0.01,0.04+u_centroid*0.01)
            : u_moodColor*0.04*u_moodIntensity + vec3(0.01)*(1.0-u_moodIntensity);
          color = bgBase + hsv2rgb(vec3(nebHue, nebSat, neb*nebBrt));

          vec3 starAccum=vec3(0.0), lineAccum=vec3(0.0);
          for(int i=0;i<N_STARS;i++){
            vec2 sp=starPos(i,asp,pull);
            float fi=float(i);
            int bIdx=i-(i/13)*13;
            float bVal=getMFCC(bIdx);
            float sz=0.004+bVal*0.014+u_rms*0.010+u_flux*0.008;
            float hue=fract(starHueBase+float(bIdx)/13.0*starHueRange+u_centroid*0.1);
            float sat=starSatBase-u_zcr*0.35;
            float d=distance(p,sp);
            float core=exp(-d*d/(sz*sz*0.5));
            float halo=exp(-d*d/(sz*sz*9.0))*(0.3+u_flux*0.4);
            float twinkle=1.0-twinkleAmp+twinkleAmp*sin(u_time*(1.5+rand(vec2(fi,5.0))*3.0+u_zcr*4.0)+fi*1.7);
            starAccum+=hsv2rgb(vec3(hue,sat,clamp((core+halo)*twinkle,0.0,1.0)));
            vec2 sh1=starHome(i);
            for(int j=0;j<N_STARS;j++){
              if(j<=i) continue;
              vec2 sh2=starHome(j);
              float sd=distance(sh1,sh2);
              if(sd>connectionThresh) continue;
              vec2 sp2=starPos(j,asp,pull);
              int bIdx2=j-(j/13)*13;
              float hue2=fract(starHueBase+float(bIdx2)/13.0*starHueRange+u_centroid*0.1);
              float ld=lineDist(p,sp,sp2);
              float la=exp(-ld*ld*(2500.0+u_rms*1500.0))
                      *(0.10+u_energy*0.20+u_flux*0.35)
                      *(1.0-sd/connectionThresh)*lineBrightMult;
              lineAccum+=hsv2rgb(vec3(fract((hue+hue2)*0.5),0.6-u_zcr*0.3,la));
            }
          }
          color+=lineAccum+starAccum;

        }else if(u_mode==2){
          vec2 p=(uv-0.5);
          p.x*=u_res.x/u_res.y;

          // ── Per-mood aurora character ──────────────────────────────────────
          float moodHueBase, moodHueRange, warpAmt, speedMult, brightBoost, bandPow;

          if(u_moodId==1){
            // Happy: warm golden sunrise — yellows, oranges, soft pinks
            moodHueBase=0.07; moodHueRange=0.14;
            warpAmt=0.28+u_rms*0.4;   // gentle, rolling waves
            speedMult=0.9;
            brightBoost=0.35; bandPow=1.0; // soft bright bands
          } else if(u_moodId==2){
            // Energetic: high-speed cyan-violet plasma, extreme warp, strobing bands
            moodHueBase=0.50; moodHueRange=0.40;
            warpAmt=0.65+u_rms*0.9;   // violent warp distortion
            speedMult=2.2;
            brightBoost=0.15; bandPow=5.0; // tight sharp bands
          } else if(u_moodId==3){
            // Sad: slow deep blue-violet aurora, minimal warping, fades at edges
            moodHueBase=0.60; moodHueRange=0.12;
            warpAmt=0.10+u_rms*0.15;  // barely moving
            speedMult=0.35;
            brightBoost=0.0; bandPow=2.5; // dim, hazy bands
          } else if(u_moodId==4){
            // Angry: dark red-orange inferno, heavy churn, sharp strobing cuts
            moodHueBase=0.0; moodHueRange=0.08;
            warpAmt=0.55+u_rms*0.8;
            speedMult=1.8;
            brightBoost=0.20; bandPow=8.0; // harsh bright cuts
          } else {
            moodHueBase=0.45; moodHueRange=0.40;
            warpAmt=0.35+u_rms*0.6; speedMult=1.0;
            brightBoost=0.0; bandPow=1.4;
          }

          float hueShift=u_mfcc[0]*0.10+u_mfcc[1]*0.06+u_mfcc[2]*0.04;
          float speed1=u_time*(0.18+u_energy*0.25)*speedMult;
          float speed2=u_time*(0.11+u_rms*0.40)*speedMult;
          float speed3=u_time*0.07*speedMult;

          vec2 warp=vec2(fbm(p*2.5+vec2(speed1,speed3)),
                         fbm(p*2.5+vec2(speed3,speed2)));
          vec2 warped=p+warp*warpAmt;

          float pl=fbm(warped*3.0+vec2(speed1*0.8,speed2*0.5))*0.50
                  +fbm(warped*2.2-vec2(speed2*0.6,speed1*0.3)+u_mfcc[3]*0.1)*0.35
                  +fbm(warped*4.5+vec2(speed3,speed1*0.2))*0.15;

          float brt=pow(pl,bandPow)*(0.7+u_energy*0.5+u_rms*0.8)+brightBoost;
          brt+=pow(abs(sin(pl*12.0+speed1)),8.0)*(0.3+u_rms*0.7);
          brt+=pow(abs(sin(pl*22.0-speed2+u_mfcc[4]*0.3)),12.0)*0.2;
          brt*=smoothstep(0.0,0.6,1.0-uv.y*0.6)*smoothstep(0.0,0.15,uv.y);

          float hue=fract(moodHueBase+pl*moodHueRange+hueShift+sin(u_time*0.3*speedMult)*0.03);
          float sat=(u_moodId==3) ? 0.45+u_rms*0.15 : 0.80+u_rms*0.20;
          color=hsv2rgb(vec3(hue, sat, clamp(brt,0.0,1.0)));
          color*=1.0-smoothstep(0.5,1.2,length(p*vec2(0.9,1.3)));

        }else if(u_mode==3){
          vec2 asp=vec2(u_res.x/u_res.y,1.0);
          vec2 p=uv*asp;
          vec2  field    = magField(p);
          float fieldMag = length(field);
          vec2  fieldDir = field/(fieldMag+0.001);
          float tension  = 0.5+u_zcr*0.8;
          float surfaceH = pow(clamp(fieldMag*0.08,0.0,1.0),tension);
          float angle      = atan(fieldDir.y,fieldDir.x);
          float spikeCount = 12.0+u_energy*8.0;
          float spikeAngle = PI/spikeCount;
          float quantAngle = floor(angle/spikeAngle+0.5)*spikeAngle;
          float angularDist= abs(mod(angle-quantAngle+PI,2.0*PI)-PI);
          float spikeWidth = 0.08+u_rms*0.06;
          float inSpike    = smoothstep(spikeWidth,0.0,angularDist);
          float spikeH     = surfaceH*inSpike*(0.6+u_rms*0.6);
          float distC  = length(p-asp*0.5);
          float ripple = sin(distC*18.0-u_ripplePhase*6.0)
                        *u_rippleAmp*exp(-distC*2.5);
          spikeH=clamp(spikeH+ripple*0.3,0.0,1.0);
          float totalH=spikeH+clamp(dot(field,field)*0.0003,0.0,0.15);
          float normalTilt=0.25+spikeH*0.5;
          vec3 normal=normalize(vec3(
            -fieldDir.x*normalTilt,
            -fieldDir.y*normalTilt,
            1.0-normalTilt*0.5
          ));
          vec3  keyDir =normalize(vec3(-0.5,0.8,1.0));
          float keyDiff=max(dot(normal,keyDir),0.0);
          vec3  rimDir =normalize(vec3(1.0,-0.3,0.4));
          float rimDiff=pow(max(dot(normal,rimDir),0.0),3.0);
          vec3  halfVec=normalize(keyDir+vec3(0.0,0.0,1.0));
          float spec   =pow(max(dot(normal,halfVec),0.0),40.0+u_energy*60.0);
          float hue=fract(mix(0.55,0.12,u_centroid)+u_flux*0.2+totalH*0.08);
          color =hsv2rgb(vec3(hue,0.4+u_centroid*0.3,0.06+totalH*0.12));
          color+=hsv2rgb(vec3(hue,0.7,0.15+keyDiff*0.5))*spikeH;
          color+=hsv2rgb(vec3(fract(hue+0.5),0.5,rimDiff*0.6))*spikeH;
          color+=vec3(0.9,0.95,1.0)*spec*(0.4+u_rms*0.8)*spikeH;
          color+=hsv2rgb(vec3(fract(hue+0.15),0.6,pow(spikeH,4.0)*0.8))*(0.5+u_rms*0.5);
          color+=hsv2rgb(vec3(fract(hue+0.08),0.3,
                              smoothstep(0.04,0.0,abs(spikeH-0.12))*0.15));
          color*=1.0-smoothstep(0.35,0.85,length((uv-0.5)*1.3));
        }

        // Modes 0-2 handle mood color internally; apply a light finishing tint for modes 3-4
        if(u_mode>=3){
          color = mix(color, color * u_moodColor * 1.5, u_moodIntensity * 0.55);
        }
        gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);
      }
    `;

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

    const rdDisplayFsSrc = `
      precision mediump float;
      uniform sampler2D u_tex;
      uniform float u_time;
      uniform float u_centroid;
      uniform float u_rms;
      uniform float u_energy;
      uniform float u_bass;
      uniform float u_mfcc[13];
      uniform vec3  u_moodColor;
      uniform float u_moodIntensity;
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
        col = mix(col, col * u_moodColor * 1.5, u_moodIntensity * 0.55);
        gl_FragColor=vec4(clamp(col,0.0,1.0),1.0);
      }
    `;

    const mainProg   = makeProgram(mainFsSrc);
    const rdSimProg  = makeProgram(rdSimFsSrc);
    const rdDispProg = makeProgram(rdDisplayFsSrc);

    const ferroLoc = {
      poleData:    gl.getUniformLocation(mainProg, "u_poleData"),
      poleStr:     gl.getUniformLocation(mainProg, "u_poleStr"),
      ripplePhase: gl.getUniformLocation(mainProg, "u_ripplePhase"),
      rippleAmp:   gl.getUniformLocation(mainProg, "u_rippleAmp"),
    };

    // ── Mood uniform locations ─────────────────────────────────────────────
    const moodLoc = {
      main:    { color: gl.getUniformLocation(mainProg,   "u_moodColor"), intensity: gl.getUniformLocation(mainProg,   "u_moodIntensity"), id: gl.getUniformLocation(mainProg, "u_moodId") },
      rdDisp:  { color: gl.getUniformLocation(rdDispProg, "u_moodColor"), intensity: gl.getUniformLocation(rdDispProg, "u_moodIntensity") },
    };

    // Smooth mood color that lerps toward the target each frame
    // [r, g, b] in 0-1 range, intensity 0-1
    let smoothMoodR = 1, smoothMoodG = 1, smoothMoodB = 1, smoothMoodI = 0;

    // Per-mood RGB targets (normalised) + intensity
    const MOOD_GL = {
      Happy:     { r: 0.96, g: 0.77, b: 0.09, i: 1 },
      Energetic: { r: 0.94, g: 0.38, b: 0.23, i: 1 },
      Sad:       { r: 0.29, g: 0.60, b: 1.00, i: 1 },
      Angry:     { r: 0.88, g: 0.23, b: 0.23, i: 1 },
    };

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

      // ── Smooth mood color transition ───────────────────────────────────────
      const mCur = avgMoodRef.current;
      const mTarget = mCur && MOOD_GL[mCur] ? MOOD_GL[mCur] : { r:1, g:1, b:1, i:0 };
      const lerpSpeed = 1.5 * dt; // ~0.67s transition
      smoothMoodR += (mTarget.r - smoothMoodR) * lerpSpeed;
      smoothMoodG += (mTarget.g - smoothMoodG) * lerpSpeed;
      smoothMoodB += (mTarget.b - smoothMoodB) * lerpSpeed;
      smoothMoodI += (mTarget.i - smoothMoodI) * lerpSpeed;

      // ── Mood-driven dynamic parameter multipliers ──────────────────────────
      // These modulate orbit speed, ripple, RD feed/kill per detected mood
      const moodDyn = mCur === "Energetic" ? { orbitMult:1.6, rippleMult:1.8, rdFeedBias:0.01,  rdKillBias:-0.003 }
                    : mCur === "Happy"     ? { orbitMult:1.2, rippleMult:1.3, rdFeedBias:0.005, rdKillBias: 0.002 }
                    : mCur === "Sad"       ? { orbitMult:0.5, rippleMult:0.4, rdFeedBias:-0.01, rdKillBias: 0.005 }
                    : mCur === "Angry"     ? { orbitMult:2.0, rippleMult:2.5, rdFeedBias:0.02,  rdKillBias:-0.005 }
                    :                        { orbitMult:1.0, rippleMult:1.0, rdFeedBias:0,      rdKillBias: 0 };
      const mfccArr=new Float32Array(f.mfcc.map(v=>Math.min(Math.max(v/40,0),1)));
      const bass=Math.min(f.bassSmooth*3,1);
      const energy=Math.min(f.energy/100,1);
      const rms=Math.min(f.rms*5,1);

      const N=6;
      for(let i=0;i<N;i++){
        const b1=mfccArr[Math.min(i*2,12)];
        const b2=mfccArr[Math.min(i*2+1,12)];
        const orbitR=0.15+b1*0.25;
        const orbitS=(0.12+b2*0.18) * moodDyn.orbitMult;
        const phase=i*(Math.PI*2/N);
        const tx=0.5+Math.sin(t*0.001*orbitS+phase)*orbitR;
        const ty=0.5+Math.cos(t*0.001*orbitS*0.7+phase*1.3)*orbitR*0.7;
        const spring=0.8, damp=0.85;
        f.poleVelX[i]=(f.poleVelX[i]+(tx-f.polePosX[i])*spring*dt)*damp;
        f.poleVelY[i]=(f.poleVelY[i]+(ty-f.polePosY[i])*spring*dt)*damp;
        f.polePosX[i]=Math.max(0.05,Math.min(0.95,f.polePosX[i]+f.poleVelX[i]));
        f.polePosY[i]=Math.max(0.05,Math.min(0.95,f.polePosY[i]+f.poleVelY[i]));
      }

      f.ripplePhase+=dt*(0.5+bass*2.0) * moodDyn.rippleMult;
      f.rippleAmp=Math.max(0,f.rippleAmp*0.92+bass*0.35*dt*20);

      const modeNow=mode;

      if(modeNow===4){
        rdFeed+=(0.03+energy*0.04+moodDyn.rdFeedBias-rdFeed)*0.05;
        rdKill+=(0.055+Math.min(f.zcr/100,1)*0.015+moodDyn.rdKillBias-rdKill)*0.05;

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
        gl.uniform3f(moodLoc.rdDisp.color,     smoothMoodR, smoothMoodG, smoothMoodB);
        gl.uniform1f(moodLoc.rdDisp.intensity, smoothMoodI);
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);

      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);
        gl.viewport(0,0,canvas.width,canvas.height);
        gl.useProgram(mainProg);
        bindQuad(mainProg);
        setCommonUniforms(mainProg);
        gl.uniform1i(gl.getUniformLocation(mainProg,"u_mode"),modeNow);

        if(modeNow===3){
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

  // ── Mood overlay styles ────────────────────────────────────────────────────
  // avgMood drives visuals & glow; mood is the instant reading shown alongside
  const accentColor = avgMood ? MOOD_COLORS[avgMood] : mood ? MOOD_COLORS[mood] : "#ffffff33";
  const MOODS_ORDER = ["Angry", "Energetic", "Happy", "Sad"];

  const MOOD_EMOJI = {
    Happy: "😊", Energetic: "⚡", Sad: "💧", Angry: "🔥",
  };
  const MOOD_DESC = {
    Happy:     "warm & bright",
    Energetic: "fast & fiery",
    Sad:       "slow & cool",
    Angry:     "intense & chaotic",
  };

  // Format time as HH:MM:SS
  const fmtTime = d =>
    `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;


  return (
      <div
        className="canvasContainer"
        style={(avgMood || mood) ? {
          "--canvas-glow": accentColor,
          boxShadow: `0 0 40px 8px ${accentColor}55, 0 0 0 2px ${accentColor}33`,
          transition: "box-shadow 1.2s ease",
        } : {}}
      >
        <CustomBtn stats={{ 
          mood, avgMood, accentColor, wsStatus, confidence, 
          scores, avgScores, moodHistory, listening, mode,
          MOOD_EMOJI, MOOD_DESC, MOODS_ORDER, MOOD_COLORS,
          scoreWindowRef }} 
          actions={{ startCapture, stopCapture, setMode }}
        />

          {/* ── Controls ── */}
          {!listening && (
            <div className="initial-setup"> 
              <button className="shareAudio" onClick={startCapture}>Share screen audio</button>
              <p className="instruction">Click on the button above, then select the tab labeled "chromophobia"</p>
            </div>
          )}

          <canvas id="glCanvas" ref={canvasRef} style={{ display: listening ? 'block' : 'none' }} />

          {error && <p className="errorMsg">{error}</p>}
        </div>
  );
}

