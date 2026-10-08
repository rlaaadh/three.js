# my tiny room

모눈종이 노트 위에 놓인 작은 3D 방. 캐릭터를 클릭으로 움직이고, 침대에 눕히거나 책상에 앉힐 수 있어요.

- Three.js + Vite + TypeScript (React 없이 순수 Three.js)
- 고정 시점 직교 카메라 (아이소메트릭 느낌), 마우스 휠 · 버튼으로 확대/축소
- 연필 스케치 로딩 인트로 → 방이 튀어나오고 캐릭터가 떨어지는 연출

## 실행

Node 20 이상이 필요해요 (`.nvmrc` 참고).

```bash
nvm use
npm install
npm run dev
```

## 폴더 구조

```
src/
├── main.ts                  진입점: 조립, 인트로 연출, 렌더 루프
├── style.css                로딩 화면 · HUD 스타일
├── core/
│   ├── Stage.ts             렌더러 · 씬 · 고정 카메라 · 조명 · 휠 줌
│   └── Loader.ts            로딩 인트로 (진행률 + 최소 연출 시간)
├── world/
│   ├── Paper.ts             모눈종이 바닥 + 그림자 받는 평면
│   ├── Room.ts              방 · 가구 (임시 도형) + 침대/책상 Spot 정의
│   ├── Character.ts         캐릭터 (임시 도형) + 상태 머신 (idle/walk/lie/sit)
│   ├── Navigation.ts        걸을 수 있는 범위 · 바닥 높이 · 벽 돌아가는 경로
│   ├── Footprints.ts        걸을 때 찍혔다 지워지는 연필 발자국
│   ├── Nature.ts            종이 위 크레용 나무 · 꽃
│   ├── Labels.ts            종이 위 손글씨 문구
│   └── ClickMarker.ts       바닥 클릭 위치 표시
├── interaction/
│   └── Pointer.ts           Raycaster 클릭 · 호버 처리
├── ui/
│   └── SpeechBubble.ts      캐릭터를 따라다니는 HTML 말풍선
└── utils/
    ├── fonts.ts             손글씨 폰트 이름 · 한글 폰트 미리 받기
    └── math.ts              이징 · 보간 함수
```

## 동작 흐름

| 입력 | 결과 |
| --- | --- |
| 바닥 클릭 | 그 위치로 걸어가요. 방 밖 종이 위도 가능하고, 벽은 끝을 돌아서 가요 |
| 침대 클릭 | 침대 옆까지 걸어가서 폴짝 → 눕기 (Zzz) |
| 책상 클릭 | 의자 옆까지 걸어가서 폴짝 → 앉아서 끄적끄적 |
| 누워있거나 앉아있을 때 바닥 클릭 | 일어나서 걸어가요 |
| 마우스 휠 / + − 버튼 | 확대 · 축소 (0.7 ~ 2.4배) |
| 하단 채팅창에 입력 후 Enter | 캐릭터 머리 위 말풍선으로 떠요 |
| 👋 손 흔들기 | 활짝 웃으면서 손을 흔들어요 |

## 다음 단계

- [ ] 캐릭터 GLB 모델로 교체 → `Character.build()` 대신 GLTFLoader + AnimationMixer
- [ ] 방 · 가구 GLB 모델로 교체 → `Room`의 `bed`, `desk`, `floor`, Spot 구조는 유지
- [ ] 가구 · 나무를 피해서 걷기 (지금은 벽만 피해요)
- [ ] 모바일 핀치 줌
- [ ] 손그림 낙서 · 스티커 장식, 효과음

GLB 파일은 `public/models/`에 두고 `Loader`의 `manager`를 GLTFLoader에 넘기면 로딩 진행률에 반영돼요.

## 폰트 바꾸기

1. `index.html`의 Google Fonts `<link>`를 원하는 폰트로 바꾸거나, `public/fonts/`에 woff2를 넣고 `style.css`에 `@font-face`를 추가해요.
2. `style.css`의 `--font-hand`와 `src/utils/fonts.ts`의 `HAND_FONT`를 같은 이름으로 바꿔요.

3D 바닥 글씨는 캔버스에 그리기 때문에, `loadHandFont()`가 실제로 그릴 한글을 넘겨서 폰트를 미리 받아온 뒤에 그려요.

## 배포 (GitHub Pages)

`main` 브랜치에 push하면 GitHub Actions(`.github/workflows/deploy.yml`)가 빌드해서 배포해요.

- 주소: https://rlaaadh.github.io/three.js/
- 처음 한 번만: 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정해요.
- 배포 진행 상황은 저장소의 **Actions** 탭에서 볼 수 있어요.
