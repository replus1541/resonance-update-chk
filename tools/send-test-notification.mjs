import { makeFeedItem } from '../src/collectors/item.js';
import { notifyDiscord } from '../src/notifier/discord.js';

const item = makeFeedItem({
  source: 'NAVER_LOUNGE',
  sourceLabel: '네이버 라운지',
  sourceItemId: `test-${Date.now()}`,
  type: 'post',
  category: '테스트',
  title: '[테스트] RES 업데이트 알림 전송 확인',
  summary: 'GitHub Actions와 기존 Discord Bot Token으로 알림이 정상 전송되는지 확인하는 가상 신규 게시글입니다.',
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
