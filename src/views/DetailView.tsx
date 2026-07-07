import React, { useMemo, useState } from 'react';
import { useItineraryStore } from '../store/useItineraryStore';
import { Accommodation, ItineraryNode, ItineraryType, TransportMode } from '../types';
import { compareItineraryNodes, isScheduledNode } from '../utils/itinerary';
import ImagePreviewModal from '../components/ImagePreviewModal/ImagePreviewModal';
import TransportTicket from '../components/TransportTicket/TransportTicket';
import {
  inferTimeZoneFromLocation,
  timeZoneOptionLabel,
  transportDurationText,
} from '../utils/timezone';
import {
  Bed,
  CalendarDays,
  Car,
  Clock,
  FileText,
  Image as ImageIcon,
  MapPin,
  Plane,
  Printer,
  Route,
  Users,
} from 'lucide-react';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const typeLabels: Record<ItineraryType, string> = {
  transfer: '转机',
  transport: '交通',
  hotel: '住宿',
  restaurant: '餐饮',
  sightseeing: '景点',
  leisure: '休闲',
  shopping: '采购',
};

const typeStyles: Record<ItineraryType, string> = {
  transfer: 'bg-sky-50 text-sky-700',
  transport: 'bg-cyan-50 text-cyan-700',
  hotel: 'bg-emerald-50 text-emerald-700',
  restaurant: 'bg-rose-50 text-rose-700',
  sightseeing: 'bg-violet-50 text-violet-700',
  leisure: 'bg-amber-50 text-amber-700',
  shopping: 'bg-pink-50 text-pink-700',
};

const transportModeLabels: Record<TransportMode, string> = {
  flight: '飞机',
  high_speed_rail: '高铁',
  train: '火车',
  car: '汽车',
  bus: '巴士',
  subway: '地铁',
  ferry: '轮渡',
  other: '其他',
};

type DaySummary = {
  day: number;
  date: string;
  city: string;
  plans: string;
  transport: string;
  overnight: string;
};

const nodeImages = (node: ItineraryNode) =>
  node.image_urls?.length ? node.image_urls : node.image_url ? [node.image_url] : [];

const isTicketTransport = (node: ItineraryNode) =>
  Boolean(node.transport_mode || node.departure_place || node.arrival_place || /航班|高铁|火车|飞往|→/.test(node.title));

const parseDateParts = (date: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [, year, month, day] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
};

const parseLocalDate = (date: string) => {
  const parts = parseDateParts(date);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day);
};

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const enumerateDates = (startDate?: string, endDate?: string) => {
  const start = parseLocalDate(startDate || '');
  const end = parseLocalDate(endDate || '');
  if (!start || !end || end < start) return [];
  const dates: string[] = [];
  for (let time = start.getTime(); time <= end.getTime(); time += MS_PER_DAY) {
    dates.push(formatDateKey(new Date(time)));
  }
  return dates;
};

const formatDisplayDate = (date: string) => {
  const parsed = parseLocalDate(date);
  if (!parsed) return date || '日期待补充';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(parsed);
};

const formatShortDate = (date: string) => {
  const parsed = parseLocalDate(date);
  if (!parsed) return date || '-';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
};

const tripDurationDays = (startDate?: string, endDate?: string) => {
  const start = parseLocalDate(startDate || '');
  const end = parseLocalDate(endDate || '');
  if (!start || !end || end < start) return 0;
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
};

const compactList = (values: string[], limit = 3) => {
  const unique = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  if (!unique.length) return '待补充';
  if (unique.length <= limit) return unique.join('；');
  return `${unique.slice(0, limit).join('；')} 等`;
};

const cleanHotelTitle = (title: string) =>
  title.replace(/^(入住|返回|抵达|前往)\s*/u, '').trim() || title;

const isTransportLike = (node: ItineraryNode) =>
  node.type === 'transport' || node.type === 'transfer';

const isMainPlanNode = (node: ItineraryNode) =>
  !isTransportLike(node) && node.type !== 'hotel';

const routeText = (node: ItineraryNode) => {
  const departure = node.departure_place?.trim();
  const arrival = node.arrival_place?.trim();
  if (departure && arrival) return `${departure} → ${arrival}`;
  return node.title;
};

const departureTimeZone = (node: ItineraryNode) =>
  inferTimeZoneFromLocation({
    place: node.departure_place || node.title,
    city: node.departure_place ? undefined : node.city,
    lat: node.departure_lat,
    lng: node.departure_lng,
    fallback: node.departure_timezone || node.timezone,
  });

const arrivalTimeZone = (node: ItineraryNode) =>
  inferTimeZoneFromLocation({
    place: node.arrival_place || node.title,
    city: node.arrival_place ? undefined : node.city,
    lat: node.arrival_lat,
    lng: node.arrival_lng,
    fallback: node.arrival_timezone || node.departure_timezone || node.timezone,
  });

const transportDuration = (node: ItineraryNode) => {
  if (node.duration?.trim()) return node.duration.trim();
  if (!node.arrival_time && !node.end_time) return '-';
  try {
    return transportDurationText({
      ...node,
      departure_timezone: departureTimeZone(node),
      arrival_timezone: arrivalTimeZone(node),
    });
  } catch {
    return '-';
  }
};

const endpointTime = (node: ItineraryNode, endpoint: 'departure' | 'arrival') => {
  const date = endpoint === 'arrival'
    ? node.end_date || node.arrival_date || node.date
    : node.date;
  const time = endpoint === 'arrival'
    ? node.end_time || node.arrival_time || node.time
    : node.time;
  const zone = endpoint === 'arrival' ? arrivalTimeZone(node) : departureTimeZone(node);
  return `${formatShortDate(date)} ${time || '-'}（${timeZoneOptionLabel(zone)}）`;
};

const accommodationDateRange = (stay: Accommodation, tripYear: number) => {
  const matches = Array.from(stay.dates.matchAll(/(\d{1,2})月(\d{1,2})日/g));
  if (matches.length < 2) return null;
  const [startMonth, startDay] = matches[0].slice(1).map(Number);
  const [endMonth, endDay] = matches[1].slice(1).map(Number);
  const start = parseLocalDate(`${tripYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`);
  const end = parseLocalDate(`${tripYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`);
  if (!start || !end) return null;
  return { start, end };
};

const accommodationMatchesDate = (stay: Accommodation, date: string, tripYear: number) => {
  const range = accommodationDateRange(stay, tripYear);
  const current = parseLocalDate(date);
  if (!range || !current) return false;
  return current >= range.start && current < range.end;
};

const overnightTransportText = (nodes: ItineraryNode[], date: string) => {
  const overnight = nodes.find((node) => {
    const arrivalDate = node.end_date || node.arrival_date;
    return isTransportLike(node) && arrivalDate && arrivalDate > date;
  });
  return overnight ? `夜间交通：${routeText(overnight)}` : '';
};

const inferredDestination = (tripTitle?: string, nodes: ItineraryNode[] = []) => {
  const text = [
    tripTitle,
    ...nodes.flatMap((node) => [
      node.title,
      node.city,
      node.address,
      node.departure_place,
      node.arrival_place,
    ]),
  ].filter(Boolean).join(' ').toLowerCase();

  if (/冰岛|iceland|reykjavik|keflavik/u.test(text)) return '冰岛';
  if (/法国|france|paris/u.test(text)) return '法国';
  if (/德国|germany|berlin|munich/u.test(text)) return '德国';
  if (/意大利|italy|rome|milan/u.test(text)) return '意大利';
  if (/西班牙|spain|madrid|barcelona/u.test(text)) return '西班牙';
  return tripTitle || '待补充';
};

const isSchengenText = (value: string) =>
  /冰岛|iceland|凯夫拉维克|keflavik|雷克雅未克|reykjavik|丹麦|denmark|哥本哈根|copenhagen|凯斯楚普|kastrup|拉脱维亚|latvia|里加|riga|法国|france|德国|germany|意大利|italy|西班牙|spain/u
    .test(value.toLowerCase());

const inferredFirstSchengenEntry = (transportNodes: ItineraryNode[]) => {
  const entry = transportNodes.find((node) => {
    const departure = [node.departure_place, node.departure_timezone].filter(Boolean).join(' ');
    const arrival = [node.arrival_place || node.title, node.arrival_timezone].filter(Boolean).join(' ');
    return !isSchengenText(departure) && isSchengenText(arrival);
  });
  if (!entry) return '待补充';
  return `${entry.arrival_place || entry.title}（${formatShortDate(entry.arrival_date || entry.end_date || entry.date)}）`;
};

const splitCarSegments = (value: string, loose = false) =>
  value
    .split(loose ? /[；;。、,，]/u : /[；;。]/u)
    .map((item) => item.trim())
    .filter(Boolean);

const keyedCarValue = (segments: string[], labels: string[]) => {
  const normalizedLabels = labels.map((label) => label.toLowerCase());
  const matched = segments.find((segment) => {
    const [rawLabel] = segment.split(/[：:]/u);
    return normalizedLabels.includes(rawLabel.trim().toLowerCase());
  });
  if (!matched) return '';
  const [, ...valueParts] = matched.split(/[：:]/u);
  return valueParts.join(':').trim();
};

const priceTextFromCar = (value: string) => {
  const explicit = value.match(/(?:价格|费用|总价|金额|租金|合计)[：:\s]*([^；;。]+)/u);
  if (explicit?.[1]) return explicit[1].trim();
  const currency = value.match(/[¥￥€$]\s?[\d,]+(?:\.\d+)?/u);
  return currency?.[0] || '待补充';
};

const checkInDateText = (dates: string) => {
  const matched = dates.match(/(\d{1,2}月\d{1,2}日)\s*入住/u);
  return matched?.[1] || dates;
};

const rentalCarRows = (carDetails: string) => {
  const coarseSegments = splitCarSegments(carDetails);
  const detailItems = splitCarSegments(carDetails, true);
  const company = keyedCarValue(coarseSegments, ['租车公司', '公司']);
  const bookingReference = keyedCarValue(coarseSegments, ['预订号', '预定号', 'Booking Code', 'Booking Reference']);
  const model = keyedCarValue(coarseSegments, ['车型', 'Class Name'])
    || coarseSegments.find((item) => !item.includes('：') && !item.includes(':'))
    || '待补充';
  const rentalTime = keyedCarValue(coarseSegments, ['租车时间', '取还车时间'])
    || coarseSegments.find((item, index) =>
    index > 0 && /(?:\d{1,2}月\d{1,2}日|至|到|取车|还车|租车)/u.test(item),
  ) || '待补充';
  const insurance = keyedCarValue(coarseSegments, ['购买保险', '保险'])
    || detailItems
    .filter((item) => /(?:保险|insurance|platinum)/iu.test(item))
    .join('、') || '待补充';
  const driverMatch = carDetails.match(/(\d+)\s*(?:名|位|人)?(?:驾驶员|司机|driver)/iu);
  const driverText = keyedCarValue(coarseSegments, ['驾驶员人数/说明', '驾驶员人数', '驾驶员'])
    || (driverMatch
    ? `${driverMatch[1]} 人`
    : detailItems.filter((item) => /(?:驾驶员|司机|driver)/iu.test(item)).join('、')) || '待补充';
  const price = keyedCarValue(coarseSegments, ['价格', '总价', 'Total Amount', 'Total Paid'])
    || priceTextFromCar(carDetails);
  const extras = keyedCarValue(coarseSegments, ['其他服务', '其他'])
    || detailItems
      .filter((item) =>
        !item.includes('：')
        && !item.includes(':')
        && !/(?:价格|费用|总价|金额|租金|合计|保险|insurance|platinum|驾驶员|司机|driver|^\d{1,2}月\d{1,2}日)/iu.test(item),
      )
      .join('、') || '待补充';

  return [
    ['租车公司', company || '待补充'],
    ['预订号', bookingReference || '待补充'],
    ['车型', model],
    ['租车时间', rentalTime],
    ['价格', price],
    ['购买保险', insurance],
    ['驾驶员人数 / 说明', driverText],
    ['其他服务', extras],
  ];
};

export default function DetailView() {
  const { trip, nodes } = useItineraryStore();
  const [preview, setPreview] = useState<{ images: string[]; index: number; title: string } | null>(null);

  const sorted = useMemo(
    () => nodes.filter(isScheduledNode).sort(compareItineraryNodes),
    [nodes],
  );

  const days = useMemo(() => Array.from(new Set(sorted.map((node) => node.day))), [sorted]);

  const dates = useMemo(
    () => enumerateDates(trip?.start_date, trip?.end_date),
    [trip?.start_date, trip?.end_date],
  );

  const transportNodes = useMemo(
    () => sorted.filter((node) => node.type === 'transport'),
    [sorted],
  );

  const tripYear = Number((trip?.start_date || '').slice(0, 4)) || new Date().getFullYear();

  const daySummaries = useMemo<DaySummary[]>(() => {
    return dates.map((date, index) => {
      const day = index + 1;
      const dayNodes = sorted.filter((node) => node.date === date || node.day === day);
      const cities = compactList(
        dayNodes
          .filter((node) => node.type !== 'transport' && (node.city || node.address))
          .map((node) => node.city || node.address || ''),
        4,
      );
      const plans = compactList(
        dayNodes.filter(isMainPlanNode).map((node) => node.title),
        4,
      );
      const transports = dayNodes.filter(isTransportLike);
      const transport = transports.length
        ? compactList(
          transports.map((node) =>
            node.service_number
              ? `${routeText(node)}（${node.service_number}）`
              : routeText(node),
          ),
          2,
        )
        : dayNodes.length
          ? '自驾 / 当地交通'
          : '待补充';
      const hotels = dayNodes
        .filter((node) => node.type === 'hotel')
        .map((node) => cleanHotelTitle(node.title));
      const matchedAccommodation = (trip?.accommodations || [])
        .filter((stay) => accommodationMatchesDate(stay, date, tripYear))
        .map((stay) => stay.name);
      const nightTransport = overnightTransportText(dayNodes, date);
      const overnight = nightTransport
        || compactList(hotels.length ? hotels : matchedAccommodation, 2);

      return {
        day,
        date,
        city: cities,
        plans,
        transport,
        overnight: date === trip?.end_date && overnight === '待补充' ? '返程 / 不住宿' : overnight,
      };
    });
  }, [dates, sorted, trip?.accommodations, trip?.end_date, tripYear]);

  const open = (node: ItineraryNode, index: number) => {
    const images = nodeImages(node);
    if (images.length) setPreview({ images, index, title: node.title });
  };

  if (!trip) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm font-semibold text-slate-500">
        正在加载行程数据...
      </div>
    );
  }

  const durationDays = tripDurationDays(trip.start_date, trip.end_date);
  const mainDestination = inferredDestination(trip.title, sorted);
  const firstSchengenEntry = inferredFirstSchengenEntry(transportNodes);

  const printVisaItinerary = () => {
    const previousTitle = document.title;
    document.title = '';
    window.print();
    window.setTimeout(() => {
      document.title = previousTitle;
    }, 500);
  };

  return (
    <div className="visa-itinerary">
      <div className="screen-itinerary space-y-5 print:hidden">
        {preview && (
          <ImagePreviewModal
            images={preview.images}
            index={preview.index}
            title={preview.title}
            onClose={() => setPreview(null)}
            onIndexChange={(index) => setPreview({ ...preview, index })}
          />
        )}

        <section className="visa-cover overflow-hidden rounded-3xl border border-white/60 bg-white/65 shadow-xl backdrop-blur-xl">
          <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-indigo-600">
                <FileText className="h-3.5 w-3.5" /> Visa Travel Itinerary
              </div>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{trip.title}</h2>
              <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-500">{trip.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-600">
                <span className="rounded-full bg-slate-100 px-3 py-1.5"><CalendarDays className="mr-1 inline h-3 w-3" />{trip.start_date} 至 {trip.end_date}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5"><Users className="mr-1 inline h-3 w-3" />{trip.travelers} 人 · {trip.origin}出发</span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5"><Plane className="mr-1 inline h-3 w-3" />共 {days.length} 天</span>
              </div>
            </div>
            <button onClick={printVisaItinerary} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-500">
              <Printer className="h-4 w-4" /> 导出签证行程单 PDF
            </button>
          </div>

          <div className="grid gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white/90 p-4">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600"><Car className="h-3.5 w-3.5" />交通安排</div>
              <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-slate-600">{trip.car}</p>
            </div>
            {trip.accommodations.map((stay) => (
              <div key={stay.name} className="bg-white/90 p-4">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700"><Bed className="h-3.5 w-3.5" />{stay.name}</div>
                <div className="mt-1 text-[9px] font-bold text-indigo-600">{stay.dates}</div>
                <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{stay.address}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-4">
          {days.map((day) => {
            const dayNodes = sorted.filter((node) => node.day === day);
            const first = dayNodes[0];
            const cities = Array.from(new Set(dayNodes.map((node) => node.city).filter(Boolean)));
            return (
              <section key={day} className="day-sheet overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-lg backdrop-blur-xl">
                <header className="flex flex-col gap-1 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="rounded-lg bg-indigo-500 px-2.5 py-1 text-xs font-black">DAY {day}</span>
                    <span className="text-xs font-bold">{formatDisplayDate(first.date)}</span>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-300">{cities.join(' · ')}</span>
                </header>

                <div className="divide-y divide-slate-100">
                  {dayNodes.map((node) => {
                    const images = nodeImages(node);
                    if (node.type === 'transport' && isTicketTransport(node)) {
                      return (
                        <article key={node.id} className="bg-slate-50/60 p-3">
                          <TransportTicket node={node} />
                        </article>
                      );
                    }
                    return (
                      <article key={node.id} className="itinerary-row grid gap-3 p-4 sm:grid-cols-[64px_minmax(150px,0.8fr)_minmax(240px,1.4fr)_180px] sm:items-center">
                        <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 sm:block">
                          <Clock className="h-3.5 w-3.5 text-indigo-500 sm:mb-1" />
                          {node.time}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`rounded-full px-2 py-0.5 text-[8px] font-black ${typeStyles[node.type]}`}>{typeLabels[node.type]}</span>
                            <span className="truncate text-sm font-black text-slate-900">{node.title}</span>
                          </div>
                          <div className="mt-1 flex items-start gap-1 text-[9px] font-semibold text-slate-400">
                            <MapPin className="mt-0.5 h-2.5 w-2.5 shrink-0" /> <span className="line-clamp-2">{node.address || node.city || '地点待补充'}</span>
                          </div>
                        </div>

                        <p className="text-[11px] leading-relaxed text-slate-600">{node.description || '暂无补充说明'}</p>

                        <div className="image-strip flex min-h-14 items-center gap-1.5">
                          {images.length ? images.slice(0, 3).map((image, index) => (
                            <button
                              key={image}
                              onClick={() => open(node, index)}
                              className={`image-thumb group relative overflow-hidden rounded-lg border border-white bg-slate-100 shadow-sm ${index === 0 ? 'h-16 w-20' : 'h-14 w-12'}`}
                            >
                              <img src={image} alt={`${node.title} ${index + 1}`} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                              {index === 2 && images.length > 3 && <span className="absolute inset-0 flex items-center justify-center bg-slate-950/65 text-[10px] font-black text-white">+{images.length - 3}</span>}
                            </button>
                          )) : (
                            <div className="flex h-14 w-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-[9px] text-slate-400">
                              <ImageIcon className="mr-1 h-3.5 w-3.5" /> 暂无图片
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="hidden print:block">
        <main className="visa-document mx-auto max-w-[210mm] bg-white p-8 text-slate-950 shadow-xl print:max-w-none print:p-0 print:shadow-none">
          <header className="border-b-2 border-slate-900 pb-4 print:pb-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-black tracking-[0.24em] text-slate-500 print:text-[8px]">
                  TRAVEL ITINERARY FOR VISA APPLICATION
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-tight print:text-xl">
                  签证申请用旅行行程单
                </h1>
              </div>
            </div>
          </header>

          <section className="mt-5 print:mt-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-black print:text-[10px]">
              <CalendarDays className="h-4 w-4 print:h-3 print:w-3" /> 一、行程概况
            </div>
            <div className="grid grid-cols-2 border border-slate-300 text-xs print:text-[8px] md:grid-cols-4">
              {[
                ['行程名称', trip.title],
                ['旅行目的', '旅游'],
                ['出行日期', `${trip.start_date} 至 ${trip.end_date}`],
                ['行程天数', `${durationDays || dates.length} 天`],
                ['出行人数', `${trip.travelers} 人`],
                ['出发地', trip.origin || '待补充'],
                ['主要目的地', mainDestination],
                ['首个申根入境点', firstSchengenEntry],
              ].map(([label, value]) => (
                <div key={label} className="min-h-16 border-b border-r border-slate-300 p-3 print:min-h-0 print:p-1.5">
                  <div className="text-[10px] font-black text-slate-500 print:text-[7px]">{label}</div>
                  <div className="mt-1 font-bold leading-snug text-slate-950">{value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-5 print:mt-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-black print:text-[10px]">
              <Plane className="h-4 w-4 print:h-3 print:w-3" /> 二、主要交通安排
            </div>
            <table className="visa-table w-full border-collapse text-left text-xs print:text-[7.5px]">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>路线</th>
                  <th>方式</th>
                  <th>班次</th>
                  <th>出发时间</th>
                  <th>到达时间</th>
                  <th>时长</th>
                </tr>
              </thead>
              <tbody>
                {transportNodes.length ? transportNodes.map((node) => (
                  <tr key={node.id}>
                    <td>{formatDisplayDate(node.date)}</td>
                    <td>{routeText(node)}</td>
                    <td>{node.transport_mode ? transportModeLabels[node.transport_mode] : '交通'}</td>
                    <td>{node.service_number || '-'}</td>
                    <td>{endpointTime(node, 'departure')}</td>
                    <td>{endpointTime(node, 'arrival')}</td>
                    <td>{transportDuration(node)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={7}>暂无主要交通信息</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="mt-5 print:mt-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-black print:text-[10px]">
              <Car className="h-4 w-4 print:h-3 print:w-3" /> 三、地面交通 / 租车安排
            </div>
            <table className="visa-table w-full border-collapse text-left text-xs print:text-[7.5px]">
              <thead>
                <tr>
                  <th className="w-[24%]">项目</th>
                  <th>内容</th>
                </tr>
              </thead>
              <tbody>
                {rentalCarRows(trip.car || '').map(([label, value]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mt-5 print:mt-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-black print:text-[10px]">
              <Bed className="h-4 w-4 print:h-3 print:w-3" /> 四、住宿安排
            </div>
            <table className="visa-table w-full border-collapse text-left text-xs print:text-[7.5px]">
              <thead>
                <tr>
                  <th>入住日期</th>
                  <th>住宿名称</th>
                  <th>地址</th>
                  <th>预定网站</th>
                </tr>
              </thead>
              <tbody>
                {trip.accommodations.length ? trip.accommodations.map((stay) => (
                  <tr key={`${stay.name}-${stay.dates}`}>
                    <td>{checkInDateText(stay.dates)}</td>
                    <td>{stay.name}</td>
                    <td>{stay.address || '待补充'}</td>
                    <td>爱彼迎</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4}>暂无住宿信息</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="mt-5 print:mt-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-black print:text-[10px]">
              <Route className="h-4 w-4 print:h-3 print:w-3" /> 五、每日行程安排
            </div>
            <table className="visa-table w-full border-collapse text-left text-xs print:text-[7.5px]">
              <thead>
                <tr>
                  <th className="w-[13%]">天数 / 日期</th>
                  <th className="w-[16%]">城市 / 区域</th>
                  <th>主要安排</th>
                  <th className="w-[24%]">当日交通</th>
                  <th className="w-[22%]">夜间住宿</th>
                </tr>
              </thead>
              <tbody>
                {daySummaries.length ? daySummaries.map((day) => (
                  <tr key={day.date}>
                    <td>
                      <div className="font-black">D{day.day}</div>
                      <div>{formatDisplayDate(day.date)}</div>
                    </td>
                    <td>{day.city}</td>
                    <td>{day.plans}</td>
                    <td>{day.transport}</td>
                    <td>{day.overnight}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5}>暂无每日行程信息</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

        </main>
      </div>
    </div>
  );
}
