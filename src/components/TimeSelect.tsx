import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  allowEmpty?: boolean
}

const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

export default function TimeSelect({ value, onChange, disabled, allowEmpty = true }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [choice, setChoice] = useState(['00', '00'])
  function finish(time: string) {
    dialog.current?.close()
    onChange(time)
  }
  return <>
    <button className="time-trigger" type="button" disabled={disabled} aria-haspopup="dialog"
      onClick={() => {
        setChoice((value || '00:00').split(':'))
        dialog.current?.showModal()
      }}>{value || (allowEmpty ? 'XX:XX' : '00:00')}</button>
    {createPortal(<dialog className="time-dialog" ref={dialog} aria-label="시간 선택"
      onClick={event => event.stopPropagation()}>
      <div className="flex items-baseline justify-between"><h2>시간 선택</h2><strong>{choice.join(':')}</strong></div>
      {[hours, minutes].map((options, index) => <fieldset key={index}>
        <legend>{index === 0 ? '시' : '분'}</legend>
        <div className="time-options">{options.map(option =>
          <button type="button" aria-pressed={choice[index] === option} key={option}
            onClick={() => setChoice(current => current.map((part, i) => i === index ? option : part))}>{option}</button>
        )}</div>
      </fieldset>)}
      <footer>{allowEmpty && <button type="button" onClick={() => finish('')}>시간 지우기</button>}
        <button type="button" onClick={() => dialog.current?.close()}>취소</button>
        <button type="button" className="primary-action" onClick={() => finish(choice.join(':'))}>적용</button>
      </footer>
    </dialog>, document.body)}
  </>
}
