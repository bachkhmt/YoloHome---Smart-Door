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
    if (!window.confirm("Stand in front of the ESP32 camera and press OK to capture your face.")) return

    setLoadingId(userId)
    try {
      const res = await axios.post(`http://localhost:5050/register_face?user_id=${userId}`)
      alert(res.data.message || "Registration successful!")
      window.location.reload()
    } catch (err) {
      alert("Error: " + (err.response?.data?.error || "Cannot connect to AI Backend"))
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.label}>👥 User Management</div>
      <div className={styles.list}>
        {users.map(u => (
          <div key={u.id} className={styles.item}>
            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${u.seed}&backgroundColor=0f0a1f`} className={styles.avt} alt="" />
            <div className={styles.info}>
              <div className={styles.uname}>{u.name} {u.face_enrolled ? '✅' : '❌'}</div>
              <div className={styles.urole}>{u.role} · #{u.id}</div>
            </div>

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
      <button className={styles.btnAdd} onClick={() => setShowForm(v => !v)}>＋ Add User</button>
      {showForm && (
        <div className={styles.form}>
          <input className={styles.input} placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
          <input className={styles.input} placeholder="Role (Owner / Guest...)" value={role} onChange={e => setRole(e.target.value)} />
          <div className={styles.btnRow}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleAdd}>Confirm</button>
            <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
