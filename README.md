# Resonance Update Check

RES 공식 네이버 라운지와 YouTube 채널을 GitHub Actions에서 주기적으로 확인하고, 새 항목이 있으면 Discord Webhook으로 알립니다.

이 프로젝트는 public repository의 GitHub-hosted runner에서 배치로 실행하는 구조입니다. `X`, `WEIBO`, `Playwright`, 상시 서버, Discord Gateway Bot은 사용하지 않습니다.

## 대상

- Naver Lounge: `https://m.game.naver.com/profile/777ff8c47a8bcd406196c695e959ac7a/RES#feed`
- YouTube: `https://www.youtube.com/@resonanceKR`

YouTube 공식 버튼 링크 `https://rzns-kr.onelink.me/6iYR/a2lrqem1`는 2026-06-24 확인 기준 `https://www.youtube.com/@resonanceKR?...`로 리다이렉트됩니다. collector 내부에서는 리다이렉트 후 채널 URL을 사용합니다.

## 실행

GitHub repository secret에 Discord Webhook URL을 저장합니다.

```text
DISCORD_WEBHOOK_URL
```

GitHub Actions의 `Check RES updates` workflow가 자동 실행됩니다.

- 네이버 라운지: 5분마다 실행
- YouTube: 30분마다 실행
- 첫 실행: baseline 저장만 수행하고 알림은 보내지 않음
- 이후 실행: `data/state.json`에 없는 신규 항목만 Discord Webhook으로 전송

## 로컬 테스트

```powershell
npm.cmd install
Copy-Item .env.example .env
$env:DRY_RUN='true'
$env:STATE_PATH="$pwd\data\state.local.json"
npm.cmd run check:updates -- --source=NAVER_LOUNGE,YOUTUBE
npm.cmd run verify
```

`DRY_RUN=true`이면 Discord로 전송하지 않고 수집과 중복 판정만 확인합니다.

## 주요 환경변수

- `DISCORD_WEBHOOK_URL`: 알림을 보낼 Discord Webhook URL입니다.
- `DISCORD_USERNAME`: Discord Webhook 표시 이름입니다.
- `COLLECTOR_USER_AGENT`: 수집 요청에 사용할 User-Agent입니다.
- `HTTP_TIMEOUT_MS`: HTTP 요청 timeout입니다.
- `MAX_PAGES`: source별 최대 페이지 확인 수입니다.
- `MAX_NEW_ITEMS`: 1회 실행에서 처리할 최대 신규 항목 수입니다.
- `MAX_KNOWN_ITEMS_PER_SOURCE`: `data/state.json`에 유지할 source별 항목 키 개수입니다.

## 수집 규칙

- 각 source는 최신순 첫 페이지부터 확인합니다.
- `sourceItemId` 또는 `url`이 `data/state.json`에 이미 있으면 기존 항목으로 보고 중단합니다.
- 신규 항목은 `publishedAt` 기준 오래된 순서부터 알림합니다.
- `data/state.json`은 GitHub Actions가 자동 커밋합니다.

## 제한

- GitHub Actions schedule은 정확한 실행 시각을 보장하지 않습니다.
- GitHub의 부하 상황에 따라 지연되거나 일부 실행이 누락될 수 있습니다.
- YouTube RSS가 비어 있거나 접근 실패하면 채널 `/videos` HTML fallback을 사용합니다.
- 실시간 slash command, `/latest`, `/res-status` 같은 Discord Bot 기능은 이 구조에서 사용하지 않습니다.
