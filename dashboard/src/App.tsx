import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';
import eggs from '../../shared/eggs.json';

// Fix Leaflet icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const eggIcon = new L.DivIcon({ html: '<div style="font-size:28px;text-align:center">🥚</div>', iconSize: [32, 32], iconAnchor: [16, 16], className: '' });
const collectedIcon = new L.DivIcon({ html: '<div style="font-size:28px;text-align:center">✅</div>', iconSize: [32, 32], iconAnchor: [16, 16], className: '' });

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

type SessionEgg = { id: number; label: string; lat: number; lng: number; code: string; collected: boolean };

function App() {
  const [session, setSession] = useState<SessionEgg[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [codeInput, setCodeInput] = useState('');
  const [message, setMessage] = useState('');
  const [gameActive, setGameActive] = useState(false);

  const finished = gameActive && currentIdx >= session.length;
  const current = session[currentIdx];

  function startGame() {
    const ses = eggs.map(e => ({ ...e, code: randomCode(), collected: false }));
    setSession(ses);
    setCurrentIdx(0);
    setCodeInput('');
    setMessage('');
    setGameActive(true);
  }

  function submitCode() {
    if (!current) return;

    if (codeInput.trim().toUpperCase() === current.code.toUpperCase()) {
      const updated = [...session];
      updated[currentIdx].collected = true;
      setSession(updated);

      const nextIdx = currentIdx + 1;
      setCurrentIdx(nextIdx);
      setCodeInput('');

      if (nextIdx >= session.length) {
        setMessage('🎉 Alla ägg hittade! Grattis!');
      } else {
        setMessage('✅ Rätt! Nästa ägg: ' + session[nextIdx].label);
        setTimeout(() => setMessage(''), 3000);
      }
    } else {
      setMessage('❌ Fel kod!');
      setTimeout(() => setMessage(''), 2000);
    }
  }

  const mapCenter: [number, number] = eggs.length > 0
    ? [eggs[0].lat, eggs[0].lng]
    : [59.33, 18.07];

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
            {(gameActive ? session : eggs.map(e => ({ ...e, collected: false }))).map((e) => (
              <Marker
                key={e.id}
                position={[e.lat, e.lng]}
                icon={e.collected ? collectedIcon : eggIcon}
                opacity={gameActive && !e.collected && e.id === current?.id ? 1 : 0.5}
              />
            ))}
            {current && !finished && (
              <Circle
                center={[current.lat, current.lng]}
                radius={15}
                pathOptions={{ color: '#FF6B35', fillOpacity: 0.1 }}
              />
            )}
          </MapContainer>
        </div>

        <div className="game-sidebar">
          {/* Not started */}
          {!gameActive && (
            <div className="start-section">
              <p className="egg-count">{eggs.length} ägg redo</p>
              <button className="start-btn" onClick={startGame}>Starta Jakt!</button>
              <p className="start-hint">Nya koder genereras varje omgång</p>
            </div>
          )}

          {/* Finished */}
          {finished && (
            <div className="start-section">
              <h2>🎉 Grattis!</h2>
              <p>Alla {session.length} ägg hittade!</p>
              <button className="start-btn" onClick={startGame}>Spela igen</button>
            </div>
          )}

          {/* Active game */}
          {gameActive && !finished && (
            <>
              {/* Progress */}
              <div className="progress">
                {session.map((e, i) => (
                  <div
                    key={e.id}
                    className={`progress-egg ${e.collected ? 'collected' : ''} ${i === currentIdx ? 'current' : ''}`}
                  >
                    {e.collected ? '✅' : '🥚'} {e.label}
                  </div>
                ))}
              </div>

              {/* Current target */}
              <div className="target-card">
                <h2>{current.label}</h2>
                <p className="target-hint">Väntar på kod från telefonen...</p>
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

              <button className="secondary-btn" onClick={() => setGameActive(false)}>
                Avbryt spel
              </button>
            </>
          )}

          {message && (
            <p className={`msg ${message.startsWith('✅') || message.startsWith('🎉') ? 'success' : 'error'}`}>
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
