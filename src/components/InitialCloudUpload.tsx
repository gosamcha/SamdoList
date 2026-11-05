import { useState } from 'react'
import { uploadExistingDataToCloud } from '../lib/initialCloudUpload'

export default function InitialCloudUpload() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleUpload = async () => {
    const confirmed = window.confirm(
      'Upload this device’s SamdoList records to the cloud?',
    )

    if (!confirmed) return

    try {
      setLoading(true)
      setMessage('Uploading...')

      const result = await uploadExistingDataToCloud()

      setMessage(
        `Uploaded ${result.total} items.`,
      )
    } catch (error) {
      console.error(error)

      if (error instanceof Error) {
        setMessage(error.message)
      } else {
        setMessage('Could not upload records.')
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
          Upload this device’s SamdoList records
          to the cloud.
        </p>

        <button
          type="button"
          disabled={loading}
          onClick={() => void handleUpload()}
        >
          {loading ? 'Uploading...' : 'UPLOAD LOCAL DATA'}
        </button>

        {message && <p>{message}</p>}
      </div>
    </div>
  )
}