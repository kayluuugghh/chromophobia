import { useEffect, useRef, useState } from "react";
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
  });
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);

  const startCapture = async () => {
    setError(null);
    try {
      // Capture system audio from screen share
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,   // required by most browsers even if we only want audio
        audio: {
          suppressLocalAudioPlayback: false,
          noiseSuppression: false,
          echoCancellation: false,
          sampleRate: 44100,
        }
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        setError('No audio track found. Make sure to check "Share system audio" in the dialog.');
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      // Stop video tracks — we only need audio
      stream.getVideoTracks().forEach((t) => t.stop());

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
          f.rms             = features.rms              ?? f.rms;
          f.energy          = features.energy           ?? f.energy;
          f.spectralCentroid= features.spectralCentroid ?? f.spectralCentroid;
          f.spectralRolloff = features.spectralRolloff  ?? f.spectralRolloff;
          f.zcr             = features.zcr              ?? f.zcr;
          f.timbre          = features.mfcc?.[1]        ?? f.timbre;
        },
      });

      meydaRef.current.start();

      // Stop everything if the user ends the share from the browser UI
      stream.getAudioTracks()[0].addEventListener("ended", () => {
        meydaRef.current?.stop();
        setListening(false);
      });

      setListening(true);
    } catch (e) {
      if (e.name === "NotAllowedError") {
        setError("Screen share was cancelled or denied.");
      } else {
        setError(`Error: ${e.message}`);
      }
    }
  };

  const stopCapture = () => {
    meydaRef.current?.stop();
    meydaRef.current = null;
    featuresRef.current = { rms: 0, energy: 0, spectralCentroid: 0, spectralRolloff: 0, zcr: 0, timbre: 0 };
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
      uniform vec2  u_res;
      uniform float u_rms;
      uniform float u_energy;
      uniform float u_centroid;
      uniform float u_rolloff;
      uniform float u_zcr;
      uniform float u_timbre;

      void main() {
        vec2 uv = (gl_FragCoord.xy - u_res * 0.5) / min(u_res.x, u_res.y);
        float dist = length(uv);
        float angle = atan(uv.y, uv.x);

        float pulse    = 0.3 + u_rms * 0.5;
        float ring     = smoothstep(0.025, 0.0, abs(dist - pulse));
        float swirl    = sin(angle * 5.0 + u_time * (1.5 + u_centroid * 3.0)) * 0.5 + 0.5;
        float outerRing= smoothstep(0.02, 0.0, abs(dist - 0.65 - u_rolloff * 0.2));
        float ripple   = sin(dist * (12.0 + u_zcr * 20.0) - u_time * 2.5) * 0.5 + 0.5;
        float brightness = 0.6 + u_energy * 0.4;
        float timbShift  = clamp(u_timbre * 0.5 + 0.5, 0.0, 1.0);

        float r = (0.1 + u_rms * 0.8   + ring * 0.9      + ripple * swirl * 0.25) * brightness;
        float g = (0.05 + timbShift * 0.6 + swirl * 0.3  + outerRing * 0.5)       * brightness;
        float b = (0.2  + u_rolloff * 0.7 + outerRing * 0.8 + ripple * 0.2)       * brightness;

        float vignette = 1.0 - smoothstep(0.45, 1.1, dist);
        gl_FragColor = vec4(clamp(vec3(r, g, b), 0.0, 1.0) * vignette, 1.0);
      }
    `;

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uTime     = gl.getUniformLocation(prog, "u_time");
    const uRes      = gl.getUniformLocation(prog, "u_res");
    const uRms      = gl.getUniformLocation(prog, "u_rms");
    const uEnergy   = gl.getUniformLocation(prog, "u_energy");
    const uCentroid = gl.getUniformLocation(prog, "u_centroid");
    const uRolloff  = gl.getUniformLocation(prog, "u_rolloff");
    const uZcr      = gl.getUniformLocation(prog, "u_zcr");
    const uTimbre   = gl.getUniformLocation(prog, "u_timbre");

    gl.uniform2f(uRes, canvas.width, canvas.height);

    let rafId;
    function draw(t) {
      const s = t * 0.001;
      const f = featuresRef.current;

      let rms      = f.rms      || 0;
      let energy   = f.energy   || 0;
      let centroid = f.spectralCentroid || 0;
      let rolloff  = f.spectralRolloff  || 0;
      let zcr      = f.zcr      || 0;
      let timbre   = f.timbre   || 0;

      const active = rms > 0.001;

      if (!active) {
        rms      = 0.1 + 0.08 * Math.sin(s * 0.8);
        energy   = 0.1 + 0.08 * Math.sin(s * 0.6 + 1);
        centroid = 0.1 + 0.08 * Math.sin(s * 0.5 + 2);
        rolloff  = 0.1 + 0.05 * Math.sin(s * 0.4 + 3);
        zcr      = 0.05;
        timbre   = 0.0;
      } else {
        rms      = Math.min(rms * 5, 1);
        energy   = Math.min(energy / 100, 1);
        centroid = Math.min(centroid / 4000, 1);
        rolloff  = Math.min(rolloff  / 8000, 1);
        zcr      = Math.min(zcr / 200, 1);
        timbre   = Math.min(Math.max(timbre / 40, -1), 1);
      }

      gl.uniform1f(uTime,     s);
      gl.uniform1f(uRms,      rms);
      gl.uniform1f(uEnergy,   energy);
      gl.uniform1f(uCentroid, centroid);
      gl.uniform1f(uRolloff,  rolloff);
      gl.uniform1f(uZcr,      zcr);
      gl.uniform1f(uTimbre,   timbre);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      rafId = requestAnimationFrame(draw);
    }
    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      meydaRef.current?.stop();
    };
  }, []);

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      justifyContent: "center", alignItems: "center",
      width: "100vw", height: "100vh", background: "#000", gap: 16,
    }}>
      <canvas ref={canvasRef} style={{ width: 600, height: 400, borderRadius: 12 }} />

      {error && (
        <p style={{ color: "#f66", fontSize: 13, margin: 0, maxWidth: 500, textAlign: "center" }}>
          {error}
        </p>
      )}

      {!listening ? (
        <button onClick={startCapture} style={{
          padding: "10px 24px", borderRadius: 8, border: "none",
          background: "#fff", color: "#000", fontSize: 14,
          fontWeight: 500, cursor: "pointer",
        }}>
          Share screen audio
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <p style={{ color: "#888", fontSize: 13, margin: 0 }}>
            Capturing system audio via Meyda
          </p>
          <button onClick={stopCapture} style={{
            padding: "6px 18px", borderRadius: 8, border: "1px solid #444",
            background: "transparent", color: "#aaa", fontSize: 13, cursor: "pointer",
          }}>
            Stop
          </button>
        </div>
      )}

      <p style={{ color: "#333", fontSize: 11, margin: 0 }}>
        Check "Share system audio" in the browser dialog
      </p>
    </div>
  );
}