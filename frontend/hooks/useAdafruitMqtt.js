import React from 'react';
import useAdafruitMqtt from '../hooks/useAdafruitMqtt';

export default function Dashboard() {
  // Lấy dữ liệu real-time từ Hook vừa tạo
  const { sensorData, latestFace, doorState } = useAdafruitMqtt();

  return (
    <div style={{ padding: '20px' }}>
      <h1>🏠 YOLO Home Dashboard (Real-time)</h1>

      {/* Hiển thị Trạng thái Cửa */}
      <div className="card">
        <h3>Trạng thái cửa: {doorState}</h3>
      </div>

      {/* Hiển thị Cảm biến ngay lập tức */}
      <div className="card">
        <h3>🌡️ Môi trường</h3>
        <p>Nhiệt độ: <b>{sensorData.temp}°C</b></p>
        <p>Độ ẩm: <b>{sensorData.hum}%</b></p>
        <p>Ánh sáng: <b>{sensorData.light} lux</b></p>
      </div>

      {/* Hiển thị người vừa vào */}
      <div className="card">
        <h3>👤 Khách vừa tới</h3>
        {latestFace ? (
          <p>
            Tên: <b>{latestFace.label}</b> 
            (Độ tin cậy: {Math.round(latestFace.confidence * 100)}%)
          </p>
        ) : (
          <p>Chưa có ai ở trước camera.</p>
        )}
      </div>
    </div>
  );
}