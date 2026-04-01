import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import './App.css';

const supabase = createClient(
  'https://vlaxnupgdviexicirfcq.supabase.co',
  'sb_publishable_62WFR5KXOQcK0Hu_BslujQ_Cs2X3iN9'
);

type PjakObject = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  code: string;
  model_ref: string | null;
};

type Screen = 'splash' | 'quest' | 'victory' | 'timeup';

const TOTAL_TIME = 30 * 60; // Shows 30 min but runs at 2x speed (15 min real time)
const CANDY_MAX = 100;
const CANDY_START = 25;
const CANDY_STEP = 10;

// Map image bounding box (GPS corners of the 1024x1024 quest-map.png)
const MAP_BOUNDS = {
  north: 57.90497,
  south: 57.90030,
  west: 14.06262,
  east: 14.07643,
};

function gpsToPixel(lat: number, lng: number): { x: number; y: number } | null {
  const xPct = (lng - MAP_BOUNDS.west) / (MAP_BOUNDS.east - MAP_BOUNDS.west);
  const yPct = (MAP_BOUNDS.north - lat) / (MAP_BOUNDS.north - MAP_BOUNDS.south);
  if (xPct < -0.15 || xPct > 1.15 || yPct < -0.15 || yPct > 1.15) return null;
  return { x: xPct * 100, y: yPct * 100 };
}

function App() {
  const [objects, setObjects] = useState<PjakObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>('splash');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [entered, setEntered] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [timeLeft, setTimeLeft] = useState(TOTAL_TIME);
  const [timerActive, setTimerActive] = useState(false);
  const [phoneLat, setPhoneLat] = useState<number | null>(null);
  const [phoneLng, setPhoneLng] = useState<number | null>(null);
  const [candyLevel, setCandyLevel] = useState(CANDY_START); // starts at 25%, ±10% per answer
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load objects (only 3 real quests)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('objects').select('*').order('created_at');
      if (data) setObjects(data.filter(o => o.model_ref !== 'test_egg').slice(0, 3));
      setLoading(false);
    })();
  }, []);

  // Poll phone GPS
  useEffect(() => {
    if (screen !== 'quest') return;
    const interval = setInterval(async () => {
      const { data } = await supabase.from('devices').select('lat,lng').eq('name', 'Pirattelefon').single();
      if (data && (data.lat !== 0 || data.lng !== 0)) {
        setPhoneLat(data.lat);
        setPhoneLng(data.lng);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [screen]);

  // Timer
  useEffect(() => {
    if (!timerActive) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setTimerActive(false);
          setScreen('timeup');
          return 0;
        }
        return prev - 1;
      });
    }, 500); // ticks every half second — feels frantic
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerActive]);

  const current = objects[currentIdx];
  const codeChars = current ? current.code.toUpperCase().split('') : [];
  // Fixed positions: spaces and dashes are pre-filled, player skips them
  const fixedPositions = new Set(codeChars.map((c, i) => (c === ' ' || c === '-') ? i : -1).filter(i => i >= 0));
  // Editable positions only
  const editablePositions = codeChars.map((_, i) => i).filter(i => !fixedPositions.has(i));
  const totalEditableSlots = editablePositions.length;

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timerStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const timerUrgent = timeLeft < 300;

  function resetGame() {
    setCurrentIdx(0);
    setEntered([]);
    setStatus('idle');
    setTimeLeft(TOTAL_TIME);
    setCandyLevel(CANDY_START);
    setScreen('splash');
    setTimerActive(false);
  }

  // Build full code string from entered (user chars placed into editable slots)
  function buildFullCode(): string {
    const result = [...codeChars];
    entered.forEach((ch, i) => {
      if (i < editablePositions.length) {
        result[editablePositions[i]] = ch;
      }
    });
    return result.join('');
  }

  // Keyboard
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (screen === 'splash') {
      if (e.key === 'Enter' || e.key === ' ') {
        setScreen('quest');
        setTimerActive(true);
      }
      return;
    }

    if (screen !== 'quest' || status !== 'idle' || !current) return;

    if (e.key === 'Backspace') {
      setEntered(prev => prev.slice(0, -1));
      return;
    }

    if (e.key === 'Enter') {
      if (entered.length === 0) return;
      const fullCode = buildFullCode();

      if (fullCode === current.code.toUpperCase()) {
        setStatus('correct');
        setCandyLevel(prev => Math.min(prev + CANDY_STEP, CANDY_MAX));
        setTimeout(() => {
          const nextIdx = currentIdx + 1;
          if (nextIdx >= objects.length) {
            setScreen('victory');
            setTimerActive(false);
          } else {
            setCurrentIdx(nextIdx);
          }
          setEntered([]);
          setStatus('idle');
        }, 1500);
      } else {
        setStatus('wrong');
        setCandyLevel(prev => Math.max(prev - CANDY_STEP, 0));
        setTimeout(() => {
          setEntered([]);
          setStatus('idle');
        }, 1200);
      }
      return;
    }

    if (/^[a-zA-Z0-9]$/.test(e.key) && entered.length < totalEditableSlots) {
      setEntered(prev => [...prev, e.key.toUpperCase()]);
    }
  }, [entered, current, status, screen, totalEditableSlots, currentIdx, objects.length, codeChars, editablePositions]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  const phonePos = phoneLat && phoneLng ? gpsToPixel(phoneLat, phoneLng) : null;
  const distToEgg = current && phoneLat && phoneLng
    ? haversine(phoneLat, phoneLng, current.lat, current.lng) : null;

  // --- Loading ---
  if (loading) {
    return (
      <div className="screen">
        <div className="glow" />
        <div className="center-content"><p className="hint">Laddar...</p></div>
      </div>
    );
  }

  // ========== SPLASH ==========
  if (screen === 'splash') {
    return (
      <div className="screen splash-screen" onClick={() => { setScreen('quest'); setTimerActive(true); }}>
        <img src="/hero.png" alt="" className="splash-bg" />
        <div className="splash-overlay">
          <h1 className="splash-title">Skattjakt</h1>
          <p className="splash-start">Klicka för att starta</p>
        </div>
      </div>
    );
  }

  // ========== VICTORY ==========
  if (screen === 'victory') {
    return (
      <div className="screen">
        <div className="glow glow-gold" />
        <div className="center-content">
          <h1 className="title-victory">ALLA LEDTRÅDAR LÖSTA!</h1>
          <p className="victory-time">Tid kvar: {timerStr}</p>
          <div className="trophy-row">
            {objects.map((_, i) => (
              <div key={i} className="trophy-chip">✅ Ledtråd {i + 1}</div>
            ))}
          </div>
          <p className="hint clickable" onClick={resetGame}>Tryck för att spela igen</p>
        </div>
      </div>
    );
  }

  // ========== TIME UP ==========
  if (screen === 'timeup') {
    return (
      <div className="screen">
        <div className="glow glow-red" />
        <div className="center-content">
          <h1 className="title-timeup">TIDEN ÄR UTE!</h1>
          <p className="hint" style={{ marginTop: '1rem' }}>
            Ni löste {currentIdx} av {objects.length} ledtrådar
          </p>
          <p className="hint clickable" style={{ marginTop: '2rem' }} onClick={resetGame}>Försök igen</p>
        </div>
      </div>
    );
  }

  // ========== QUEST (sequential: map + code, one at a time) ==========
  if (screen === 'quest' && current) {
    const eggPos = gpsToPixel(current.lat, current.lng);

    // Code boxes — fixed chars pre-filled, editable positions tracked
    const codeBoxes = [];
    let editIdx = 0; // tracks which editable slot we're on
    // Find which absolute position the cursor is at
    const cursorAbsPos = entered.length < editablePositions.length
      ? editablePositions[entered.length]
      : -1;

    for (let i = 0; i < codeChars.length; i++) {
      const isFixed = fixedPositions.has(i);

      if (isFixed) {
        // Pre-filled character (space, dash)
        codeBoxes.push(
          <div key={i} className="digit-box fixed">
            {codeChars[i] === ' ' ? '\u00A0' : codeChars[i]}
          </div>
        );
      } else {
        // Editable position
        const hasValue = editIdx < entered.length;
        const isActive = i === cursorAbsPos && status === 'idle';
        codeBoxes.push(
          <div key={i} className={`digit-box ${hasValue ? 'filled' : ''} ${isActive ? 'active' : ''}`}>
            {hasValue ? entered[editIdx] : ''}
            {isActive && <span className="cursor" />}
          </div>
        );
        editIdx++;
      }
    }

    return (
      <div className="screen game-screen">
        <div className="game-body">
          {/* Map — single egg + phone */}
          <div className="game-map">
            <div className="map-container">
              <div className={`timer ${timerUrgent ? 'timer-urgent' : ''}`}>{timerStr}</div>
              <img src="/quest-map.png" alt="Treasure Map" className="treasure-map-img" />

              {/* This quest's target — glowing skull */}
              {eggPos && (
                <div className="egg-target" style={{ left: `${eggPos.x}%`, top: `${eggPos.y}%` }}>
                  <div className="egg-target-pulse" />
                  <div className="egg-target-icon">💀</div>
                </div>
              )}

              {/* Phone dot */}
              {phonePos && (
                <div className="phone-dot" style={{ left: `${phonePos.x}%`, top: `${phonePos.y}%` }}>
                  <div className="phone-dot-ping" />
                  <div className="phone-dot-core">📱</div>
                </div>
              )}

              {/* Distance badge */}
              <div className="distance-badge">
                <span className="distance-label">Avstånd:</span>
                <span className="distance-value">
                  {distToEgg !== null ? `${distToEgg.toFixed(0)}m` : 'Väntar på GPS...'}
                </span>
              </div>
            </div>
          </div>

          {/* Right panel — code entry + candy */}
          <div className="game-panel">
            {/* Progress */}
            <div className="progress-strip">
              {objects.map((obj, i) => (
                <div key={obj.id} className={`prog-pip ${i < currentIdx ? 'prog-done' : ''} ${i === currentIdx ? 'prog-current' : ''}`}>
                  {i < currentIdx ? '✅' : `${i + 1}`}
                </div>
              ))}
            </div>

            <div className="quest-num">LEDTRÅD {currentIdx + 1} av {objects.length}</div>
            <p className="quest-hint">
              Guida spelaren till platsen!<br/>
              Skriv kodordet från bilden på telefonen.
            </p>

            {/* Code entry */}
            <div className="panel-code">
              <h3 className="code-label">ANGE KODORD</h3>
              <div className={`code-row ${status === 'wrong' ? 'error' : ''} ${status === 'correct' ? 'success' : ''}`}>
                {codeBoxes}
              </div>
              {status === 'idle' && <p className="hint">Tryck ENTER för att bekräfta</p>}
              {status === 'correct' && <p className="hint found">Korrekt! Nästa ledtråd...</p>}
              {status === 'wrong' && <p className="hint error-text">Fel kodord! Godis dräneras...</p>}
            </div>

            {/* Candy meter */}
            <div className="candy-meter">
              <div className="candy-meter-label">GODISFÖRRÅDET</div>
              <div className="candy-meter-track">
                <div
                  className={`candy-meter-fill ${candyLevel <= 30 ? 'candy-danger' : ''}`}
                  style={{ height: `${candyLevel}%` }}
                />
              </div>
              <div className="candy-meter-icons">
                🍬🍫🍭
              </div>
              <div className="candy-meter-pct">{candyLevel}%</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default App;
