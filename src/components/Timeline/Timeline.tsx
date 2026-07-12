import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bed,
  Bus,
  Car,
  Footprints,
  Image as ImageIcon,
  MapPin,
  Plane,
  Route,
  Ship,
  TrainFront,
} from 'lucide-react';
import ImagePreviewModal from '../ImagePreviewModal/ImagePreviewModal';
import TransportTicket from '../TransportTicket/TransportTicket';
import { useItineraryStore } from '../../store/useItineraryStore';
import { ItineraryEdge, ItineraryNode, Lodging, RouteSegment, Stay, TransportMode } from '../../types';
import { activitySubtypeOf, compareItineraryNodes, isScheduledNode, itineraryTypeLabel, itineraryTypeTone } from '../../utils/itinerary';
import { responsiveImageProps } from '../../utils/images';

const START_MINUTES = 0;
const END_MINUTES = 24 * 60;
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 32;
const MIN_EVENT_HEIGHT = 30;

type ScheduleSegmentKind = 'single' | 'start' | 'middle' | 'end';

type ScheduleEvent = {
  node: ItineraryNode;
  start: number;
  end: number;
  lane: number;
  lanes: number;
  segmentKind: ScheduleSegmentKind;
  displayStart: string;
  displayEnd: string;
  departureDay: number;
  arrivalDay: number;
};

type ScheduleEntry =
  | { kind: 'event'; node: ItineraryNode }
  | { kind: 'route'; edge: ItineraryEdge; segment?: RouteSegment; source: ItineraryNode; target: ItineraryNode }
  | { kind: 'lodging'; stay: Stay; lodging: Lodging };

type DayStay = {
  stay: Stay;
  lodging: Lodging;
  nightIndex: number;
  nightCount: number;
};

type DayRouteLink = {
  edge: ItineraryEdge;
  segment?: RouteSegment;
  source: ScheduleEvent;
  target: ScheduleEvent;
};

const slots = Array.from(
  { length: (END_MINUTES - START_MINUTES) / SLOT_MINUTES },
  (_, index) => START_MINUTES + index * SLOT_MINUTES,
);

const pad = (value: number) => String(value).padStart(2, '0');

const formatTime = (minutes: number) => {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`;
};

const parseTime = (value?: string) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(value || '');
  if (!match) return 12 * 60;
  return Number(match[1]) * 60 + Number(match[2]);
};

const formatShortDate = (date?: string) => date ? date.slice(5).replace('-', '/') : '--/--';

const dateToUtcTime = (isoDate?: string) => {
  if (!isoDate) return null;
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
};

const dateDeltaDays = (start?: string, end?: string) => {
  const startTime = dateToUtcTime(start);
  const endTime = dateToUtcTime(end);
  if (startTime == null || endTime == null) return null;
  return Math.round((endTime - startTime) / 86400000);
};

const addDays = (isoDate: string, offset: number) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return date.toISOString().slice(0, 10);
};

const dayFromStartDate = (date?: string, startDate?: string) => {
  const delta = dateDeltaDays(startDate, date);
  return delta != null && delta >= 0 ? delta + 1 : null;
};

const dayCountBetween = (start?: string, end?: string) => {
  if (!start || !end) return 0;
  const delta = dateDeltaDays(start, end);
  return delta == null ? 0 : Math.max(1, delta + 1);
};

const parseDurationMinutes = (value?: string) => {
  const text = (value || '').trim();
  if (!text) return null;
  const colon = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  const plainNumber = /^(\d+)$/.exec(text);
  if (plainNumber) return Number(plainNumber[1]);
  const hourMatch = /(\d+(?:\.\d+)?)\s*(小时|小時|h|hr|hour)/i.exec(text);
  const minuteMatch = /(\d+)\s*(分钟|分鐘|分|m|min|minute)/i.exec(text);
  const hours = hourMatch ? Number(hourMatch[1]) * 60 : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  const total = Math.round(hours + minutes);
  return total > 0 ? total : null;
};

const defaultDurationForNode = (node: Pick<ItineraryNode, 'type' | 'activity_subtype'>) => {
  if (node.type === 'transport') return 60;
  switch (activitySubtypeOf(node)) {
    case 'meal': return 75;
    case 'shopping': return 60;
    case 'tour':
    case 'ticketed_event': return 120;
    case 'layover': return 60;
    case 'errand': return 45;
    case 'buffer': return 30;
    default: return 90;
  }
};

const eventDurationMinutes = (node: ItineraryNode) => {
  if (isScheduledNode(node) && node.end_time) {
    const start = parseTime(node.time);
    const endDay = node.end_day && node.end_day >= node.day ? node.end_day : node.day;
    const end = parseTime(node.end_time) + (endDay - node.day) * END_MINUTES;
    if (end > start) return Math.max(SLOT_MINUTES, end - start);
  }

  if (node.type === 'transport' && node.arrival_time) {
    const start = parseTime(node.time);
    let end = parseTime(node.arrival_time);
    const arrivalOffset = Math.max(0, dateDeltaDays(node.date, node.arrival_date) || 0);
    if (arrivalOffset > 0) end += arrivalOffset * END_MINUTES;
    else if (end <= start) end += END_MINUTES;
    if (end > start) return Math.max(SLOT_MINUTES, end - start);
  }

  return Math.max(SLOT_MINUTES, parseDurationMinutes(node.duration) || defaultDurationForNode(node));
};

const imagesOf = (node: ItineraryNode) => node.image_urls?.length ? node.image_urls : node.image_url ? [node.image_url] : [];

const lodgingImagesOf = (lodging: Lodging) => lodging.image_urls?.length ? lodging.image_urls : lodging.image_url ? [lodging.image_url] : [];

const isTicketTransport = (node: ItineraryNode) =>
  Boolean(node.transport_mode || node.departure_place || node.arrival_place || /航班|高铁|火车|飞往|→/.test(node.title));

const routeSegmentKey = (linkType: RouteSegment['linkType'], linkId: string) => `${linkType}:${linkId}`;

const findEdgeBetween = (edges: ItineraryEdge[], source: ItineraryNode, target: ItineraryNode) =>
  edges.find((edge) =>
    edge.displayStatus !== 'hidden' &&
    edge.source === source.id &&
    edge.target === target.id
  );

const routeMetricText = (edge: ItineraryEdge, segment?: RouteSegment) =>
  [segment?.distanceText || edge.distance, segment?.durationText || edge.duration].filter(Boolean).join(' · ');

const edgeTransportLabel = (type?: string) => {
  switch (type) {
    case 'walk': return '步行';
    case 'car': return '驾车';
    case 'taxi': return '打车';
    case 'transit': return '公共交通';
    case 'bus': return '公交';
    case 'subway': return '地铁';
    case 'train': return '铁路';
    case 'high_speed_rail': return '高铁';
    case 'ferry': return '轮渡';
    default: return '接续';
  }
};

const edgeTransportIcon = (type?: string) => {
  switch (type) {
    case 'walk': return Footprints;
    case 'car':
    case 'taxi': return Car;
    case 'bus':
    case 'transit': return Bus;
    case 'train':
    case 'high_speed_rail':
    case 'subway': return TrainFront;
    case 'ferry': return Ship;
    default: return Route;
  }
};

const transportModeIcon = (mode?: TransportMode) => {
  switch (mode) {
    case 'flight': return Plane;
    case 'car': return Car;
    case 'bus': return Bus;
    case 'ferry': return Ship;
    case 'train':
    case 'high_speed_rail':
    case 'subway': return TrainFront;
    default: return Route;
  }
};

const routeTone = (type?: string) => {
  switch (type) {
    case 'walk': return { dot: 'bg-orange-500', text: 'text-orange-600', border: 'border-orange-200', bg: 'bg-orange-50/90' };
    case 'car':
    case 'taxi': return { dot: 'bg-rose-500', text: 'text-rose-600', border: 'border-rose-200', bg: 'bg-rose-50/90' };
    case 'bus':
    case 'transit':
    case 'subway':
    case 'train':
    case 'high_speed_rail': return { dot: 'bg-emerald-500', text: 'text-emerald-600', border: 'border-emerald-200', bg: 'bg-emerald-50/90' };
    case 'ferry': return { dot: 'bg-blue-500', text: 'text-blue-600', border: 'border-blue-200', bg: 'bg-blue-50/90' };
    default: return { dot: 'bg-slate-400', text: 'text-slate-600', border: 'border-slate-200', bg: 'bg-slate-50/90' };
  }
};

const eventPalette = (node: ItineraryNode) => {
  if (node.type === 'transport') {
    return {
      background: 'linear-gradient(135deg, rgba(255,255,255,.97), rgba(224,242,254,.92))',
      border: 'rgba(125,211,252,.76)',
      text: '#0f172a',
      muted: '#64748b',
      rail: '#38bdf8',
      shadow: 'rgba(14,165,233,.18)',
    };
  }

  switch (activitySubtypeOf(node)) {
    case 'meal':
      return { background: 'linear-gradient(135deg, rgba(225,29,72,.95), rgba(251,113,133,.9))', border: 'rgba(254,205,211,.78)', text: '#fff', muted: 'rgba(255,255,255,.78)', rail: '#fecdd3', shadow: 'rgba(225,29,72,.2)' };
    case 'shopping':
      return { background: 'linear-gradient(135deg, rgba(190,24,93,.95), rgba(168,85,247,.9))', border: 'rgba(251,207,232,.78)', text: '#fff', muted: 'rgba(255,255,255,.76)', rail: '#fbcfe8', shadow: 'rgba(190,24,93,.2)' };
    case 'leisure':
      return { background: 'linear-gradient(135deg, rgba(202,138,4,.94), rgba(245,158,11,.88))', border: 'rgba(254,240,138,.78)', text: '#fff', muted: 'rgba(255,255,255,.76)', rail: '#fef08a', shadow: 'rgba(202,138,4,.18)' };
    case 'tour':
    case 'ticketed_event':
      return { background: 'linear-gradient(135deg, rgba(37,99,235,.95), rgba(124,58,237,.9))', border: 'rgba(191,219,254,.78)', text: '#fff', muted: 'rgba(255,255,255,.76)', rail: '#bfdbfe', shadow: 'rgba(37,99,235,.22)' };
    case 'layover':
      return { background: 'linear-gradient(135deg, rgba(8,145,178,.95), rgba(20,184,166,.88))', border: 'rgba(165,243,252,.78)', text: '#fff', muted: 'rgba(255,255,255,.76)', rail: '#a5f3fc', shadow: 'rgba(8,145,178,.2)' };
    default:
      return { background: 'linear-gradient(135deg, rgba(124,58,237,.95), rgba(217,70,239,.9))', border: 'rgba(221,214,254,.78)', text: '#fff', muted: 'rgba(255,255,255,.76)', rail: '#f5d0fe', shadow: 'rgba(124,58,237,.22)' };
  }
};

const eventStyle = (node: ItineraryNode): React.CSSProperties => {
  const tone = eventPalette(node);
  return {
    background: tone.background,
    borderColor: tone.border,
    color: tone.text,
    boxShadow: `0 16px 34px ${tone.shadow}, inset 0 1px 0 rgba(255,255,255,.42)`,
    ['--event-muted' as string]: tone.muted,
    ['--event-rail' as string]: tone.rail,
  };
};

const dayForDate = (date: string | undefined, dateByDay: Map<number, string>, tripStartDate?: string) => {
  if (!date) return null;
  for (const [day, dayDate] of dateByDay.entries()) {
    if (dayDate === date) return day;
  }
  return dayFromStartDate(date, tripStartDate);
};

const nodeScheduleRange = (node: ItineraryNode, dateByDay: Map<number, string>, tripStartDate?: string) => {
  const departureDay = node.day || dayForDate(node.date, dateByDay, tripStartDate) || 1;
  const start = parseTime(node.time);
  const startAbsolute = (departureDay - 1) * END_MINUTES + start;

  let endDay = node.end_day || dayForDate(node.end_date, dateByDay, tripStartDate) || 0;
  let endTime = node.end_time;

  if (!endDay || !endTime) {
    const explicitArrivalDay = dayForDate(node.arrival_date, dateByDay, tripStartDate);
    const arrivalOffset = Math.max(0, dateDeltaDays(node.date, node.arrival_date) || 0);
    const inferredOvernight = Boolean(
      node.arrival_time &&
      parseTime(node.arrival_time) <= parseTime(node.time) &&
      (!node.arrival_date || node.arrival_date === node.date),
    );
    endDay = node.type === 'transport'
      ? explicitArrivalDay || departureDay + arrivalOffset + (inferredOvernight ? 1 : 0)
      : departureDay + Math.floor((start + eventDurationMinutes(node)) / END_MINUTES);
    endTime = node.type === 'transport' && node.arrival_time
      ? node.arrival_time
      : formatTime((start + eventDurationMinutes(node)) % END_MINUTES);
  }

  let endAbsolute = (Math.max(departureDay, endDay) - 1) * END_MINUTES + parseTime(endTime);
  if (endAbsolute <= startAbsolute) endAbsolute = startAbsolute + eventDurationMinutes(node);

  const arrivalDay = Math.max(departureDay, Math.ceil(endAbsolute / END_MINUTES));
  return { departureDay, arrivalDay, startAbsolute, endAbsolute };
};

const scheduleSegmentForDay = (
  node: ItineraryNode,
  day: number,
  dateByDay: Map<number, string>,
  tripStartDate?: string,
): Omit<ScheduleEvent, 'lane' | 'lanes'> | null => {
  const { departureDay, arrivalDay, startAbsolute, endAbsolute } = nodeScheduleRange(node, dateByDay, tripStartDate);
  if (day < departureDay || day > arrivalDay) return null;

  const dayStart = (day - 1) * END_MINUTES;
  const dayEnd = dayStart + END_MINUTES;
  const overlapStart = Math.max(startAbsolute, dayStart);
  const overlapEnd = Math.min(endAbsolute, dayEnd);
  if (overlapEnd <= overlapStart) return null;

  const start = Math.max(START_MINUTES, overlapStart - dayStart);
  const end = Math.min(END_MINUTES, overlapEnd - dayStart);
  const startsHere = overlapStart === startAbsolute;
  const endsHere = overlapEnd === endAbsolute;
  const segmentKind: ScheduleSegmentKind = startsHere && endsHere
    ? 'single'
    : startsHere
      ? 'start'
      : endsHere
        ? 'end'
        : 'middle';

  return {
    node,
    start,
    end,
    segmentKind,
    displayStart: start === START_MINUTES && !startsHere ? '00:00' : node.time || formatTime(start),
    displayEnd: end === END_MINUTES && !endsHere ? '23:59' : formatTime(end),
    departureDay,
    arrivalDay,
  };
};

const layoutScheduleEvents = (
  nodes: ItineraryNode[],
  day: number,
  dateByDay: Map<number, string>,
  tripStartDate?: string,
): ScheduleEvent[] => {
  const events = nodes
    .map((node) => scheduleSegmentForDay(node, day, dateByDay, tripStartDate))
    .filter((event): event is Omit<ScheduleEvent, 'lane' | 'lanes'> => Boolean(event))
    .map((event) => ({ ...event, lane: 0, lanes: 1 }))
    .sort((a, b) => a.start - b.start || a.end - b.end || a.node.title.localeCompare(b.node.title, 'zh-CN'));

  const groups: ScheduleEvent[][] = [];
  let currentGroup: ScheduleEvent[] = [];
  let currentGroupEnd = START_MINUTES;

  events.forEach((event) => {
    if (!currentGroup.length || event.start < currentGroupEnd) {
      currentGroup.push(event);
      currentGroupEnd = Math.max(currentGroupEnd, event.end);
      return;
    }
    groups.push(currentGroup);
    currentGroup = [event];
    currentGroupEnd = event.end;
  });
  if (currentGroup.length) groups.push(currentGroup);

  return groups.flatMap((group) => {
    const laneEnds: number[] = [];
    let groupLaneCount = 1;

    group.forEach((event) => {
      const lane = laneEnds.findIndex((end) => end <= event.start);
      event.lane = lane === -1 ? laneEnds.length : lane;
      laneEnds[event.lane] = event.end;
      groupLaneCount = Math.max(groupLaneCount, laneEnds.length);
    });

    return group.map((event) => ({ ...event, lanes: groupLaneCount }));
  });
};

const stayNightCount = (stay: Stay) => Math.max(1, dateDeltaDays(stay.check_in_date, stay.check_out_date) || 1);

const stayNightIndex = (stay: Stay, date: string) => {
  const offset = dateDeltaDays(stay.check_in_date, date);
  if (offset == null || offset < 0 || offset >= stayNightCount(stay)) return null;
  return offset + 1;
};

const buildEntries = (
  nodes: ItineraryNode[],
  edges: ItineraryEdge[],
  routeSegments: RouteSegment[],
  stays: Stay[],
  lodgings: Lodging[],
  activeDay: number | 'all',
): ScheduleEntry[] => {
  const routeSegmentLookup = new Map(routeSegments.map((segment) => [routeSegmentKey(segment.linkType, segment.linkId), segment]));
  const lodgingLookup = new Map(lodgings.map((lodging) => [lodging.id, lodging]));
  const ordered = nodes
    .filter((node) => isScheduledNode(node) && (activeDay === 'all' || node.day === activeDay))
    .sort(compareItineraryNodes);
  const entries: ScheduleEntry[] = [];

  ordered.forEach((node, index) => {
    entries.push({ kind: 'event', node });
    const next = ordered[index + 1];
    if (!next) return;
    const edge = findEdgeBetween(edges, node, next);
    if (!edge) return;
    entries.push({
      kind: 'route',
      edge,
      segment: routeSegmentLookup.get(routeSegmentKey('edge', edge.id)),
      source: node,
      target: next,
    });
  });

  stays
    .filter((stay) =>
      stay.status !== 'cancelled' &&
      (activeDay === 'all' || (stay.check_in_day <= activeDay && stay.check_out_day > activeDay))
    )
    .forEach((stay) => {
      const lodging = lodgingLookup.get(stay.lodging_id);
      if (lodging) entries.push({ kind: 'lodging', stay, lodging });
    });

  return entries;
};

const nodeLocationText = (node: ItineraryNode) => {
  if (node.type === 'transport') return `${node.departure_place || '出发地'} → ${node.arrival_place || '到达地'}`;
  return node.city || node.address || node.description || '地点信息待补充';
};

const segmentBadge = (event: ScheduleEvent) => {
  if (event.segmentKind === 'single') return itineraryTypeLabel(event.node);
  if (event.segmentKind === 'start') return `跨至 D${event.arrivalDay}`;
  if (event.segmentKind === 'end') return `D${event.departureDay} 延续`;
  return '跨天途中';
};

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return isMobile;
}

function MobileEventCard({
  node,
  selected,
  setCardRef,
  onPreview,
  onSelect,
}: {
  key?: React.Key;
  node: ItineraryNode;
  selected: boolean;
  setCardRef: (id: string, element: HTMLDivElement | null) => void;
  onPreview: (preview: { node: ItineraryNode; index: number }) => void;
  onSelect: () => void;
}) {
  const nodeMeta = itineraryTypeTone(node);
  const images = imagesOf(node);
  const duration = eventDurationMinutes(node);
  const width = Math.max(190, Math.min(286, duration * 1.25));

  if (node.type === 'transport') {
    return (
      <div
        ref={(element) => setCardRef(node.id, element)}
        onClick={onSelect}
        className={`shrink-0 snap-center cursor-pointer transition ${selected ? 'rounded-xl ring-2 ring-sky-400/40' : ''}`}
        style={{ width }}
      >
        {isTicketTransport(node) ? (
          <TransportTicket node={node} compact />
        ) : (
          <div className="rounded-xl border border-sky-100 bg-sky-50/85 px-2.5 py-2 shadow-sm">
            <div className="text-[10px] font-black text-sky-700">{node.time} - {node.end_time || node.arrival_time || formatTime(parseTime(node.time) + duration)}</div>
            <div className="mt-1 text-xs font-black text-slate-800">{node.title}</div>
            <p className="mt-0.5 line-clamp-1 text-[9px] font-bold text-slate-500">{nodeLocationText(node)}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <article
      ref={(element) => setCardRef(node.id, element)}
      onClick={onSelect}
      className={`shrink-0 snap-center cursor-pointer overflow-hidden rounded-xl border transition ${
        selected
          ? 'border-indigo-200 bg-white/92 shadow-xl ring-2 ring-indigo-500/12'
          : 'border-white/60 bg-white/62 shadow-md hover:bg-white/82'
      }`}
      style={{ width }}
    >
      <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 p-2">
        <button
          onClick={(event) => {
            event.stopPropagation();
            if (images[0]) onPreview({ node, index: 0 });
          }}
          className={`group relative h-16 overflow-hidden rounded-lg ${images[0] ? 'bg-slate-200' : nodeMeta.card}`}
          type="button"
        >
          {images[0] ? (
            <>
              <img src={images[0]} {...responsiveImageProps(images[0], '160px')} alt={node.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full bg-slate-950/70 px-1.5 py-0.5 text-[8px] font-bold text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
                <ImageIcon className="h-2.5 w-2.5" />
                {images.length}
              </span>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] font-black text-slate-400">{itineraryTypeLabel(node)}</div>
          )}
        </button>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[9px] font-black tabular-nums text-slate-500">
                {node.time} - {node.end_time || formatTime(parseTime(node.time) + duration)}
              </div>
              <h4 className="mt-0.5 truncate text-xs font-black text-slate-950">{node.title}</h4>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-black ${nodeMeta.timeline}`}>
              {itineraryTypeLabel(node)}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[9px] leading-relaxed text-slate-500">{nodeLocationText(node)}</p>
          <div className="mt-1 border-t border-slate-100/80 pt-1 text-[8px] font-semibold text-slate-400">
            持续 {duration >= 60 ? `${Math.floor(duration / 60)}小时${duration % 60 ? `${duration % 60}分` : ''}` : `${duration}分钟`}
          </div>
        </div>
      </div>
    </article>
  );
}

function MobileRouteCard({
  entry,
  active,
  onSelect,
  onHover,
}: {
  key?: React.Key;
  entry: Extract<ScheduleEntry, { kind: 'route' }>;
  active: boolean;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
}) {
  const Icon = edgeTransportIcon(entry.edge.transportType);
  const tone = routeTone(entry.edge.transportType);
  const metric = routeMetricText(entry.edge, entry.segment) || '路线待补充';

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className={`flex w-32 shrink-0 snap-center items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-left transition ${
        active ? `bg-white/90 shadow-md ring-1 ring-indigo-200 ${tone.border}` : `bg-white/46 hover:bg-white/68 ${tone.border}`
      }`}
    >
      <span className={`h-1.5 w-8 shrink-0 rounded-full ${tone.dot}`} />
      <Icon className={`h-3.5 w-3.5 shrink-0 ${tone.text}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[10px] font-black text-slate-700">{edgeTransportLabel(entry.edge.transportType)}</span>
        <span className="mt-0.5 block truncate text-[9px] font-bold text-slate-500">{metric}</span>
      </span>
    </button>
  );
}

function MobileLodgingCard({
  stay,
  lodging,
  selected,
  setCardRef,
  onSelect,
}: {
  key?: React.Key;
  stay: Stay;
  lodging: Lodging;
  selected: boolean;
  setCardRef: (id: string, element: HTMLDivElement | null) => void;
  onSelect: () => void;
}) {
  return (
    <button
      ref={(element) => setCardRef(lodging.id, element)}
      type="button"
      onClick={onSelect}
      className={`w-48 shrink-0 snap-center rounded-xl border p-2 text-left shadow-sm transition ${
        selected
          ? 'border-emerald-300 bg-emerald-50/92 ring-2 ring-emerald-400/20'
          : 'border-emerald-100 bg-emerald-50/78 hover:border-emerald-200'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-700">
          <Bed className="h-3.5 w-3.5" />
          夜宿
        </span>
        <span className="rounded-full bg-white/72 px-2 py-0.5 text-[8px] font-black text-emerald-700">
          D{stay.check_in_day}-D{stay.check_out_day}
        </span>
      </div>
      <div className="mt-1 truncate text-xs font-black text-slate-950">{lodging.name}</div>
      <div className="mt-1 truncate text-[10px] font-bold text-slate-500">{lodging.city || lodging.address || '住宿地址待补充'}</div>
    </button>
  );
}

function LodgingBand({
  stays,
  activeNodeId,
  setActiveNodeId,
  setCardRef,
}: {
  stays: DayStay[];
  activeNodeId: string | null;
  setActiveNodeId: (id: string | null) => void;
  setCardRef: (id: string, element: HTMLDivElement | null) => void;
}) {
  if (!stays.length) return null;

  return (
    <div className="mb-2 grid gap-2">
      {stays.map(({ stay, lodging, nightIndex, nightCount }) => {
        const cover = lodgingImagesOf(lodging)[0];
        const selected = activeNodeId === lodging.id;
        return (
          <button
            key={stay.id}
            ref={(element) => setCardRef(lodging.id, element)}
            type="button"
            onClick={() => setActiveNodeId(lodging.id)}
            className={`group flex min-w-0 items-center gap-2 overflow-hidden rounded-2xl border px-2.5 py-2 text-left shadow-sm transition hover:-translate-y-0.5 ${
              selected
                ? 'border-emerald-300 bg-emerald-50/95 ring-2 ring-emerald-300/25'
                : 'border-emerald-100 bg-white/70 hover:border-emerald-200 hover:bg-emerald-50/80'
            }`}
          >
            <span className="relative flex h-11 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-100 text-emerald-700">
              {cover ? <img src={cover} {...responsiveImageProps(cover, '160px')} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <Bed className="h-5 w-5" />}
              <span className="absolute inset-x-0 bottom-0 bg-slate-950/55 px-1 py-0.5 text-center text-[8px] font-black text-white">N{nightIndex}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-[9px] font-black text-emerald-700">
                <Bed className="h-3 w-3" />
                夜宿 · 第 {nightIndex} / {nightCount} 晚
              </span>
              <span className="mt-0.5 block truncate text-xs font-black text-slate-900">{lodging.name}</span>
              <span className="mt-0.5 block truncate text-[10px] font-bold text-slate-500">{lodging.city || lodging.address || '地址待补充'}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DayEventBlock({
  event,
  selected,
  setCardRef,
  onPreview,
  onSelect,
}: {
  key?: React.Key;
  event: ScheduleEvent;
  selected: boolean;
  setCardRef: (id: string, element: HTMLDivElement | null) => void;
  onPreview: (preview: { node: ItineraryNode; index: number }) => void;
  onSelect: () => void;
}) {
  const top = ((event.start - START_MINUTES) / SLOT_MINUTES) * SLOT_HEIGHT + 2;
  const height = Math.max(MIN_EVENT_HEIGHT, ((event.end - event.start) / SLOT_MINUTES) * SLOT_HEIGHT - 4);
  const width = 100 / event.lanes;
  const left = event.lane * width;
  const cover = imagesOf(event.node)[0];
  const Icon = event.node.type === 'transport' ? transportModeIcon(event.node.transport_mode) : MapPin;
  const compact = height < 68;
  const roomy = height >= 104;
  const timeText = `${event.displayStart} - ${event.displayEnd}`;

  return (
    <button
      ref={(element) => setCardRef(event.node.id, element)}
      type="button"
      onClick={onSelect}
      className={`pointer-events-auto absolute isolate overflow-hidden rounded-xl border px-3 py-2 text-left backdrop-blur-xl backdrop-saturate-150 transition hover:-translate-y-0.5 hover:brightness-105 ${
        selected ? 'ring-2 ring-slate-950/20' : ''
      }`}
      style={{
        top,
        height,
        left: `calc(${left}% + 3px)`,
        width: `calc(${width}% - 6px)`,
        ...eventStyle(event.node),
      }}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/55" />
      <span className="pointer-events-none absolute bottom-2 left-2 top-2 w-1 rounded-full bg-[var(--event-rail)]/90 shadow-[0_0_16px_rgba(255,255,255,0.45)]" />
      <span className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-white/18 blur-2xl" />
      <span className="relative z-10 flex h-full min-w-0 items-center gap-2 pl-2">
        {cover && event.node.type !== 'transport' && height >= 54 ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              onPreview({ node: event.node, index: 0 });
            }}
            onKeyDown={(keyEvent) => {
              if (keyEvent.key === 'Enter') {
                keyEvent.stopPropagation();
                onPreview({ node: event.node, index: 0 });
              }
            }}
            className={`${compact ? 'h-8 w-10' : 'h-11 w-14'} shrink-0 overflow-hidden rounded-lg border border-white/25 bg-white/16 shadow-inner backdrop-blur`}
          >
            <img src={cover} {...responsiveImageProps(cover, '160px')} alt="" className="h-full w-full object-cover" />
          </span>
        ) : (
          <span className={`${compact ? 'h-7 w-7' : 'h-9 w-9'} flex shrink-0 items-center justify-center rounded-lg bg-white/16 text-current backdrop-blur`}>
            <Icon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-[9px] font-black tabular-nums">{timeText}</span>
            <span className="min-w-0 flex-1 truncate text-[11px] font-black drop-shadow-sm">{event.node.title}</span>
          </span>
          {!compact && (
            <span className="mt-0.5 block truncate text-[9px] font-semibold text-[var(--event-muted)]">
              {nodeLocationText(event.node)}
            </span>
          )}
          {roomy && event.node.description && (
            <span className="mt-0.5 block truncate text-[8px] font-medium text-[var(--event-muted)]">
              {event.node.description}
            </span>
          )}
        </span>
        {!compact && (
          <span className="shrink-0 rounded-full bg-white/18 px-1.5 py-0.5 text-[8px] font-black backdrop-blur">
            {segmentBadge(event)}
          </span>
        )}
      </span>
    </button>
  );
}

function DayRouteChip({
  link,
  active,
  onSelect,
  onHover,
}: {
  key?: React.Key;
  link: DayRouteLink;
  active: boolean;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
}) {
  const top = ((Math.min(END_MINUTES - 20, Math.max(START_MINUTES, (link.source.end + link.target.start) / 2)) - START_MINUTES) / SLOT_MINUTES) * SLOT_HEIGHT - 10;
  const Icon = edgeTransportIcon(link.edge.transportType);
  const tone = routeTone(link.edge.transportType);
  const metric = routeMetricText(link.edge, link.segment) || '路线';

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className={`pointer-events-auto absolute right-3 z-40 flex max-w-[calc(100%-90px)] items-center gap-1.5 rounded-full border px-2 py-1 text-left shadow-sm backdrop-blur transition hover:-translate-y-0.5 ${
        active ? `bg-white ${tone.border} ring-1 ring-indigo-200` : `${tone.bg} ${tone.border} hover:bg-white/95`
      }`}
      style={{ left: 68, top }}
    >
      <span className={`h-1.5 w-6 shrink-0 rounded-full ${tone.dot}`} />
      <Icon className={`h-3 w-3 shrink-0 ${tone.text}`} />
      <span className="min-w-0 truncate text-[8px] font-black text-slate-600">
        {edgeTransportLabel(link.edge.transportType)} · {metric}
      </span>
    </button>
  );
}

function ReadOnlyDaySchedule({
  day,
  date,
  events,
  routeLinks,
  stays,
  activeNodeId,
  activeEdgeId,
  hoveredEdgeId,
  setCardRef,
  setActiveNodeId,
  setActiveEdgeId,
  setHoveredEdgeId,
  onPreview,
}: {
  day: number;
  date?: string;
  events: ScheduleEvent[];
  routeLinks: DayRouteLink[];
  stays: DayStay[];
  activeNodeId: string | null;
  activeEdgeId: string | null;
  hoveredEdgeId: string | null;
  setCardRef: (id: string, element: HTMLDivElement | null) => void;
  setActiveNodeId: (id: string | null) => void;
  setActiveEdgeId: (id: string | null) => void;
  setHoveredEdgeId: (id: string | null) => void;
  onPreview: (preview: { node: ItineraryNode; index: number }) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    const earliest = events.reduce((minimum, event) => Math.min(minimum, event.start), END_MINUTES);
    const targetMinutes = Math.max(START_MINUTES, (earliest === END_MINUTES ? 8 * 60 : earliest) - 60);
    scrollRef.current.scrollTo({
      top: (targetMinutes / SLOT_MINUTES) * SLOT_HEIGHT,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [day, events.length]);

  return (
    <div className="hidden min-h-0 flex-1 flex-col sm:flex">
      <LodgingBand stays={stays} activeNodeId={activeNodeId} setActiveNodeId={setActiveNodeId} setCardRef={setCardRef} />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/55 bg-white/72 shadow-inner">
        <div className="sticky top-0 z-50 flex items-center justify-between border-b border-slate-100 bg-white/82 px-3 py-2 backdrop-blur-xl">
          <span className="text-[10px] font-black text-slate-900">D{day} · {formatShortDate(date)}</span>
          <span className="text-[9px] font-bold text-slate-400">00:00 - 23:59</span>
        </div>
        <div className="relative" style={{ height: slots.length * SLOT_HEIGHT }}>
          {slots.map((minutes) => (
            <div
              key={minutes}
              className="grid border-t border-slate-100 first:border-t-0"
              style={{ gridTemplateColumns: '56px minmax(0, 1fr)', height: SLOT_HEIGHT }}
            >
              <div className="select-none border-r border-slate-100 pr-2 pt-1 text-right text-[9px] font-bold tabular-nums text-slate-400">
                {minutes % 60 === 0 ? formatTime(minutes) : ''}
              </div>
              <div className="bg-white/24" />
            </div>
          ))}
          <div className="pointer-events-none absolute right-3 top-0" style={{ left: 58 }}>
            {events.map((event) => (
              <DayEventBlock
                key={`${event.node.id}-${day}-${event.segmentKind}`}
                event={event}
                selected={activeNodeId === event.node.id}
                setCardRef={setCardRef}
                onPreview={onPreview}
                onSelect={() => setActiveNodeId(event.node.id)}
              />
            ))}
          </div>
          {routeLinks.map((link) => {
            const active = activeEdgeId === link.edge.id || hoveredEdgeId === link.edge.id;
            return (
              <DayRouteChip
                key={link.edge.id}
                link={link}
                active={active}
                onSelect={() => setActiveEdgeId(link.edge.id)}
                onHover={(hovered) => setHoveredEdgeId(hovered ? link.edge.id : null)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OverviewSchedule({
  days,
  dateByDay,
  nodes,
  stays,
  lodgingById,
  setActiveDay,
}: {
  days: number[];
  dateByDay: Map<number, string>;
  nodes: ItineraryNode[];
  stays: Stay[];
  lodgingById: Map<string, Lodging>;
  setActiveDay: (day: number | 'all') => void;
}) {
  return (
    <div className="hidden min-h-0 flex-1 overflow-y-auto pr-1 sm:block">
      <div className="space-y-2">
        {days.map((day) => {
          const dayNodes = nodes.filter((node) => node.day === day).sort(compareItineraryNodes);
          const dayStays = stays
            .filter((stay) => stay.status !== 'cancelled' && stay.check_in_day <= day && stay.check_out_day > day)
            .map((stay) => lodgingById.get(stay.lodging_id)?.name)
            .filter(Boolean);
          return (
            <button
              key={day}
              type="button"
              onClick={() => setActiveDay(day)}
              className="w-full rounded-2xl border border-white/60 bg-white/62 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-white/82"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-black text-slate-900">D{day}</span>
                <span className="text-[10px] font-bold text-slate-400">{formatShortDate(dateByDay.get(day))}</span>
              </div>
              <div className="mt-2 space-y-1.5">
                {dayNodes.slice(0, 4).map((node) => (
                  <div key={node.id} className="flex items-center gap-2 text-[10px]">
                    <span className="w-10 shrink-0 font-black tabular-nums text-slate-500">{node.time}</span>
                    <span className="min-w-0 flex-1 truncate font-bold text-slate-700">{node.title}</span>
                  </div>
                ))}
              </div>
              {dayStays.length > 0 && (
                <div className="mt-2 truncate rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700">
                  夜宿 · {dayStays.join('、')}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Timeline() {
  const {
    trip,
    nodes,
    edges,
    routeSegments,
    lodgings,
    stays,
    activeNodeId,
    activeEdgeId,
    hoveredEdgeId,
    setActiveNodeId,
    setActiveEdgeId,
    setHoveredEdgeId,
    activeDay,
    setActiveDay,
  } = useItineraryStore();
  const isMobile = useIsMobile();
  const [preview, setPreview] = useState<{ node: ItineraryNode; index: number } | null>(null);
  const mobileTrackRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const scrollEndTimer = useRef<number | null>(null);

  const scheduledNodes = useMemo(() => nodes.filter(isScheduledNode).sort(compareItineraryNodes), [nodes]);
  const dayNumbers = useMemo(() => {
    const tripDays = dayCountBetween(trip?.start_date, trip?.end_date);
    const fromTrip = Array.from({ length: tripDays }, (_, index) => index + 1);
    const fromNodes = scheduledNodes.flatMap((node) => {
      const range = nodeScheduleRange(node, new Map(), trip?.start_date);
      return [range.departureDay, range.arrivalDay];
    });
    const fromStays = stays.flatMap((stay) => [stay.check_in_day, stay.check_out_day]).filter((day) => day > 0);
    return Array.from(new Set([...fromTrip, ...fromNodes, ...fromStays, 1])).filter((day) => day > 0).sort((a, b) => a - b);
  }, [scheduledNodes, stays, trip?.end_date, trip?.start_date]);

  const dateByDay = useMemo(() => {
    const map = new Map<number, string>();
    if (trip?.start_date) dayNumbers.forEach((day) => map.set(day, addDays(trip.start_date, day - 1)));
    scheduledNodes.forEach((node) => {
      if (!map.has(node.day) && node.date) map.set(node.day, node.date);
    });
    stays.forEach((stay) => {
      if (!map.has(stay.check_in_day) && stay.check_in_date) map.set(stay.check_in_day, stay.check_in_date);
      if (!map.has(stay.check_out_day) && stay.check_out_date) map.set(stay.check_out_day, stay.check_out_date);
    });
    return map;
  }, [dayNumbers, scheduledNodes, stays, trip?.start_date]);

  const lodgingById = useMemo(() => new Map(lodgings.map((lodging) => [lodging.id, lodging])), [lodgings]);
  const routeSegmentLookup = useMemo(
    () => new Map(routeSegments.map((segment) => [routeSegmentKey(segment.linkType, segment.linkId), segment])),
    [routeSegments],
  );
  const currentDay = activeDay === 'all' ? dayNumbers[0] || 1 : activeDay;
  const currentDate = dateByDay.get(currentDay);
  const visibleEventCount = scheduledNodes.filter((node) => activeDay === 'all' || scheduleSegmentForDay(node, currentDay, dateByDay, trip?.start_date)).length;
  const visibleTransportCount = scheduledNodes.filter((node) => node.type === 'transport' && (activeDay === 'all' || scheduleSegmentForDay(node, currentDay, dateByDay, trip?.start_date))).length;
  const entries = useMemo(
    () => buildEntries(nodes, edges, routeSegments, stays, lodgings, activeDay),
    [activeDay, edges, lodgings, nodes, routeSegments, stays],
  );
  const dayEvents = useMemo(
    () => layoutScheduleEvents(
      scheduledNodes.filter((node) => scheduleSegmentForDay(node, currentDay, dateByDay, trip?.start_date)),
      currentDay,
      dateByDay,
      trip?.start_date,
    ),
    [currentDay, dateByDay, scheduledNodes, trip?.start_date],
  );
  const dayRouteLinks = useMemo(() => {
    const ordered = dayEvents
      .filter((event) => event.segmentKind !== 'middle')
      .sort((a, b) => a.start - b.start || a.node.title.localeCompare(b.node.title, 'zh-CN'));
    const links: DayRouteLink[] = [];
    ordered.forEach((sourceEvent, index) => {
      const targetEvent = ordered[index + 1];
      if (!targetEvent) return;
      const edge = findEdgeBetween(edges, sourceEvent.node, targetEvent.node);
      if (!edge) return;
      links.push({
        edge,
        segment: routeSegmentLookup.get(routeSegmentKey('edge', edge.id)),
        source: sourceEvent,
        target: targetEvent,
      });
    });
    return links;
  }, [dayEvents, edges, routeSegmentLookup]);
  const dayStays = useMemo(
    () => stays
      .filter((stay) => stay.status !== 'cancelled' && stay.check_in_day <= currentDay && stay.check_out_day > currentDay)
      .map((stay) => {
        const lodging = lodgingById.get(stay.lodging_id);
        const date = dateByDay.get(currentDay);
        const nightIndex = date ? stayNightIndex(stay, date) : null;
        return lodging && nightIndex ? { stay, lodging, nightIndex, nightCount: stayNightCount(stay) } : null;
      })
      .filter((item): item is DayStay => Boolean(item)),
    [currentDay, dateByDay, lodgingById, stays],
  );

  const setCardRef = useCallback((id: string, element: HTMLElement | null) => {
    if (element) cardRefs.current.set(id, element);
    else cardRefs.current.delete(id);
  }, []);

  useEffect(() => {
    if (!activeNodeId) return;
    cardRefs.current.get(activeNodeId)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }, [activeNodeId, activeDay, isMobile]);

  const syncActiveCard = () => {
    if (!isMobile) return;
    if (scrollEndTimer.current !== null) window.clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = window.setTimeout(() => {
      scrollEndTimer.current = null;
      const track = mobileTrackRef.current;
      if (!track) return;
      const trackRect = track.getBoundingClientRect();
      const center = trackRect.left + trackRect.width / 2;
      let closestId: string | null = null;
      let closestDistance = Number.POSITIVE_INFINITY;
      cardRefs.current.forEach((card, id) => {
        const rect = card.getBoundingClientRect();
        const distance = Math.abs(rect.left + rect.width / 2 - center);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestId = id;
        }
      });
      if (closestId && closestId !== activeNodeId) setActiveNodeId(closestId);
    }, 140);
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {preview && (
        <ImagePreviewModal
          images={imagesOf(preview.node)}
          index={preview.index}
          title={preview.node.title}
          onClose={() => setPreview(null)}
          onIndexChange={(index) => setPreview({ ...preview, index })}
        />
      )}

      <div className="mb-2 shrink-0 rounded-xl border border-white/50 bg-white/42 p-2 shadow-lg backdrop-blur-md sm:mb-3 sm:rounded-2xl sm:p-3">
        <div className="mb-1.5 flex items-center justify-between gap-2 sm:mb-2">
          <div>
            <div className="text-xs font-black text-slate-900">按天时间表</div>
            <div className="mt-0.5 text-[10px] font-bold text-slate-500">
              {activeDay === 'all' ? '全览' : `D${activeDay} · ${formatShortDate(currentDate)}`}
            </div>
          </div>
          <span className="rounded-full bg-indigo-50 px-2 py-1 text-[9px] font-black text-indigo-700 sm:px-2.5 sm:text-[10px]">
            {Math.max(0, visibleEventCount - visibleTransportCount)} 个地点 · {visibleTransportCount} 段交通
          </span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          <button
            onClick={() => setActiveDay('all')}
            className={`shrink-0 rounded-lg border px-3 py-1 text-[11px] font-semibold sm:rounded-xl sm:px-4 sm:py-1.5 sm:text-xs ${
              activeDay === 'all' ? 'border-slate-900 bg-slate-900 text-white' : 'border-white bg-white/50 text-slate-700'
            }`}
            type="button"
          >
            全览
          </button>
          {dayNumbers.map((day) => (
            <button
              key={day}
              onClick={() => setActiveDay(day)}
              className={`shrink-0 rounded-lg border px-3 py-1 text-left text-[11px] font-semibold sm:rounded-xl sm:px-4 sm:py-1.5 sm:text-xs ${
                activeDay === day ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-white bg-white/50 text-slate-700'
              }`}
              type="button"
            >
              <span className="block leading-none">D{day}</span>
              <span className="mt-0.5 block text-[9px] opacity-75">{formatShortDate(dateByDay.get(day))}</span>
            </button>
          ))}
        </div>
      </div>

      {isMobile ? (
        <div
          ref={mobileTrackRef}
          onScroll={syncActiveCard}
          className="flex min-h-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto overflow-y-hidden px-[4%] pb-1 no-scrollbar"
        >
          {entries.map((entry, index) => {
            if (entry.kind === 'event') {
              return (
                <MobileEventCard
                  key={`event-${entry.node.id}`}
                  node={entry.node}
                  selected={activeNodeId === entry.node.id}
                  setCardRef={setCardRef}
                  onPreview={setPreview}
                  onSelect={() => setActiveNodeId(entry.node.id)}
                />
              );
            }
            if (entry.kind === 'route') {
              const active = activeEdgeId === entry.edge.id || hoveredEdgeId === entry.edge.id;
              return (
                <MobileRouteCard
                  key={`route-${entry.edge.id}-${index}`}
                  entry={entry}
                  active={active}
                  onSelect={() => setActiveEdgeId(entry.edge.id)}
                  onHover={(hovered) => setHoveredEdgeId(hovered ? entry.edge.id : null)}
                />
              );
            }
            return (
              <MobileLodgingCard
                key={`lodging-${entry.stay.id}`}
                stay={entry.stay}
                lodging={entry.lodging}
                selected={activeNodeId === entry.lodging.id}
                setCardRef={setCardRef}
                onSelect={() => setActiveNodeId(entry.lodging.id)}
              />
            );
          })}
        </div>
      ) : activeDay === 'all' ? (
        <OverviewSchedule
          days={dayNumbers}
          dateByDay={dateByDay}
          nodes={scheduledNodes}
          stays={stays}
          lodgingById={lodgingById}
          setActiveDay={setActiveDay}
        />
      ) : (
        <ReadOnlyDaySchedule
          day={currentDay}
          date={currentDate}
          events={dayEvents}
          routeLinks={dayRouteLinks}
          stays={dayStays}
          activeNodeId={activeNodeId}
          activeEdgeId={activeEdgeId}
          hoveredEdgeId={hoveredEdgeId}
          setCardRef={setCardRef}
          setActiveNodeId={setActiveNodeId}
          setActiveEdgeId={setActiveEdgeId}
          setHoveredEdgeId={setHoveredEdgeId}
          onPreview={setPreview}
        />
      )}
    </div>
  );
}
