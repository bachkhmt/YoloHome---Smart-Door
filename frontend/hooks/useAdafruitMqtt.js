/**
 * useAdafruitMqtt.js
 * 
 * Custom Hook để kết nối MQTT với Adafruit IO
 * Nhận dữ liệu real-time từ các feed:
 *  - Sensors: temp, hum, light
 *  - Door state: locked/unlocked
 *  - Face detection: label, confidence
 */

import { useState, useEffect, useRef } from 'react';

// ══════════════════════════════════════════════════════════════
//  CẤU HÌNH ADAFRUIT IO - Thay đổi theo tài khoản của bạn
// ══════════════════════════════════════════════════════════════
const ADAFRUIT_CONFIG = {
  username: 'Bachk23_',  // 👈 Thay bằng username của bạn
  key: 'aio_IaJW43vyweEQJnVKgszxrmhkdZ2D',                 // 👈 Thay bằng AIO Key của bạn
  
  // Tên các feed trên Adafruit IO
  feeds: {
    temp:  "yolohome.temperature",
    light:        "yolohome.light",
    humidity:       "yolohome.humidity",
    face:         "yolohome.face-detected",
    door:    "yolohome.door-lock",
  }
};

export default function useAdafruitMqtt() {
  // ── State ──────────────────────────────────────────────────
  const [sensorData, setSensorData] = useState({
    temp: 24.5,
    hum: 52,
    light: 310,
  });
  const [latestFace, setLatestFace] = useState(null);
  const [doorState, setDoorState] = useState('locked');
  const [connected, setConnected] = useState(false);

  const clientRef = useRef(null);

  // ══════════════════════════════════════════════════════════════
  //  KẾT NỐI MQTT VỚI ADAFRUIT IO
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    // Kiểm tra cấu hình
    if (ADAFRUIT_CONFIG.username === 'Bachk23_' || 
        ADAFRUIT_CONFIG.key === 'aio_IaJW43vyweEQJnVKgszxrmhkdZ2D') {
      console.warn('⚠️ Chưa cấu hình Adafruit IO credentials trong useAdafruitMqtt.js');
      return;
    }

    // Import MQTT client (cần cài: npm install mqtt)
    import('mqtt').then((mqtt) => {
      const brokerUrl = `wss://io.adafruit.com:443`;
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

      // ── Khi kết nối thành công ──────────────────────────────
      client.on('connect', () => {
        console.log('✅ Đã kết nối Adafruit MQTT');
        setConnected(true);

        // Subscribe tất cả các feed
        const { username, feeds } = ADAFRUIT_CONFIG;
        client.subscribe(`${username}/feeds/${feeds.temp}`);
        client.subscribe(`${username}/feeds/${feeds.humidity}`);
        client.subscribe(`${username}/feeds/${feeds.light}`);
        client.subscribe(`${username}/feeds/${feeds.door}`);
        client.subscribe(`${username}/feeds/${feeds.face}`);

        console.log('📡 Đã subscribe các feed:', Object.values(feeds));
      });

      // ── Nhận message từ các feed ────────────────────────────
      client.on('message', (topic, message) => {
        try {
          const payload = message.toString();
          
          // Xác định feed nào gửi data
          if (topic.includes(feeds.temp)) {
            const temp = parseFloat(payload);
            setSensorData(prev => ({ ...prev, temp }));
            console.log('🌡️ Nhiệt độ:', temp);
          } 
          else if (topic.includes(feeds.humidity)) {
            const hum = parseFloat(payload);
            setSensorData(prev => ({ ...prev, hum }));
            console.log('💧 Độ ẩm:', hum);
          } 
          else if (topic.includes(feeds.light)) {
            const light = parseFloat(payload);
            setSensorData(prev => ({ ...prev, light }));
            console.log('💡 Ánh sáng:', light);
          } 
          else if (topic.includes(feeds.door)) {
            setDoorState(payload);
            console.log('🚪 Cửa:', payload);
          } 
          else if (topic.includes(feeds.face)) {
            // Payload có thể là JSON: {"label": "John", "confidence": 0.95}
            try {
              const faceData = JSON.parse(payload);
              setLatestFace(faceData);
              console.log('👤 Nhận diện:', faceData);
            } catch {
              // Nếu không phải JSON, coi như là tên người
              setLatestFace({ label: payload, confidence: null });
            }
          }
        } catch (err) {
          console.error('❌ Lỗi parse MQTT message:', err);
        }
      });

      // ── Xử lý lỗi ───────────────────────────────────────────
      client.on('error', (err) => {
        console.error('❌ MQTT Error:', err);
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

    // Cleanup khi unmount
    return () => {
      if (clientRef.current) {
        clientRef.current.end();
        console.log('🛑 Đã ngắt kết nối MQTT');
      }
    };
  }, []);

  // ══════════════════════════════════════════════════════════════
  //  PUBLISH DATA LÊN ADAFRUIT (tùy chọn)
  // ══════════════════════════════════════════════════════════════
  const publishDoorState = (state) => {
    if (clientRef.current && connected) {
      const topic = `${ADAFRUIT_CONFIG.username}/feeds/${ADAFRUIT_CONFIG.feeds.door}`;
      clientRef.current.publish(topic, state);
      console.log('📤 Published door state:', state);
    }
  };

  return {
    sensorData,
    latestFace,
    doorState,
    connected,
    publishDoorState, // Hàm publish (nếu cần điều khiển từ frontend)
  };
}