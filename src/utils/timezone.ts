export const DEFAULT_TIMEZONE = 'Asia/Shanghai';
export const BEIJING_TIMEZONE = 'Asia/Shanghai';

export const TIMEZONE_OPTIONS = [
  { value: 'Asia/Shanghai', label: '北京时间', hint: 'UTC+8' },
  { value: 'Asia/Ashgabat', label: '阿什哈巴德时间', hint: 'UTC+5' },
  { value: 'Europe/Istanbul', label: '伊斯坦布尔时间', hint: 'UTC+3' },
  { value: 'Europe/Copenhagen', label: '哥本哈根时间', hint: 'UTC+1/+2' },
  { value: 'Atlantic/Reykjavik', label: '冰岛时间', hint: 'UTC+0' },
  { value: 'Europe/Riga', label: '里加时间', hint: 'UTC+2/+3' },
  { value: 'Asia/Ulaanbaatar', label: '乌兰巴托时间', hint: 'UTC+8' },
];

type TimeZoneLocation = {
  place?: string;
  city?: string;
  address?: string;
  lat?: number | null;
  lng?: number | null;
  fallback?: string;
};

export const normaliseTimeZone = (timeZone?: string) => {
  const value = (timeZone || '').trim();
  if (!value) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return value;
  } catch {
    return DEFAULT_TIMEZONE;
  }
};

export const timeZoneOptionLabel = (timeZone?: string) => {
  const zone = normaliseTimeZone(timeZone);
  return TIMEZONE_OPTIONS.find((option) => option.value === zone)?.label || zone;
};

const textIncludes = (text: string, values: string[]) => values.some((value) => text.includes(value.toLocaleLowerCase()));

export const inferTimeZoneFromLocation = ({ place, city, address, lat, lng, fallback }: TimeZoneLocation = {}) => {
  const text = [place, city, address].filter(Boolean).join(' ').toLocaleLowerCase();
  if (textIncludes(text, ['北京', '上海', '大连', '广州', '深圳', '中国', 'china', 'beijing', 'shanghai'])) return 'Asia/Shanghai';
  if (textIncludes(text, ['阿什哈巴德', '土库曼', 'ashgabat', 'turkmenistan'])) return 'Asia/Ashgabat';
  if (textIncludes(text, ['伊斯坦布尔', '土耳其', 'istanbul', 'turkey'])) return 'Europe/Istanbul';
  if (textIncludes(text, ['哥本哈根', '凯斯楚普', '丹麦', 'copenhagen', 'kastrup', 'denmark'])) return 'Europe/Copenhagen';
  if (textIncludes(text, ['冰岛', '雷克雅未克', '凯夫拉维克', 'reykjavik', 'keflavik', 'iceland'])) return 'Atlantic/Reykjavik';
  if (textIncludes(text, ['里加', '拉脱维亚', 'riga', 'latvia'])) return 'Europe/Riga';
  if (textIncludes(text, ['乌兰巴托', '蒙古', 'ulaanbaatar', 'mongolia'])) return 'Asia/Ulaanbaatar';

  if (typeof lat === 'number' && typeof lng === 'number') {
    if (lng >= 72 && lng <= 138 && lat >= 18 && lat <= 54) return 'Asia/Shanghai';
    if (lng >= 52 && lng <= 67 && lat >= 35 && lat <= 43) return 'Asia/Ashgabat';
    if (lng >= 25 && lng <= 45 && lat >= 36 && lat <= 42) return 'Europe/Istanbul';
    if (lng >= 7 && lng <= 16 && lat >= 54 && lat <= 58) return 'Europe/Copenhagen';
    if (lng >= -25 && lng <= -13 && lat >= 63 && lat <= 67) return 'Atlantic/Reykjavik';
    if (lng >= 20 && lng <= 29 && lat >= 55 && lat <= 58) return 'Europe/Riga';
    if (lng >= 87 && lng <= 120 && lat >= 41 && lat <= 53) return 'Asia/Ulaanbaatar';
  }

  return normaliseTimeZone(fallback);
};

const partsInTimeZone = (instantMs: number, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: normaliseTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instantMs));

  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
};

export const timeZoneOffsetMinutes = (timeZone: string, instantMs = Date.now()) => {
  const parts = partsInTimeZone(instantMs, timeZone);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((localAsUtc - instantMs) / 60000);
};

export const formatTimeZoneOffset = (timeZone?: string, instantMs = Date.now()) => {
  const offset = timeZoneOffsetMinutes(normaliseTimeZone(timeZone), instantMs);
  const sign = offset >= 0 ? '+' : '-';
  const absolute = Math.abs(offset);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`;
};

export const zonedTimeToUtcMs = (date: string, time: string, timeZone?: string) => {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const zone = normaliseTimeZone(timeZone);
  const localAsUtc = Date.UTC(year, month - 1, day, hour || 0, minute || 0, 0);
  const firstOffset = timeZoneOffsetMinutes(zone, localAsUtc);
  const firstGuess = localAsUtc - firstOffset * 60000;
  const secondOffset = timeZoneOffsetMinutes(zone, firstGuess);
  return localAsUtc - secondOffset * 60000;
};

export const formatInTimeZone = (instantMs: number, timeZone?: string) => {
  const parts = partsInTimeZone(instantMs, normaliseTimeZone(timeZone));
  return {
    date: `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
    time: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
  };
};

export const formatDurationFromMinutes = (minutes: number) => {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (!hours) return `${rest}分钟`;
  return rest ? `${hours}小时${rest}分` : `${hours}小时`;
};

export const transportInstantRange = (node: {
  date: string;
  time: string;
  end_date?: string;
  end_time?: string;
  arrival_date?: string;
  arrival_time?: string;
  departure_timezone?: string;
  arrival_timezone?: string;
}) => {
  const departureTimezone = normaliseTimeZone(node.departure_timezone);
  const arrivalTimezone = normaliseTimeZone(node.arrival_timezone || node.departure_timezone);
  const arrivalDate = node.end_date || node.arrival_date || node.date;
  const arrivalTime = node.end_time || node.arrival_time || node.time;
  const start = zonedTimeToUtcMs(node.date, node.time, departureTimezone);
  let end = zonedTimeToUtcMs(arrivalDate, arrivalTime, arrivalTimezone);
  if (end <= start) end += 24 * 60 * 60 * 1000;
  return { start, end, departureTimezone, arrivalTimezone };
};

export const transportDurationText = (node: Parameters<typeof transportInstantRange>[0]) => {
  const range = transportInstantRange(node);
  return formatDurationFromMinutes((range.end - range.start) / 60000);
};

export const beijingRangeText = (node: Parameters<typeof transportInstantRange>[0]) => {
  const range = transportInstantRange(node);
  const start = formatInTimeZone(range.start, BEIJING_TIMEZONE);
  const end = formatInTimeZone(range.end, BEIJING_TIMEZONE);
  const endDate = start.date === end.date ? '' : ` ${end.date.slice(5)}`;
  return `${start.time} →${endDate} ${end.time}`;
};
