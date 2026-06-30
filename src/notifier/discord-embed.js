export function toDiscordEmbed(item) {
  return {
    title: `[${item.sourceLabel}] ${item.title}`.slice(0, 256),
    url: item.url,
    description: (item.summary || item.url).slice(0, 2048),
    color: colorForCategory(item.category),
    fields: [
      { name: '출처', value: sourceFieldValue(item), inline: false },
      { name: '작성일', value: formatKst(item.publishedAt), inline: false }
    ]
  };
}

function sourceFieldValue(item) {
  if (item.source === 'YOUTUBE') return `${sourceLabel(item.source)} / ${item.boardName || 'resonanceKR'}`;
  return `${sourceLabel(item.source)} / ${item.category || '기타'}`;
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

function formatKst(value) {
  if (!value) return '확인 불가';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '확인 불가';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}

function colorForCategory(category) {
  switch (category) {
    case '공지':
      return 0x4f8cff;
    case '업데이트':
      return 0x37c871;
    case '이벤트':
      return 0xf4b942;
    case '캐릭터':
      return 0xd66bff;
    case '영상':
      return 0xff4f69;
    default:
      return 0x9aa4b2;
  }
}
