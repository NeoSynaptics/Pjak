import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet, Text, View, Image, Animated, Alert, ActivityIndicator,
  Dimensions, TouchableOpacity, ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import { createClient } from '@supabase/supabase-js';
import { distanceMeters } from './src/geo';

const supabase = createClient(
  'https://vlaxnupgdviexicirfcq.supabase.co',
  'sb_publishable_62WFR5KXOQcK0Hu_BslujQ_Cs2X3iN9'
);

const PROXIMITY_RADIUS_M = 50;  // meters — bump for GPS drift tolerance
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Bundled pirate quest images — keyed by model_ref in Supabase
const QUEST_IMAGES: Record<string, any> = {
  dumle: require('./assets/dumle.png'),
  geisha: require('./assets/geisha.png'),
  ferrero: require('./assets/ferrero.png'),
  test_egg: require('./assets/test_egg.png'),
};

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

const DEVICE_NAME = 'Pirattelefon';

export default function App() {
  const [objects, setObjects] = useState<PjakObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [nearbyObject, setNearbyObject] = useState<PjakObject | null>(null);
  const [deviceDbId, setDeviceDbId] = useState<string | null>(null);
  const [ready, setReady] = useState(false); // delay proximity check so compass shows first

  const fadeAnim = useRef(new Animated.Value(0)).current;

  // --- Load objects + register device on startup ---
  useEffect(() => {
    (async () => {
      // Load objects
      const { data } = await supabase.from('objects').select('*').order('created_at');
      if (data) setObjects(data);

      // Register device (or reuse existing)
      const { data: existing } = await supabase.from('devices').select('id').eq('name', DEVICE_NAME).single();
      if (existing) {
        setDeviceDbId(existing.id);
      } else {
        const { data: created } = await supabase.from('devices').insert({ name: DEVICE_NAME, lat: 0, lng: 0 }).select('id').single();
        if (created) setDeviceDbId(created.id);
      }

      setLoading(false);
    })();
  }, []);

  // --- GPS + broadcast to devices table ---
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('GPS behövs', 'Aktivera platsåtkomst för att hitta skatten!');
        return;
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 2, timeInterval: 2000 },
        (loc) => {
          const lat = loc.coords.latitude;
          const lng = loc.coords.longitude;
          setUserLat(lat);
          setUserLng(lng);
          // Broadcast position to Supabase — force execution with .then()
          supabase.from('devices').update({ lat, lng, updated_at: new Date().toISOString() }).eq('name', DEVICE_NAME).then(() => {});
        }
      );
    })();
    return () => { sub?.remove(); };
  }, []);

  // --- Delay proximity detection so compass screen shows first ---
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  // --- Proximity check: find nearest object within radius ---
  useEffect(() => {
    if (!ready || userLat === null || userLng === null || objects.length === 0) return;

    let closest: PjakObject | null = null;
    let closestDist = Infinity;

    for (const obj of objects) {
      const dist = distanceMeters(userLat, userLng, obj.lat, obj.lng);
      if (dist <= PROXIMITY_RADIUS_M && dist < closestDist) {
        closest = obj;
        closestDist = dist;
      }
    }

    setNearbyObject(closest);
  }, [userLat, userLng, objects, ready]);

  // --- Fade-in animation when photo appears ---
  useEffect(() => {
    if (!nearbyObject) {
      fadeAnim.setValue(0);
      return;
    }
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [nearbyObject?.id]);

  // --- Loading ---
  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#ffd700" />
        <Text style={s.subtitle}>Laddar skattkartan...</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  // --- Photo reveal when player reaches the spot ---
  if (nearbyObject) {
    const imageSource = nearbyObject.model_ref ? QUEST_IMAGES[nearbyObject.model_ref] : null;

    return (
      <View style={s.foundContainer}>
        <StatusBar style="light" hidden />

        {imageSource ? (
          <Animated.View style={[s.photoWrap, { opacity: fadeAnim }]}>
            <ScrollView
              maximumZoomScale={4}
              minimumZoomScale={1}
              contentContainerStyle={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}
              bouncesZoom
            >
              <Image source={imageSource} style={s.photoFull} resizeMode="contain" />
            </ScrollView>
          </Animated.View>
        ) : (
          <Text style={s.foundIcon}>🏴‍☠️</Text>
        )}

        <Text style={s.hintOverlay}>Studera bilden noga — hitta det hemliga kodordet!</Text>
      </View>
    );
  }

  // --- Compass walking screen — shown while searching ---
  return (
    <View style={s.compassContainer}>
      <StatusBar style="light" />

      <Image source={require('./assets/compass.png')} style={s.compass} resizeMode="contain" />

      <Text style={s.compassTitle}>Följ kaptenens order...</Text>
      <Text style={s.compassHint}>Lyssna på datorn — de ser var du är!</Text>

      {userLat && userLng && (
        <View style={s.coordsBadge}>
          <Text style={s.coordsText}>{userLat.toFixed(5)}, {userLng.toFixed(5)}</Text>
          {objects.map((obj) => {
            const dist = distanceMeters(userLat, userLng, obj.lat, obj.lng);
            return (
              <Text key={obj.id} style={[s.coordsText, dist <= PROXIMITY_RADIUS_M && { color: '#00ff88' }]}>
                {obj.label}: {dist < 1000 ? `${dist.toFixed(0)}m` : `${(dist / 1000).toFixed(1)}km`}
              </Text>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#0b1129', alignItems: 'center', justifyContent: 'center', padding: 32 },
  subtitle: { fontSize: 16, color: '#aaa', marginTop: 12 },

  // Compass walking screen
  compassContainer: {
    flex: 1,
    backgroundColor: '#0b1129',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  compass: {
    width: SCREEN_W * 0.6,
    height: SCREEN_W * 0.6,
    marginBottom: 32,
  },
  compassTitle: {
    color: '#e3ff00',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 1,
  },
  compassHint: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
    letterSpacing: 0.5,
  },
  coordsBadge: {
    marginTop: 24,
    backgroundColor: 'rgba(227,255,0,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(227,255,0,0.15)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  coordsText: {
    color: 'rgba(227,255,0,0.4)',
    fontSize: 11,
    fontFamily: 'Courier',
  },

  // Photo reveal
  foundContainer: { flex: 1, backgroundColor: '#000' },
  photoWrap: { flex: 1 },
  photoFull: { width: SCREEN_W, height: SCREEN_H },
  foundIcon: { fontSize: 120, textAlign: 'center', marginTop: 80 },
  hintOverlay: {
    position: 'absolute', bottom: 40, left: 20, right: 20,
    color: '#fff', fontSize: 13, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  hintText: { color: '#aaa', fontSize: 14, marginTop: 6, textAlign: 'center' },
});
