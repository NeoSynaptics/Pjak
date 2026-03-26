import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, Animated, Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import { distanceMeters } from './src/geo';
import eggs from '../shared/eggs.json';

const PROXIMITY_RADIUS_M = 15;

// Generate a deterministic-ish code per egg per session
// Session seed is set once when app opens
const SESSION_SEED = Date.now();
function codeForEgg(eggId: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let hash = SESSION_SEED + eggId * 9973;
  let code = '';
  for (let i = 0; i < 4; i++) {
    hash = ((hash * 31337) + 7) & 0x7fffffff;
    code += chars[hash % chars.length];
  }
  return code;
}

export default function App() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [showEgg, setShowEgg] = useState(false);
  const [collected, setCollected] = useState(false);
  const [codes] = useState(() => eggs.map(e => codeForEgg(e.id)));

  const bounceAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  const currentEgg = eggs[currentIdx];
  const currentCode = codes[currentIdx];
  const finished = currentIdx >= eggs.length;

  // --- GPS ---
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('GPS behövs', 'Aktivera platsåtkomst för att hitta äggen!');
        return;
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 2, timeInterval: 2000 },
        (loc) => { setUserLat(loc.coords.latitude); setUserLng(loc.coords.longitude); }
      );
    })();
    return () => { sub?.remove(); };
  }, []);

  // --- Proximity ---
  useEffect(() => {
    if (finished || !currentEgg || userLat === null || userLng === null) return;
    const dist = distanceMeters(userLat, userLng, currentEgg.lat, currentEgg.lng);
    if (dist <= PROXIMITY_RADIUS_M && !collected) {
      setShowEgg(true);
    } else if (dist > PROXIMITY_RADIUS_M * 2) {
      setShowEgg(false);
    }
  }, [userLat, userLng, currentIdx, collected, finished]);

  // --- Animation ---
  useEffect(() => {
    if (!showEgg) return;
    const spin = Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 3000, useNativeDriver: true })
    );
    const bounce = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -20, duration: 800, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    );
    spin.start(); bounce.start();
    return () => { spin.stop(); bounce.stop(); };
  }, [showEgg]);

  const spinInterp = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  function collectEgg() {
    setCollected(true);
    setShowEgg(false);
  }

  function nextEgg() {
    setCurrentIdx(currentIdx + 1);
    setCollected(false);
    setShowEgg(false);
    spinAnim.setValue(0);
    bounceAnim.setValue(0);
  }

  // --- Screens ---
  if (finished) {
    return (
      <View style={s.center}>
        <Text style={s.title}>🎉 Grattis!</Text>
        <Text style={s.subtitle}>Du hittade alla {eggs.length} ägg!</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  if (showEgg && !collected) {
    return (
      <View style={s.eggContainer}>
        <Animated.View style={[s.eggWrap, { transform: [{ translateY: bounceAnim }, { rotateY: spinInterp }] }]}>
          <Text style={s.bigEgg}>🥚</Text>
          <View style={s.codeBox}>
            <Text style={s.codeLabel}>KOD</Text>
            <Text style={s.codeText}>{currentCode}</Text>
          </View>
        </Animated.View>
        <TouchableOpacity style={s.collectBtn} onPress={collectEgg}>
          <Text style={s.collectBtnText}>Samla in!</Text>
        </TouchableOpacity>
        <StatusBar style="light" />
      </View>
    );
  }

  if (collected) {
    return (
      <View style={s.center}>
        <Text style={s.title}>✅ Insamlat!</Text>
        <Text style={s.subtitle}>Koden: {currentCode}</Text>
        <Text style={s.hint}>Skriv in koden på datorn!</Text>
        <TouchableOpacity style={s.btn} onPress={nextEgg}>
          <Text style={s.btnText}>Nästa ägg</Text>
        </TouchableOpacity>
        <StatusBar style="light" />
      </View>
    );
  }

  // Map
  const dist = userLat && userLng
    ? distanceMeters(userLat, userLng, currentEgg.lat, currentEgg.lng)
    : null;

  return (
    <View style={s.container}>
      <MapView
        style={s.map}
        initialRegion={{
          latitude: currentEgg.lat, longitude: currentEgg.lng,
          latitudeDelta: 0.005, longitudeDelta: 0.005,
        }}
        showsUserLocation
        showsMyLocationButton
      >
        <Marker
          coordinate={{ latitude: currentEgg.lat, longitude: currentEgg.lng }}
          title={currentEgg.label}
          pinColor="#FF6B35"
        />
      </MapView>
      <View style={s.infoBar}>
        <Text style={s.infoTitle}>🥚 {currentEgg.label}</Text>
        {dist !== null && (
          <Text style={s.infoDist}>
            {dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`} kvar
          </Text>
        )}
        <Text style={s.infoHint}>Ägg {currentIdx + 1} av {eggs.length}</Text>
      </View>
      <StatusBar style="dark" />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { fontSize: 48, color: '#fff', fontWeight: 'bold' },
  subtitle: { fontSize: 20, color: '#aaa', marginTop: 12 },
  hint: { fontSize: 16, color: '#ffd700', marginTop: 20 },
  btn: { marginTop: 24, backgroundColor: '#FF6B35', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  infoBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(26,26,46,0.95)', padding: 20, paddingBottom: 40,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
  },
  infoTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  infoDist: { color: '#FF6B35', fontSize: 32, fontWeight: 'bold', marginTop: 4 },
  infoHint: { color: '#888', fontSize: 14, marginTop: 6 },
  eggContainer: { flex: 1, backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center' },
  eggWrap: { alignItems: 'center' },
  bigEgg: { fontSize: 120 },
  codeBox: {
    marginTop: 20, backgroundColor: '#ffd700', paddingHorizontal: 32, paddingVertical: 16,
    borderRadius: 16, alignItems: 'center',
  },
  codeLabel: { fontSize: 14, color: '#333', fontWeight: '600' },
  codeText: { fontSize: 48, color: '#1a1a2e', fontWeight: 'bold', letterSpacing: 8 },
  collectBtn: { marginTop: 40, backgroundColor: '#4CAF50', paddingHorizontal: 48, paddingVertical: 16, borderRadius: 16 },
  collectBtnText: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
});
