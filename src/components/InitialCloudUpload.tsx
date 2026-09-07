import { useState } from 'react'
import { uploadExistingDataToCloud } from '../lib/initialCloudUpload'

export default function InitialCloudUpload() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleUpload = async () => {
    const confirmed = window.confirm(
      '이 기기의 삼두리스트 데이터를 최초 클라우드 데이터로 업로드할까?',
    )

    if (!confirmed) return

    try {
      setLoading(true)
      setMessage('Uploading...')

      const result = await uploadExistingDataToCloud()

      setMessage(
        `완료: 총 ${result.total}개 항목을 클라우드에 저장했어.`,
      )
    } catch (error) {
      console.error(error)

      if (error instanceof Error) {
        setMessage(error.message)
      } else {
        setMessage('업로드 중 오류가 발생했어.')
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
          maxWidth: '400px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <h1>SamdoList Cloud Migration</h1>

        <p>
          현재 기기에 저장된 SamdoList 데이터를 Supabase에 최초
          업로드해.
        </p>

        <button
          type="button"
          disabled={loading}
          onClick={() => void handleUpload()}
        >
          {loading ? 'Uploading...' : 'Upload Local Data'}
        </button>

        {message && <p>{message}</p>}
      </div>
    </div>
  )
}