import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Circle } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from './supabase';
import 'leaflet/dist/leaflet.css';
import './App.css';

// Fix Leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const eggIcon = new L.DivIcon({
  html: '<div style="font-size:28px;text-align:center">🥚</div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  className: '',
});

const playerIcon = new L.DivIcon({
  html: '<div style="font-size:24px;text-align:center">📍</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  className: '',
});

const collectedIcon = new L.DivIcon({
  html: '<div style="font-size:28px;text-align:center">✅</div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  className: '',
});

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
type NewWaypoint = { label: string; lat: number; lng: number; code: string };

// Auto-generate a random code with letters and numbers
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Map click handler component
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function App() {
  const [game, setGame] = useState<Game | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [playerPos, setPlayerPos] = useState<PlayerPos | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [message, setMessage] = useState('');
  const [setupMode, setSetupMode] = useState(false);
  const [newWaypoints, setNewWaypoints] = useState<NewWaypoint[]>([]);
  const [editingLabel, setEditingLabel] = useState<number | null>(null);

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

  // --- Map click: add egg ---
  function handleMapClick(lat: number, lng: number) {
    if (!setupMode && !game) setSetupMode(true);
    if (setupMode || !game) {
      const wp: NewWaypoint = {
        label: `Ägg ${newWaypoints.length + 1}`,
        lat,
        lng,
        code: randomCode(),
      };
      setNewWaypoints([...newWaypoints, wp]);
      setEditingLabel(newWaypoints.length);
    }
  }

  // --- Create new game ---
  async function createGame() {
    if (newWaypoints.length === 0) {
      setMessage('Klicka på kartan för att placera ägg!');
      setTimeout(() => setMessage(''), 3000);
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

    const wps = newWaypoints.map((w, i) => ({
      game_id: newGame.id,
      idx: i,
      label: w.label,
      lat: w.lat,
      lng: w.lng,
      code: w.code,
      collected: false,
    }));

    await supabase.from('waypoints').insert(wps);
    await supabase.from('player_position').insert({
      game_id: newGame.id,
      lat: 0,
      lng: 0,
    });

    setSetupMode(false);
    setNewWaypoints([]);
    setEditingLabel(null);
    loadGame();
  }

  // --- Validate code ---
  async function submitCode() {
    if (!game) return;

    const current = waypoints.find(w => w.idx === game.current_waypoint_index);
    if (!current) return;

    if (codeInput.trim().toUpperCase() === current.code.toUpperCase()) {
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

  // --- Remove egg from active game ---
  async function removeWaypoint(wp: Waypoint) {
    if (!game) return;
    await supabase.from('waypoints').delete().eq('id', wp.id);

    // Re-index remaining waypoints
    const remaining = waypoints.filter(w => w.id !== wp.id);
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].idx !== i) {
        await supabase.from('waypoints').update({ idx: i }).eq('id', remaining[i].id);
      }
    }

    // Adjust current_waypoint_index if needed
    const newIdx = Math.min(game.current_waypoint_index, remaining.length - 1);
    if (newIdx !== game.current_waypoint_index || remaining.length === 0) {
      const status = remaining.length === 0 ? 'finished' : game.status;
      await supabase.from('games').update({ current_waypoint_index: Math.max(0, newIdx), status }).eq('id', game.id);
      setGame({ ...game, current_waypoint_index: Math.max(0, newIdx), status });
    }

    // Reload
    const { data: wps } = await supabase
      .from('waypoints')
      .select('*')
      .eq('game_id', game.id)
      .order('idx');
    if (wps) setWaypoints(wps);
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

  // Default map center (Stockholm, will be overridden)
  const defaultCenter: [number, number] = [59.33, 18.07];

  // --- SETUP MODE ---
  if (setupMode || !game) {
    return (
      <div className="dashboard full">
        <div className="setup-header">
          <h1>🥚 Pjak — Skapa Påskjakt</h1>
          <p className="setup-hint">Klicka på kartan för att placera ägg. Koder genereras automatiskt.</p>
        </div>

        <div className="setup-layout">
          <div className="map-container">
            <MapContainer center={defaultCenter} zoom={15} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapClickHandler onMapClick={handleMapClick} />
              {newWaypoints.map((wp, i) => (
                <Marker key={i} position={[wp.lat, wp.lng]} icon={eggIcon}>
                  <Popup>
                    <strong>{wp.label}</strong><br />
                    Kod: <code>{wp.code}</code>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          <div className="setup-sidebar">
            <h3>Placerade ägg ({newWaypoints.length})</h3>
            <div className="egg-list">
              {newWaypoints.map((wp, i) => (
                <div key={i} className="egg-item">
                  <div className="egg-item-header">
                    <span className="egg-num">🥚 {i + 1}</span>
                    <button className="remove-btn" onClick={() => {
                      setNewWaypoints(newWaypoints.filter((_, j) => j !== i));
                    }}>✕</button>
                  </div>
                  {editingLabel === i ? (
                    <input
                      className="label-input"
                      value={wp.label}
                      autoFocus
                      onChange={e => {
                        const copy = [...newWaypoints];
                        copy[i].label = e.target.value;
                        setNewWaypoints(copy);
                      }}
                      onBlur={() => setEditingLabel(null)}
                      onKeyDown={e => e.key === 'Enter' && setEditingLabel(null)}
                      placeholder="Namnge platsen..."
                    />
                  ) : (
                    <div className="label-display" onClick={() => setEditingLabel(i)}>
                      {wp.label} <span className="edit-hint">✏️</span>
                    </div>
                  )}
                  <div className="egg-code">
                    Kod: <input
                      className="code-edit-input"
                      value={wp.code}
                      onChange={e => {
                        const copy = [...newWaypoints];
                        copy[i].code = e.target.value.toUpperCase();
                        setNewWaypoints(copy);
                      }}
                      placeholder="Kod eller ord..."
                    />
                  </div>
                  <div className="egg-coords">{wp.lat.toFixed(5)}, {wp.lng.toFixed(5)}</div>
                </div>
              ))}
              {newWaypoints.length === 0 && (
                <p className="empty-hint">👆 Klicka på kartan för att placera ditt första ägg</p>
              )}
            </div>
            {newWaypoints.length > 0 && (
              <button className="start-btn" onClick={createGame}>
                🚀 Starta Jakt! ({newWaypoints.length} ägg)
              </button>
            )}
            {message && <p className="msg">{message}</p>}
          </div>
        </div>
      </div>
    );
  }

  // --- GAME VIEW ---
  const current = waypoints.find(w => w.idx === game.current_waypoint_index);
  const playerDist = current && playerPos && playerPos.lat !== 0
    ? distanceM(playerPos.lat, playerPos.lng, current.lat, current.lng)
    : null;

  const mapCenter: [number, number] = current
    ? [current.lat, current.lng]
    : defaultCenter;

  return (
    <div className="dashboard full">
      <div className="game-header">
        <h1>🥚 Pjak — Påskjakt</h1>
      </div>

      {game.status === 'finished' ? (
        <div className="finished">
          <h2>🎉 Grattis! Alla ägg hittade!</h2>
          <button className="start-btn" onClick={() => { setSetupMode(true); setGame(null); setNewWaypoints([]); }}>
            Ny jakt
          </button>
        </div>
      ) : (
        <div className="game-layout">
          <div className="map-container">
            <MapContainer center={mapCenter} zoom={16} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {/* All egg markers */}
              {waypoints.map((wp) => (
                <Marker
                  key={wp.id}
                  position={[wp.lat, wp.lng]}
                  icon={wp.collected ? collectedIcon : eggIcon}
                  opacity={wp.idx === game.current_waypoint_index ? 1 : 0.4}
                >
                  <Popup>{wp.label} {wp.collected ? '(hittad!)' : ''}</Popup>
                </Marker>
              ))}
              {/* Proximity circle for current egg */}
              {current && (
                <Circle
                  center={[current.lat, current.lng]}
                  radius={15}
                  pathOptions={{ color: '#FF6B35', fillOpacity: 0.1 }}
                />
              )}
              {/* Player position */}
              {playerPos && playerPos.lat !== 0 && (
                <Marker position={[playerPos.lat, playerPos.lng]} icon={playerIcon}>
                  <Popup>Spelaren</Popup>
                </Marker>
              )}
            </MapContainer>
          </div>

          <div className="game-sidebar">
            {/* Progress */}
            <div className="progress">
              {waypoints.map((wp, i) => (
                <div
                  key={wp.id}
                  className={`progress-egg ${wp.collected ? 'collected' : ''} ${i === game.current_waypoint_index ? 'current' : ''}`}
                >
                  <span>{wp.collected ? '✅' : '🥚'} {wp.label}</span>
                  <button className="remove-btn-sm" onClick={() => removeWaypoint(wp)} title="Ta bort">✕</button>
                </div>
              ))}
            </div>

            {/* Current target */}
            <div className="target-card">
              <h2>{current?.label}</h2>
              {playerDist !== null && (
                <div className="distance">
                  <span className="dist-value">
                    {playerDist < 1000 ? `${Math.round(playerDist)} m` : `${(playerDist / 1000).toFixed(1)} km`}
                  </span>
                  <span className="dist-label">från ägget</span>
                </div>
              )}
              {playerDist !== null && playerDist < 50 && (
                <div className="close-alert">📍 Spelaren är nära!</div>
              )}
            </div>

            {/* Code input */}
            <div className="code-input-section">
              <h3>Skriv in koden:</h3>
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
                <button className="submit-btn" onClick={submitCode}>OK</button>
              </div>
            </div>

            {message && <p className={`msg ${message.startsWith('✅') || message.startsWith('🎉') ? 'success' : 'error'}`}>{message}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
