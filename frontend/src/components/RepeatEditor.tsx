import { WEEKDAYS, parseDays, formatDays } from '../utils/recurrence'

interface RepeatEditorProps {
  value: string                      // weekly repeat rule, '' = does not repeat
  onChange: (rule: string) => void
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Seven day toggles — the days of the week an item repeats on. None picked
// means it doesn't repeat.
function RepeatEditor({ value, onChange }: RepeatEditorProps) {
  const days = parseDays(value) ?? []
  const toggle = (d: string) => onChange(formatDays(days.includes(d) ? days.filter(x => x !== d) : [...days, d]))
  return (
    <div className="repeat-days" role="group" aria-label="Repeat on">
      {WEEKDAYS.map((d, i) => (
        <button
          key={d}
          type="button"
          className={`repeat-day${days.includes(d) ? ' active' : ''}`}
          onClick={() => toggle(d)}
          aria-pressed={days.includes(d)}
          title={DAY_NAMES[i]}
        >
          {DAY_LETTERS[i]}
        </button>
      ))}
    </div>
  )
}

export default RepeatEditor
