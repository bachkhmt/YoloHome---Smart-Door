/**
 * useAdafruitMqtt.js
 * 
 * Custom Hook để kết nối MQTT với Adafruit IO
 * Nhận dữ liệu real-time từ các feed:
 *  - Sensors: temp, hum, light
 *  - Door state: locked/unlocked  ← Python publish sau khi thực hiện lệnh
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
  }
};

export default function useAdafruitMqtt() {
  const [sensorData, setSensorData] = useState({ temp: 24.5, hum: 52, light: 310 });
  const [latestFace, setLatestFace] = useState(null);
  const [doorState, setDoorState]   = useState(null);  // null = chưa nhận từ Adafruit
  const [connected, setConnected]   = useState(false);

  const clientRef = useRef(null);

  useEffect(() => {
    // Không check cứng credentials — chỉ cần có giá trị là kết nối
    if (!ADAFRUIT_CONFIG.username || !ADAFRUIT_CONFIG.key) {
      console.warn('⚠️ Chưa cấu hình Adafruit IO credentials trong useAdafruitMqtt.js');
      return;
    }

    import('mqtt').then((mqtt) => {
      // path /mqtt bắt buộc với Adafruit IO WebSocket
      const brokerUrl = `wss://io.adafruit.com:443/mqtt`;
      const options = {
        username: ADAFRUIT_CONFIG.username,
        password: ADAFRUIT_CONFIG.key,
        clientId: `yolo-home-${Math.random().toString(16).slice(2, 8)}`,
        clean: true,
        reconnectPeriod: 5000,
      };

      console.log('🔄 Đang kết nối Adafruit MQTT...');
      const client = mqtt.connect(brokerUrl, options);
      clientRef.current = client;

      client.on('connect', () => {
        console.log('✅ Đã kết nối Adafruit MQTT');
        setConnected(true);

        const { username, feeds } = ADAFRUIT_CONFIG;
        client.subscribe(`${username}/feeds/${feeds.temp}`);
        client.subscribe(`${username}/feeds/${feeds.humidity}`);
        client.subscribe(`${username}/feeds/${feeds.light}`);
        client.subscribe(`${username}/feeds/${feeds.door}`);
        client.subscribe(`${username}/feeds/${feeds.face}`);

        console.log('📡 Đã subscribe các feed:', Object.values(feeds));
      });

      client.on('message', (topic, message) => {
        try {
          const payload = message.toString();
          const { feeds } = ADAFRUIT_CONFIG;

          if (topic.includes(feeds.temp)) {
            setSensorData(prev => ({ ...prev, temp: parseFloat(payload) }));
            console.log('🌡️ Nhiệt độ:', payload);
          }
          else if (topic.includes(feeds.humidity)) {
            setSensorData(prev => ({ ...prev, hum: parseFloat(payload) }));
            console.log('💧 Độ ẩm:', payload);
          }
          else if (topic.includes(feeds.light)) {
            setSensorData(prev => ({ ...prev, light: parseFloat(payload) }));
            console.log('💡 Ánh sáng:', payload);
          }
          else if (topic.includes(feeds.door)) {
            // Python publish "UNLOCK" hoặc "LOCK" sau khi thực hiện lệnh thật
            console.log('🚪 [MQTT] Nhận door state từ Adafruit:', payload);
            setDoorState(payload);
          }
          else if (topic.includes(feeds.face)) {
            try {
              setLatestFace(JSON.parse(payload));
            } catch {
              setLatestFace({ label: payload, confidence: null });
            }
            console.log('👤 Nhận diện:', payload);
          }
        } catch (err) {
          console.error('❌ Lỗi parse MQTT message:', err);
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
        console.log('🔄 Đang reconnect MQTT...');
      });

    }).catch((err) => {
      console.error('❌ Không thể load MQTT library:', err);
      console.log('💡 Chạy: npm install mqtt');
    });

    return () => {
      if (clientRef.current) {
        clientRef.current.end();
        console.log('🛑 Đã ngắt kết nối MQTT');
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

  return { sensorData, latestFace, doorState, connected, publishDoorState };
}