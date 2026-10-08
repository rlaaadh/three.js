import { defineConfig } from 'vite'

// GitHub Pages는 https://rlaaadh.github.io/three.js/ 처럼 저장소 이름 아래 경로에서 열려요.
// 빌드할 때만 그 경로를 기준으로 파일 주소를 만들고, 로컬 개발 서버는 그대로 / 에서 열어요.
// (public/ 폴더의 파일을 코드에서 불러올 때는 `${import.meta.env.BASE_URL}models/xxx.glb`처럼 써요)
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/three.js/' : '/',
}))
