interface NotificationProps {
  message: string
  type: 'success' | 'error' | 'syncing'
}

function Notification({ message, type }: NotificationProps) {
  return (
    <div className={`notification ${type}`}>
      {type === 'syncing' && '🔄 '}
      {type === 'success' && '✓ '}
      {type === 'error' && '✗ '}
      {message}
    </div>
  )
}

export default Notification
