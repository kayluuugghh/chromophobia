import { useEffect, useRef, useState } from "react";
import './Canvas.css';
import Meyda from "meyda";

export default function WebGLCanvas() {
  const canvasRef = useRef(null);
  const meydaRef = useRef(null);
  const featuresRef = useRef({
    rms: 0,
    energy: 0,
    spectralCentroid: 0,
    spectralRolloff: 0,
    zcr: 0,
    timbre: 0,
    mfcc: Array(13).fill(0),
  });

  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);
  const [barsMode, setBarsMode] = useState(false); // toggle mode

  const startCapture = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
        preferred
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        setError('No audio track found. Make sure to check "Share system audio".');
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
        featureExtractors: [
          "rms",
          "energy",
          "spectralCentroid",
          "spectralRolloff",
          "zcr",
          "mfcc",
        ],
        callback: (features) => {
          if (!features) return;
          const f = featuresRef.current;
          f.rms = features.rms ?? f.rms;
          f.energy = features.energy ?? f.energy;
          f.spectralCentroid = features.spectralCentroid ?? f.spectralCentroid;
          f.spectralRolloff = features.spectralRolloff ?? f.spectralRolloff;
          f.zcr = features.zcr ?? f.zcr;
          f.timbre = features.mfcc?.[1] ?? f.timbre;
          if (features.mfcc) f.mfcc = features.mfcc.slice(0, 13);
        },
      });

      meydaRef.current.start();
      stream.getAudioTracks()[0].addEventListener("ended", () => {
        meydaRef.current?.stop();
        setListening(false);
      });

      setListening(true);
    } catch (e) {
      setError(e.name === "NotAllowedError"
        ? "Screen share was cancelled or denied."
        : `Error: ${e.message}`);
    }
  };

  const stopCapture = () => {
    meydaRef.current?.stop();
    meydaRef.current = null;
    featuresRef.current = {
      rms: 0,
      energy: 0,
      spectralCentroid: 0,
      spectralRolloff: 0,
      zcr: 0,
      timbre: 0,
      mfcc: Array(13).fill(0),
    };
    setListening(false);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = canvas.offsetWidth * devicePixelRatio;
    canvas.height = canvas.offsetHeight * devicePixelRatio;

    const gl = canvas.getContext("webgl");
    if (!gl) return;

    const vs = `
      attribute vec2 a_pos;
      void main() { gl_Position = vec4(a_pos, 0, 1); }
    `;

    const fs = `
      precision mediump float;
      uniform float u_time;
      uniform vec2 u_res;
      uniform float u_rms;
      uniform float u_energy;
      uniform float u_centroid;
      uniform float u_rolloff;
      uniform float u_zcr;
      uniform float u_timbre;
      uniform float u_mfcc0; uniform float u_mfcc1; uniform float u_mfcc2; 
      uniform float u_mfcc3; uniform float u_mfcc4; uniform float u_mfcc5; 
      uniform float u_mfcc6; uniform float u_mfcc7; uniform float u_mfcc8; 
      uniform float u_mfcc9; uniform float u_mfcc10; uniform float u_mfcc11; 
      uniform float u_mfcc12;
      uniform int u_mode; // 0 = swirl, 1 = bars

      void main() {
          vec2 uv = gl_FragCoord.xy / u_res;

          vec3 color = vec3(0.0);

          if(u_mode == 1) {
              // --- Bars visualization ---
              float barHeight = 0.0;
              float x = uv.x;
              if(x < 1.0/13.0)      barHeight = u_mfcc0;
              else if(x < 2.0/13.0) barHeight = u_mfcc1;
              else if(x < 3.0/13.0) barHeight = u_mfcc2;
              else if(x < 4.0/13.0) barHeight = u_mfcc3;
              else if(x < 5.0/13.0) barHeight = u_mfcc4;
              else if(x < 6.0/13.0) barHeight = u_mfcc5;
              else if(x < 7.0/13.0) barHeight = u_mfcc6;
              else if(x < 8.0/13.0) barHeight = u_mfcc7;
              else if(x < 9.0/13.0) barHeight = u_mfcc8;
              else if(x < 10.0/13.0) barHeight = u_mfcc9;
              else if(x < 11.0/13.0) barHeight = u_mfcc10;
              else if(x < 12.0/13.0) barHeight = u_mfcc11;
              else                  barHeight = u_mfcc12;

              float isBar = step(uv.y, barHeight);
              color = mix(color, vec3(1.0, 0.8, 0.2), isBar);
          } else {
              

              vec2 centered = (gl_FragCoord.xy - u_res*0.5) / min(u_res.x, u_res.y);
              float dist = length(centered);
              float angle = atan(centered.y, centered.x);
              float pulse = 0.3 + u_rms * 0.5;
              float ring = smoothstep(0.025, 0.0, abs(dist - pulse));
              float swirl = sin(angle * 5.0 + u_time * (1.5 + u_centroid * 3.0)) * 0.5 + 0.5;
              float outerRing = smoothstep(0.02, 0.0, abs(dist - 0.65 - u_rolloff * 0.2));
              float ripple = sin(dist * (12.0 + u_zcr * 20.0) - u_time * 2.5) * 0.5 + 0.5;
              float brightness = 0.6 + u_energy * 0.4;
              float timbShift = clamp(u_timbre*0.5+0.5,0.0,1.0);

              float r = (0.1 + u_rms*0.8 + ring*0.9 + ripple*swirl*0.25) * brightness;
              float g = (0.05 + timbShift*0.6 + swirl*0.3 + outerRing*0.5) * brightness;
              float b = (0.2 + u_rolloff*0.7 + outerRing*0.8 + ripple*0.2) * brightness;
              color = vec3(r, g, b);
          }

          gl_FragColor = vec4(clamp(color,0.0,1.0),1.0);
      }
    `;

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if(!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        console.error(gl.getShaderInfoLog(s));
      return s;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog, gl.LINK_STATUS))
      console.error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);

    const loc = gl.getAttribLocation(prog,"a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);

    const uTime     = gl.getUniformLocation(prog,"u_time");
    const uRes      = gl.getUniformLocation(prog,"u_res");
    const uRms      = gl.getUniformLocation(prog,"u_rms");
    const uEnergy   = gl.getUniformLocation(prog,"u_energy");
    const uCentroid = gl.getUniformLocation(prog,"u_centroid");
    const uRolloff  = gl.getUniformLocation(prog,"u_rolloff");
    const uZcr      = gl.getUniformLocation(prog,"u_zcr");
    const uTimbre   = gl.getUniformLocation(prog,"u_timbre");
    const uMode     = gl.getUniformLocation(prog,"u_mode");
    const uMfccs = [
      gl.getUniformLocation(prog,"u_mfcc0"), gl.getUniformLocation(prog,"u_mfcc1"), gl.getUniformLocation(prog,"u_mfcc2"),
      gl.getUniformLocation(prog,"u_mfcc3"), gl.getUniformLocation(prog,"u_mfcc4"), gl.getUniformLocation(prog,"u_mfcc5"),
      gl.getUniformLocation(prog,"u_mfcc6"), gl.getUniformLocation(prog,"u_mfcc7"), gl.getUniformLocation(prog,"u_mfcc8"),
      gl.getUniformLocation(prog,"u_mfcc9"), gl.getUniformLocation(prog,"u_mfcc10"), gl.getUniformLocation(prog,"u_mfcc11"),
      gl.getUniformLocation(prog,"u_mfcc12")
    ];

    gl.uniform2f(uRes, canvas.width, canvas.height);

    let rafId;
    function draw(t) {
      const s = t * 0.001;
      const f = featuresRef.current;

      gl.uniform1f(uTime, s);
      gl.uniform1f(uRms, Math.min(f.rms*5,1));
      gl.uniform1f(uEnergy, Math.min(f.energy/100,1));
      gl.uniform1f(uCentroid, Math.min(f.spectralCentroid/4000,1));
      gl.uniform1f(uRolloff, Math.min(f.spectralRolloff/8000,1));
      gl.uniform1f(uZcr, Math.min(f.zcr/200,1));
      gl.uniform1f(uTimbre, Math.min(Math.max(f.timbre/40,-1),1));
      gl.uniform1i(uMode, barsMode ? 1 : 0);

      f.mfcc.forEach((v,i)=>gl.uniform1f(uMfccs[i], Math.min(Math.max(v/40,0),1)));

      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      rafId = requestAnimationFrame(draw);
    }

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);

  }, [barsMode]);

  return (
    <div className="canvasContainer">
      <canvas id='glCanvas'ref={canvasRef}/>
      {error && <p>{error}</p>}

      {!listening ? (
        <button onClick={startCapture}>Share screen audio</button>
      ) : (
        <div>
          <p>Capturing system audio via Meyda</p>
          <button onClick={stopCapture}>Stop</button>
          <button onClick={()=>setBarsMode(!barsMode)}>
            Toggle {barsMode ? "Swirl" : "Bars"}
          </button>
        </div>
      )}

      <p>Check "Share system audio" in the browser dialog</p>
    </div>
  );
}