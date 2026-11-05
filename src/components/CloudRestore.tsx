import { useState } from 'react'
import { restoreCloudDataToLocal } from '../lib/cloudRestore'

export default function CloudRestore() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleRestore() {
    const confirmed = window.confirm(
      'Replace the records on this device with your cloud records?',
    )

    if (!confirmed) return

    try {
      setLoading(true)
      setMessage('Restoring...')

      const result = await restoreCloudDataToLocal()

      setMessage(
        `Restored: ${result.total} items / ` +
          `Skipped tasks: ${result.skippedTasks} / ` +
          `Skipped template tasks: ${result.skippedTemplateTasks}`,
      )
    } catch (error) {
      console.error(error)

      if (error instanceof Error) {
        setMessage(error.message)
      } else {
        setMessage('Could not restore records.')
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
          Restore your SamdoList cloud records to this device.
        </p>

        <button
          type="button"
          disabled={loading}
          onClick={() => void handleRestore()}
        >
          {loading ? 'Restoring...' : 'RESTORE CLOUD DATA'}
        </button>

        {message && <p>{message}</p>}

        {message.startsWith('Restored:') && (
          <button
            type="button"
            onClick={() => {
              window.location.href = '/'
            }}
          >
            BACK TO SAMDOLIST
          </button>
        )}
      </div>
    </div>
  )
}