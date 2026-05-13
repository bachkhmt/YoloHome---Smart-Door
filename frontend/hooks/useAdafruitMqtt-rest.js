/**
 * useAdafruitMqtt.js - REST API Version
 * 
 * Uses Adafruit REST API (polling) instead of MQTT
 * Use when MQTT is unavailable or for simplicity
 */

import { useState, useEffect } from 'react';

// ══════════════════════════════════════════════════════════════
//  ADAFRUIT IO CONFIG — Replace with your credentials
// ══════════════════════════════════════════════════════════════
const ADAFRUIT_CONFIG = {
  username: 'YOUR_ADAFRUIT_USERNAME',  // 👈 Replace with your username
  key: 'YOUR_AIO_KEY',                 // 👈 Replace with your AIO Key
  
  // Feed names on Adafruit IO
  feeds: {
    temp: 'temp',
    humidity: 'humidity',
    light: 'light',
    door: 'door-state',
    face: 'face-detection',
  }
};

const POLL_INTERVAL = 2000; // Poll every 2 seconds

export default function useAdafruitMqtt() {
  const [sensorData, setSensorData] = useState({
    temp: 24.5,
    hum: 52,
    light: 310,
  });
  const [latestFace, setLatestFace] = useState(null);
  const [doorState, setDoorState] = useState('locked');
  const [connected, setConnected] = useState(false);

  // ══════════════════════════════════════════════════════════════
  //  FETCH DỮ LIỆU TỪ ADAFRUIT REST API
  // ══════════════════════════════════════════════════════════════
  const fetchFeedData = async (feedName) => {
    try {
      const url = `https://io.adafruit.com/api/v2/${ADAFRUIT_CONFIG.username}/feeds/${feedName}/data/last`;
      const response = await fetch(url, {
        headers: {
          'X-AIO-Key': ADAFRUIT_CONFIG.key,
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      return data.value;
    } catch (err) {
      console.error(`❌ Fetch error feed ${feedName}:`, err);
      return null;
    }
  };

  // ══════════════════════════════════════════════════════════════
  //  POLLING TẤT CẢ FEEDS
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    // Check configuration
    if (ADAFRUIT_CONFIG.username === 'YOUR_ADAFRUIT_USERNAME' || 
        ADAFRUIT_CONFIG.key === 'YOUR_AIO_KEY') {
      console.warn('⚠️ Adafruit IO credentials not configured in useAdafruitMqtt.js');
      return;
    }

    const pollAllFeeds = async () => {
      try {
        // Fetch all feeds in parallel
        const [temp, hum, light, door, face] = await Promise.all([
          fetchFeedData(ADAFRUIT_CONFIG.feeds.temp),
          fetchFeedData(ADAFRUIT_CONFIG.feeds.humidity),
          fetchFeedData(ADAFRUIT_CONFIG.feeds.light),
          fetchFeedData(ADAFRUIT_CONFIG.feeds.door),
          fetchFeedData(ADAFRUIT_CONFIG.feeds.face),
        ]);

        // Update sensors
        if (temp !== null || hum !== null || light !== null) {
          setSensorData(prev => ({
            temp: temp !== null ? parseFloat(temp) : prev.temp,
            hum: hum !== null ? parseFloat(hum) : prev.hum,
            light: light !== null ? parseFloat(light) : prev.light,
          }));
        }

        // Update door state
        if (door !== null) {
          setDoorState(door);
        }

        // Update face detection
        if (face !== null) {
          try {
            const faceData = JSON.parse(face);
            setLatestFace(faceData);
          } catch {
            setLatestFace({ label: face, confidence: null });
          }
        }

        setConnected(true);
      } catch (err) {
        console.error('❌ Adafruit polling error:', err);
        setConnected(false);
      }
    };

    // Poll immediately
    pollAllFeeds();

    // Then poll on interval
    const intervalId = setInterval(pollAllFeeds, POLL_INTERVAL);

    console.log(`📡 Polling Adafruit IO every ${POLL_INTERVAL/1000}s`);

    return () => {
      clearInterval(intervalId);
      console.log('🛑 Adafruit polling stopped');
    };
  }, []);

  // ══════════════════════════════════════════════════════════════
  //  PUBLISH DATA LÊN ADAFRUIT (REST API)
  // ══════════════════════════════════════════════════════════════
  const publishDoorState = async (state) => {
    try {
      const url = `https://io.adafruit.com/api/v2/${ADAFRUIT_CONFIG.username}/feeds/${ADAFRUIT_CONFIG.feeds.door}/data`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-AIO-Key': ADAFRUIT_CONFIG.key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: state })
      });
      
      if (response.ok) {
        console.log('📤 Published door state:', state);
      }
    } catch (err) {
      console.error('❌ Door state publish error:', err);
    }
  };

  return {
    sensorData,
    latestFace,
    doorState,
    connected,
    publishDoorState,
  };
}
