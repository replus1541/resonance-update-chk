import { makeFeedItem } from '../src/collectors/item.js';
import { notifyDiscord } from '../src/notifier/discord.js';

const item = makeFeedItem({
  source: 'NAVER_LOUNGE',
  sourceLabel: '네이버 라운지',
  sourceItemId: `test-${Date.now()}`,
  type: 'post',
  category: '테스트',
  title: '[TEST] RES 업데이트 알림 전송 확인',
  summary: 'GitHub Actions workflow_dispatch test_notify=true 실행으로 전송한 테스트 알림입니다.',
  url: 'https://github.com/replus1541/resonance-update-chk/actions',
  publishedAt: new Date().toISOString(),
  author: 'RES Update Monitor'
});

const result = await notifyDiscord(item);
console.log(`test notification sent=${result.sent}`);
if (!result.sent) {
  console.error(result.reason || 'test notification was not sent');
  process.exit(1);
}
