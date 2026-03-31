/**
 * ActivityChart — dữ liệu thật từ DB (v_weekly_auth_stats)
 */
import { useRef, useMemo } from 'react'
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Legend, Filler
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import styles from './css/ActivityChart.module.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

// Fallback khi DB chưa có dữ liệu
const EMPTY_WEEK = ['T2','T3','T4','T5','T6','T7','CN'].map(d => ({
  day_name: d, success_count: 0, fail_count: 0
}))

// Map tên tiếng Anh → viết tắt tiếng Việt
const DAY_MAP = {
  Monday:'T2', Tuesday:'T3', Wednesday:'T4', Thursday:'T5',
  Friday:'T6', Saturday:'T7', Sunday:'CN'
}

export default function ActivityChart({ theme, chartData }) {
  const chartRef = useRef(null)
  const primary  = theme?.primary || '#ec4899'

  // Xử lý dữ liệu từ DB
  const { labels, successData, failData } = useMemo(() => {
    const rows = chartData?.length ? chartData : EMPTY_WEEK
    return {
      labels:      rows.map(r => DAY_MAP[r.day_name] || r.day_name),
      successData: rows.map(r => Number(r.success_count) || 0),
      failData:    rows.map(r => Number(r.fail_count)    || 0),
    }
  }, [chartData])

  const totalSuccess = successData.reduce((a, b) => a + b, 0)
  const totalFail    = failData.reduce((a, b) => a + b, 0)
  const isRealData   = chartData?.length > 0

  const buildGradient = () => {
    const canvas = chartRef.current?.canvas
    if (!canvas) return primary + '33'
    const ctx = canvas.getContext('2d')
    const g = ctx.createLinearGradient(0, 0, 0, 200)
    g.addColorStop(0, primary + '55')
    g.addColorStop(1, 'transparent')
    return g
  }

  const data = {
    labels,
    datasets: [
      {
        label: 'Thành công',
        data:  successData,
        borderColor:      primary,
        backgroundColor:  buildGradient(),
        fill: true, tension: 0.4, borderWidth: 3,
        pointRadius: 5, pointBackgroundColor: primary,
        pointBorderColor: '#fff', pointBorderWidth: 1.5,
      },
      {
        label: 'Thất bại',
        data:  failData,
        borderColor: '#ef4444', backgroundColor: 'transparent',
        fill: false, tension: 0.4, borderWidth: 2,
        borderDash: [5, 4], pointRadius: 4,
        pointBackgroundColor: '#ef4444',
      },
    ],
  }

  const options = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        labels: {
          color: 'rgba(253,242,248,.55)',
          font: { family: 'Space Grotesk', size: 11 },
          padding: 16,
        },
      },
      tooltip: {
        callbacks: {
          afterTitle: (items) => {
            const idx = items[0]?.dataIndex
            if (idx == null) return ''
            const s = successData[idx], f = failData[idx], total = s + f
            return total ? `Tổng: ${total} | Tỉ lệ: ${Math.round(s/total*100)}%` : ''
          }
        }
      }
    },
    scales: {
      y: {
        display: true, beginAtZero: true,
        grid:  { color: 'rgba(255,255,255,.05)' },
        ticks: { color: 'rgba(253,242,248,.4)', font: { family: 'Space Grotesk', size: 10 }, stepSize: 1 },
      },
      x: {
        grid:  { display: false },
        ticks: { color: 'rgba(253,242,248,.4)', font: { family: 'Space Grotesk', size: 10 } },
      },
    },
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.label}>📊 Lịch Sử Hoạt Động (7 ngày)</div>
        <div className={styles.summary}>
          {isRealData ? (
            <>
              <span className={styles.tagOk}>✓ {totalSuccess} thành công</span>
              <span className={styles.tagFail}>✗ {totalFail} thất bại</span>
            </>
          ) : (
            <span className={styles.tagEmpty}>Chưa có dữ liệu</span>
          )}
        </div>
      </div>
      <div className={styles.wrap}>
        <Line ref={chartRef} data={data} options={options} />
      </div>
    </div>
  )
}
