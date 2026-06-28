export function toDiscordContent(item, mentionUserId = null) {
  const lines = [
    `RES 신규 업데이트: ${sourceLabel(item.source)}`,
    `${item.category || '기타'} / ${item.type || 'unknown'}`,
    `제목: ${truncateLine(item.title || '(제목 없음)', 120)}`
  ];
  if (mentionUserId) lines.push(`<@${mentionUserId}>`);
  return lines.join('\n');
}

function sourceLabel(source) {
  switch (source) {
    case 'NAVER_LOUNGE':
      return '네이버 라운지';
    case 'YOUTUBE':
      return '유튜브';
    case 'X':
      return '일본 X';
    case 'WEIBO':
      return '웨이보';
    default:
      return source || '알 수 없음';
  }
}

function truncateLine(value, maxLength) {
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}
