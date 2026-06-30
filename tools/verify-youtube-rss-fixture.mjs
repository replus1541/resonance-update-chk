import assert from 'node:assert/strict';
import { XMLParser } from 'fast-xml-parser';
import { normalizeYouTubeRssEntry } from '../src/collectors/youtube.js';
import { toDiscordEmbed } from '../src/notifier/discord-embed.js';

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"
      xmlns:media="http://search.yahoo.com/mrss/"
      xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>yt:video:abc123</id>
    <yt:videoId>abc123</yt:videoId>
    <title>테스트 영상 제목</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=abc123" />
    <published>2026-06-30T04:45:00+00:00</published>
    <updated>2026-06-30T04:46:00+00:00</updated>
    <media:group>
      <media:description>테스트 영상 소개글입니다.</media:description>
      <media:thumbnail url="https://i.ytimg.com/vi/abc123/hqdefault.jpg" width="480" height="360" />
    </media:group>
  </entry>
</feed>`;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text'
});

const parsed = parser.parse(rss);
const item = normalizeYouTubeRssEntry(parsed.feed.entry);
const embed = toDiscordEmbed(item);

assert.equal(item.sourceItemId, 'abc123');
assert.equal(item.title, '테스트 영상 제목');
assert.notEqual(item.title, '0');
assert.notEqual(item.title, '1');
assert.equal(item.summary, '테스트 영상 소개글입니다.');
assert.equal(item.url, 'https://www.youtube.com/watch?v=abc123');
assert.equal(item.publishedAt, '2026-06-30T04:45:00.000Z');
assert.equal(item.raw.thumbnailUrl, 'https://i.ytimg.com/vi/abc123/hqdefault.jpg');

assert.equal(embed.title, '[YouTube resonanceKR] 테스트 영상 제목');
assert.equal(embed.description, '테스트 영상 소개글입니다.');
assert.deepEqual(embed.fields.find((field) => field.name === '출처'), {
  name: '출처',
  value: '유튜브 / resonanceKR',
  inline: false
});
assert.deepEqual(embed.fields.find((field) => field.name === '작성일'), {
  name: '작성일',
  value: '2026.06.30 13:45',
  inline: false
});
assert.equal(embed.url, 'https://www.youtube.com/watch?v=abc123');

console.log('verify-youtube-rss-fixture: ok');
