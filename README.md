# KEY//DODGE

실제 QWERTY 키보드 전체를 전장으로 사용하는 45초 리듬 회피 게임입니다. 알파벳 키를 누르면 화면 속 플레이어가 해당 키 셀로 즉시 이동합니다. 박자에 맞춰 붉게 예고되는 키를 피하고 최대한 긴 연속 회피를 기록하세요.

## 현재 프로토타입

- QWERTY 알파벳 26키 전체 사용
- `KeyboardEvent.code` 기반 물리 키 위치 입력
- 120 BPM 공격 예고와 키 셀 단위 충돌 판정
- HP 5, 피격 후 500ms 무적
- 45초 생존, 3단계 난이도 상승
- 점수, 연속 회피, 결과 및 즉시 재도전
- Web Audio 효과음과 음소거
- Escape 일시정지 및 탭 이탈 자동 일시정지
- 클릭/터치 키 이동과 반응형 화면

## 조작

| 입력 | 동작 |
|---|---|
| `A`–`Z` | 해당 키 셀로 즉시 이동 |
| `Space` | 게임 시작 / 재시작 |
| `Escape` | 일시정지 / 계속 |
| `0` | 소리 켜기 / 끄기 |

마지막으로 누른 유효 알파벳 키가 현재 위치입니다. 키를 계속 누를 필요는 없으며, 인접한 키로만 이동해야 하는 제한도 없습니다.

## 로컬 실행

Node.js 22.13 이상과 pnpm 11이 필요합니다.

```bash
pnpm install
pnpm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 검사

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
```

## 프로젝트 문서

- `GAME_DESIGN.md`: 게임 규칙과 목표 경험
- `ROADMAP.md`: 구현 단계와 완료 조건
- `DECISIONS.md`: 확정한 설계 결정과 근거
- `AGENTS.md`: 저장소 작업 지침
