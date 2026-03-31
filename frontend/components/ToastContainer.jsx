import styles from './css/ToastContainer.module.css'

const TYPE_CLS = { ok: 'ok', err: 'err', warn: 'warn', inf: 'inf' }

export default function ToastContainer({ toasts }) {
  return (
    <div className={styles.container}>
      {toasts.map(t => (
        <div key={t.id} className={`${styles.toast} ${styles[TYPE_CLS[t.type]]}`}>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  )
}
