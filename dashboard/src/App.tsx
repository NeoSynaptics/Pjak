import { useEffect, useState, useRef } from 'react';
import { supabase } from './supabase';
import './App.css';

type Waypoint = {
  id: string;
  idx: number;
  label: string;
  lat: number;
  lng: number;
  code: string;
  collected: boolean;
};

type Game = {
  id: string;
  name: string;
  current_waypoint_index: number;
  status: string;
};

type PlayerPos = { lat: number; lng: number };

function App() {
  const [game, setGame] = useState<Game | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [playerPos, setPlayerPos] = useState<PlayerPos | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [message, setMessage] = useState('');
  const [setupMode, setSetupMode] = useState(false);
  const [newWaypoints, setNewWaypoints] = useState<Array<{ label: string; lat: string; lng: string; code: string }>>([
    { label: '', lat: '', lng: '', code: '' },
  ]);

  // --- Load game ---
  useEffect(() => {
    loadGame();
  }, []);

  async function loadGame() {
    const { data: games } = await supabase
      .from('games')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (games && games.length > 0) {
      setGame(games[0]);
      const { data: wps } = await supabase
        .from('waypoints')
        .select('*')
        .eq('game_id', games[0].id)
        .order('idx');
      if (wps) setWaypoints(wps);
    }
  }

  // --- Realtime subscriptions ---
  useEffect(() => {
    if (!game) return;

    const channel = supabase
      .channel('dashboard-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'player_position', filter: `game_id=eq.${game.id}` },
        (payload) => {
          const p = payload.new as any;
          setPlayerPos({ lat: p.lat, lng: p.lng });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'waypoints', filter: `game_id=eq.${game.id}` },
        () => {
          supabase
            .from('waypoints')
            .select('*')
            .eq('game_id', game.id)
            .order('idx')
            .then(({ data }) => { if (data) setWaypoints(data); });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [game?.id]);

  // --- Create new game ---
  async function createGame() {
    const validWps = newWaypoints.filter(w => w.label && w.lat && w.lng && w.code);
    if (validWps.length === 0) {
      setMessage('Lägg till minst en waypoint!');
      return;
    }

    const { data: newGame, error } = await supabase
      .from('games')
      .insert({ name: 'Påskjakt', status: 'active', current_waypoint_index: 0 })
      .select()
      .single();

    if (error || !newGame) {
      setMessage('Kunde inte skapa spel: ' + error?.message);
      return;
    }

    const wps = validWps.map((w, i) => ({
      game_id: newGame.id,
      idx: i,
      label: w.label,
      lat: parseFloat(w.lat),
      lng: parseFloat(w.lng),
      code: w.code,
      collected: false,
    }));

    await supabase.from('waypoints').insert(wps);

    // Create player position row
    await supabase.from('player_position').insert({
      game_id: newGame.id,
      lat: 0,
      lng: 0,
    });

    setSetupMode(false);
    loadGame();
  }

  // --- Validate code ---
  async function submitCode() {
    if (!game) return;

    const current = waypoints.find(w => w.idx === game.current_waypoint_index);
    if (!current) return;

    if (codeInput.trim().toUpperCase() === current.code.toUpperCase()) {
      // Correct! Advance to next waypoint
      const nextIdx = game.current_waypoint_index + 1;
      const isFinished = nextIdx >= waypoints.length;

      await supabase
        .from('games')
        .update({
          current_waypoint_index: nextIdx,
          status: isFinished ? 'finished' : 'active',
        })
        .eq('id', game.id);

      setGame({ ...game, current_waypoint_index: nextIdx, status: isFinished ? 'finished' : 'active' });
      setCodeInput('');
      setMessage(isFinished ? '🎉 Alla ägg hittade! Grattis!' : '✅ Rätt kod! Nästa ägg skickat till telefonen.');

      setTimeout(() => setMessage(''), 4000);
    } else {
      setMessage('❌ Fel kod! Försök igen.');
      setTimeout(() => setMessage(''), 3000);
    }
  }

  // --- Distance helper ---
  function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // --- Setup mode ---
  if (setupMode || !game) {
    return (
      <div className="dashboard">
        <h1>🥚 Pjak — Skapa Påskjakt</h1>
        <div className="setup">
          {newWaypoints.map((wp, i) => (
            <div key={i} className="wp-row">
              <span className="wp-num">Ägg {i + 1}</span>
              <input
                placeholder="Plats (t.ex. Storgatan 5)"
                value={wp.label}
                onChange={e => {
                  const copy = [...newWaypoints];
                  copy[i].label = e.target.value;
                  setNewWaypoints(copy);
                }}
              />
              <input
                placeholder="Lat"
                value={wp.lat}
                onChange={e => {
                  const copy = [...newWaypoints];
                  copy[i].lat = e.target.value;
                  setNewWaypoints(copy);
                }}
              />
              <input
                placeholder="Lng"
                value={wp.lng}
                onChange={e => {
                  const copy = [...newWaypoints];
                  copy[i].lng = e.target.value;
                  setNewWaypoints(copy);
                }}
              />
              <input
                placeholder="Kod (t.ex. 4782)"
                value={wp.code}
                onChange={e => {
                  const copy = [...newWaypoints];
                  copy[i].code = e.target.value;
                  setNewWaypoints(copy);
                }}
              />
              {newWaypoints.length > 1 && (
                <button className="remove-btn" onClick={() => setNewWaypoints(newWaypoints.filter((_, j) => j !== i))}>✕</button>
              )}
            </div>
          ))}
          <button className="add-btn" onClick={() => setNewWaypoints([...newWaypoints, { label: '', lat: '', lng: '', code: '' }])}>
            + Lägg till ägg
          </button>
          <button className="start-btn" onClick={createGame}>🚀 Starta Jakt!</button>
          {message && <p className="msg">{message}</p>}
        </div>
      </div>
    );
  }

  // --- Game view ---
  const current = waypoints.find(w => w.idx === game.current_waypoint_index);
  const playerDist = current && playerPos
    ? distanceM(playerPos.lat, playerPos.lng, current.lat, current.lng)
    : null;

  return (
    <div className="dashboard">
      <h1>🥚 Pjak — Påskjakt</h1>

      {game.status === 'finished' ? (
        <div className="finished">
          <h2>🎉 Grattis! Alla ägg hittade!</h2>
          <button className="start-btn" onClick={() => { setSetupMode(true); setGame(null); }}>
            Ny jakt
          </button>
        </div>
      ) : (
        <div className="game-view">
          {/* Progress */}
          <div className="progress">
            {waypoints.map((wp, i) => (
              <div
                key={wp.id}
                className={`progress-egg ${wp.collected ? 'collected' : ''} ${i === game.current_waypoint_index ? 'current' : ''}`}
              >
                {wp.collected ? '✅' : '🥚'} {wp.label}
              </div>
            ))}
          </div>

          {/* Current target */}
          <div className="target-card">
            <h2>Nästa ägg: {current?.label}</h2>
            {playerPos && playerDist !== null && (
              <div className="distance">
                <span className="dist-value">
                  {playerDist < 1000 ? `${Math.round(playerDist)} m` : `${(playerDist / 1000).toFixed(1)} km`}
                </span>
                <span className="dist-label">från ägget</span>
              </div>
            )}
            {playerPos && playerDist !== null && playerDist < 50 && (
              <div className="close-alert">📍 Spelaren är nära!</div>
            )}
          </div>

          {/* Code input */}
          <div className="code-input-section">
            <h3>Skriv in koden från ägget:</h3>
            <div className="code-input-row">
              <input
                className="code-input"
                type="text"
                value={codeInput}
                onChange={e => setCodeInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitCode()}
                placeholder="Kod..."
                autoFocus
              />
              <button className="submit-btn" onClick={submitCode}>Bekräfta</button>
            </div>
          </div>

          {message && <p className={`msg ${message.startsWith('✅') || message.startsWith('🎉') ? 'success' : 'error'}`}>{message}</p>}
        </div>
      )}
    </div>
  );
}

export default App;
