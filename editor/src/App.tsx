import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { createClient } from '@supabase/supabase-js';
import 'leaflet/dist/leaflet.css';
import './App.css';

// Supabase
const supabase = createClient(
  'https://vlaxnupgdviexicirfcq.supabase.co',
  'sb_publishable_62WFR5KXOQcK0Hu_BslujQ_Cs2X3iN9'
);

// Fix Leaflet icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const icons: Record<string, L.DivIcon> = {
  '3d_model': new L.DivIcon({ html: '<div style="font-size:24px;text-align:center">🎁</div>', iconSize: [28, 28], iconAnchor: [14, 14], className: '' }),
  'text': new L.DivIcon({ html: '<div style="font-size:24px;text-align:center">💬</div>', iconSize: [28, 28], iconAnchor: [14, 14], className: '' }),
  'code_object': new L.DivIcon({ html: '<div style="font-size:24px;text-align:center">🥚</div>', iconSize: [28, 28], iconAnchor: [14, 14], className: '' }),
};

type ObjectType = '3d_model' | 'text' | 'code_object';

type PjakObject = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  type: ObjectType;
  code: string;
  display_text: string | null;
  model_ref: string | null;
  metadata: Record<string, any>;
};

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onMapClick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

function App() {
  const [objects, setObjects] = useState<PjakObject[]>([]);
  const [selected, setSelected] = useState<PjakObject | null>(null);
  const [placingType, setPlacingType] = useState<ObjectType>('code_object');
  const [message, setMessage] = useState('');

  // Load objects
  useEffect(() => { loadObjects(); }, []);

  async function loadObjects() {
    const { data } = await supabase.from('objects').select('*').order('created_at');
    if (data) setObjects(data);
  }

  // Place new object
  async function handleMapClick(lat: number, lng: number) {
    const obj = {
      label: `Object ${objects.length + 1}`,
      lat,
      lng,
      type: placingType,
      code: randomCode(),
      display_text: placingType === 'text' ? 'Hello' : null,
      model_ref: placingType === '3d_model' ? 'default_egg.glb' : null,
      metadata: {},
    };

    const { data, error } = await supabase.from('objects').insert(obj).select().single();
    if (error) {
      flash('Error: ' + error.message);
      return;
    }
    if (data) {
      setObjects([...objects, data]);
      setSelected(data);
      flash('Object placed');
    }
  }

  // Update object
  async function updateObject(obj: PjakObject) {
    await supabase.from('objects').update({
      label: obj.label,
      type: obj.type,
      code: obj.code,
      display_text: obj.display_text,
      model_ref: obj.model_ref,
      metadata: obj.metadata,
    }).eq('id', obj.id);

    setObjects(objects.map(o => o.id === obj.id ? obj : o));
    flash('Saved');
  }

  // Delete object
  async function deleteObject(id: string) {
    await supabase.from('objects').delete().eq('id', id);
    setObjects(objects.filter(o => o.id !== id));
    if (selected?.id === id) setSelected(null);
    flash('Deleted');
  }

  function flash(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(''), 2000);
  }

  const defaultCenter: [number, number] = objects.length > 0
    ? [objects[0].lat, objects[0].lng]
    : [59.3293, 18.0686];

  return (
    <div className="editor">
      {/* Toolbar */}
      <div className="toolbar">
        <span className="toolbar-title">Pjak Editor</span>
        <div className="toolbar-group">
          <span className="toolbar-label">Place:</span>
          {(['code_object', '3d_model', 'text'] as ObjectType[]).map(t => (
            <button
              key={t}
              className={`type-btn ${placingType === t ? 'active' : ''}`}
              onClick={() => setPlacingType(t)}
            >
              {t === 'code_object' ? '🥚 Egg' : t === '3d_model' ? '🎁 3D' : '💬 Text'}
            </button>
          ))}
        </div>
        <span className="object-count">{objects.length} objects</span>
        {message && <span className="flash">{message}</span>}
      </div>

      <div className="main">
        {/* Map */}
        <div className="map-area">
          <MapContainer center={defaultCenter} zoom={15} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapClickHandler onMapClick={handleMapClick} />
            {objects.map(obj => (
              <Marker
                key={obj.id}
                position={[obj.lat, obj.lng]}
                icon={icons[obj.type] || icons['code_object']}
                opacity={selected?.id === obj.id ? 1 : 0.6}
                eventHandlers={{ click: () => setSelected(obj) }}
              >
                <Popup>{obj.label} — {obj.code}</Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* Sidebar: object list + editor */}
        <div className="sidebar">
          {/* Object list */}
          <div className="object-list">
            <h3>Objects</h3>
            {objects.map(obj => (
              <div
                key={obj.id}
                className={`object-row ${selected?.id === obj.id ? 'selected' : ''}`}
                onClick={() => setSelected(obj)}
              >
                <span className="object-icon">
                  {obj.type === '3d_model' ? '🎁' : obj.type === 'text' ? '💬' : '🥚'}
                </span>
                <span className="object-label">{obj.label}</span>
                <span className="object-code">{obj.code}</span>
              </div>
            ))}
            {objects.length === 0 && <p className="hint">Click the map to place objects</p>}
          </div>

          {/* Property editor */}
          {selected && (
            <div className="props">
              <h3>Properties</h3>

              <label>Label</label>
              <input
                value={selected.label}
                onChange={e => setSelected({ ...selected, label: e.target.value })}
                onBlur={() => updateObject(selected)}
              />

              <label>Type</label>
              <select
                value={selected.type}
                onChange={e => {
                  const updated = { ...selected, type: e.target.value as ObjectType };
                  setSelected(updated);
                  updateObject(updated);
                }}
              >
                <option value="code_object">🥚 Code Object</option>
                <option value="3d_model">🎁 3D Model</option>
                <option value="text">💬 Text</option>
              </select>

              <label>Code</label>
              <input
                value={selected.code}
                onChange={e => setSelected({ ...selected, code: e.target.value.toUpperCase() })}
                onBlur={() => updateObject(selected)}
              />

              {selected.type === 'text' && (
                <>
                  <label>Display Text</label>
                  <input
                    value={selected.display_text || ''}
                    onChange={e => setSelected({ ...selected, display_text: e.target.value })}
                    onBlur={() => updateObject(selected)}
                  />
                </>
              )}

              {selected.type === '3d_model' && (
                <>
                  <label>Model Reference</label>
                  <input
                    value={selected.model_ref || ''}
                    onChange={e => setSelected({ ...selected, model_ref: e.target.value })}
                    onBlur={() => updateObject(selected)}
                    placeholder="model.glb"
                  />
                </>
              )}

              <div className="coords">
                {selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}
              </div>

              <button className="delete-btn" onClick={() => deleteObject(selected.id)}>
                Delete Object
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
