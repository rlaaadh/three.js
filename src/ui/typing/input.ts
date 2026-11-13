/**
 * 한글 입력창에서 Enter(또는 스페이스)로 제출할 때 마지막 글자가 빠지지 않게 해요.
 * 한글은 치는 동안 글자를 조합(ㄱ→가→각)하는데, 조합 중에 Enter를 누르면
 * 조합이 끝난 뒤(compositionend)에 제출해요. 모바일 키보드의 '이동 · 완료'(submit)도 같이 받아요.
 */
export function bindKoreanInput(
  input: HTMLInputElement,
  form: HTMLFormElement,
  options: { onSubmit: () => void; onInput: () => void; submitOnSpace?: boolean },
) {
  let composing = false
  let submitAfterComposition = false
  const submit = () => {
    if (composing) submitAfterComposition = true
    else options.onSubmit()
  }

  input.addEventListener('compositionstart', () => (composing = true))
  input.addEventListener('compositionend', () => {
    composing = false
    if (!submitAfterComposition) return
    submitAfterComposition = false
    // 조합이 끝난 글자가 value에 반영된 다음에 확인해요
    setTimeout(options.onSubmit, 0)
  })
  input.addEventListener('keydown', (e) => {
    const isSubmitKey = e.key === 'Enter' || (options.submitOnSpace && e.key === ' ')
    if (!isSubmitKey) return
    e.preventDefault()
    if (e.isComposing || e.keyCode === 229) submitAfterComposition = true
    else submit()
  })
  input.addEventListener('input', options.onInput)
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    submit()
  })
}
