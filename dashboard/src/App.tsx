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

// --- Types ---
type Egg = {
  id: string;
  idx: number;
  label: string;
  lat: number;
  lng: number;
};

type SessionEgg = {
  id: string;
  game_id: string;
  egg_id: string;
  idx: number;
  code: string;
  collected: boolean;
  egg?: Egg; // joined
};

type Game = {
  id: string;
  name: string;
  current_egg_index: number;
  status: string;
};

type PlayerPos = { lat: number; lng: number };
type NewEgg = { label: string; lat: number; lng: number };

// Auto-generate a random code with letters and numbers
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Map click handler
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onMapClick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

function App() {
  // Permanent eggs
  const [eggs, setEggs] = useState<Egg[]>([]);
  // Current game session
  const [game, setGame] = useState<Game | null>(null);
  const [sessionEggs, setSessionEggs] = useState<SessionEgg[]>([]);
  const [playerPos, setPlayerPos] = useState<PlayerPos | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [message, setMessage] = useState('');
  // Setup
  const [setupMode, setSetupMode] = useState(false);
  const [newEggs, setNewEggs] = useState<NewEgg[]>([]);
  const [editingLabel, setEditingLabel] = useState<number | null>(null);

  // --- Load permanent eggs and latest game ---
  useEffect(() => {
    loadEggs();
    loadGame();
  }, []);

  async function loadEggs() {
    const { data } = await supabase.from('eggs').select('*').order('idx');
    if (data) setEggs(data);
  }

  async function loadGame() {
    const { data: games } = await supabase
      .from('games')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (games && games.length > 0) {
      setGame(games[0]);
      await loadSessionEggs(games[0].id);
    }
  }

  async function loadSessionEggs(gameId: string) {
    const { data } = await supabase
      .from('session_eggs')
      .select('*, egg:eggs(*)')
      .eq('game_id', gameId)
      .order('idx');
    if (data) setSessionEggs(data);
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
        { event: 'UPDATE', schema: 'public', table: 'session_eggs', filter: `game_id=eq.${game.id}` },
        () => loadSessionEggs(game.id)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${game.id}` },
        (payload) => setGame(payload.new as Game)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [game?.id]);

  // --- Map click: add egg in setup ---
  function handleMapClick(lat: number, lng: number) {
    if (setupMode) {
      setNewEggs([...newEggs, { label: `Ägg ${eggs.length + newEggs.length + 1}`, lat, lng }]);
      setEditingLabel(newEggs.length);
    }
  }

  // --- Save new permanent eggs ---
  async function saveEggs() {
    if (newEggs.length === 0) {
      setMessage('Klicka på kartan för att placera ägg!');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    const startIdx = eggs.length;
    const toInsert = newEggs.map((e, i) => ({
      idx: startIdx + i,
      label: e.label,
      lat: e.lat,
      lng: e.lng,
    }));

    await supabase.from('eggs').insert(toInsert);
    setNewEggs([]);
    setEditingLabel(null);
    setSetupMode(false);
    await loadEggs();
    setMessage(`✅ ${toInsert.length} ägg sparade!`);
    setTimeout(() => setMessage(''), 3000);
  }

  // --- Remove permanent egg ---
  async function removeEgg(egg: Egg) {
    await supabase.from('eggs').delete().eq('id', egg.id);
    // Re-index remaining
    const remaining = eggs.filter(e => e.id !== egg.id);
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].idx !== i) {
        await supabase.from('eggs').update({ idx: i }).eq('id', remaining[i].id);
      }
    }
    await loadEggs();
  }

  // --- Start new game (replay with fresh codes) ---
  async function startGame() {
    if (eggs.length === 0) {
      setMessage('Placera ägg först!');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    const { data: newGame, error } = await supabase
      .from('games')
      .insert({ name: 'Påskjakt', status: 'active', current_egg_index: 0 })
      .select()
      .single();

    if (error || !newGame) {
      setMessage('Kunde inte starta spel: ' + error?.message);
      return;
    }

    // Create session eggs with fresh codes
    const ses = eggs.map((e) => ({
      game_id: newGame.id,
      egg_id: e.id,
      idx: e.idx,
      code: randomCode(),
      collected: false,
    }));

    await supabase.from('session_eggs').insert(ses);
    await supabase.from('player_position').upsert(
      { game_id: newGame.id, lat: 0, lng: 0 },
      { onConflict: 'game_id' }
    );

    setGame(newGame);
    await loadSessionEggs(newGame.id);
    setCodeInput('');
    setMessage('');
  }

  // --- Validate code ---
  async function submitCode() {
    if (!game) return;

    const current = sessionEggs.find(se => se.idx === game.current_egg_index);
    if (!current) return;

    if (codeInput.trim().toUpperCase() === current.code.toUpperCase()) {
      // Mark collected
      await supabase.from('session_eggs').update({ collected: true }).eq('id', current.id);

      const nextIdx = game.current_egg_index + 1;
      const isFinished = nextIdx >= sessionEggs.length;

      await supabase
        .from('games')
        .update({ current_egg_index: nextIdx, status: isFinished ? 'finished' : 'active' })
        .eq('id', game.id);

      setGame({ ...game, current_egg_index: nextIdx, status: isFinished ? 'finished' : 'active' });
      setCodeInput('');
      setMessage(isFinished ? '🎉 Alla ägg hittade! Grattis!' : '✅ Rätt kod! Nästa ägg skickat till telefonen.');
      await loadSessionEggs(game.id);
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

  // Default map center
  const defaultCenter: [number, number] = eggs.length > 0
    ? [eggs[0].lat, eggs[0].lng]
    : [59.33, 18.07];

  // --- SETUP MODE (placing new eggs) ---
  if (setupMode) {
    return (
      <div className="dashboard full">
        <div className="setup-header">
          <h1>🥚 Pjak — Placera Ägg</h1>
          <p className="setup-hint">Klicka på kartan för att placera nya ägg. Dessa sparas permanent.</p>
        </div>

        <div className="setup-layout">
          <div className="map-container">
            <MapContainer center={defaultCenter} zoom={15} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapClickHandler onMapClick={handleMapClick} />
              {/* Existing permanent eggs */}
              {eggs.map((e) => (
                <Marker key={e.id} position={[e.lat, e.lng]} icon={eggIcon} opacity={0.5}>
                  <Popup><strong>{e.label}</strong> (sparad)</Popup>
                </Marker>
              ))}
              {/* New eggs being placed */}
              {newEggs.map((e, i) => (
                <Marker key={`new-${i}`} position={[e.lat, e.lng]} icon={eggIcon}>
                  <Popup><strong>{e.label}</strong> (nytt)</Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          <div className="setup-sidebar">
            {/* Existing eggs */}
            {eggs.length > 0 && (
              <>
                <h3>Sparade ägg ({eggs.length})</h3>
                <div className="egg-list compact">
                  {eggs.map((e) => (
                    <div key={e.id} className="egg-item-row">
                      <span>🥚 {e.label}</span>
                      <button className="remove-btn-sm" onClick={() => removeEgg(e)} title="Ta bort">✕</button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* New eggs */}
            <h3>Nya ägg ({newEggs.length})</h3>
            <div className="egg-list">
              {newEggs.map((e, i) => (
                <div key={i} className="egg-item">
                  <div className="egg-item-header">
                    <span className="egg-num">🥚 {eggs.length + i + 1}</span>
                    <button className="remove-btn" onClick={() => setNewEggs(newEggs.filter((_, j) => j !== i))}>✕</button>
                  </div>
                  {editingLabel === i ? (
                    <input
                      className="label-input"
                      value={e.label}
                      autoFocus
                      onChange={ev => {
                        const copy = [...newEggs];
                        copy[i].label = ev.target.value;
                        setNewEggs(copy);
                      }}
                      onBlur={() => setEditingLabel(null)}
                      onKeyDown={ev => ev.key === 'Enter' && setEditingLabel(null)}
                      placeholder="Namnge platsen..."
                    />
                  ) : (
                    <div className="label-display" onClick={() => setEditingLabel(i)}>
                      {e.label} <span className="edit-hint">✏️</span>
                    </div>
                  )}
                  <div className="egg-coords">{e.lat.toFixed(5)}, {e.lng.toFixed(5)}</div>
                </div>
              ))}
              {newEggs.length === 0 && eggs.length === 0 && (
                <p className="empty-hint">Klicka på kartan för att placera ägg</p>
              )}
            </div>

            <div className="setup-actions">
              {newEggs.length > 0 && (
                <button className="start-btn" onClick={saveEggs}>
                  Spara {newEggs.length} ägg
                </button>
              )}
              <button className="secondary-btn" onClick={() => { setSetupMode(false); setNewEggs([]); }}>
                Tillbaka
              </button>
            </div>
            {message && <p className="msg">{message}</p>}
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN VIEW (egg overview + game controls) ---
  const currentSessionEgg = game && game.status === 'active'
    ? sessionEggs.find(se => se.idx === game.current_egg_index)
    : null;
  const currentEgg = currentSessionEgg
    ? eggs.find(e => e.id === currentSessionEgg.egg_id) || (currentSessionEgg.egg as Egg | undefined)
    : null;

  const playerDist = currentEgg && playerPos && playerPos.lat !== 0
    ? distanceM(playerPos.lat, playerPos.lng, currentEgg.lat, currentEgg.lng)
    : null;

  const mapCenter: [number, number] = currentEgg
    ? [currentEgg.lat, currentEgg.lng]
    : defaultCenter;

  return (
    <div className="dashboard full">
      <div className="game-header">
        <h1>🥚 Pjak</h1>
      </div>

      <div className="game-layout">
        <div className="map-container">
          <MapContainer center={mapCenter} zoom={15} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {/* All permanent eggs */}
            {eggs.map((e) => {
              const se = sessionEggs.find(s => s.egg_id === e.id);
              const isCurrent = currentEgg?.id === e.id;
              return (
                <Marker
                  key={e.id}
                  position={[e.lat, e.lng]}
                  icon={se?.collected ? collectedIcon : eggIcon}
                  opacity={isCurrent ? 1 : (game ? 0.4 : 0.7)}
                >
                  <Popup>
                    <strong>{e.label}</strong>
                    {se?.collected && ' (hittad!)'}
                  </Popup>
                </Marker>
              );
            })}
            {/* Proximity circle */}
            {currentEgg && (
              <Circle
                center={[currentEgg.lat, currentEgg.lng]}
                radius={15}
                pathOptions={{ color: '#FF6B35', fillOpacity: 0.1 }}
              />
            )}
            {/* Player */}
            {playerPos && playerPos.lat !== 0 && (
              <Marker position={[playerPos.lat, playerPos.lng]} icon={playerIcon}>
                <Popup>Spelaren</Popup>
              </Marker>
            )}
          </MapContainer>
        </div>

        <div className="game-sidebar">
          {/* Egg count and setup button */}
          <div className="sidebar-header">
            <span>{eggs.length} ägg placerade</span>
            <button className="edit-eggs-btn" onClick={() => setSetupMode(true)}>Redigera ägg</button>
          </div>

          {/* No eggs yet */}
          {eggs.length === 0 && (
            <div className="empty-state">
              <p>Inga ägg placerade ännu.</p>
              <button className="start-btn" onClick={() => setSetupMode(true)}>Placera ägg</button>
            </div>
          )}

          {/* Has eggs but no active game */}
          {eggs.length > 0 && (!game || game.status === 'finished') && (
            <div className="start-section">
              {game?.status === 'finished' && <h2>🎉 Alla ägg hittade!</h2>}
              <button className="start-btn" onClick={startGame}>
                {game?.status === 'finished' ? 'Spela igen' : 'Starta Jakt!'}
              </button>
              <p className="start-hint">Nya koder genereras automatiskt varje omgång</p>
            </div>
          )}

          {/* Active game */}
          {game && game.status === 'active' && (
            <>
              {/* Progress */}
              <div className="progress">
                {sessionEggs.map((se) => {
                  const egg = eggs.find(e => e.id === se.egg_id) || se.egg as Egg | undefined;
                  return (
                    <div
                      key={se.id}
                      className={`progress-egg ${se.collected ? 'collected' : ''} ${se.idx === game.current_egg_index ? 'current' : ''}`}
                    >
                      <span>{se.collected ? '✅' : '🥚'} {egg?.label || `Ägg ${se.idx + 1}`}</span>
                    </div>
                  );
                })}
              </div>

              {/* Current target */}
              <div className="target-card">
                <h2>{currentEgg?.label}</h2>
                {playerDist !== null && (
                  <div className="distance">
                    <span className="dist-value">
                      {playerDist < 1000 ? `${Math.round(playerDist)} m` : `${(playerDist / 1000).toFixed(1)} km`}
                    </span>
                    <span className="dist-label">från ägget</span>
                  </div>
                )}
                {playerDist !== null && playerDist < 50 && (
                  <div className="close-alert">Spelaren är nära!</div>
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

              {/* Cancel game */}
              <button className="secondary-btn" onClick={async () => {
                if (game) {
                  await supabase.from('games').update({ status: 'finished' }).eq('id', game.id);
                  setGame({ ...game, status: 'finished' });
                }
              }}>Avbryt spel</button>
            </>
          )}

          {message && <p className={`msg ${message.startsWith('✅') || message.startsWith('🎉') ? 'success' : 'error'}`}>{message}</p>}
        </div>
      </div>
    </div>
  );
}

export default App;
