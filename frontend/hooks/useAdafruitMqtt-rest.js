/**
 * useAdafruitMqtt.js - REST API Version
 * 
 * Phiên bản sử dụng Adafruit REST API (polling) thay vì MQTT
 * Dùng khi MQTT không khả dụng hoặc muốn đơn giản hơn
 */

import { useState, useEffect } from 'react';

// ══════════════════════════════════════════════════════════════
//  CẤU HÌNH ADAFRUIT IO - Thay đổi theo tài khoản của bạn
// ══════════════════════════════════════════════════════════════
const ADAFRUIT_CONFIG = {
  username: 'YOUR_ADAFRUIT_USERNAME',  // 👈 Thay bằng username của bạn
  key: 'YOUR_AIO_KEY',                 // 👈 Thay bằng AIO Key của bạn
  
  // Tên các feed trên Adafruit IO
  feeds: {
    temp: 'temp',
    humidity: 'humidity',
    light: 'light',
    door: 'door-state',
    face: 'face-detection',
  }
};

const POLL_INTERVAL = 2000; // Poll mỗi 2 giây

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
      console.error(`❌ Lỗi fetch feed ${feedName}:`, err);
      return null;
    }
  };

  // ══════════════════════════════════════════════════════════════
  //  POLLING TẤT CẢ FEEDS
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    // Kiểm tra cấu hình
    if (ADAFRUIT_CONFIG.username === 'YOUR_ADAFRUIT_USERNAME' || 
        ADAFRUIT_CONFIG.key === 'YOUR_AIO_KEY') {
      console.warn('⚠️ Chưa cấu hình Adafruit IO credentials trong useAdafruitMqtt.js');
      return;
    }

    const pollAllFeeds = async () => {
      try {
        // Fetch song song tất cả feeds
        const [temp, hum, light, door, face] = await Promise.all([
          fetchFeedData(ADAFRUIT_CONFIG.feeds.temp),
          fetchFeedData(ADAFRUIT_CONFIG.feeds.humidity),
          fetchFeedData(ADAFRUIT_CONFIG.feeds.light),
          fetchFeedData(ADAFRUIT_CONFIG.feeds.door),
          fetchFeedData(ADAFRUIT_CONFIG.feeds.face),
        ]);

        // Cập nhật sensors
        if (temp !== null || hum !== null || light !== null) {
          setSensorData(prev => ({
            temp: temp !== null ? parseFloat(temp) : prev.temp,
            hum: hum !== null ? parseFloat(hum) : prev.hum,
            light: light !== null ? parseFloat(light) : prev.light,
          }));
        }

        // Cập nhật door state
        if (door !== null) {
          setDoorState(door);
        }

        // Cập nhật face detection
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
        console.error('❌ Lỗi polling Adafruit:', err);
        setConnected(false);
      }
    };

    // Poll ngay lập tức
    pollAllFeeds();

    // Sau đó poll theo interval
    const intervalId = setInterval(pollAllFeeds, POLL_INTERVAL);

    console.log(`📡 Đang polling Adafruit IO mỗi ${POLL_INTERVAL/1000}s`);

    return () => {
      clearInterval(intervalId);
      console.log('🛑 Đã dừng polling Adafruit');
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
      console.error('❌ Lỗi publish door state:', err);
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
