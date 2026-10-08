const HEARTS = ['❤️', '💗', '💖', '❤️', '💕']

const random = (min: number, max: number) => min + Math.random() * (max - min)

/**
 * 화면의 한 지점 주변에 하트 이모지를 여러 개 띄워요.
 * 각 하트가 위로 떠오르며 사라지는 건 CSS 애니메이션(.heart)이 처리하고, 끝나면 DOM에서 지워요.
 */
export function burstHearts(x: number, y: number, count = 12) {
  for (let i = 0; i < count; i++) {
    const heart = document.createElement('span')
    heart.className = 'heart'
    heart.textContent = HEARTS[Math.floor(Math.random() * HEARTS.length)]
    heart.style.left = `${x + random(-70, 70)}px`
    heart.style.top = `${y + random(-30, 50)}px`
    heart.style.setProperty('--size', `${random(20, 36)}px`)
    heart.style.setProperty('--dx', `${random(-40, 40)}px`)
    heart.style.setProperty('--rise', `${random(90, 170)}px`)
    heart.style.setProperty('--rotate', `${random(-25, 25)}deg`)
    heart.style.setProperty('--duration', `${random(1.2, 1.9)}s`)
    heart.style.setProperty('--delay', `${random(0, 0.35)}s`)
    heart.addEventListener('animationend', () => heart.remove())
    document.body.appendChild(heart)
  }
}
