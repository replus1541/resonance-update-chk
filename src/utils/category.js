const CATEGORY_RULES = [
  { category: '영상', patterns: [/pv/i, /trailer/i, /트레일러/i, /영상/i, /youtube/i] },
  { category: '업데이트', patterns: [/update/i, /업데이트/i, /패치/i, /점검/i, /버전/i] },
  { category: '이벤트', patterns: [/event/i, /이벤트/i, /캠페인/i, /보상/i] },
  { category: '공지', patterns: [/notice/i, /공지/i, /안내/i, /알림/i] },
  { category: '캐릭터', patterns: [/character/i, /캐릭터/i, /ssr/i, /신규\s*캐릭/i] }
];

export function inferCategory(...parts) {
  const haystack = parts.filter(Boolean).join('\n');
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(haystack))) return rule.category;
  }
  return '기타';
}

export function inferYouTubeType(title, url) {
  const text = `${title ?? ''} ${url ?? ''}`;
  if (/shorts/i.test(text)) return 'shorts';
  return 'video';
}
