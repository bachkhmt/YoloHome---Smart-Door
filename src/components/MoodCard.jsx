import styles from './css/MoodCard.module.css'

const MOODS = [
  { primary: '#ec4899', secondary: '#8b5cf6', name: 'Pink Fusion',  grad: 'linear-gradient(135deg,#ec4899,#8b5cf6)' },
  { primary: '#4cc9f0', secondary: '#4361ee', name: 'Cyber Blue',   grad: 'linear-gradient(135deg,#4cc9f0,#4361ee)' },
  { primary: '#06d6a0', secondary: '#0077b6', name: 'Ocean Green',  grad: 'linear-gradient(135deg,#06d6a0,#0077b6)' },
  { primary: '#ffd60a', secondary: '#fb923c', name: 'Solar Flare',  grad: 'linear-gradient(135deg,#ffd60a,#fb923c)' },
  { primary: '#f43f5e', secondary: '#7c3aed', name: 'Red Violet',   grad: 'linear-gradient(135deg,#f43f5e,#7c3aed)' },
]

export default function MoodCard({ theme, applyTheme }) {
  return (
    <div className={styles.card}>
      <div className={styles.label}>🎨 Mood Lighting (RGB LED)</div>
      <div className={styles.row}>
        {MOODS.map(m => (
          <div
            key={m.name}
            className={`${styles.dot} ${theme.name === m.name ? styles.active : ''}`}
            style={{ background: m.grad }}
            onClick={() => applyTheme(m.primary, m.secondary, m.name)}
            title={m.name}
          />
        ))}
      </div>
      <div className={styles.name}>Hiện tại: {theme.name}</div>
    </div>
  )
}
