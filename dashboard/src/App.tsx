import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet';
import L from 'leaflet';
import { createClient } from '@supabase/supabase-js';
import 'leaflet/dist/leaflet.css';
import './App.css';

const supabase = createClient(
  'https://vlaxnupgdviexicirfcq.supabase.co',
  'sb_publishable_62WFR5KXOQcK0Hu_BslujQ_Cs2X3iN9'
);

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const pirateIcon = new L.DivIcon({ html: '<div style="font-size:28px;text-align:center">🏴‍☠️</div>', iconSize: [32, 32], iconAnchor: [16, 16], className: '' });
const collectedIcon = new L.DivIcon({ html: '<div style="font-size:28px;text-align:center">✅</div>', iconSize: [32, 32], iconAnchor: [16, 16], className: '' });

type PjakObject = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  type: string;
  code: string;
  display_text: string | null;
  model_ref: string | null;
};

function App() {
  const [objects, setObjects] = useState<PjakObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [collectedSet, setCollectedSet] = useState<Set<string>>(new Set());
  const [codeInput, setCodeInput] = useState('');
  const [message, setMessage] = useState('');

  // Load objects from Supabase
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('objects').select('*').order('created_at');
      if (data) setObjects(data);
      setLoading(false);
    })();
  }, []);

  const current = objects[currentIdx];
  const finished = objects.length > 0 && currentIdx >= objects.length;

  function submitCode() {
    if (!current) return;

    if (codeInput.trim().toUpperCase() === current.code.toUpperCase()) {
      const newCollected = new Set(collectedSet);
      newCollected.add(current.id);
      setCollectedSet(newCollected);

      const nextIdx = currentIdx + 1;
      setCurrentIdx(nextIdx);
      setCodeInput('');

      if (nextIdx >= objects.length) {
        setMessage('🎉 Alla skatter hittade!');
      } else {
        setMessage('✅ Rätt! Nästa: ' + objects[nextIdx].label);
        setTimeout(() => setMessage(''), 3000);
      }
    } else {
      setMessage('❌ Fel kodord — titta noga på bilden!');
      setTimeout(() => setMessage(''), 2000);
    }
  }

  function restart() {
    setCurrentIdx(0);
    setCollectedSet(new Set());
    setCodeInput('');
    setMessage('');
  }

  if (loading) {
    return (
      <div className="dashboard full" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h2 style={{ color: '#ffd700' }}>Laddar skattkartan...</h2>
      </div>
    );
  }

  const mapCenter: [number, number] = current
    ? [current.lat, current.lng]
    : objects.length > 0
    ? [objects[0].lat, objects[0].lng]
    : [59.33, 18.07];

  return (
    <div className="dashboard full">
      <div className="game-header">
        <h1>🏴‍☠️ Easter Pirate</h1>
      </div>

      <div className="game-layout">
        <div className="map-container">
          <MapContainer center={mapCenter} zoom={15} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {objects.map((obj) => (
              <Marker
                key={obj.id}
                position={[obj.lat, obj.lng]}
                icon={collectedSet.has(obj.id) ? collectedIcon : pirateIcon}
                opacity={!finished && current && obj.id === current.id ? 1 : 0.4}
              />
            ))}
            {current && !finished && (
              <Circle
                center={[current.lat, current.lng]}
                radius={20}
                pathOptions={{ color: '#FF6B35', fillOpacity: 0.15 }}
              />
            )}
          </MapContainer>
        </div>

        <div className="game-sidebar">
          {/* Progress */}
          <div className="progress">
            {objects.map((obj, i) => (
              <div
                key={obj.id}
                className={`progress-egg ${collectedSet.has(obj.id) ? 'collected' : ''} ${i === currentIdx && !finished ? 'current' : ''}`}
              >
                {collectedSet.has(obj.id) ? '✅' : '🏴‍☠️'} {obj.label}
              </div>
            ))}
          </div>

          {/* Finished */}
          {finished ? (
            <div className="start-section">
              <h2>🎉 Grattis!</h2>
              <p>Alla {objects.length} skatter hittade!</p>
              <button className="start-btn" onClick={restart}>Spela igen</button>
            </div>
          ) : current ? (
            <>
              {/* Current target */}
              <div className="target-card">
                <h2>📍 {current.label}</h2>
                <p className="target-hint">Gå till platsen, se bilden på telefonen, hitta kodordet!</p>
                <p className="target-coords">{current.lat.toFixed(5)}, {current.lng.toFixed(5)}</p>
              </div>

              {/* Code input */}
              <div className="code-input-section">
                <h3>Skriv kodordet du hittade i bilden:</h3>
                <div className="code-input-row">
                  <input
                    className="code-input"
                    type="text"
                    value={codeInput}
                    onChange={e => setCodeInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitCode()}
                    placeholder="Kodord..."
                    autoFocus
                  />
                  <button className="submit-btn" onClick={submitCode}>OK</button>
                </div>
              </div>
            </>
          ) : null}

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
