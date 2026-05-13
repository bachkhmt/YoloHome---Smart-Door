import { useAppState } from './hooks/useAppState'
import { useFaceRecognition } from './hooks/useFaceRecognition'

import Topbar         from './components/Topbar'
import AlertBar       from './components/AlertBar'
import HeroCard       from './components/HeroCard'
import FaceRecognitionCard from './components/FaceRecognitionCard'
import AuthModes      from './components/AuthModes'
import SensorCard     from './components/SensorCard'
import FanCard        from './components/FanCard'
import MoodCard       from './components/MoodCard'
import ActivityChart  from './components/ActivityChart'
import UserManager    from './components/UserManager'
import AccessLog      from './components/AccessLog'
import SystemStats    from './components/SystemStats'
import PinoutCard     from './components/PinoutCard'
import ToastContainer from './components/ToastContainer'

import styles from './App.module.css'

export default function App() {
  const s = useAppState()
  const fr = useFaceRecognition({ useRealApi: true, onMatch: s.handleFaceMatch })

  if (s.loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingDot} />
        <div className={styles.loadingText}>Connecting to system...</div>
      </div>
    )
  }

  return (
    <>
      <Topbar dbConnected={s.dbConnected} uptimeStart={s.uptimeStart} />
      <AlertBar
        alerts={s.alerts}
        resolveAlertById={s.resolveAlertById}
        resolveAllAlerts={s.resolveAllAlerts}
      />

      <main className={styles.dashboard}>
        <HeroCard
          locked={s.locked} busy={s.busy} ledState={s.ledState}
          startAuth={s.startAuth} manualUnlock={s.manualUnlock} manualLock={s.manualLock}
        />

        {/* Face Recognizer Pipeline */}
        <FaceRecognitionCard
          pipelineState={fr.pipelineState}
          stages={fr.stages}
          lastResult={fr.lastResult}
          faceDetected={fr.faceDetected}
          faceBbox={fr.faceBbox}
          enrolling={fr.enrolling}
          enrollProgress={fr.enrollProgress}
          enrollName={fr.enrollName}
          identities={fr.identities}
          threshold={fr.threshold}
          cameraActive={fr.cameraActive}
          videoRef={fr.videoRef}
          setEnrollName={fr.setEnrollName}
          recognize={fr.recognize}
          enroll={fr.enroll}
          deletePerson={fr.deletePerson}
          calibrate={fr.calibrate}
          reset={fr.reset}
          startCamera={fr.startCamera}
        />

        <AuthModes authMode={s.authMode} toggleAuthMode={s.toggleAuthMode} />

        <SensorCard icon="🌡️" label="Temperature"
          value={s.sensors.temp.toFixed(1)} unit="°C"
          barPct={s.sensors.temp / 40 * 100} delay={0.2}
        />
        <SensorCard icon="💧" label="Humidity"
          value={Math.round(s.sensors.hum)} unit="%"
          barPct={s.sensors.hum} delay={0.25}
        />
        <SensorCard icon="☀️" label="Light"
          value={Math.round(s.sensors.light)} unit="lx"
          barPct={s.sensors.light / 1000 * 100} delay={0.3}
        />

        <FanCard fanSpeed={s.fanSpeed} setFanSpeed={s.setFanSpeed} />
        <MoodCard theme={s.theme} applyTheme={s.applyTheme} />
        <ActivityChart theme={s.theme} chartData={s.chartData} />

        <UserManager
          users={s.users}
          addUserLocal={s.addUserLocal}
          removeUser={s.removeUser}
        />

        <AccessLog logs={s.logs} />
        <SystemStats sysStats={s.sysStats} />
        <PinoutCard />
      </main>

      <ToastContainer toasts={s.toasts} />
    </>
  )
}
