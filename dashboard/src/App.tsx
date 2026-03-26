import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';
import eggs from '../../shared/eggs.json';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const eggIcon = new L.DivIcon({ html: '<div style="font-size:28px;text-align:center">🥚</div>', iconSize: [32, 32], iconAnchor: [16, 16], className: '' });
const collectedIcon = new L.DivIcon({ html: '<div style="font-size:28px;text-align:center">✅</div>', iconSize: [32, 32], iconAnchor: [16, 16], className: '' });

function App() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [collectedSet, setCollectedSet] = useState<Set<number>>(new Set());
  const [codeInput, setCodeInput] = useState('');
  const [message, setMessage] = useState('');

  const current = eggs[currentIdx];
  const finished = currentIdx >= eggs.length;

  function submitCode() {
    if (!current) return;

    if (codeInput.trim().toUpperCase() === current.code.toUpperCase()) {
      const newCollected = new Set(collectedSet);
      newCollected.add(current.id);
      setCollectedSet(newCollected);

      const nextIdx = currentIdx + 1;
      setCurrentIdx(nextIdx);
      setCodeInput('');

      if (nextIdx >= eggs.length) {
        setMessage('🎉 Alla ägg hittade!');
      } else {
        setMessage('✅ Rätt! Nästa: ' + eggs[nextIdx].label);
        setTimeout(() => setMessage(''), 3000);
      }
    } else {
      setMessage('❌ Fel kod!');
      setTimeout(() => setMessage(''), 2000);
    }
  }

  function restart() {
    setCurrentIdx(0);
    setCollectedSet(new Set());
    setCodeInput('');
    setMessage('');
  }

  const mapCenter: [number, number] = current
    ? [current.lat, current.lng]
    : eggs.length > 0
    ? [eggs[0].lat, eggs[0].lng]
    : [59.33, 18.07];

  return (
    <div className="dashboard full">
      <div className="game-header">
        <h1>🥚 Pjak</h1>
      </div>

      <div className="game-layout">
        <div className="map-container">
          <MapContainer center={mapCenter} zoom={16} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {eggs.map((e) => (
              <Marker
                key={e.id}
                position={[e.lat, e.lng]}
                icon={collectedSet.has(e.id) ? collectedIcon : eggIcon}
                opacity={!finished && current && e.id === current.id ? 1 : 0.4}
              />
            ))}
            {current && !finished && (
              <Circle
                center={[current.lat, current.lng]}
                radius={15}
                pathOptions={{ color: '#FF6B35', fillOpacity: 0.15 }}
              />
            )}
          </MapContainer>
        </div>

        <div className="game-sidebar">
          {/* Progress */}
          <div className="progress">
            {eggs.map((e, i) => (
              <div
                key={e.id}
                className={`progress-egg ${collectedSet.has(e.id) ? 'collected' : ''} ${i === currentIdx && !finished ? 'current' : ''}`}
              >
                {collectedSet.has(e.id) ? '✅' : '🥚'} {e.label}
              </div>
            ))}
          </div>

          {/* Finished */}
          {finished ? (
            <div className="start-section">
              <h2>🎉 Grattis!</h2>
              <p>Alla {eggs.length} ägg hittade!</p>
              <button className="start-btn" onClick={restart}>Spela igen</button>
            </div>
          ) : (
            <>
              {/* Current egg info */}
              <div className="target-card">
                <h2>{current.label}</h2>
                <p className="target-hint">Guida spelaren hit!</p>
                <p className="target-coords">{current.lat.toFixed(5)}, {current.lng.toFixed(5)}</p>
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
