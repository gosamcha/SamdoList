import { useState } from 'react'
import { restoreCloudDataToLocal } from '../lib/cloudRestore'

export default function CloudRestore() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleRestore() {
    const confirmed = window.confirm(
      '이 기기의 기존 데이터를 지우고 클라우드 데이터로 복원할까?',
    )

    if (!confirmed) return

    try {
      setLoading(true)
      setMessage('Restoring...')

      const result = await restoreCloudDataToLocal()

      setMessage(
        `완료: ${result.total}개 항목 복원 / ` +
          `건너뛴 Todo ${result.skippedTasks}개 / ` +
          `건너뛴 Template Task ${result.skippedTemplateTasks}개`,
      )
    } catch (error) {
      console.error(error)

      if (error instanceof Error) {
        setMessage(error.message)
      } else {
        setMessage('복원 중 오류가 발생했어.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <h1>SamdoList Cloud Restore</h1>

        <p>
          클라우드에 저장된 SamdoList 데이터를 현재 기기로 가져와.
        </p>

        <button
          type="button"
          disabled={loading}
          onClick={() => void handleRestore()}
        >
          {loading ? 'Restoring...' : 'Restore Cloud Data'}
        </button>

        {message && <p>{message}</p>}

        {message.startsWith('완료:') && (
          <button
            type="button"
            onClick={() => {
              window.location.href = '/'
            }}
          >
            Back to SamdoList
          </button>
        )}
      </div>
    </div>
  )
}