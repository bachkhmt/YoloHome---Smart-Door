import { useState } from 'react'
import styles from './css/UserManager.module.css'
import axios from 'axios'

export default function UserManager({ users, addUserLocal, removeUser }) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')

  const handleAdd = () => {
    if (addUserLocal(name, role)) {
      setName(''); setRole(''); setShowForm(false)
    }
  }

  const [loadingId, setLoadingId] = useState(null)

  const registerFace = async (userId) => {
    if (!window.confirm("Hãy đứng trước camera ESP32 và nhấn OK để bắt đầu chụp khuôn mặt.")) return
    
    setLoadingId(userId)
    try {
      // Gọi trực tiếp đến trạm trung chuyển Python (Port 5050)
      const res = await axios.post(`http://localhost:5050/register_face?user_id=${userId}`)
      alert(res.data.message || "Đăng ký thành công!")
      window.location.reload() // Load lại để cập nhật trạng thái face_enrolled
    } catch (err) {
      alert("Lỗi: " + (err.response?.data?.error || "Không thể kết nối với Backend AI"))
    } finally {
      setLoadingId(userId)
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.label}>👥 Quản Lý Người Dùng</div>
      <div className={styles.list}>
        {users.map(u => (
          <div key={u.id} className={styles.item}>
            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${u.seed}&backgroundColor=0f0a1f`} className={styles.avt} alt="" />
            <div className={styles.info}>
              <div className={styles.uname}>{u.name} {u.face_enrolled ? '✅' : '❌'}</div>
              <div className={styles.urole}>{u.role} · #{u.id}</div>
            </div>
            
            {/* Nút Đăng ký gương mặt mới */}
            <button 
              className={styles.btnAction} 
              onClick={() => registerFace(u.id)}
              disabled={loadingId === u.id}
            >
              {loadingId === u.id ? '...' : '📸'}
            </button>

            <button className={styles.del} onClick={() => removeUser(u.id)}>✕</button>
          </div>
        ))}
      </div>
      <button className={styles.btnAdd} onClick={() => setShowForm(v => !v)}>＋ Thêm Người Dùng</button>
      {showForm && (
        <div className={styles.form}>
          <input className={styles.input} placeholder="Họ và tên" value={name} onChange={e => setName(e.target.value)} />
          <input className={styles.input} placeholder="Vai trò (Owner / Guest...)" value={role} onChange={e => setRole(e.target.value)} />
          <div className={styles.btnRow}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleAdd}>Xác nhận</button>
            <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setShowForm(false)}>Hủy</button>
          </div>
        </div>
      )}
    </div>
  )
}
