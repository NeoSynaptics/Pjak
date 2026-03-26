import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Animated,
  Dimensions,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { supabase, PROXIMITY_RADIUS_M } from './src/supabase';
import { distanceMeters } from './src/geo';

type Waypoint = {
  id: string;
  idx: number;
  label: string;
  lat: number;
  lng: number;
  code: string;
  collected: boolean;
};

type GameState = {
  id: string;
  current_waypoint_index: number;
  status: string;
};

export default function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [showEgg, setShowEgg] = useState(false);
  const [currentCode, setCurrentCode] = useState('');
  const [collected, setCollected] = useState(false);

  const spinAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const mapRef = useRef<MapView>(null);

  // --- Fetch game and waypoints ---
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

  // --- Subscribe to game changes (Mac advances waypoint) ---
  useEffect(() => {
    if (!game) return;

    const channel = supabase
      .channel('game-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${game.id}` },
        (payload) => {
          setGame(payload.new as GameState);
          setShowEgg(false);
          setCollected(false);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'waypoints', filter: `game_id=eq.${game.id}` },
        () => {
          // Reload waypoints when any changes
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

  // --- GPS tracking ---
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'GPS access is needed for the egg hunt!');
        return;
      }

      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 2,
          timeInterval: 2000,
        },
        (loc) => {
          setUserLat(loc.coords.latitude);
          setUserLng(loc.coords.longitude);
        }
      );
    })();

    return () => { sub?.remove(); };
  }, []);

  // --- Push position to Supabase ---
  useEffect(() => {
    if (!game || userLat === null || userLng === null) return;

    const interval = setInterval(async () => {
      await supabase.from('player_position').upsert(
        { game_id: game.id, lat: userLat, lng: userLng, updated_at: new Date().toISOString() },
        { onConflict: 'game_id' }
      );
    }, 3000);

    return () => clearInterval(interval);
  }, [game?.id, userLat, userLng]);

  // --- Proximity check ---
  const currentWaypoint = waypoints.find((w) => w.idx === game?.current_waypoint_index);

  useEffect(() => {
    if (!currentWaypoint || userLat === null || userLng === null) return;

    const dist = distanceMeters(userLat, userLng, currentWaypoint.lat, currentWaypoint.lng);
    if (dist <= PROXIMITY_RADIUS_M && !collected) {
      setShowEgg(true);
      setCurrentCode(currentWaypoint.code);
    } else if (dist > PROXIMITY_RADIUS_M * 2) {
      // Hide if they walk away
      setShowEgg(false);
    }
  }, [userLat, userLng, currentWaypoint, collected]);

  // --- Egg animation ---
  useEffect(() => {
    if (!showEgg) return;

    // Spin
    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      })
    );

    // Bounce
    const bounce = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -20, duration: 800, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    );

    spin.start();
    bounce.start();

    return () => { spin.stop(); bounce.stop(); };
  }, [showEgg]);

  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // --- Collect egg ---
  async function collectEgg() {
    if (!currentWaypoint || !game) return;

    await supabase
      .from('waypoints')
      .update({ collected: true })
      .eq('id', currentWaypoint.id);

    setCollected(true);
    setShowEgg(false);
  }

  // --- Render ---
  const screenW = Dimensions.get('window').width;

  if (!game) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>🥚 Pjak</Text>
        <Text style={styles.subtitle}>Waiting for game...</Text>
        <TouchableOpacity style={styles.btn} onPress={loadGame}>
          <Text style={styles.btnText}>Refresh</Text>
        </TouchableOpacity>
        <StatusBar style="light" />
      </View>
    );
  }

  if (game.status === 'finished') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>🎉 Grattis!</Text>
        <Text style={styles.subtitle}>Du hittade alla ägg!</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  // Egg overlay
  if (showEgg && !collected) {
    return (
      <View style={styles.eggContainer}>
        <Animated.View
          style={[
            styles.eggWrapper,
            {
              transform: [
                { translateY: bounceAnim },
                { rotateY: spinInterpolate },
              ],
            },
          ]}
        >
          <Text style={styles.egg}>🥚</Text>
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>KOD</Text>
            <Text style={styles.codeText}>{currentCode}</Text>
          </View>
        </Animated.View>
        <TouchableOpacity style={styles.collectBtn} onPress={collectEgg}>
          <Text style={styles.collectBtnText}>Samla in!</Text>
        </TouchableOpacity>
        <StatusBar style="light" />
      </View>
    );
  }

  // Collected confirmation
  if (collected) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>✅ Insamlat!</Text>
        <Text style={styles.subtitle}>Koden var: {currentCode}</Text>
        <Text style={styles.hint}>Gå till datorn och skriv in koden!</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  // Map view
  const initialRegion = currentWaypoint
    ? {
        latitude: currentWaypoint.lat,
        longitude: currentWaypoint.lng,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }
    : userLat && userLng
    ? { latitude: userLat, longitude: userLng, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : { latitude: 59.33, longitude: 18.07, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  const dist = currentWaypoint && userLat && userLng
    ? distanceMeters(userLat, userLng, currentWaypoint.lat, currentWaypoint.lng)
    : null;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton
      >
        {currentWaypoint && (
          <Marker
            coordinate={{ latitude: currentWaypoint.lat, longitude: currentWaypoint.lng }}
            title={currentWaypoint.label}
            description="Nästa ägg!"
            pinColor="#FF6B35"
          />
        )}
      </MapView>

      {/* Bottom info bar */}
      <View style={styles.infoBar}>
        <Text style={styles.infoTitle}>
          🥚 {currentWaypoint?.label || 'Laddar...'}
        </Text>
        {dist !== null && (
          <Text style={styles.infoDistance}>
            {dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`} kvar
          </Text>
        )}
        <Text style={styles.infoHint}>
          Ägg {(game.current_waypoint_index || 0) + 1} av {waypoints.length}
        </Text>
      </View>

      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: { fontSize: 48, color: '#fff', fontWeight: 'bold' },
  subtitle: { fontSize: 20, color: '#aaa', marginTop: 12 },
  hint: { fontSize: 16, color: '#ffd700', marginTop: 20, textAlign: 'center' },
  btn: {
    marginTop: 24,
    backgroundColor: '#FF6B35',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  infoBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(26,26,46,0.95)',
    padding: 20,
    paddingBottom: 40,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  infoTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  infoDistance: { color: '#FF6B35', fontSize: 32, fontWeight: 'bold', marginTop: 4 },
  infoHint: { color: '#888', fontSize: 14, marginTop: 6 },
  eggContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eggWrapper: { alignItems: 'center' },
  egg: { fontSize: 120 },
  codeBox: {
    marginTop: 20,
    backgroundColor: '#ffd700',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  codeLabel: { fontSize: 14, color: '#333', fontWeight: '600' },
  codeText: { fontSize: 48, color: '#1a1a2e', fontWeight: 'bold', letterSpacing: 8 },
  collectBtn: {
    marginTop: 40,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 16,
  },
  collectBtnText: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
});
