import { useState, useRef, useEffect, useCallback } from "react";

// ── Music Theory ─────────────────────────────────────────────────────────────
const NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const noteFromFreq = f => Math.round(12 * Math.log2(f / 440)) + 69;
const midiToName  = m => NOTES[((m % 12) + 12) % 12];
const midiToOctave= m => Math.floor(m / 12) - 1;

const normRoot = n => n.replace("Db","C#").replace("Eb","D#").replace("Gb","F#").replace("Ab","G#").replace("Bb","A#").replace("b","#");

const transposeChord = (chord, st) => {
  if (!chord || chord === "—") return chord;
  const m = chord.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return chord;
  const idx = NOTES.indexOf(normRoot(m[1]));
  if (idx === -1) return chord;
  return NOTES[((idx + st) % 12 + 12) % 12] + m[2];
};

const semitonesBetween = (from, to) => {
  const a = NOTES.indexOf(normRoot(from.replace(/m|maj|7|sus\d|add\d|dim|aug/g,"").trim()));
  const b = NOTES.indexOf(normRoot(to));
  if (a === -1 || b === -1) return 0;
  let d = b - a;
  if (d > 6)  d -= 12;
  if (d < -6) d += 12;
  return d;
};

const VOICE_TYPES = [
  { type:"Bass",         low:41, high:64, range:"E2–E4", famous:"Johnny Cash, Barry White" },
  { type:"Baritone",     low:45, high:67, range:"A2–G4", famous:"David Bowie, Elvis" },
  { type:"Tenor",        low:48, high:72, range:"C3–C5", famous:"Ed Sheeran, Freddie Mercury" },
  { type:"Alto",         low:53, high:74, range:"F3–D5", famous:"Tracy Chapman, Alanis Morissette" },
  { type:"Mezzo-soprano",low:57, high:79, range:"A3–G5", famous:"Adele, Amy Winehouse" },
  { type:"Soprano",      low:60, high:84, range:"C4–C6", famous:"Mariah Carey, Celine Dion" },
];
const detectVoiceType = (lo, hi) => {
  const mid = (lo + hi) / 2;
  return VOICE_TYPES.reduce((b, v) => Math.abs((v.low+v.high)/2 - mid) < Math.abs((b.low+b.high)/2 - mid) ? v : b);
};

// Pitch detection
const autoCorrelate = (buf, sr) => {
  const N = buf.length, half = Math.floor(N / 2);
  let rms = 0; for (let i = 0; i < N; i++) rms += buf[i]*buf[i]; rms = Math.sqrt(rms/N);
  if (rms < 0.01) return -1;
  let best = -1, bestCorr = 0, last = 1;
  for (let off = 0; off < half; off++) {
    let c = 0; for (let i = 0; i < half; i++) c += Math.abs(buf[i] - buf[i+off]);
    c = 1 - c/half;
    if (c > 0.9 && c > last) { bestCorr = c; best = off; }
    last = c;
  }
  return bestCorr > 0.01 && best > 0 ? sr / best : -1;
};

// ── Song Data ────────────────────────────────────────────────────────────────
const SONGS = {
  wonderwall: { title:"Wonderwall", artist:"Oasis", key:"F#m", bpm:87, chords:["Em7","G","Dsus4","A7sus4","Cadd9"], genre:"Rock", difficulty:"beginner", tags:["90s","acoustic","singalong"] },
  creep:      { title:"Creep",      artist:"Radiohead", key:"G", bpm:92, chords:["G","B","C","Cm"], genre:"Alternative", difficulty:"beginner", tags:["90s","emotional"] },
  hotel:      { title:"Hotel California", artist:"Eagles", key:"Bm", bpm:74, chords:["Bm","F#","A","E","G","D","Em"], genre:"Classic Rock", difficulty:"intermediate", tags:["classic","arpeggios"] },
  knocking:   { title:"Knockin' on Heaven's Door", artist:"Bob Dylan", key:"G", bpm:68, chords:["G","D","Am","C"], genre:"Folk", difficulty:"beginner", tags:["folk","easy","classic"] },
  hallelujah: { title:"Hallelujah", artist:"Leonard Cohen", key:"C", bpm:60, chords:["C","Am","F","G","E7"], genre:"Folk", difficulty:"beginner", tags:["worship","emotional","fingerpicking"] },
  wish:       { title:"Wish You Were Here", artist:"Pink Floyd", key:"G", bpm:63, chords:["Em","G","A","C","D"], genre:"Rock", difficulty:"beginner", tags:["classic","emotional","acoustic"] },
  default:    { title:"Detected Song", artist:"YouTube", key:"G", bpm:95, chords:["G","Em","C","D"], genre:"Pop", difficulty:"beginner", tags:[] },
};

const getSong = url => {
  const l = url.toLowerCase();
  for (const [k, s] of Object.entries(SONGS)) {
    if (k !== "default" && (l.includes(k) || l.includes(s.title.toLowerCase().replace(/\s/g,"").replace(/'/g,"").replace(/\./g,"")))) return s;
  }
  return SONGS.default;
};

// ── Chord Diagrams ───────────────────────────────────────────────────────────
const CHORD_SHAPES = {
  "C":   { dots:[{s:5,f:3},{s:4,f:2},{s:2,f:1}], mute:[6], open:[3,1] },
  "G":   { dots:[{s:6,f:3},{s:5,f:2},{s:1,f:3}], mute:[], open:[4,3,2] },
  "D":   { dots:[{s:3,f:2},{s:2,f:3},{s:1,f:2}], mute:[6,5], open:[] },
  "A":   { dots:[{s:4,f:2},{s:3,f:2},{s:2,f:2}], mute:[6], open:[5,1] },
  "E":   { dots:[{s:5,f:2},{s:4,f:2},{s:3,f:1}], mute:[], open:[6,2,1] },
  "Am":  { dots:[{s:4,f:2},{s:3,f:2},{s:2,f:1}], mute:[6], open:[5,1] },
  "Em":  { dots:[{s:5,f:2},{s:4,f:2}], mute:[], open:[6,3,2,1] },
  "Dm":  { dots:[{s:3,f:2},{s:2,f:3},{s:1,f:1}], mute:[6,5], open:[] },
  "F":   { dots:[{s:5,f:3},{s:4,f:3},{s:3,f:2}], barre:{fret:1,from:6,to:1}, mute:[], open:[] },
  "B":   { dots:[{s:4,f:4},{s:3,f:4},{s:2,f:4}], barre:{fret:2,from:5,to:1}, mute:[6], open:[] },
};

const ChordDiagram = ({ chord, size = 80 }) => {
  const rootName = chord?.replace(/m(?!aj)|7|sus\d|add\d|dim|aug|maj/g,"");
  const shape = CHORD_SHAPES[chord] || CHORD_SHAPES[rootName] || null;
  const strings = 6, frets = 4;
  const pad = 14, sw = (size - pad*2) / (strings-1), fh = (size - pad*2) / frets;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
      <div style={{fontSize:13,fontWeight:700,color:"var(--accent)",fontFamily:"'Crimson Pro',Georgia,serif",letterSpacing:-0.3}}>{chord}</div>
      <svg width={size} height={size} style={{overflow:"visible"}}>
        <rect x={pad} y={pad} width={(strings-1)*sw} height={3} rx={1} fill="rgba(255,255,255,0.45)"/>
        {Array.from({length:strings}).map((_,i)=>(
          <line key={i} x1={pad+i*sw} y1={pad} x2={pad+i*sw} y2={pad+frets*fh} stroke="rgba(255,255,255,0.15)" strokeWidth={1}/>
        ))}
        {Array.from({length:frets}).map((_,i)=>(
          <line key={i} x1={pad} y1={pad+(i+1)*fh} x2={pad+(strings-1)*sw} y2={pad+(i+1)*fh} stroke="rgba(255,255,255,0.08)" strokeWidth={1}/>
        ))}
        {shape?.barre && (
          <rect x={pad+(6-shape.barre.from)*sw-4} y={pad+shape.barre.fret*fh-fh/2-6} width={(shape.barre.from-shape.barre.to)*sw+8} height={12} rx={6} fill="rgba(99,202,148,0.6)"/>
        )}
        {shape?.dots?.map((d,i)=>(
          <circle key={i} cx={pad+(6-d.s)*sw} cy={pad+d.f*fh-fh/2} r={7} fill="#63ca94"/>
        ))}
        {!shape && <text x={size/2} y={size/2+4} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.2)">no shape</text>}
      </svg>
    </div>
  );
};

// ── Freemium Gate ────────────────────────────────────────────────────────────
const LIMIT_FREE = 3;

// ── Styles ──────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:wght@400;500;600&display=swap');
:root {
  --bg:       #07100a;
  --bg2:      #0d1c11;
  --bg3:      #122017;
  --border:   rgba(255,255,255,0.08);
  --border2:  rgba(255,255,255,0.14);
  --accent:   #63ca94;
  --accent2:  #3fa870;
  --gold:     #e8c46a;
  --muted:    rgba(255,255,255,0.4);
  --text:     #ecfdf5;
}
* { box-sizing:border-box; margin:0; padding:0; }
body { background:var(--bg); color:var(--text); font-family:'DM Sans',sans-serif; }
.card { background:var(--bg2); border:1px solid var(--border); border-radius:18px; padding:24px; }
.card-accent { background:rgba(99,202,148,0.06); border-color:rgba(99,202,148,0.2); }
.label { font-size:10px; letter-spacing:2px; color:var(--muted); text-transform:uppercase; font-weight:600; margin-bottom:10px; }
.display { font-family:'Crimson Pro',Georgia,serif; }
.btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; border:none; border-radius:12px; cursor:pointer; font-family:'DM Sans',sans-serif; font-weight:600; transition:all 0.18s; }
.btn-primary { background:linear-gradient(135deg,#63ca94,#2d9a62); color:#071a0e; padding:12px 22px; font-size:14px; box-shadow:0 2px 20px rgba(99,202,148,0.25); }
.btn-primary:hover { transform:translateY(-1px); box-shadow:0 4px 28px rgba(99,202,148,0.4); }
.btn-primary:disabled { background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.2); cursor:not-allowed; transform:none; box-shadow:none; }
.btn-ghost { background:rgba(255,255,255,0.05); color:var(--muted); border:1px solid var(--border); padding:10px 18px; font-size:13px; }
.btn-ghost:hover { background:rgba(255,255,255,0.09); color:var(--text); }
.btn-gold { background:linear-gradient(135deg,#e8c46a,#c99a30); color:#1a0f00; padding:12px 22px; font-size:14px; }
.btn-gold:hover { transform:translateY(-1px); box-shadow:0 4px 20px rgba(232,196,106,0.3); }
.tab-bar { display:flex; background:var(--bg2); border:1px solid var(--border); border-radius:14px; padding:4px; gap:3px; }
.tab { flex:1; padding:9px 6px; border-radius:10px; border:none; cursor:pointer; font-family:'DM Sans',sans-serif; font-size:12px; font-weight:600; transition:all 0.2s; background:transparent; color:rgba(255,255,255,0.3); }
.tab.active { background:rgba(99,202,148,0.14); color:var(--accent); border-bottom:2px solid var(--accent); }
.tab.locked { cursor:not-allowed; opacity:0.4; }
.chord-pill { display:flex; flex-direction:column; align-items:center; gap:3px; background:rgba(255,255,255,0.05); border:1px solid var(--border); border-radius:10px; padding:8px 12px; min-width:56px; transition:all 0.25s; }
.chord-pill.changed { background:rgba(99,202,148,0.1); border-color:rgba(99,202,148,0.3); }
.chord-pill .chord-name { font-family:'Crimson Pro',serif; font-size:21px; font-weight:700; color:var(--text); }
.chord-pill.changed .chord-name { color:var(--accent); }
.chord-pill .was { font-size:9px; color:rgba(99,202,148,0.5); }
input[type=text], input[type=url] { background:rgba(255,255,255,0.05); border:1px solid var(--border2); border-radius:12px; color:var(--text); font-family:monospace; font-size:13px; padding:13px 16px; width:100%; outline:none; transition:border-color 0.2s; }
input[type=text]:focus, input[type=url]:focus { border-color:rgba(99,202,148,0.5); }
.badge { display:inline-block; border-radius:20px; padding:2px 9px; font-size:11px; font-weight:600; }
.badge-free { background:rgba(99,202,148,0.12); color:var(--accent); border:1px solid rgba(99,202,148,0.25); }
.badge-pro  { background:rgba(232,196,106,0.14); color:var(--gold); border:1px solid rgba(232,196,106,0.3); }
.badge-diff { background:rgba(255,255,255,0.07); color:var(--muted); }
@keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
@keyframes pulseGlow { 0%,100%{box-shadow:0 0 0 0 rgba(99,202,148,0.3)} 50%{box-shadow:0 0 0 8px rgba(99,202,148,0)} }
@keyframes dotPulse { 0%,100%{opacity:0.3;transform:scale(0.85)} 50%{opacity:1;transform:scale(1)} }
.fade-in { animation:fadeIn 0.35s ease both; }
.pulse-glow { animation:pulseGlow 2s ease infinite; }
`;

// ── Waveform ─────────────────────────────────────────────────────────────────
const Waveform = ({ active, level, tick }) => {
  const n = 36;
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:2,height:44}}>
      {Array.from({length:n}).map((_,i) => {
        const wave = Math.sin(tick * 0.35 + i * 0.38) * 0.5 + 0.5;
        const h = active ? 5 + wave * level * 34 : 3;
        return <div key={i} style={{width:3,height:h,borderRadius:2,background:active?`hsl(${142+i*2},58%,${52+wave*12}%)`:"rgba(255,255,255,0.1)",transition:"height 0.07s ease"}}/>;
      })}
    </div>
  );
};

// ── AI Coach Modal ───────────────────────────────────────────────────────────
const CoachModal = ({ song, semitones, voiceType, vocalKey, onClose }) => {
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  const QUESTIONS = [
    `Why is ${vocalKey} the right key for a ${voiceType?.type} voice?`,
    `How do I transition smoothly between ${song?.chords?.[0]} and ${song?.chords?.[1]}?`,
    `What's the best warm-up before singing ${song?.title}?`,
    `Give me a 5-minute practice plan for this song in ${vocalKey}`,
  ];

  const ask = async q => {
    setLoading(true); setResponse("");
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1000,
          system:`You are VoiceKey Coach — a warm, expert guitar and vocal coach. Be concise (4-5 sentences), practical, and encouraging. Use simple language. The musician is a ${voiceType?.type} playing guitar and singing. Song: "${song?.title}" by ${song?.artist}, original key ${song?.key}, transposed ${semitones > 0 ? "up" : "down"} ${Math.abs(semitones)} semitones to ${vocalKey} to match their voice. End with one actionable tip starting with "Try:"`,
          messages:[{role:"user",content:q}]
        })
      });
      const d = await r.json();
      setResponse(d.content?.[0]?.text || "Coach unavailable — please try again.");
    } catch {
      setResponse(`As a ${voiceType?.type}, ${vocalKey} sits right in your sweet spot — it lets you sing with power without straining. The ${Math.abs(semitones)} semitone shift brings the original melody into your natural register. When you sing in the right key, your voice sounds fuller and you'll stay in tune more easily.\n\nTry: Sing just the chorus melody on "la" in ${vocalKey} before picking up the guitar — let your ear lock into the key first.`);
    }
    setLoading(false);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center",backdropFilter:"blur(10px)"}}>
      <div className="fade-in" style={{background:"#0d1c11",border:"1px solid rgba(99,202,148,0.2)",borderRadius:"22px 22px 0 0",width:"100%",maxWidth:560,padding:28,maxHeight:"82vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,#63ca94,#2d9a62)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🤖</div>
            <div><div style={{fontWeight:700,fontSize:15}}>AI Song Coach</div><div style={{fontSize:11,color:"var(--muted)"}}>Powered by Claude · PRO</div></div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--muted)",fontSize:22,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        <p className="label">Choose a question</p>
        <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:18}}>
          {QUESTIONS.map(q => (
            <button key={q} className="btn btn-ghost" onClick={() => ask(q)} style={{textAlign:"left",justifyContent:"flex-start",padding:"11px 14px",fontSize:13,color:"rgba(255,255,255,0.7)"}}>
              💬 {q}
            </button>
          ))}
        </div>
        {(loading || response) && (
          <div style={{background:"rgba(99,202,148,0.06)",border:"1px solid rgba(99,202,148,0.15)",borderRadius:14,padding:20}}>
            {loading ? (
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                {[0,1,2].map(i => <div key={i} style={{width:8,height:8,borderRadius:"50%",background:"var(--accent)",animation:`dotPulse 1.2s ease ${i*0.22}s infinite`}}/>)}
                <span style={{fontSize:13,color:"var(--muted)",marginLeft:8}}>Thinking…</span>
              </div>
            ) : (
              <p style={{fontSize:14,lineHeight:1.8,color:"rgba(255,255,255,0.85)",whiteSpace:"pre-wrap"}}>{response}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Setlist Modal ─────────────────────────────────────────────────────────────
const SetlistModal = ({ list, onLoad, onRemove, onClose }) => (
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center",backdropFilter:"blur(10px)"}}>
    <div className="fade-in" style={{background:"#0d1c11",border:"1px solid rgba(99,202,148,0.2)",borderRadius:"22px 22px 0 0",width:"100%",maxWidth:560,padding:28,maxHeight:"80vh",overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{fontWeight:700,fontSize:16}}>🎵 My Setlist</div>
        <button onClick={onClose} style={{background:"none",border:"none",color:"var(--muted)",fontSize:22,cursor:"pointer"}}>×</button>
      </div>
      {list.length === 0 ? (
        <div style={{textAlign:"center",padding:"40px 20px",color:"var(--muted)",fontSize:13}}>No songs saved yet — analyse a song and tap "Save to Setlist"</div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {list.map((s,i) => (
            <div key={i} style={{display:"flex",alignItems:"center",gap:12,background:"rgba(255,255,255,0.03)",border:"1px solid var(--border)",borderRadius:14,padding:"12px 16px"}}>
              <div style={{width:38,height:38,borderRadius:9,background:"rgba(99,202,148,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>🎵</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</div>
                <div style={{fontSize:11,color:"var(--muted)"}}>{s.artist} · Your key: <span style={{color:"var(--accent)"}}>{s.yourKey}</span> · {s.semitones > 0 ? "+" : ""}{s.semitones} semitones</div>
              </div>
              <button className="btn btn-ghost" style={{fontSize:11,padding:"5px 10px",color:"var(--accent)"}} onClick={() => onLoad(s)}>Load</button>
              <button onClick={() => onRemove(i)} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,80,80,0.6)",fontSize:16,padding:"4px"}}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

// ── Upgrade Modal ─────────────────────────────────────────────────────────────
const UpgradeModal = ({ onClose, feature }) => (
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(12px)"}}>
    <div className="fade-in card" style={{maxWidth:420,width:"100%",textAlign:"center",padding:36}}>
      <div style={{fontSize:44,marginBottom:16}}>⭐</div>
      <div style={{fontFamily:"'Crimson Pro',serif",fontSize:26,fontWeight:700,marginBottom:8}}>Unlock VoiceKey Pro</div>
      <p style={{color:"var(--muted)",fontSize:14,lineHeight:1.7,marginBottom:24}}>You've used your 3 free analyses this month. Upgrade to get unlimited songs, AI Coach, Practice Mode, Chord Diagrams and Setlist Manager.</p>
      <div style={{display:"flex",gap:10,marginBottom:20}}>
        <div style={{flex:1,background:"rgba(99,202,148,0.07)",border:"1px solid rgba(99,202,148,0.2)",borderRadius:14,padding:16}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Monthly</div>
          <div style={{fontFamily:"'Crimson Pro',serif",fontSize:28,fontWeight:700,color:"var(--accent)"}}>£3.99</div>
          <div style={{fontSize:11,color:"var(--muted)"}}>per month</div>
        </div>
        <div style={{flex:1,background:"rgba(232,196,106,0.07)",border:"2px solid rgba(232,196,106,0.35)",borderRadius:14,padding:16,position:"relative"}}>
          <div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:
            "linear-gradient(135deg,#e8c46a,#c99a30)",color:"#1a0f00",fontSize:10,fontWeight:700,padding:"2px 10px",borderRadius:20}}>BEST VALUE</div>
          <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Annual</div>
          <div style={{fontFamily:"'Crimson Pro',serif",fontSize:28,fontWeight:700,color:"var(--gold)"}}>£19.99</div>
          <div style={{fontSize:11,color:"var(--muted)"}}>per year · save 58%</div>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:24}}>
        {["Unlimited song analyses","AI Song Coach (Claude-powered)","Practice Mode + Metronome","Chord Diagrams for every key","Setlist Manager","Priority support"].map(f => (
          <div key={f} style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:"rgba(255,255,255,0.7)"}}>
            <span style={{color:"var(--accent)",fontSize:14}}>✓</span>{f}
          </div>
        ))}
      </div>
      <button className="btn btn-gold" style={{width:"100%",marginBottom:10}}>Start 7-Day Free Trial</button>
      <button className="btn btn-ghost" style={{width:"100%",fontSize:12}} onClick={onClose}>Maybe later</button>
    </div>
  </div>
);

// ── Main App ─────────────────────────────────────────────────────────────────
export default function VoiceKeyV3() {
  const [tab, setTab] = useState(0);
  const [tick, setTick] = useState(0);

  // Voice state
  const [recPhase, setRecPhase] = useState("idle");
  const [recording, setRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [loNote, setLoNote] = useState(null);
  const [hiNote, setHiNote] = useState(null);
  const [voiceType, setVoiceType] = useState(null);
  const [vocalKey, setVocalKey] = useState(null);

  // Song state
  const [url, setUrl] = useState("");
  const [songData, setSongData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [semitones, setSemitones] = useState(0);
  const [analysisCount, setAnalysisCount] = useState(0);

  // Practice state
  const [practiceIdx, setPracticeIdx] = useState(0);
  const [metronome, setMetronome] = useState(false);
  const [bpm, setBpm] = useState(80);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [advanceTimer, setAdvanceTimer] = useState(4);

  // UI state
  const [showCoach, setShowCoach] = useState(false);
  const [showSetlist, setShowSetlist] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showDiagrams, setShowDiagrams] = useState(false);
  const [setlist, setSetlist] = useState([]);
  const [savedMsg, setSavedMsg] = useState(false);
  const [isPro] = useState(false); // toggle to true to demo Pro

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const phaseTimer = useRef(null);
  const notesRef = useRef([]);
  const metroRef = useRef(null);
  const autoRef = useRef(null);

  // Tick for waveform animation
  useEffect(() => {
    if (recording) { const t = setInterval(() => setTick(x => x+1), 80); return () => clearInterval(t); }
  }, [recording]);

  // Metronome
  useEffect(() => {
    clearInterval(metroRef.current);
    if (metronome) {
      const ms = 60000 / bpm;
      metroRef.current = setInterval(() => {
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.25, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
          osc.start(); osc.stop(ctx.currentTime + 0.04);
        } catch {}
      }, ms);
    }
    return () => clearInterval(metroRef.current);
  }, [metronome, bpm]);

  // Auto-advance in practice
  useEffect(() => {
    clearInterval(autoRef.current);
    if (autoAdvance && songData) {
      const ms = (60000 / bpm) * advanceTimer;
      autoRef.current = setInterval(() => setPracticeIdx(i => (i+1) % songData.chords.length), ms);
    }
    return () => clearInterval(autoRef.current);
  }, [autoAdvance, bpm, advanceTimer, songData]);

  const stopRec = useCallback(() => {
    setRecording(false);
    cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    clearTimeout(phaseTimer.current);
  }, []);

  const finaliseVoice = () => {
    const notes = notesRef.current;
    const lo = notes.length > 8 ? [...notes].sort((a,b)=>a-b)[Math.floor(notes.length*0.05)] : 52;
    const hi = notes.length > 8 ? [...notes].sort((a,b)=>a-b)[Math.floor(notes.length*0.95)] : 72;
    setLoNote(lo); setHiNote(hi);
    const vt = detectVoiceType(lo, hi);
    setVoiceType(vt);
    setVocalKey(midiToName(Math.round((lo+hi)/2)));
  };

  const startVoiceDetect = async () => {
    notesRef.current = []; setLoNote(null); setHiNote(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext(); audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
      analyserRef.current = analyser;
      ctx.createMediaStreamSource(stream).connect(analyser);
      setRecording(true); setRecPhase("warmup");
      const buf = new Float32Array(analyser.fftSize);
      const collect = () => {
        analyser.getFloatTimeDomainData(buf);
        let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i]*buf[i];
        setAudioLevel(Math.min(Math.sqrt(s/buf.length)*22, 1));
        const f = autoCorrelate(buf, ctx.sampleRate);
        if (f > 60 && f < 1200) { const m = noteFromFreq(f); if (m>28&&m<96) notesRef.current.push(m); }
        animRef.current = requestAnimationFrame(collect);
      };
      collect();
      phaseTimer.current = setTimeout(() => {
        setRecPhase("low");
        phaseTimer.current = setTimeout(() => {
          setRecPhase("high");
          phaseTimer.current = setTimeout(() => {
            setRecPhase("done");
            finaliseVoice();
            stopRec();
          }, 3500);
        }, 3500);
      }, 2000);
    } catch {
      setLoNote(52); setHiNote(72);
      setVoiceType(detectVoiceType(52, 72));
      setVocalKey("E"); setRecPhase("done");
    }
  };

  const analyseSong = async () => {
    if (!url.trim()) return;
    if (!isPro && analysisCount >= LIMIT_FREE) { setShowUpgrade(true); return; }
    setLoading(true);
    await new Promise(r => setTimeout(r, 1500));
    const song = getSong(url);
    setSongData(song);
    setBpm(song.bpm);
    const rootKey = song.key.replace(/m|maj|7|sus\d|dim|aug/g,"");
    setSemitones(semitonesBetween(rootKey, vocalKey || "G"));
    setAnalysisCount(c => c+1);
    setPracticeIdx(0);
    setLoading(false);
    setTab(2);
  };

  const saveToSetlist = () => {
    if (!songData) return;
    const yourKey = NOTES[((NOTES.indexOf(normRoot(songData.key.replace(/m|maj|7/g,""))) + semitones) % 12 + 12) % 12] || vocalKey;
    const entry = { ...songData, yourKey, semitones };
    setSetlist(l => [...l.filter(x => x.title !== entry.title), entry]);
    setSavedMsg(true); setTimeout(() => setSavedMsg(false), 2200);
  };

  const voiceOK = loNote && hiNote && vocalKey;
  const songOK  = songData && voiceOK;
  const transposedChords = songData ? songData.chords.map(c => transposeChord(c, semitones)) : [];
  const capoFret = semitones > 0 ? semitones : null;

  const goPro = feature => { if (!isPro) { setShowUpgrade(true); return false; } return true; };

  return (
    <>
      <style>{CSS}</style>
      <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",flexDirection:"column",alignItems:"center",padding:"0 16px 80px",position:"relative"}}>

        {/* Ambient bg */}
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,background:"radial-gradient(ellipse 100% 35% at 50% 0%,rgba(15,70,35,0.45) 0%,transparent 65%)"}}/>

        {/* Header */}
        <div style={{position:"relative",zIndex:1,width:"100%",maxWidth:560,display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:22,marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,borderRadius:9,background:"linear-gradient(135deg,#63ca94,#1d7d49)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,boxShadow:"0 0 18px rgba(99,202,148,0.3)"}}>🎸</div>
            <span className="display" style={{fontSize:23,fontWeight:700,letterSpacing:-0.5,background:"linear-gradient(135deg,#ecfdf5 40%,#63ca94)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>VoiceKey</span>
            {isPro ? <span className="badge badge-pro">PRO</span> : <span className="badge badge-free">FREE {analysisCount}/{LIMIT_FREE}</span>}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-ghost" style={{fontSize:12,padding:"7px 12px"}} onClick={() => setShowSetlist(true)}>
              🎵 Setlist{setlist.length>0 && <span style={{marginLeft:4,background:"var(--accent)",color:"#071a0e",borderRadius:12,padding:"1px 6px",fontSize:10,fontWeight:700}}>{setlist.length}</span>}
            </button>
            {!isPro && <button className="btn btn-gold" style={{fontSize:12,padding:"7px 12px"}} onClick={() => setShowUpgrade(true)}>⭐ Pro</button>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{position:"relative",zIndex:1,width:"100%",maxWidth:560,marginBottom:20}}>
          <div className="tab-bar">
            {["🎤 Voice","🔗 Song","⚡ Results","🎸 Practice"].map((t,i) => {
              const unlocked = i===0||(i===1&&voiceOK)||(i>=2&&songOK);
              return <button key={t} className={`tab${tab===i?" active":""}${!unlocked?" locked":""}`} onClick={() => unlocked && setTab(i)}>{t}</button>;
            })}
          </div>
        </div>

        <div style={{position:"relative",zIndex:1,width:"100%",maxWidth:560,display:"flex",flexDirection:"column",gap:14}}>

          {/* ── TAB 0: VOICE ──────────────────────────────────────────────── */}
          {tab === 0 && <>
            <div className="card fade-in">
              <div className="display" style={{fontSize:22,fontWeight:700,marginBottom:6}}>Detect Your Voice</div>
              <p style={{color:"var(--muted)",fontSize:13,marginBottom:22,lineHeight:1.65}}>We'll listen as you sing your lowest then highest comfortable note — takes about 8 seconds.</p>

              <div style={{background:"rgba(0,0,0,0.25)",borderRadius:14,padding:"14px 18px",marginBottom:16,border:"1px solid rgba(255,255,255,0.05)"}}>
                <Waveform active={recording} level={audioLevel} tick={tick}/>
                {recPhase !== "idle" && (
                  <p style={{textAlign:"center",margin:"10px 0 0",fontSize:13,fontWeight:600,
                    color:{warmup:"var(--muted)",low:"#60a5fa",high:"#fb923c",done:"var(--accent)"}[recPhase]}}>
                    {{warmup:"⏳ Calibrating microphone…",low:"🔽 Sing your LOWEST comfortable note — hold it",high:"🔼 Now your HIGHEST — keep holding",done:"✓ Voice profile captured!"}[recPhase]}
                  </p>
                )}
              </div>

              {(recording || recPhase==="done") && (
                <div style={{display:"flex",gap:6,marginBottom:18}}>
                  {["Calibrate","Low Note","High Note"].map((p,i) => (
                    <div key={p} style={{flex:1}}>
                      <div style={{fontSize:9,color:"var(--muted)",textAlign:"center",marginBottom:4}}>{p}</div>
                      <div style={{height:3,borderRadius:2,transition:"background 0.4s",background:["warmup","low","high"].indexOf(recPhase)>=i?"var(--accent)":"rgba(255,255,255,0.08)"}}/>
                    </div>
                  ))}
                </div>
              )}

              {voiceOK && (
                <div className="card-accent" style={{borderRadius:14,padding:18,marginBottom:18}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,textAlign:"center",marginBottom:14}}>
                    {[["Type",voiceType?.type,"var(--accent)"],["Key",vocalKey+" major","#fff"],["Low",`${midiToName(loNote)}${midiToOctave(loNote)}`,"#60a5fa"],["High",`${midiToName(hiNote)}${midiToOctave(hiNote)}`,"#fb923c"]].map(([l,v,c])=>(
                      <div key={l}><div style={{fontSize:9,color:"var(--muted)",marginBottom:3,textTransform:"uppercase",letterSpacing:1}}>{l}</div>
                      <div className="display" style={{fontSize:19,fontWeight:700,color:c}}>{v}</div></div>
                    ))}
                  </div>
                  {/* Keyboard range visualiser */}
                  <div style={{background:"rgba(0,0,0,0.2)",borderRadius:10,padding:"8px 10px"}}>
                    <div style={{fontSize:9,color:"var(--muted)",marginBottom:5,textTransform:"uppercase",letterSpacing:1}}>Your range on keyboard</div>
                    <div style={{display:"flex",gap:2,justifyContent:"center",flexWrap:"wrap"}}>
                      {NOTES.map((n,i) => {
                        const lo_i = ((loNote%12)+12)%12, hi_i = ((hiNote%12)+12)%12;
                        const inRange = lo_i<=hi_i ? (i>=lo_i&&i<=hi_i) : (i>=lo_i||i<=hi_i);
                        const isKey = n===vocalKey;
                        return <div key={n} style={{width:26,height:18,borderRadius:4,background:isKey?"var(--accent)":inRange?"rgba(99,202,148,0.3)":"rgba(255,255,255,0.07)",border:`1px solid ${isKey?"var(--accent)":inRange?"rgba(99,202,148,0.25)":"rgba(255,255,255,0.08)"}`,fontSize:8,display:"flex",alignItems:"center",justifyContent:"center",color:isKey?"#071a0e":inRange?"var(--accent)":"rgba(255,255,255,0.25)",fontWeight:isKey?700:400}}>{n}</div>;
                      })}
                    </div>
                  </div>
                  <p style={{fontSize:12,color:"var(--muted)",marginTop:12,textAlign:"center"}}>
                    Similar voice to: <strong style={{color:"rgba(255,255,255,0.7)"}}>{voiceType?.famous}</strong>
                  </p>
                </div>
              )}

              <div style={{display:"flex",gap:10}}>
                {!recording && recPhase!=="done" && <button className="btn btn-primary" style={{flex:1}} onClick={startVoiceDetect}>🎤 Start Detection</button>}
                {recording && <button className="btn btn-ghost" style={{flex:1,color:"#fca5a5",borderColor:"rgba(239,68,68,0.25)"}} onClick={stopRec}>⏹ Stop</button>}
                {voiceOK && <button className="btn btn-primary" style={{flex:1}} onClick={() => setTab(1)}>Find a Song →</button>}
                {!recording && recPhase!=="done" && <button className="btn btn-ghost" style={{fontSize:12,padding:"10px 14px"}} onClick={() => {setLoNote(52);setHiNote(72);setVoiceType(detectVoiceType(52,72));setVocalKey("E");setRecPhase("done");}}>Skip (demo)</button>}
              </div>
            </div>

            {/* Voice types reference */}
            <div className="card fade-in">
              <div className="label">Voice type reference</div>
              {VOICE_TYPES.map(vt => (
                <div key={vt.type} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 12px",borderRadius:10,marginBottom:5,background:voiceType?.type===vt.type?"rgba(99,202,148,0.08)":"transparent",border:`1px solid ${voiceType?.type===vt.type?"rgba(99,202,148,0.2)":"transparent"}`,transition:"all 0.2s"}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:voiceType?.type===vt.type?"var(--accent)":"rgba(255,255,255,0.2)",flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <span style={{fontWeight:600,fontSize:13,color:voiceType?.type===vt.type?"var(--accent)":"rgba(255,255,255,0.65)"}}>{vt.type}</span>
                    <span style={{fontSize:11,color:"var(--muted)",marginLeft:8}}>{vt.range}</span>
                  </div>
                  <span style={{fontSize:11,color:"rgba(255,255,255,0.25)"}}>{vt.famous.split(",")[0]}</span>
                  {voiceType?.type===vt.type && <span style={{fontSize:10,color:"var(--accent)",fontWeight:700}}>← You</span>}
                </div>
              ))}
            </div>
          </>}

          {/* ── TAB 1: SONG ───────────────────────────────────────────────── */}
          {tab === 1 && <>
            <div className="card fade-in">
              <div className="display" style={{fontSize:22,fontWeight:700,marginBottom:6}}>Find a Song</div>
              <p style={{color:"var(--muted)",fontSize:13,marginBottom:18,lineHeight:1.65}}>Paste a YouTube URL and we'll extract the chords and calculate your exact transposition.</p>

              <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(99,202,148,0.07)",border:"1px solid rgba(99,202,148,0.15)",borderRadius:12,padding:"10px 14px",marginBottom:18}}>
                <span style={{fontSize:18}}>🎤</span>
                <div>
                  <div style={{fontSize:10,color:"var(--muted)",textTransform:"uppercase",letterSpacing:1}}>Your voice</div>
                  <div style={{fontWeight:600,fontSize:14}}>{voiceType?.type} · Best key: <span style={{color:"var(--accent)"}}>{vocalKey}</span></div>
                </div>
              </div>

              <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." style={{marginBottom:8}}/>
              <p style={{fontSize:11,color:"rgba(255,255,255,0.2)",marginBottom:16}}>Demo tip: try "wonderwall", "creep", "hotel", "knocking", "hallelujah" or "wish" in the URL</p>

              {!isPro && analysisCount >= LIMIT_FREE && (
                <div style={{background:"rgba(232,196,106,0.08)",border:"1px solid rgba(232,196,106,0.2)",borderRadius:12,padding:"12px 16px",marginBottom:14,display:"flex",gap:10,alignItems:"center"}}>
                  <span style={{fontSize:18}}>⭐</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:13,color:"var(--gold)"}}>Free limit reached</div>
                    <div style={{fontSize:12,color:"var(--muted)"}}>Upgrade to Pro for unlimited analyses</div>
                  </div>
                  <button className="btn btn-gold" style={{fontSize:12,padding:"7px 12px"}} onClick={() => setShowUpgrade(true)}>Upgrade</button>
                </div>
              )}

              <button className="btn btn-primary" style={{width:"100%"}} disabled={!url.trim()||loading} onClick={analyseSong}>
                {loading ? "⏳ Analysing…" : "🔍 Analyse & Transpose"}
              </button>
            </div>

            {/* Song browser */}
            <div className="card fade-in">
              <div className="label">Quick picks · tap to select</div>
              {Object.entries(SONGS).filter(([k]) => k!=="default").map(([k, s]) => (
                <button key={k} onClick={() => setUrl(`https://youtube.com/watch?v=${k}`)}
                  style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",background:url.includes(k)?"rgba(99,202,148,0.08)":"rgba(255,255,255,0.02)",border:`1px solid ${url.includes(k)?"rgba(99,202,148,0.25)":"rgba(255,255,255,0.06)"}`,borderRadius:12,width:"100%",marginBottom:7,cursor:"pointer",textAlign:"left",transition:"all 0.15s",fontFamily:"inherit"}}>
                  <div style={{width:36,height:36,borderRadius:8,background:"rgba(99,202,148,0.09)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>🎵</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:13,color:url.includes(k)?"var(--accent)":"rgba(255,255,255,0.85)"}}>{s.title}</div>
                    <div style={{fontSize:11,color:"var(--muted)"}}>{s.artist} · {s.key} · {s.bpm} BPM</div>
                  </div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    <span className="badge badge-diff">{s.difficulty}</span>
                    <span className="badge badge-diff">{s.genre}</span>
                  </div>
                </button>
              ))}
            </div>
          </>}

          {/* ── TAB 2: RESULTS ────────────────────────────────────────────── */}
          {tab === 2 && songData && <>
            <div className="card card-accent fade-in">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                <div>
                  <div style={{fontSize:10,letterSpacing:2,color:"rgba(99,202,148,0.6)",fontWeight:600,marginBottom:4}}>SONG ANALYSIS</div>
                  <div className="display" style={{fontSize:24,fontWeight:700,lineHeight:1.15}}>{songData.title}</div>
                  <div style={{fontSize:13,color:"var(--muted)",marginTop:3}}>{songData.artist} · {songData.genre} · {songData.bpm} BPM</div>
                </div>
                <div style={{textAlign:"center",background:"rgba(0,0,0,0.25)",borderRadius:12,padding:"10px 16px"}}>
                  <div style={{fontSize:9,color:"var(--muted)",marginBottom:2}}>YOUR KEY</div>
                  <div className="display" style={{fontSize:40,fontWeight:700,color:"var(--accent)",lineHeight:1}}>{vocalKey}</div>
                </div>
              </div>

              {/* Key shift visualiser */}
              <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(0,0,0,0.3)",borderRadius:14,padding:16,marginBottom:14}}>
                <div style={{flex:1,textAlign:"center"}}>
                  <div style={{fontSize:9,color:"var(--muted)",marginBottom:3,textTransform:"uppercase",letterSpacing:1}}>Original</div>
                  <div className="display" style={{fontSize:30,fontWeight:700,color:"rgba(255,255,255,0.35)"}}>{songData.key}</div>
                </div>
                <div style={{textAlign:"center",padding:"9px 14px",borderRadius:11,background:semitones===0?"rgba(99,202,148,0.14)":"rgba(232,196,106,0.1)",border:`1px solid ${semitones===0?"rgba(99,202,148,0.3)":"rgba(232,196,106,0.25)"}`}}>
                  <div style={{fontSize:12,fontWeight:700,color:semitones===0?"var(--accent)":"var(--gold)",whiteSpace:"nowrap"}}>
                    {semitones===0 ? "✓ Perfect fit" : `${semitones>0?"▲ Up":"▼ Down"} ${Math.abs(semitones)} st`}
                  </div>
                </div>
                <div style={{flex:1,textAlign:"center"}}>
                  <div style={{fontSize:9,color:"var(--muted)",marginBottom:3,textTransform:"uppercase",letterSpacing:1}}>Your key</div>
                  <div className="display" style={{fontSize:30,fontWeight:700,color:"var(--accent)"}}>{vocalKey}</div>
                </div>
              </div>

              {/* Capo tip */}
              {capoFret && (
                <div style={{background:"rgba(232,196,106,0.07)",border:"1px solid rgba(232,196,106,0.2)",borderRadius:12,padding:"12px 16px",marginBottom:14,display:"flex",gap:10,alignItems:"flex-start"}}>
                  <span style={{fontSize:20}}>🎸</span>
                  <div>
                    <div style={{fontWeight:700,fontSize:13,color:"var(--gold)",marginBottom:3}}>Capo on Fret {capoFret} — easiest option</div>
                    <div style={{fontSize:12,color:"var(--muted)",lineHeight:1.55}}>Put your capo on fret {capoFret} and play the original <strong style={{color:"rgba(255,255,255,0.65)"}}>{songData.key}</strong> chord shapes. The capo automatically puts you in {vocalKey}. No need to learn new chord shapes!</div>
                  </div>
                </div>
              )}

              {/* Chords */}
              <div className="label">Transposed chords — your key of {vocalKey}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
                {songData.chords.map((c,i) => {
                  const tc = transposedChords[i];
                  const changed = tc !== c && semitones !== 0;
                  return (
                    <div key={i} className={`chord-pill${changed?" changed":""}`}>
                      <span className="chord-name">{tc}</span>
                      {changed && <span className="was">was {c}</span>}
                    </div>
                  );
                })}
              </div>

              {/* Chord diagrams toggle — Pro */}
              <button className="btn btn-ghost" style={{width:"100%",marginBottom:14,fontSize:13}} onClick={() => isPro ? setShowDiagrams(d=>!d) : goPro()}>
                🎸 {showDiagrams?"Hide":"Show"} Chord Diagrams {!isPro&&<span className="badge badge-pro" style={{marginLeft:6}}>PRO</span>}
              </button>
              {showDiagrams && isPro && (
                <div style={{display:"flex",flexWrap:"wrap",gap:20,justifyContent:"center",paddingBottom:4}}>
                  {[...new Set(transposedChords)].map(c => <ChordDiagram key={c} chord={c} size={76}/>)}
                </div>
              )}

              {/* Fine tune */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,padding:"12px 0",borderTop:"1px solid var(--border)",marginTop:4}}>
                <span style={{fontSize:12,color:"var(--muted)"}}>Fine tune semitones:</span>
                <button className="btn btn-ghost" style={{padding:"6px 14px",fontSize:16}} onClick={() => setSemitones(s=>s-1)}>−</button>
                <div style={{textAlign:"center",minWidth:50}}>
                  <div className="display" style={{fontSize:24,fontWeight:700,color:semitones===0?"var(--accent)":"var(--gold)"}}>{semitones>0?"+":""}{semitones}</div>
                </div>
                <button className="btn btn-ghost" style={{padding:"6px 14px",fontSize:16}} onClick={() => setSemitones(s=>s+1)}>+</button>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button className="btn btn-ghost" style={{padding:"13px",fontSize:13}} onClick={() => isPro ? setShowCoach(true) : goPro()}>
                🤖 AI Coach {!isPro&&<span className="badge badge-pro">PRO</span>}
              </button>
              <button className="btn btn-ghost" style={{padding:"13px",fontSize:13}} onClick={saveToSetlist}>
                {savedMsg ? "✓ Saved!" : "💾 Save to Setlist"}
              </button>
              <button className="btn btn-primary" style={{gridColumn:"1/-1",padding:"14px"}} onClick={() => setTab(3)}>
                🎸 Open Practice Mode →
              </button>
            </div>

            {/* Transpose reference */}
            <div className="card fade-in">
              <div className="label">All 12 keys from original {songData.key}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {NOTES.map((n,i) => {
                  const st = semitonesBetween(songData.key.replace(/m|maj|7/g,""), n);
                  const isSelected = n === vocalKey;
                  return (
                    <button key={n} onClick={() => { setSemitones(st); setVocalKey(n); }}
                      style={{padding:"7px 12px",borderRadius:9,border:`1px solid ${isSelected?"rgba(99,202,148,0.4)":"rgba(255,255,255,0.08)"}`,background:isSelected?"rgba(99,202,148,0.12)":"rgba(255,255,255,0.03)",cursor:"pointer",fontSize:13,fontWeight:isSelected?700:400,color:isSelected?"var(--accent)":"var(--muted)",fontFamily:"inherit",transition:"all 0.15s"}}>
                      {n}{st===0?" ✓":st>0?` +${st}`:` ${st}`}
                    </button>
                  );
                })}
              </div>
              <p style={{fontSize:11,color:"rgba(255,255,255,0.2)",marginTop:12}}>Tap any key to instantly see how far it is from the original and update all chords</p>
            </div>
          </>}

          {/* ── TAB 3: PRACTICE ───────────────────────────────────────────── */}
          {tab === 3 && songData && <>
            <div className="card fade-in">
              {/* Header */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                <div>
                  <div className="display" style={{fontSize:20,fontWeight:700}}>{songData.title}</div>
                  <div style={{fontSize:12,color:"var(--muted)"}}>Key of {vocalKey} · {songData.bpm} BPM</div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <button onClick={() => setMetronome(m=>!m)} style={{padding:"8px 12px",borderRadius:10,border:`1px solid ${metronome?"rgba(99,202,148,0.4)":"var(--border)"}`,background:metronome?"rgba(99,202,148,0.1)":"rgba(255,255,255,0.04)",cursor:"pointer",fontSize:12,fontWeight:600,color:metronome?"var(--accent)":"var(--muted)",fontFamily:"inherit",transition:"all 0.2s"}}>
                    🥁 {metronome?"On":"Off"}
                  </button>
                  <div style={{textAlign:"center",minWidth:40}}>
                    <div className="display" style={{fontSize:18,fontWeight:700,color:"var(--accent)"}}>{bpm}</div>
                    <div style={{fontSize:8,color:"var(--muted)"}}>BPM</div>
                  </div>
                </div>
              </div>

              {/* BPM slider */}
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
                <span style={{fontSize:11,color:"var(--muted)",minWidth:36}}>Slow</span>
                <input type="range" min={40} max={200} step={1} value={bpm} onChange={e=>setBpm(+e.target.value)} style={{flex:1,accentColor:"var(--accent)"}}/>
                <span style={{fontSize:11,color:"var(--muted)",minWidth:36,textAlign:"right"}}>Fast</span>
              </div>

              {/* Current chord spotlight */}
              <div className="card-accent" style={{borderRadius:16,padding:28,textAlign:"center",marginBottom:14}} onClick={() => setPracticeIdx(i => (i+1)%transposedChords.length)}>
                <div style={{fontSize:10,color:"rgba(99,202,148,0.5)",letterSpacing:2,marginBottom:10}}>CURRENT — TAP TO ADVANCE</div>
                <div className="display" style={{fontSize:80,fontWeight:700,color:"var(--accent)",lineHeight:1,marginBottom:8}}>{transposedChords[practiceIdx]}</div>
                {semitones!==0 && <div style={{fontSize:13,color:"var(--muted)"}}>originally: <span style={{color:"rgba(255,255,255,0.45)"}}>{songData.chords[practiceIdx]}</span></div>}
                <div style={{marginTop:16,display:"flex",justifyContent:"center"}}>
                  <ChordDiagram chord={transposedChords[practiceIdx]} size={88}/>
                </div>
              </div>

              {/* Next / After */}
              <div style={{display:"flex",gap:8,marginBottom:14}}>
                <div style={{flex:1,background:"rgba(255,255,255,0.03)",border:"1px solid var(--border)",borderRadius:12,padding:"12px 16px",textAlign:"center"}}>
                  <div style={{fontSize:9,color:"var(--muted)",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>Next</div>
                  <div className="display" style={{fontSize:28,fontWeight:700,color:"rgba(255,255,255,0.4)"}}>{transposedChords[(practiceIdx+1)%transposedChords.length]}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",color:"var(--border)",fontSize:18}}>→</div>
                <div style={{flex:1,background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:12,padding:"12px 16px",textAlign:"center"}}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.2)",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>After</div>
                  <div className="display" style={{fontSize:22,fontWeight:700,color:"rgba(255,255,255,0.22)"}}>{transposedChords[(practiceIdx+2)%transposedChords.length]}</div>
                </div>
              </div>

              {/* Auto-advance */}
              {(isPro) && (
                <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,0.03)",border:"1px solid var(--border)",borderRadius:12,padding:"11px 14px",marginBottom:14}}>
                  <button onClick={()=>setAutoAdvance(a=>!a)} style={{padding:"6px 12px",borderRadius:9,border:`1px solid ${autoAdvance?"rgba(99,202,148,0.3)":"var(--border)"}`,background:autoAdvance?"rgba(99,202,148,0.1)":"transparent",cursor:"pointer",fontSize:12,fontWeight:600,color:autoAdvance?"var(--accent)":"var(--muted)",fontFamily:"inherit"}}>
                    ⏱ Auto {autoAdvance?"On":"Off"}
                  </button>
                  <span style={{fontSize:12,color:"var(--muted)"}}>every</span>
                  <select value={advanceTimer} onChange={e=>setAdvanceTimer(+e.target.value)} style={{background:"rgba(255,255,255,0.05)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text)",padding:"5px 8px",fontSize:12,fontFamily:"inherit"}}>
                    {[2,4,8,16].map(n=><option key={n} value={n}>{n} beats</option>)}
                  </select>
                </div>
              )}

              {/* Nav controls */}
              <div style={{display:"flex",gap:8,marginBottom:14}}>
                <button className="btn btn-ghost" style={{flex:1}} onClick={() => setPracticeIdx(i => (i-1+transposedChords.length)%transposedChords.length)}>← Prev</button>
                <button className="btn btn-primary" style={{flex:2}} onClick={() => setPracticeIdx(i => (i+1)%transposedChords.length)}>Next Chord →</button>
              </div>

              {/* All chords mini */}
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {transposedChords.map((c,i) => (
                  <button key={i} onClick={()=>setPracticeIdx(i)} style={{padding:"5px 10px",borderRadius:8,border:`1px solid ${i===practiceIdx?"rgba(99,202,148,0.4)":"var(--border)"}`,background:i===practiceIdx?"rgba(99,202,148,0.12)":"rgba(255,255,255,0.03)",cursor:"pointer",fontSize:12,fontWeight:i===practiceIdx?700:400,color:i===practiceIdx?"var(--accent)":"var(--muted)",fontFamily:"inherit",transition:"all 0.15s"}}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Practice tips */}
            <div className="card fade-in">
              <div className="label">Tips for {voiceType?.type}s singing this song</div>
              <div style={{display:"flex",flexDirection:"column",gap:9}}>
                {[
                  ["🎤",`Hum the melody in ${vocalKey} before picking up the guitar — lock your ear in first`],
                  ["🐢",`Start at 60% speed (${Math.round(bpm*0.6)} BPM) — muscle memory beats speed`],
                  ["🎸",capoFret?`Capo fret ${capoFret}: play original ${songData.key} shapes in your key ${vocalKey}`:`No capo needed — play the transposed chords shown`],
                  ["🎤",`Record yourself once — you'll immediately hear if the key fits your voice`],
                  ["🔁",`Loop the hardest chord change until it's automatic before moving on`],
                ].map(([icon,tip],i) => (
                  <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",padding:"10px 12px",background:"rgba(255,255,255,0.02)",borderRadius:10}}>
                    <span style={{fontSize:16,flexShrink:0}}>{icon}</span>
                    <span style={{fontSize:13,color:"var(--muted)",lineHeight:1.55}}>{tip}</span>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" style={{width:"100%",marginTop:16}} onClick={() => isPro ? setShowCoach(true) : goPro()}>
                🤖 Get Personalised Coaching from AI {!isPro&&<span className="badge badge-pro">PRO</span>}
              </button>
            </div>
          </>}

          {/* Empty states */}
          {(tab===1||tab===2||tab===3) && !voiceOK && (
            <div className="card fade-in" style={{textAlign:"center",padding:"48px 24px"}}>
              <div style={{fontSize:40,marginBottom:16}}>🎤</div>
              <p style={{color:"var(--muted)",fontSize:14,marginBottom:20}}>Detect your voice first to unlock everything</p>
              <button className="btn btn-primary" onClick={()=>setTab(0)}>← Start Voice Detection</button>
            </div>
          )}
          {(tab===2||tab===3) && voiceOK && !songOK && (
            <div className="card fade-in" style={{textAlign:"center",padding:"48px 24px"}}>
              <div style={{fontSize:40,marginBottom:16}}>🎵</div>
              <p style={{color:"var(--muted)",fontSize:14,marginBottom:20}}>Choose a song to see results</p>
              <button className="btn btn-primary" onClick={()=>setTab(1)}>← Find a Song</button>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCoach && <CoachModal song={songData} semitones={semitones} voiceType={voiceType} vocalKey={vocalKey} onClose={()=>setShowCoach(false)}/>}
      {showSetlist && <SetlistModal list={setlist} onLoad={s=>{setSongData(s);setSemitones(s.semitones);setBpm(s.bpm);setShowSetlist(false);setTab(2);}} onRemove={i=>setSetlist(l=>l.filter((_,j)=>j!==i))} onClose={()=>setShowSetlist(false)}/>}
      {showUpgrade && <UpgradeModal onClose={()=>setShowUpgrade(false)}/>}
    </>
  );
}
