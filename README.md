# Resonance Update Check

RES 공식 네이버 라운지와 YouTube 채널을 Cloudflare Cron Trigger로 주기적으로 확인하고, 새 항목이 있으면 기존 Discord Bot으로 지정 채널에 알립니다.

Cloudflare Worker가 지정된 KST 시간대에 10분마다 GitHub Actions `workflow_dispatch`를 호출하고, GitHub Actions는 수집/Discord 전송/상태 커밋을 담당합니다. GitHub Actions `schedule`은 보조로 남기되, 실제 10분 호출은 Cloudflare Cron Trigger가 담당합니다.

## 대상

- Naver Lounge: `https://m.game.naver.com/profile/777ff8c47a8bcd406196c695e959ac7a/RES#feed`
- YouTube: `https://www.youtube.com/@resonanceKR`

YouTube 공식 버튼 링크 `https://rzns-kr.onelink.me/6iYR/a2lrqem1`는 2026-06-24 확인 기준 `https://www.youtube.com/@resonanceKR?...`로 리다이렉트됩니다. collector 내부에서는 리다이렉트 후 채널 URL을 사용합니다.

## 실행 구조

GitHub repository secret에 기존 Discord Bot Token과 알림 받을 채널 ID를 저장합니다.

```text
DISCORD_BOT_TOKEN
DISCORD_CHANNEL_ID
```

Cloudflare Worker secret에는 GitHub workflow를 실행할 token을 저장합니다.

```text
GITHUB_TOKEN
```

`GITHUB_TOKEN`은 이 저장소의 Actions workflow dispatch 권한이 있어야 합니다.

Cloudflare Cron Trigger가 지정된 KST 시간대에 `Check RES updates` workflow를 수동 실행 API로 호출합니다.

- 실행 source: `NAVER_LOUNGE,YOUTUBE`
- Cloudflare Worker URL: `https://resonance-cron.replus1541.workers.dev`
- 수동 테스트 URL: `https://resonance-cron.replus1541.workers.dev/run`
- cron:
  - `3 23 * * *`: KST 08:03 아침 회수 체크
  - `3,13,23,33,43,53 1-7 * * *`: KST 10:03~16:53 집중 체크
  - `3,13,23,33,43,53 9-16 * * *`: KST 18:03~다음날 01:53 야간 체크
- 첫 실행: baseline 저장만 수행하고 알림은 보내지 않음
- 이후 실행: `data/state.json`에 없는 신규 항목만 기존 Discord Bot으로 전송

## Cloudflare 배포

```powershell
npx wrangler login
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```

설정 파일은 `wrangler.toml`, Worker 코드는 `cloudflare/cron-dispatcher.js`입니다.

수동 dispatch 테스트가 필요하면 `DISPATCH_SECRET` secret을 추가한 뒤 `/run?sources=NAVER_LOUNGE,YOUTUBE`로 호출할 수 있습니다. 정상 응답은 `{"ok":true,"status":204}` 형태입니다.

GitHub Actions의 `Run workflow`에서 `test_notify=true`를 선택하면 실제 수집 결과와 무관하게 `[TEST]` Discord 알림 1건만 전송합니다. 이 실행은 `data/state.json`을 변경하지 않습니다. Cloudflare Cron 자동 실행은 항상 `test_notify=false`로 workflow를 호출합니다.

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

## 알림 전송 테스트

GitHub Actions의 `Check RES updates` workflow를 수동 실행하면서 `test_notify` 값을 `true`로 지정하면, 실제 수집과 `data/state.json` 변경 없이 `[TEST]` 알림 1건을 기존 Discord Bot으로 전송합니다.

## 주요 환경변수

- `DISCORD_BOT_TOKEN`: 메시지를 보낼 기존 Discord Bot Token입니다.
- `DISCORD_CHANNEL_ID`: 알림을 받을 Discord 채널 ID입니다.
- `COLLECTOR_USER_AGENT`: 수집 요청에 사용할 User-Agent입니다.
- `HTTP_TIMEOUT_MS`: HTTP 요청 timeout입니다.
- `MAX_PAGES`: source별 최대 페이지 확인 수입니다.
- `MAX_NEW_ITEMS`: 1회 실행에서 처리할 최대 신규 항목 수입니다.
- `MAX_KNOWN_ITEMS_PER_SOURCE`: `data/state.json`에 유지할 source별 항목 키 개수입니다.

## 수집 규칙

- 각 source는 최신순 첫 페이지부터 확인합니다.
- `sourceItemId` 또는 `url`이 `data/state.json`에 이미 있으면 기존 항목으로 보고 중단합니다.
- 신규 항목은 이미 저장된 항목을 만날 때까지 모두 모은 뒤 `publishedAt` 기준 오래된 순서부터 알림합니다.
- Discord 전송이 성공한 항목만 `data/state.json`에 저장합니다. 전송 실패 항목은 다음 실행에서 다시 시도합니다.
- `data/state.json`은 GitHub Actions가 자동 커밋합니다.

## 제한

- Cloudflare Cron Trigger도 초 단위 실시간 실행은 아니지만, GitHub Actions `schedule`보다 이 용도에 맞게 외부에서 workflow를 명시적으로 호출합니다.
- GitHub Actions runner queue가 지연되면 실제 수집 시작은 늦어질 수 있습니다.
- YouTube RSS가 비어 있거나 접근 실패하면 채널 `/videos` HTML fallback을 사용합니다.
- 실시간 slash command, `/latest`, `/res-status` 같은 Discord Bot Gateway 기능은 이 구조에서 사용하지 않습니다.
