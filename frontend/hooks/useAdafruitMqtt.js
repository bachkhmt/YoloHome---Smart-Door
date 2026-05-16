/**
 * useAdafruitMqtt.js
 * 
 * Custom Hook to connect MQTT to Adafruit IO
 * Receives real-time data from feeds:
 *  - Sensors: temp, hum, light
 *  - Door state: locked/unlocked  ← Python publishes after executing command
 *  - Face detection: label, confidence
 */

import { useState, useEffect, useRef } from 'react';

const ADAFRUIT_CONFIG = {
  username: 'Bachk23_',
  key: 'aio_IaJW43vyweEQJnVKgszxrmhkdZ2D',
  feeds: {
    temp:     "yolohome.temperature",
    light:    "yolohome.light",
    humidity: "yolohome.humidity",
    face:     "yolohome.face-detected",
    door:     "yolohome.door-lock",
    activity: "yolohome.activity-log",
  }
};

export default function useAdafruitMqtt() {
  const [sensorData, setSensorData] = useState({ temp: 24.5, hum: 52, light: 310 });
  const [latestFace, setLatestFace] = useState(null);
  const [doorState, setDoorState]   = useState(null);  // null = not yet received from Adafruit
  const [connected, setConnected]   = useState(false);

  const clientRef = useRef(null);

  useEffect(() => {
    // Don't enforce credentials — any value will attempt connection
    if (!ADAFRUIT_CONFIG.username || !ADAFRUIT_CONFIG.key) {
      console.warn('⚠️ Adafruit IO credentials not configured in useAdafruitMqtt.js');
      return;
    }

    import('mqtt').then((mqtt) => {
      // /mqtt path is required for Adafruit IO WebSocket
      const brokerUrl = `wss://io.adafruit.com:443/mqtt`;
      const options = {
        username: ADAFRUIT_CONFIG.username,
        password: ADAFRUIT_CONFIG.key,
        clientId: `yolo-home-${Math.random().toString(16).slice(2, 8)}`,
        clean: true,
        reconnectPeriod: 5000,
      };

      console.log('🔄 Connecting to Adafruit MQTT...');
      const client = mqtt.connect(brokerUrl, options);
      clientRef.current = client;

      client.on('connect', () => {
        console.log('✅ Connected to Adafruit MQTT');
        setConnected(true);

        const { username, feeds } = ADAFRUIT_CONFIG;
        client.subscribe(`${username}/feeds/${feeds.temp}`);
        client.subscribe(`${username}/feeds/${feeds.humidity}`);
        client.subscribe(`${username}/feeds/${feeds.light}`);
        client.subscribe(`${username}/feeds/${feeds.door}`);
        client.subscribe(`${username}/feeds/${feeds.face}`);

        console.log('📡 Subscribed to feeds:', Object.values(feeds));
      });

      client.on('message', (topic, message) => {
        try {
          const payload = message.toString();
          const { feeds } = ADAFRUIT_CONFIG;

          if (topic.includes(feeds.temp)) {
            setSensorData(prev => ({ ...prev, temp: parseFloat(payload) }));
            console.log('🌡️ Temperature:', payload);
          }
          else if (topic.includes(feeds.humidity)) {
            setSensorData(prev => ({ ...prev, hum: parseFloat(payload) }));
            console.log('💧 Humidity:', payload);
          }
          else if (topic.includes(feeds.light)) {
            setSensorData(prev => ({ ...prev, light: parseFloat(payload) }));
            console.log('💡 Light:', payload);
          }
          else if (topic.includes(feeds.door)) {
            // Python publishes "UNLOCK" or "LOCK" after executing the real command
            console.log('🚪 [MQTT] Received door state from Adafruit:', payload);
            setDoorState(payload);
          }
          else if (topic.includes(feeds.face)) {
            try {
              setLatestFace(JSON.parse(payload));
            } catch {
              setLatestFace({ label: payload, confidence: null });
            }
            console.log('👤 Face detected:', payload);
          }
        } catch (err) {
          console.error('❌ MQTT parse error:', err);
        }
      });

      client.on('error', (err) => {
        console.error('❌ MQTT Error:', err.message);
        setConnected(false);
      });

      client.on('close', () => {
        console.log('🔌 MQTT disconnected');
        setConnected(false);
      });

      client.on('reconnect', () => {
        console.log('🔄 Reconnecting MQTT...');
      });

    }).catch((err) => {
      console.error('❌ Could not load MQTT library:', err);
      console.log('💡 Run: npm install mqtt');
    });

    return () => {
      if (clientRef.current) {
        clientRef.current.end();
        console.log('🛑 MQTT disconnected');
      }
    };
  }, []);

  const publishDoorState = (state) => {
    if (clientRef.current && connected) {
      const topic = `${ADAFRUIT_CONFIG.username}/feeds/${ADAFRUIT_CONFIG.feeds.door}`;
      clientRef.current.publish(topic, state);
      console.log('📤 Published door state:', state);
    }
  };

  const publishActivity = (entry) => {
    if (clientRef.current && connected) {
      const topic = `${ADAFRUIT_CONFIG.username}/feeds/${ADAFRUIT_CONFIG.feeds.activity}`;
      const payload = JSON.stringify(entry);
      clientRef.current.publish(topic, payload);
      console.log('📤 Published activity log:', payload);
    }
  };

  return { sensorData, latestFace, doorState, connected, publishDoorState, publishActivity };
}