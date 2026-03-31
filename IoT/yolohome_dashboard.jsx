import { useState, useEffect, useRef, useCallback } from "react";

const SCENARIOS = {
  camera: ["empty", "single_face", "multi_face", "dark", "noise"],
  mic: ["silence", "doorbell", "knock", "voice", "mixed"],
  microbit: ["idle", "button_press", "shake_unlock", "environment"],
};

function generateMicrobitReading(scenario, elapsed) {
  let temp = 22, light = 128, ax = 0, ay = 0, az = -1024;
  let btnA = false, btnB = false, gesture = null;
  if (scenario === "button_press" && elapsed >= 2 && elapsed < 2.5) btnA = true;
  if (scenario === "shake_unlock" && elapsed >= 1 && elapsed < 1.8) {
    gesture = "shake";
    ax = Math.round((Math.random() - 0.5) * 4000);
    ay = Math.round((Math.random() - 0.5) * 4000);
    az = Math.round((Math.random() - 0.5) * 4000);
  }
  if (scenario === "environment") {
    const p = Math.min(elapsed / 10, 1);
    temp = 15 + 20 * p;
    light = Math.round(255 * p);
  }
  temp += (Math.random() - 0.5) * 0.6;
  light = Math.max(0, Math.min(255, light + Math.round((Math.random() - 0.5) * 10)));
  return { temp: Math.round(temp * 100) / 100, light, ax, ay, az, btnA, btnB, gesture };
}

function generateAudioRMS(scenario, elapsed) {
  if (scenario === "silence") return 0.005;
  if (scenario === "doorbell" && elapsed >= 1 && elapsed < 1.6) return 0.49 + Math.random() * 0.02;
  if (scenario === "knock") {
    for (const t of [0.5, 0.7, 0.9]) {
      if (elapsed >= t && elapsed < t + 0.05) return 0.7 + Math.random() * 0.2;
    }
    return 0.005;
  }
  if (scenario === "voice" && elapsed >= 1 && elapsed < 3) {
    const mod = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * elapsed);
    return 0.3 * mod + Math.random() * 0.05;
  }
  if (scenario === "mixed") {
    if (elapsed >= 0.5 && elapsed < 1.1) return 0.49;
    if (elapsed >= 2 && elapsed < 3.5) return 0.25 + Math.random() * 0.1;
  }
  return 0.005;
}

function generateFaceDetected(scenario, elapsed) {
  if (scenario === "single_face" && elapsed >= 1) return [{ label: "alice", x: 200, y: 120, w: 150, h: 180, conf: 0.95 }];
  if (scenario === "multi_face" && elapsed >= 0.5) return [
    { label: "alice", x: 100, y: 100, w: 130, h: 160, conf: 0.93 },
    { label: "bob", x: 380, y: 110, w: 140, h: 170, conf: 0.88 },
  ];
  return [];
}

function classifySound(rms, peak) {
  if (rms < 0.05) return null;
  if (peak > 0.8 && rms < 0.3) return "impulse";
  if (rms > 0.2) return "tonal";
  return "ambient";
}

const C = {
  bg: "#0C1117",
  panel: "#141B24",
  border: "#1E2A36",
  accent: "#00D4AA",
  accentDim: "rgba(0,212,170,0.15)",
  warm: "#FF6B4A",
  warmDim: "rgba(255,107,74,0.15)",
  blue: "#4A9EFF",
  blueDim: "rgba(74,158,255,0.15)",
  amber: "#FFB84A",
  amberDim: "rgba(255,184,74,0.15)",
  text: "#E8ECF0",
  textMuted: "#7A8A9E",
  textDim: "#3E4E60",
  danger: "#FF4757",
  success: "#2ED573",
};

const mono = "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', monospace";
const sans = "'DM Sans', 'Nunito Sans', system-ui, sans-serif";

function Panel({ title, icon, children, accent = C.accent, span = 1 }) {
  return (
    <div style={{
      background: C.panel, borderRadius: 10, border: `1px solid ${C.border}`,
      padding: "14px 16px", gridColumn: span > 1 ? `span ${span}` : undefined,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: accent, opacity: 0.6,
      }} />
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
        fontSize: 11, fontFamily: mono, color: C.textMuted, textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value, unit, accent = C.accent }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 11, color: C.textMuted, fontFamily: mono, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: mono, color: accent, lineHeight: 1 }}>
        {value}
      </div>
      {unit && <div style={{ fontSize: 10, color: C.textDim, fontFamily: mono, marginTop: 2 }}>{unit}</div>}
    </div>
  );
}

function MiniBar({ value, max = 1, color = C.accent, h = 6 }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ height: h, background: C.border, borderRadius: h / 2, overflow: "hidden", flex: 1 }}>
      <div style={{
        height: "100%", width: `${pct}%`, background: color, borderRadius: h / 2,
        transition: "width 0.15s ease",
      }} />
    </div>
  );
}

function CameraView({ faces, scenario, isDark }) {
  const w = 200, h = 150;
  const bgBright = isDark ? 15 : 60;
  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "4/3", background: `rgb(${bgBright},${bgBright + 2},${bgBright + 5})`, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.border}` }}>
      {scenario === "noise" && (
        <div style={{
          position: "absolute", inset: 0, opacity: 0.4,
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='1' height='1' fill='%23fff' opacity='0.3'/%3E%3C/svg%3E")`,
        }} />
      )}
      {faces.map((f, i) => {
        const sx = w / 640, sy = h / 480;
        return (
          <div key={i} style={{
            position: "absolute",
            left: f.x * sx, top: f.y * sy,
            width: f.w * sx, height: f.h * sy,
            border: `1.5px solid ${C.accent}`,
            borderRadius: 3,
          }}>
            <div style={{
              position: "absolute", top: -16, left: -1,
              fontSize: 9, fontFamily: mono, color: C.bg,
              background: C.accent, padding: "1px 5px", borderRadius: "3px 3px 0 0",
              whiteSpace: "nowrap",
            }}>
              {f.label} {Math.round(f.conf * 100)}%
            </div>
            <div style={{
              position: "absolute", top: "30%", left: "25%",
              width: 3, height: 3, borderRadius: "50%", background: "rgba(0,212,170,0.6)",
            }} />
            <div style={{
              position: "absolute", top: "30%", right: "25%",
              width: 3, height: 3, borderRadius: "50%", background: "rgba(0,212,170,0.6)",
            }} />
          </div>
        );
      })}
      {faces.length === 0 && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          color: C.textDim, fontSize: 11, fontFamily: mono,
        }}>
          {scenario === "dark" ? "LOW LIGHT" : scenario === "noise" ? "NOISE" : "NO FACE"}
        </div>
      )}
      <div style={{
        position: "absolute", bottom: 4, right: 6, fontSize: 9,
        fontFamily: mono, color: faces.length > 0 ? C.accent : C.textDim,
      }}>
        {faces.length > 0 ? `${faces.length} DETECTED` : "SCANNING"}
      </div>
      <div style={{
        position: "absolute", top: 4, left: 6, width: 6, height: 6,
        borderRadius: "50%", background: faces.length > 0 ? C.success : C.textDim,
        boxShadow: faces.length > 0 ? `0 0 6px ${C.success}` : "none",
      }} />
    </div>
  );
}

function AudioWaveform({ history, threshold }) {
  const svgW = 280, svgH = 48;
  const maxBars = 60;
  const bars = history.slice(-maxBars);
  const barW = svgW / maxBars;
  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", height: 48 }}>
      <line x1={0} y1={svgH * (1 - threshold)} x2={svgW} y2={svgH * (1 - threshold)}
        stroke={C.warm} strokeWidth={0.5} strokeDasharray="3 3" opacity={0.5} />
      {bars.map((v, i) => {
        const barH = Math.max(1, v * svgH);
        const above = v > threshold;
        return (
          <rect key={i} x={i * barW} y={svgH - barH} width={barW - 1} height={barH}
            rx={1} fill={above ? C.warm : C.textDim} opacity={above ? 0.9 : 0.4} />
        );
      })}
    </svg>
  );
}

function EventLog({ events }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events.length]);
  return (
    <div ref={ref} style={{
      height: 180, overflowY: "auto", fontSize: 11, fontFamily: mono,
      lineHeight: 1.6, color: C.textMuted,
    }}>
      {events.length === 0 && <div style={{ color: C.textDim, padding: 8 }}>Waiting for events...</div>}
      {events.map((ev, i) => {
        const colors = {
          face_detected: C.accent, sound_detected: C.warm,
          button_trigger: C.amber, motion_trigger: C.danger,
          environment_update: C.textDim,
        };
        const c = colors[ev.type] || C.textMuted;
        return (
          <div key={i} style={{ display: "flex", gap: 8, padding: "1px 0" }}>
            <span style={{ color: C.textDim, minWidth: 44 }}>{ev.time}</span>
            <span style={{
              color: c, minWidth: 120,
              fontWeight: ev.type === "environment_update" ? 400 : 500,
            }}>{ev.type}</span>
            <span style={{ color: C.textDim, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.detail}</span>
          </div>
        );
      })}
    </div>
  );
}

function AccelViz({ ax, ay, az }) {
  const mag = Math.sqrt(ax * ax + ay * ay + az * az);
  const isShake = mag > 1500;
  const norm = Math.min(mag / 3000, 1);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{
        width: 44, height: 44, borderRadius: "50%",
        border: `1.5px solid ${isShake ? C.danger : C.border}`,
        background: isShake ? "rgba(255,71,87,0.1)" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative", transition: "all 0.2s",
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%", background: isShake ? C.danger : C.blue,
          transform: `translate(${(ax / 2048) * 14}px, ${(ay / 2048) * 14}px)`,
          transition: "transform 0.15s",
          boxShadow: isShake ? `0 0 8px ${C.danger}` : "none",
        }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", gap: 12, fontSize: 10, fontFamily: mono, color: C.textDim, marginBottom: 4 }}>
          <span>X:{ax}</span><span>Y:{ay}</span><span>Z:{az}</span>
        </div>
        <MiniBar value={norm} color={isShake ? C.danger : C.blue} />
        <div style={{ fontSize: 9, fontFamily: mono, color: isShake ? C.danger : C.textDim, marginTop: 2 }}>
          {Math.round(mag)} mg {isShake ? "SHAKE" : ""}
        </div>
      </div>
    </div>
  );
}

function ScenarioSelector({ label, options, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 10, fontFamily: mono, color: C.textDim, minWidth: 48 }}>{label}</span>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)} style={{
            fontSize: 10, fontFamily: mono, padding: "3px 8px", borderRadius: 4,
            border: `1px solid ${o === value ? C.accent : C.border}`,
            background: o === value ? C.accentDim : "transparent",
            color: o === value ? C.accent : C.textMuted,
            cursor: "pointer", transition: "all 0.15s",
          }}>{o}</button>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [camScenario, setCamScenario] = useState("single_face");
  const [micScenario, setMicScenario] = useState("doorbell");
  const [mbScenario, setMbScenario] = useState("idle");
  const [mbData, setMbData] = useState({ temp: 22, light: 128, ax: 0, ay: 0, az: -1024, btnA: false, btnB: false, gesture: null });
  const [faces, setFaces] = useState([]);
  const [audioHistory, setAudioHistory] = useState([]);
  const [currentRMS, setCurrentRMS] = useState(0);
  const [soundType, setSoundType] = useState(null);
  const [events, setEvents] = useState([]);
  const [counts, setCounts] = useState({ face: 0, sound: 0, button: 0, motion: 0, env: 0 });
  const intervalRef = useRef(null);
  const startRef = useRef(0);
  const lastFaceRef = useRef(0);
  const lastSoundRef = useRef(0);

  const addEvent = useCallback((type, detail) => {
    const t = (performance.now() - startRef.current) / 1000;
    const time = t.toFixed(1) + "s";
    setEvents(prev => {
      const next = [...prev, { type, detail, time }];
      return next.length > 200 ? next.slice(-200) : next;
    });
    setCounts(prev => {
      const key = { face_detected: "face", sound_detected: "sound", button_trigger: "button", motion_trigger: "motion", environment_update: "env" }[type];
      return key ? { ...prev, [key]: prev[key] + 1 } : prev;
    });
  }, []);

  const tick = useCallback(() => {
    const now = performance.now();
    const t = (now - startRef.current) / 1000;
    setElapsed(t);

    const mb = generateMicrobitReading(mbScenario, t);
    setMbData(mb);
    addEvent("environment_update", `temp=${mb.temp} light=${mb.light}`);
    if (mb.btnA) addEvent("button_trigger", "button=A");
    if (mb.gesture === "shake") addEvent("motion_trigger", `gesture=shake mag=${Math.round(Math.sqrt(mb.ax ** 2 + mb.ay ** 2 + mb.az ** 2))}`);

    const detectedFaces = generateFaceDetected(camScenario, t);
    setFaces(detectedFaces);
    if (detectedFaces.length > 0 && t - lastFaceRef.current > 1) {
      lastFaceRef.current = t;
      addEvent("face_detected", `faces=${detectedFaces.length} label=${detectedFaces[0].label}`);
    }

    const rms = generateAudioRMS(micScenario, t);
    setCurrentRMS(rms);
    setAudioHistory(prev => {
      const next = [...prev, rms];
      return next.length > 60 ? next.slice(-60) : next;
    });
    const st = classifySound(rms, rms > 0.4 ? 0.85 : rms * 1.5);
    setSoundType(st);
    if (st && t - lastSoundRef.current > 0.5) {
      lastSoundRef.current = t;
      addEvent("sound_detected", `type=${st} rms=${rms.toFixed(3)}`);
    }
  }, [camScenario, micScenario, mbScenario, addEvent]);

  const start = () => {
    setEvents([]);
    setCounts({ face: 0, sound: 0, button: 0, motion: 0, env: 0 });
    setAudioHistory([]);
    setElapsed(0);
    lastFaceRef.current = 0;
    lastSoundRef.current = 0;
    startRef.current = performance.now();
    setRunning(true);
  };
  const stop = () => { setRunning(false); };

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(tick, 500);
      return () => clearInterval(intervalRef.current);
    }
  }, [running, tick]);

  const doorLocked = counts.face === 0;

  return (
    <div style={{
      background: C.bg, color: C.text, fontFamily: sans,
      padding: "20px 16px", borderRadius: 12, minHeight: 400,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 16, flexWrap: "wrap", gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: running ? C.success : C.textDim,
            boxShadow: running ? `0 0 8px ${C.success}` : "none",
          }} />
          <span style={{ fontFamily: mono, fontSize: 15, fontWeight: 700, letterSpacing: "0.04em" }}>
            YOLOHOME
          </span>
          <span style={{ fontFamily: mono, fontSize: 11, color: C.textDim }}>
            Module 1 — Input parser
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: mono, fontSize: 12, color: C.textMuted }}>
            {elapsed.toFixed(1)}s
          </span>
          <button onClick={running ? stop : start} style={{
            fontFamily: mono, fontSize: 11, padding: "6px 16px",
            borderRadius: 5, border: `1px solid ${running ? C.danger : C.accent}`,
            background: running ? "rgba(255,71,87,0.1)" : C.accentDim,
            color: running ? C.danger : C.accent,
            cursor: "pointer", fontWeight: 500,
          }}>
            {running ? "STOP" : "START"}
          </button>
        </div>
      </div>

      <div style={{
        display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap",
        padding: "10px 12px", background: C.panel, borderRadius: 8,
        border: `1px solid ${C.border}`,
      }}>
        <ScenarioSelector label="CAM" options={SCENARIOS.camera} value={camScenario} onChange={v => { setCamScenario(v); setFaces([]); }} />
        <div style={{ width: 1, background: C.border, margin: "0 6px" }} />
        <ScenarioSelector label="MIC" options={SCENARIOS.mic} value={micScenario} onChange={v => { setMicScenario(v); setAudioHistory([]); }} />
        <div style={{ width: 1, background: C.border, margin: "0 6px" }} />
        <ScenarioSelector label="MB" options={SCENARIOS.microbit} value={mbScenario} onChange={setMbScenario} />
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 8, marginBottom: 14,
      }}>
        {[
          { label: "FACES", value: counts.face, accent: C.accent },
          { label: "SOUNDS", value: counts.sound, accent: C.warm },
          { label: "BUTTONS", value: counts.button, accent: C.amber },
          { label: "MOTION", value: counts.motion, accent: C.danger },
          { label: "DOOR", value: doorLocked ? "LOCKED" : "OPEN", accent: doorLocked ? C.textDim : C.success },
        ].map(m => (
          <div key={m.label} style={{
            background: C.panel, borderRadius: 8, padding: "10px 12px",
            border: `1px solid ${C.border}`, textAlign: "center",
          }}>
            <div style={{ fontSize: 9, fontFamily: mono, color: C.textDim, marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: mono, color: m.accent }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10,
      }}>
        <Panel title="Camera feed" icon="◉" accent={C.accent}>
          <CameraView faces={faces} scenario={camScenario} isDark={camScenario === "dark"} />
        </Panel>

        <Panel title="Audio input" icon="◈" accent={C.warm}>
          <AudioWaveform history={audioHistory} threshold={0.05} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <Metric label="RMS" value={currentRMS.toFixed(3)} accent={currentRMS > 0.05 ? C.warm : C.textDim} />
            <Metric label="TYPE" value={soundType || "—"} accent={soundType ? C.warm : C.textDim} />
            <Metric label="PEAK" value={(currentRMS * 1.5).toFixed(2)} accent={C.textMuted} />
          </div>
        </Panel>

        <Panel title="Micro:bit sensors" icon="◆" accent={C.blue}>
          <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
            <Metric label="TEMP" value={mbData.temp.toFixed(1)} unit="°C" accent={C.blue} />
            <Metric label="LIGHT" value={mbData.light} unit="/255" accent={C.amber} />
          </div>
          <AccelViz ax={mbData.ax} ay={mbData.ay} az={mbData.az} />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {["A", "B"].map(b => {
              const pressed = b === "A" ? mbData.btnA : mbData.btnB;
              return (
                <div key={b} style={{
                  flex: 1, textAlign: "center", padding: "4px 0",
                  borderRadius: 4, fontSize: 10, fontFamily: mono, fontWeight: 500,
                  border: `1px solid ${pressed ? C.amber : C.border}`,
                  background: pressed ? C.amberDim : "transparent",
                  color: pressed ? C.amber : C.textDim,
                  transition: "all 0.15s",
                }}>
                  BTN {b} {pressed ? "▼" : ""}
                </div>
              );
            })}
            <div style={{
              flex: 1, textAlign: "center", padding: "4px 0",
              borderRadius: 4, fontSize: 10, fontFamily: mono, fontWeight: 500,
              border: `1px solid ${mbData.gesture ? C.danger : C.border}`,
              background: mbData.gesture ? "rgba(255,71,87,0.1)" : "transparent",
              color: mbData.gesture ? C.danger : C.textDim,
            }}>
              {mbData.gesture?.toUpperCase() || "IDLE"}
            </div>
          </div>
        </Panel>

        <Panel title="Event log" icon="◇" accent={C.textMuted}>
          <EventLog events={events} />
        </Panel>
      </div>

      <div style={{
        display: "flex", gap: 10, fontSize: 10, fontFamily: mono,
        color: C.textDim, justifyContent: "center", marginTop: 6,
      }}>
        <span>Events: {events.length}</span>
        <span>·</span>
        <span>MQTT: {counts.face + counts.sound + counts.button + counts.motion + counts.env * 2}</span>
        <span>·</span>
        <span>Interval: 500ms</span>
      </div>
    </div>
  );
}
