// 00시 ~ 23시
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, '0'),
)

// 5분 단위
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) =>
  String(index * 5).padStart(2, '0'),
)

type TimeSelectProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  allowEmpty?: boolean
}

function splitTime(value: string) {
  // 저장된 시간이 없으면 XX:XX로 표시함
  if (!value) {
    return {
      hour: 'XX',
      minute: 'XX',
    }
  }

  const [hour, minute] = value.split(':')

  return {
    hour: hour || 'XX',
    minute: minute || 'XX',
  }
}

function TimeSelect({
  value,
  onChange,
  disabled = false,
  allowEmpty = true,
}: TimeSelectProps) {
  /*
   * 값이 비어 있으면 현재 시간을 자동으로 표시하지 않고
   * XX:XX를 표시함.
   *
   * DayStart처럼 빈 값이 허용되지 않는 곳은
   * allowEmpty={false}를 전달함.
   */
  const { hour, minute } = value
    ? splitTime(value)
    : allowEmpty
      ? splitTime('')
      : splitTime('00:00')

  function updateHour(nextHour: string) {
    // XX를 선택하면 시간 전체를 미설정 상태로 바꿈
    if (nextHour === 'XX') {
      onChange('')
      return
    }

    // XX:XX 상태에서 시를 먼저 고르면 분은 00으로 설정함
    const nextMinute = minute === 'XX' ? '00' : minute

    onChange(`${nextHour}:${nextMinute}`)
  }

  function updateMinute(nextMinute: string) {
    // XX를 선택하면 시간 전체를 미설정 상태로 바꿈
    if (nextMinute === 'XX') {
      onChange('')
      return
    }

    // XX:XX 상태에서 분을 먼저 고르면 시는 00으로 설정함
    const nextHour = hour === 'XX' ? '00' : hour

    onChange(`${nextHour}:${nextMinute}`)
  }

  return (
    <div className="mt-1 grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
      <select
        value={hour}
        disabled={disabled}
        onChange={(event) =>
          updateHour(event.target.value)
        }
        className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
      >
        {/* 기상·취침·투두 시간에서는 XX 선택 가능 */}
        {allowEmpty && (
          <option value="XX">XX</option>
        )}

        {HOUR_OPTIONS.map((hourOption) => (
          <option
            key={hourOption}
            value={hourOption}
          >
            {hourOption}
          </option>
        ))}
      </select>

      <span className="text-sm font-bold text-neutral-500">
        :
      </span>

      <select
        value={minute}
        disabled={disabled}
        onChange={(event) =>
          updateMinute(event.target.value)
        }
        className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
      >
        {/* 기상·취침·투두 시간에서는 XX 선택 가능 */}
        {allowEmpty && (
          <option value="XX">XX</option>
        )}

        {MINUTE_OPTIONS.map((minuteOption) => (
          <option
            key={minuteOption}
            value={minuteOption}
          >
            {minuteOption}
          </option>
        ))}
      </select>
    </div>
  )
}


export default TimeSelect