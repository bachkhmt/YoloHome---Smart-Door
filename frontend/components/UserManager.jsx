import { useState } from 'react'
import styles from './css/UserManager.module.css'

export default function UserManager({ users, addUserLocal, removeUser }) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')

  const handleAdd = () => {
    if (addUserLocal(name, role)) {
      setName(''); setRole(''); setShowForm(false)
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.label}>👥 Quản Lý Người Dùng</div>
      <div className={styles.list}>
        {users.map(u => (
          <div key={u.id} className={styles.item}>
            <img
              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${u.seed}&backgroundColor=0f0a1f`}
              className={styles.avt} alt=""
            />
            <div className={styles.info}>
              <div className={styles.uname}>{u.name}</div>
              <div className={styles.urole}>{u.role} · #{String(u.id).padStart(4,'0')}</div>
            </div>
            <div className={`${styles.dot} ${u.online ? styles.dotOn : styles.dotOff}`} />
            <button className={styles.del} onClick={() => removeUser(u.id)} title="Xóa">✕</button>
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
