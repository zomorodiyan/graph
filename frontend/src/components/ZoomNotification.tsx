import './ZoomNotification.css'

interface ZoomNotificationProps {
  message: string
  type: 'limit' | 'normal'
}

export default function ZoomNotification({ message, type }: ZoomNotificationProps) {
  return (
    <div className={`zoom-notification ${type}`}>
      {message}
    </div>
  )
}
