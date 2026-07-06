import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BedDouble,
  Bus,
  Car,
  GripVertical,
  Image,
  LockKeyhole,
  LoaderCircle,
  MapPin,
  Plane,
  Plus,
  RefreshCw,
  Route,
  Save,
  Search,
  Ship,
  Train,
  Trash2,
  Upload,
  Utensils,
  X,
} from 'lucide-react';
import LocationPicker from '../components/LocationPicker/LocationPicker';
import MapView from '../components/Map/MapView';
import { useItineraryStore } from '../store/useItineraryStore';
import { ItineraryNode, ItineraryType, TransportMode } from '../types';
import { compareItineraryNodes, isScheduledNode, isUnscheduledPointNode } from '../utils/itinerary';
import {
  BEIJING_TIMEZONE,
  DEFAULT_TIMEZONE,
  TIMEZONE_OPTIONS,
  beijingRangeText,
  formatInTimeZone,
  formatTimeZoneOffset,
  inferTimeZoneFromLocation,
  normaliseTimeZone,
  timeZoneOptionLabel,
  transportDurationText,
  zonedTimeToUtcMs,
} from '../utils/timezone';

const START_MINUTES = 0;
const END_MINUTES = 24 * 60;
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 34;
const SCHEDULE_SNAP_MINUTES = SLOT_MINUTES;
const CONNECTION_SNAP_THRESHOLD_MINUTES = 10;

const pointTypeOptions: Array<{ value: Exclude<ItineraryType, 'transport'>; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'sightseeing', label: '景点', icon: MapPin },
  { value: 'hotel', label: '住宿', icon: BedDouble },
  { value: 'restaurant', label: '饭店', icon: Utensils },
];

const legacyPointTypeLabels: Partial<Record<ItineraryType, string>> = {
  transfer: '转机',
  leisure: '休闲',
  shopping: '采购',
};

const transportModeOptions: Array<{ value: TransportMode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'flight', label: '飞机', icon: Plane },
  { value: 'high_speed_rail', label: '高铁', icon: Train },
  { value: 'train', label: '火车', icon: Train },
  { value: 'car', label: '汽车', icon: Car },
  { value: 'bus', label: '公交车', icon: Bus },
  { value: 'subway', label: '地铁', icon: Train },
  { value: 'ferry', label: '轮渡', icon: Ship },
  { value: 'other', label: '其他', icon: Route },
];

const typeLabels: Record<ItineraryType, string> = {
  transport: '交通',
  transfer: '转机',
  hotel: '住宿',
  restaurant: '饭店',
  sightseeing: '景点',
  leisure: '休闲',
  shopping: '采购',
};

const typeTone: Record<ItineraryType, { card: string; badge: string; event: string }> = {
  sightseeing: {
    card: 'border-violet-100 bg-violet-50/70',
    badge: 'bg-violet-100 text-violet-700',
    event: 'border-violet-200 bg-violet-600 text-white',
  },
  hotel: {
    card: 'border-emerald-100 bg-emerald-50/75',
    badge: 'bg-emerald-100 text-emerald-700',
    event: 'border-emerald-200 bg-emerald-600 text-white',
  },
  restaurant: {
    card: 'border-rose-100 bg-rose-50/75',
    badge: 'bg-rose-100 text-rose-700',
    event: 'border-rose-200 bg-rose-600 text-white',
  },
  transport: {
    card: 'border-sky-100 bg-sky-50/80',
    badge: 'bg-sky-100 text-sky-700',
    event: 'border-sky-200 bg-sky-600 text-white',
  },
  transfer: {
    card: 'border-cyan-100 bg-cyan-50/70',
    badge: 'bg-cyan-100 text-cyan-700',
    event: 'border-cyan-200 bg-cyan-600 text-white',
  },
  leisure: {
    card: 'border-amber-100 bg-amber-50/70',
    badge: 'bg-amber-100 text-amber-700',
    event: 'border-amber-200 bg-amber-500 text-slate-950',
  },
  shopping: {
    card: 'border-pink-100 bg-pink-50/75',
    badge: 'bg-pink-100 text-pink-700',
    event: 'border-pink-200 bg-pink-600 text-white',
  },
};

const defaultDurationByType: Record<ItineraryType, number> = {
  sightseeing: 90,
  hotel: 45,
  restaurant: 75,
  transport: 60,
  transfer: 60,
  leisure: 90,
  shopping: 60,
};

type EmptyFormOptions = {
  day?: number;
  date?: string;
  time?: string;
  kind?: 'point' | 'transport';
  scheduled?: boolean;
};

const emptyForm = ({
  day = 1,
  date = '2026-09-26',
  time = '12:00',
  kind = 'point',
  scheduled = false,
}: EmptyFormOptions = {}): Omit<ItineraryNode, 'id'> => {
  const isTransport = kind === 'transport';
  const hasSchedule = isTransport || scheduled;
  return {
    title: '',
    description: '',
    type: isTransport ? 'transport' : 'sightseeing',
    time: hasSchedule ? time : '',
    day: hasSchedule ? day : 0,
    date: hasSchedule ? date : '',
    end_time: hasSchedule ? time : '',
    end_day: hasSchedule ? day : 0,
    end_date: hasSchedule ? date : '',
    timezone: DEFAULT_TIMEZONE,
    city: '',
    address: '',
    lat: 64.1466,
    lng: -21.9426,
    status: hasSchedule ? 'planned' : 'unscheduled',
    image_url: '',
    image_urls: [],
    transport_mode: 'flight',
    departure_place: '',
    arrival_place: '',
    departure_timezone: DEFAULT_TIMEZONE,
    arrival_timezone: DEFAULT_TIMEZONE,
    arrival_time: isTransport ? '14:00' : '',
    arrival_date: isTransport ? date : '',
    service_number: '',
    duration: '',
    departure_lat: null,
    departure_lng: null,
    arrival_lat: null,
    arrival_lng: null,
  };
};

const pad = (value: number) => String(value).padStart(2, '0');

const formatTime = (minutes: number) => {
  const safe = Math.max(0, Math.min(23 * 60 + 59, minutes));
  return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`;
};

const parseTime = (value?: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value || '');
  if (!match) return 12 * 60;
  return Number(match[1]) * 60 + Number(match[2]);
};

const formatShortDate = (date?: string) => date ? date.slice(5).replace('-', '/') : '--/--';

const addDays = (isoDate: string, offset: number) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return date.toISOString().slice(0, 10);
};

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

const dayFromStartDate = (date?: string, startDate?: string) => {
  const delta = dateDeltaDays(startDate, date);
  return delta != null && delta >= 0 ? delta + 1 : null;
};

const dayCountBetween = (start?: string, end?: string) => {
  if (!start || !end) return 0;
  const [startYear, startMonth, startDay] = start.split('-').map(Number);
  const [endYear, endMonth, endDay] = end.split('-').map(Number);
  const startDate = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const endDate = new Date(Date.UTC(endYear, endMonth - 1, endDay));
  return Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
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

const eventDurationMinutes = (node: ItineraryNode) => {
  if (isScheduledNode(node) && node.end_time) {
    const start = parseTime(node.time);
    const endDay = node.end_day && node.end_day >= node.day ? node.end_day : node.day;
    const end = parseTime(node.end_time) + (endDay - node.day) * END_MINUTES;
    if (end > start) return Math.max(SCHEDULE_SNAP_MINUTES, Math.min(END_MINUTES, end - start));
  }

  const parsed = parseDurationMinutes(node.duration);
  if (node.type === 'transport' && node.arrival_time) {
    const start = parseTime(node.time);
    let end = parseTime(node.arrival_time);
    const arrivalOffset = Math.max(0, dateDeltaDays(node.date, node.arrival_date) || 0);
    if (arrivalOffset > 0) end += arrivalOffset * 24 * 60;
    else if (end <= start) end += 24 * 60;
    if (end > start) return Math.max(30, Math.min(24 * 60, end - start));
  }
  return Math.max(30, parsed || defaultDurationByType[node.type] || 60);
};

const clampDurationMinutes = (minutes: number, maxMinutes = 12 * 60) => {
  const snapped = Math.round(minutes / SCHEDULE_SNAP_MINUTES) * SCHEDULE_SNAP_MINUTES;
  return Math.max(SLOT_MINUTES, Math.min(maxMinutes, snapped));
};

const formatDurationText = (minutes: number) => {
  const safe = Math.max(SLOT_MINUTES, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const restMinutes = safe % 60;
  if (!hours) return `${safe}分钟`;
  return restMinutes ? `${hours}小时${restMinutes}分` : `${hours}小时`;
};

const localOffsetText = (date: string, time: string, timeZone?: string) =>
  formatTimeZoneOffset(timeZone, zonedTimeToUtcMs(date, time, timeZone));

const nodePointTimeZone = (node: ItineraryNode, fallback = DEFAULT_TIMEZONE) =>
  normaliseTimeZone(node.timezone || inferTimeZoneFromLocation({
    place: node.title,
    city: node.city,
    address: node.address,
    lat: node.lat,
    lng: node.lng,
    fallback,
  }));

const nodeDepartureTimeZone = (node: ItineraryNode, fallback = DEFAULT_TIMEZONE) =>
  normaliseTimeZone(node.departure_timezone || inferTimeZoneFromLocation({
    place: node.departure_place || node.title,
    lat: node.departure_lat ?? node.lat,
    lng: node.departure_lng ?? node.lng,
    fallback,
  }));

const nodeArrivalTimeZone = (node: ItineraryNode, fallback = DEFAULT_TIMEZONE) =>
  normaliseTimeZone(node.arrival_timezone || inferTimeZoneFromLocation({
    place: node.arrival_place || node.title,
    lat: node.arrival_lat ?? node.lat,
    lng: node.arrival_lng ?? node.lng,
    fallback,
  }));

const beijingPointTimeText = (node: ItineraryNode, fallback = DEFAULT_TIMEZONE) => {
  const timeZone = nodePointTimeZone(node, fallback);
  if (timeZone === BEIJING_TIMEZONE) return '';
  const value = formatInTimeZone(zonedTimeToUtcMs(node.date, node.time, timeZone), BEIJING_TIMEZONE);
  return `${value.date === node.date ? '' : `${value.date.slice(5)} `}${value.time}`;
};

const endFromStart = (
  day: number,
  date: string,
  time: string,
  durationMinutes: number,
  dateByDay: Map<number, string>,
) => {
  const start = parseTime(time);
  const total = start + Math.max(SLOT_MINUTES, durationMinutes);
  const dayOffset = Math.floor(total / END_MINUTES);
  const endMinutes = total % END_MINUTES;
  const endDay = day + dayOffset;
  return {
    end_day: endDay,
    end_date: dateByDay.get(endDay) || (date ? addDays(date, dayOffset) : ''),
    end_time: formatTime(endMinutes),
  };
};

const snapScheduleMinutes = (minutes: number) => {
  const snapped = Math.round(minutes / SCHEDULE_SNAP_MINUTES) * SCHEDULE_SNAP_MINUTES;
  return Math.max(START_MINUTES, Math.min(END_MINUTES - SCHEDULE_SNAP_MINUTES, snapped));
};

const nodeImageUrl = (node: ItineraryNode) => node.image_urls?.[0] || node.image_url || '';

const nodeLocationText = (node: ItineraryNode) => {
  if (node.type === 'transport') {
    return `${node.departure_place || '出发地'} → ${node.arrival_place || '到达地'}`;
  }
  return node.city || node.address || '地点信息待补充';
};

const nodeTimingText = (node: ItineraryNode) => {
  if (!isScheduledNode(node)) return node.duration ? `待排期 · ${node.duration}` : '待排期';
  if (node.type === 'transport') {
    const arrival = node.arrival_time ? ` - ${node.arrival_time}` : '';
    const service = node.service_number ? ` · ${node.service_number}` : '';
    return `${node.time}${arrival}${service}`;
  }
  return node.duration ? `${node.time} · ${node.duration}` : node.time;
};

const nodeScheduleDetailText = (node: ItineraryNode) => {
  if (node.type === 'transport') {
    return [nodeLocationText(node), node.duration].filter(Boolean).join(' · ');
  }

  return [node.city || node.address, node.duration].filter(Boolean).join(' · ') || node.description || '行程信息待补充';
};

type EventGlassTone = {
  from: string;
  via: string;
  to: string;
  border: string;
  shadow: string;
  rail: string;
};

const eventGlassPalettes: Record<ItineraryType, EventGlassTone[]> = {
  sightseeing: [
    { from: 'rgba(124, 58, 237, 0.94)', via: 'rgba(147, 51, 234, 0.9)', to: 'rgba(217, 70, 239, 0.88)', border: 'rgba(221, 214, 254, 0.76)', shadow: 'rgba(124, 58, 237, 0.24)', rail: '#f5d0fe' },
    { from: 'rgba(37, 99, 235, 0.94)', via: 'rgba(79, 70, 229, 0.9)', to: 'rgba(124, 58, 237, 0.88)', border: 'rgba(191, 219, 254, 0.76)', shadow: 'rgba(37, 99, 235, 0.22)', rail: '#bfdbfe' },
    { from: 'rgba(5, 150, 105, 0.94)', via: 'rgba(13, 148, 136, 0.9)', to: 'rgba(8, 145, 178, 0.88)', border: 'rgba(167, 243, 208, 0.74)', shadow: 'rgba(5, 150, 105, 0.2)', rail: '#a7f3d0' },
    { from: 'rgba(234, 88, 12, 0.94)', via: 'rgba(245, 158, 11, 0.9)', to: 'rgba(202, 138, 4, 0.88)', border: 'rgba(254, 215, 170, 0.76)', shadow: 'rgba(234, 88, 12, 0.2)', rail: '#fed7aa' },
  ],
  hotel: [
    { from: 'rgba(4, 120, 87, 0.94)', via: 'rgba(5, 150, 105, 0.9)', to: 'rgba(20, 184, 166, 0.88)', border: 'rgba(167, 243, 208, 0.76)', shadow: 'rgba(4, 120, 87, 0.2)', rail: '#bbf7d0' },
    { from: 'rgba(15, 118, 110, 0.94)', via: 'rgba(14, 165, 233, 0.88)', to: 'rgba(59, 130, 246, 0.86)', border: 'rgba(186, 230, 253, 0.76)', shadow: 'rgba(14, 165, 233, 0.2)', rail: '#bae6fd' },
  ],
  restaurant: [
    { from: 'rgba(225, 29, 72, 0.94)', via: 'rgba(244, 63, 94, 0.9)', to: 'rgba(251, 113, 133, 0.88)', border: 'rgba(254, 205, 211, 0.76)', shadow: 'rgba(225, 29, 72, 0.2)', rail: '#fecdd3' },
    { from: 'rgba(190, 24, 93, 0.94)', via: 'rgba(219, 39, 119, 0.9)', to: 'rgba(249, 115, 22, 0.86)', border: 'rgba(251, 207, 232, 0.76)', shadow: 'rgba(190, 24, 93, 0.2)', rail: '#fbcfe8' },
  ],
  transport: [
    { from: 'rgba(2, 132, 199, 0.95)', via: 'rgba(6, 182, 212, 0.9)', to: 'rgba(14, 165, 233, 0.88)', border: 'rgba(186, 230, 253, 0.78)', shadow: 'rgba(2, 132, 199, 0.22)', rail: '#bae6fd' },
    { from: 'rgba(30, 64, 175, 0.95)', via: 'rgba(37, 99, 235, 0.9)', to: 'rgba(14, 165, 233, 0.88)', border: 'rgba(191, 219, 254, 0.78)', shadow: 'rgba(30, 64, 175, 0.22)', rail: '#bfdbfe' },
    { from: 'rgba(8, 145, 178, 0.95)', via: 'rgba(20, 184, 166, 0.9)', to: 'rgba(34, 197, 94, 0.86)', border: 'rgba(153, 246, 228, 0.76)', shadow: 'rgba(8, 145, 178, 0.2)', rail: '#99f6e4' },
  ],
  transfer: [
    { from: 'rgba(8, 145, 178, 0.94)', via: 'rgba(14, 116, 144, 0.9)', to: 'rgba(15, 118, 110, 0.88)', border: 'rgba(165, 243, 252, 0.76)', shadow: 'rgba(8, 145, 178, 0.2)', rail: '#a5f3fc' },
  ],
  leisure: [
    { from: 'rgba(202, 138, 4, 0.94)', via: 'rgba(234, 179, 8, 0.9)', to: 'rgba(245, 158, 11, 0.88)', border: 'rgba(254, 240, 138, 0.76)', shadow: 'rgba(202, 138, 4, 0.18)', rail: '#fef08a' },
    { from: 'rgba(101, 163, 13, 0.94)', via: 'rgba(132, 204, 22, 0.9)', to: 'rgba(20, 184, 166, 0.86)', border: 'rgba(217, 249, 157, 0.76)', shadow: 'rgba(101, 163, 13, 0.18)', rail: '#d9f99d' },
  ],
  shopping: [
    { from: 'rgba(190, 24, 93, 0.94)', via: 'rgba(236, 72, 153, 0.9)', to: 'rgba(168, 85, 247, 0.88)', border: 'rgba(251, 207, 232, 0.76)', shadow: 'rgba(190, 24, 93, 0.2)', rail: '#fbcfe8' },
    { from: 'rgba(124, 58, 237, 0.94)', via: 'rgba(168, 85, 247, 0.9)', to: 'rgba(244, 114, 182, 0.88)', border: 'rgba(233, 213, 255, 0.76)', shadow: 'rgba(124, 58, 237, 0.2)', rail: '#e9d5ff' },
  ],
};

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const eventGlassTone = (node: ItineraryNode) => {
  const palette = eventGlassPalettes[node.type] || eventGlassPalettes.sightseeing;
  return palette[hashString(`${node.id}-${node.title}`) % palette.length];
};

const eventGlassStyle = (node: ItineraryNode): React.CSSProperties => {
  const tone = eventGlassTone(node);
  return {
    background: `linear-gradient(135deg, ${tone.from} 0%, ${tone.via} 52%, ${tone.to} 100%)`,
    borderColor: tone.border,
    boxShadow: `0 16px 34px ${tone.shadow}, inset 0 1px 0 rgba(255,255,255,0.42)`,
    ['--event-rail' as string]: tone.rail,
  };
};

const transportTicketStyle = (node: ItineraryNode): React.CSSProperties => {
  const tone = eventGlassTone(node);
  return {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(240,249,255,0.94) 50%, rgba(224,242,254,0.9) 100%)',
    borderColor: tone.border,
    boxShadow: `0 14px 30px ${tone.shadow}, inset 0 1px 0 rgba(255,255,255,0.88)`,
    ['--transport-rail' as string]: tone.rail,
  };
};

const slots = Array.from(
  { length: (END_MINUTES - START_MINUTES) / SLOT_MINUTES },
  (_, index) => START_MINUTES + index * SLOT_MINUTES,
);

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

type LibraryFilter = 'all' | ItineraryType;

const libraryFilterOrder: ItineraryType[] = ['sightseeing', 'hotel', 'restaurant', 'transfer', 'leisure', 'shopping'];

const dayForDate = (date: string | undefined, dateByDay: Map<number, string>, tripStartDate?: string) => {
  if (!date) return null;
  for (const [day, dayDate] of dateByDay.entries()) {
    if (dayDate === date) return day;
  }
  return dayFromStartDate(date, tripStartDate);
};

const nodeDaySpan = (node: ItineraryNode, dateByDay: Map<number, string>, tripStartDate?: string) => {
  const departureDay = node.day || dayForDate(node.date, dateByDay, tripStartDate) || 1;
  if (node.end_day && node.end_day >= departureDay) {
    return { departureDay, arrivalDay: node.end_day };
  }

  const explicitArrivalDay = dayForDate(node.arrival_date, dateByDay, tripStartDate);
  const arrivalOffset = Math.max(0, dateDeltaDays(node.date, node.arrival_date) || 0);
  const inferredOvernight = Boolean(
    node.arrival_time &&
    parseTime(node.arrival_time) <= parseTime(node.time) &&
    (!node.arrival_date || node.arrival_date === node.date),
  );
  const arrivalDay = Math.max(
    departureDay,
    node.type === 'transport'
      ? explicitArrivalDay || departureDay + arrivalOffset + (inferredOvernight ? 1 : 0)
      : departureDay + Math.floor((parseTime(node.time) + eventDurationMinutes(node)) / END_MINUTES),
  );
  return { departureDay, arrivalDay };
};

const scheduleSegmentForDay = (
  node: ItineraryNode,
  day: number,
  dateByDay: Map<number, string>,
  tripStartDate?: string,
): Omit<ScheduleEvent, 'lane' | 'lanes'> | null => {
  const { departureDay, arrivalDay } = nodeDaySpan(node, dateByDay, tripStartDate);
  if (day < departureDay || day > arrivalDay) return null;

  if (departureDay === arrivalDay) {
    const start = Math.max(START_MINUTES, Math.min(END_MINUTES - SLOT_MINUTES, parseTime(node.time)));
    const explicitEnd = node.end_time ? parseTime(node.end_time) : null;
    const end = Math.min(END_MINUTES, Math.max(start + SLOT_MINUTES, explicitEnd ?? start + eventDurationMinutes(node)));
    return {
      node,
      start,
      end,
      segmentKind: 'single',
      displayStart: node.time || formatTime(start),
      displayEnd: node.end_time || (node.type === 'transport' ? node.arrival_time || formatTime(end) : formatTime(end)),
      departureDay,
      arrivalDay,
    };
  }

  if (day === departureDay) {
    const start = Math.max(START_MINUTES, Math.min(END_MINUTES - SLOT_MINUTES, parseTime(node.time)));
    return {
      node,
      start,
      end: END_MINUTES,
      segmentKind: 'start',
      displayStart: node.time || formatTime(start),
      displayEnd: '23:59',
      departureDay,
      arrivalDay,
    };
  }

  if (day === arrivalDay) {
    const arrival = Math.max(START_MINUTES, Math.min(END_MINUTES, parseTime(node.end_time || node.arrival_time)));
    return {
      node,
      start: START_MINUTES,
      end: Math.max(SLOT_MINUTES, arrival),
      segmentKind: 'end',
      displayStart: '00:00',
      displayEnd: node.end_time || node.arrival_time || formatTime(Math.max(SLOT_MINUTES, arrival)),
      departureDay,
      arrivalDay,
    };
  }

  return {
    node,
    start: START_MINUTES,
    end: END_MINUTES,
    segmentKind: 'middle',
    displayStart: '00:00',
    displayEnd: '23:59',
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
  const laneEnds: number[] = [];
  const events = nodes
    .map((node) => scheduleSegmentForDay(node, day, dateByDay, tripStartDate))
    .filter((event): event is Omit<ScheduleEvent, 'lane' | 'lanes'> => Boolean(event))
    .map((event) => ({ ...event, lane: 0, lanes: 1 }))
    .sort((a, b) => a.start - b.start || a.end - b.end || a.node.title.localeCompare(b.node.title, 'zh-CN'));

  events.forEach((event) => {
    const lane = laneEnds.findIndex((end) => end <= event.start);
    event.lane = lane === -1 ? laneEnds.length : lane;
    laneEnds[event.lane] = event.end;
  });

  const lanes = Math.max(1, laneEnds.length);
  return events.map((event) => ({ ...event, lanes }));
};

export default function AdminView() {
  const {
    selectedTripSlug,
    trip,
    nodes,
    addNode,
    updateNode,
    deleteNode,
    autoConnectEdges,
    saving,
    activeDay,
    activeNodeId,
    setActiveDay,
    setActiveNodeId,
  } = useItineraryStore();

  const dayNumbers = useMemo(() => {
    const tripDays = dayCountBetween(trip?.start_date, trip?.end_date);
    const fromTrip = Array.from({ length: tripDays }, (_, index) => index + 1);
    const fromNodes = nodes.filter(isScheduledNode).map((node) => node.day);
    const fromEndNodes = nodes
      .filter(isScheduledNode)
      .map((node) =>
        node.end_day ||
        dayFromStartDate(node.end_date || node.arrival_date, trip?.start_date) ||
        node.day + Math.floor((parseTime(node.time) + eventDurationMinutes(node)) / END_MINUTES),
      )
      .filter((day): day is number => Boolean(day && day > 0));
    return Array.from(new Set([...fromTrip, ...fromNodes, ...fromEndNodes, 1])).sort((a, b) => a - b);
  }, [nodes, trip?.end_date, trip?.start_date]);

  const dateByDay = useMemo(() => {
    const map = new Map<number, string>();
    if (trip?.start_date) {
      dayNumbers.forEach((day) => map.set(day, addDays(trip.start_date, day - 1)));
    }
    nodes.filter(isScheduledNode).forEach((node) => {
      if (!map.has(node.day) && node.date) map.set(node.day, node.date);
    });
    return map;
  }, [dayNumbers, nodes, trip?.start_date]);

  const currentDay = activeDay === 'all' ? dayNumbers[0] || 1 : activeDay;
  const currentDate = dateByDay.get(currentDay) || trip?.start_date || '2026-09-26';

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm({ day: currentDay, date: currentDate }));
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [pendingUploadUrls, setPendingUploadUrls] = useState<string[]>([]);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [resizeDraft, setResizeDraft] = useState<{ nodeId: string; duration: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ nodeId: string; minutes: number; connected: boolean } | null>(null);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [showBeijingTime, setShowBeijingTime] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scheduleGridRef = useRef<HTMLDivElement>(null);
  const resizeStateRef = useRef<{ node: ItineraryNode; startY: number; startDuration: number; latestDuration: number; maxDuration: number } | null>(null);
  const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white/85 px-3 py-2.5 text-xs outline-none transition focus:border-indigo-400';

  useEffect(() => {
    if (activeDay === 'all' && dayNumbers.length) setActiveDay(dayNumbers[0]);
  }, [activeDay, dayNumbers, setActiveDay]);

  const sortedNodes = useMemo(
    () => [...nodes].sort(compareItineraryNodes),
    [nodes],
  );
  const dayTimeZones = useMemo(() => {
    const map = new Map<number, string>();
    let activeTimeZone = DEFAULT_TIMEZONE;
    dayNumbers.forEach((day) => {
      const sameDayNodes = sortedNodes.filter((node) => isScheduledNode(node) && scheduleSegmentForDay(node, day, dateByDay, trip?.start_date));
      const arrivingTransports = sameDayNodes.filter((node) => {
        if (node.type !== 'transport') return false;
        return (node.end_day || dayForDate(node.end_date || node.arrival_date, dateByDay, trip?.start_date) || node.day) === day;
      });
      const finalArrival = arrivingTransports.at(-1);
      const firstPoint = sameDayNodes.find((node) => node.type !== 'transport');
      const firstTransport = sameDayNodes.find((node) => node.type === 'transport');

      if (finalArrival) activeTimeZone = nodeArrivalTimeZone(finalArrival, activeTimeZone);
      else if (firstPoint) activeTimeZone = nodePointTimeZone(firstPoint, activeTimeZone);
      else if (firstTransport) activeTimeZone = nodeDepartureTimeZone(firstTransport, activeTimeZone);

      map.set(day, activeTimeZone);
    });
    return map;
  }, [dateByDay, dayNumbers, sortedNodes, trip?.start_date]);
  const currentDayTimezone = dayTimeZones.get(currentDay) || DEFAULT_TIMEZONE;
  const editingNode = useMemo(() => editingId ? nodes.find((node) => node.id === editingId) || null : null, [editingId, nodes]);
  const editingExistingTransport = editingNode?.type === 'transport';
  const currentDayNodes = useMemo(
    () => sortedNodes.filter((node) => isScheduledNode(node) && scheduleSegmentForDay(node, currentDay, dateByDay, trip?.start_date)),
    [currentDay, dateByDay, sortedNodes, trip?.start_date],
  );
  const scheduledDisplayNodes = useMemo(
    () => resizeDraft
      ? currentDayNodes.map((node) => {
        if (node.id !== resizeDraft.nodeId) return node;
        return {
          ...node,
          ...endFromStart(node.day, node.date, node.time, resizeDraft.duration, dateByDay),
          duration: formatDurationText(resizeDraft.duration),
        };
      })
      : currentDayNodes,
    [currentDayNodes, dateByDay, resizeDraft],
  );
  const scheduleEvents = useMemo(
    () => layoutScheduleEvents(scheduledDisplayNodes, currentDay, dateByDay, trip?.start_date),
    [currentDay, dateByDay, scheduledDisplayNodes, trip?.start_date],
  );
  const currentDayTimeZoneTransitions = useMemo(
    () => scheduleEvents
      .filter((event) => event.node.type === 'transport')
      .map((event) => {
        const departureTimezone = nodeDepartureTimeZone(event.node, currentDayTimezone);
        const arrivalTimezone = nodeArrivalTimeZone(event.node, departureTimezone);
        const arrivalDay = event.node.end_day || dayForDate(event.node.end_date || event.node.arrival_date, dateByDay, trip?.start_date) || event.node.day;
        if (departureTimezone === arrivalTimezone || arrivalDay !== currentDay) return null;
        const minutes = Math.max(START_MINUTES, Math.min(END_MINUTES, parseTime(event.node.end_time || event.node.arrival_time || event.displayEnd)));
        return {
          id: event.node.id,
          minutes,
          departureTimezone,
          arrivalTimezone,
        };
      })
      .filter((item): item is { id: string; minutes: number; departureTimezone: string; arrivalTimezone: string } => Boolean(item)),
    [currentDay, currentDayTimezone, dateByDay, scheduleEvents, trip?.start_date],
  );
  const currentDayTimeZoneText = currentDayTimeZoneTransitions.length
    ? `多时区 · ${currentDayTimeZoneTransitions.map((item) => `${timeZoneOptionLabel(item.departureTimezone)}→${timeZoneOptionLabel(item.arrivalTimezone)}`).join(' · ')}`
    : `${timeZoneOptionLabel(currentDayTimezone)} ${formatTimeZoneOffset(currentDayTimezone, zonedTimeToUtcMs(currentDate, '12:00', currentDayTimezone))}`;
  const libraryNodes = useMemo(() => sortedNodes.filter(isUnscheduledPointNode), [sortedNodes]);
  const libraryTypeCounts = useMemo(
    () => libraryNodes.reduce<Partial<Record<ItineraryType, number>>>((counts, node) => {
      counts[node.type] = (counts[node.type] || 0) + 1;
      return counts;
    }, {}),
    [libraryNodes],
  );
  const libraryFilterOptions = useMemo(
    () => [
      { value: 'all' as const, label: '全部', count: libraryNodes.length },
      ...libraryFilterOrder
        .filter((type) => libraryTypeCounts[type])
        .map((type) => ({ value: type, label: typeLabels[type], count: libraryTypeCounts[type] || 0 })),
    ],
    [libraryNodes.length, libraryTypeCounts],
  );
  const filteredLibraryNodes = useMemo(() => {
    const keyword = libraryQuery.trim().toLocaleLowerCase();
    return libraryNodes.filter((node) => {
      if (libraryFilter !== 'all' && node.type !== libraryFilter) return false;
      if (!keyword) return true;

      return [
        typeLabels[node.type],
        node.title,
        node.description,
        node.city,
        node.address,
        node.departure_place,
        node.arrival_place,
        node.service_number,
      ].some((value) => (value || '').toLocaleLowerCase().includes(keyword));
    });
  }, [libraryFilter, libraryNodes, libraryQuery]);
  const draggedNode = useMemo(
    () => draggedNodeId ? nodes.find((node) => node.id === draggedNodeId) || null : null,
    [draggedNodeId, nodes],
  );
  const canDropToLibrary = Boolean(draggedNode && draggedNode.type !== 'transport' && isScheduledNode(draggedNode));

  const toast = (value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(null), 3000);
  };

  const cleanupUploadedImage = async (url: string) => {
    if (!selectedTripSlug || !url.startsWith('/uploads/')) return;
    await fetch(`/api/trips/${selectedTripSlug}/images`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }).catch(() => undefined);
  };

  const cleanupPendingUploads = (urls = pendingUploadUrls) => {
    urls.forEach((url) => void cleanupUploadedImage(url));
  };

  const normalizeFormForSubmit = (draft: Omit<ItineraryNode, 'id'>): Omit<ItineraryNode, 'id'> => {
    if (draft.type === 'transport') {
      const day = draft.day || currentDay;
      const date = draft.date || currentDate;
      const time = draft.time || '12:00';
      const endDate = draft.arrival_date || draft.end_date || date;
      const endDay = dayForDate(endDate, dateByDay, trip?.start_date) || draft.end_day || day;
      const endTime = draft.arrival_time || draft.end_time || time;
      const departureTimezone = normaliseTimeZone(draft.departure_timezone || inferTimeZoneFromLocation({
        place: draft.departure_place || draft.title,
        lat: draft.departure_lat ?? draft.lat,
        lng: draft.departure_lng ?? draft.lng,
        fallback: currentDayTimezone,
      }));
      const arrivalTimezone = normaliseTimeZone(draft.arrival_timezone || inferTimeZoneFromLocation({
        place: draft.arrival_place || draft.title,
        lat: draft.arrival_lat ?? draft.lat,
        lng: draft.arrival_lng ?? draft.lng,
        fallback: departureTimezone,
      }));
      const duration = draft.duration || transportDurationText({
        date,
        time,
        end_date: endDate,
        end_time: endTime,
        arrival_date: endDate,
        arrival_time: endTime,
        departure_timezone: departureTimezone,
        arrival_timezone: arrivalTimezone,
      });
      return {
        ...draft,
        status: draft.status === 'unscheduled' ? 'planned' : draft.status,
        day,
        date,
        time,
        timezone: arrivalTimezone,
        departure_timezone: departureTimezone,
        arrival_timezone: arrivalTimezone,
        end_day: endDay,
        end_date: endDate,
        end_time: endTime,
        arrival_date: endDate,
        arrival_time: endTime,
        duration,
        lat: draft.arrival_lat ?? draft.lat,
        lng: draft.arrival_lng ?? draft.lng,
      };
    }

    const scheduled = draft.status !== 'unscheduled' && draft.day > 0 && Boolean(draft.date) && Boolean(draft.time);
    const fallbackDay = draft.day > 0 ? draft.day : currentDay;
    const fallbackDate = draft.date || currentDate;
    const fallbackTime = draft.time || '12:00';
    const endPatch = scheduled
      ? endFromStart(draft.day, draft.date, draft.time, eventDurationMinutes({ id: 'draft', ...draft }), dateByDay)
      : { end_day: 0, end_date: '', end_time: '' };
    return {
      ...draft,
      timezone: normaliseTimeZone(draft.timezone || inferTimeZoneFromLocation({
        place: draft.title,
        city: draft.city,
        address: draft.address,
        lat: draft.lat,
        lng: draft.lng,
        fallback: currentDayTimezone,
      })),
      day: scheduled ? draft.day : fallbackDay,
      date: scheduled ? draft.date : fallbackDate,
      time: scheduled ? draft.time : fallbackTime,
      ...endPatch,
      status: scheduled ? draft.status : 'unscheduled',
      transport_mode: undefined,
      departure_place: '',
      arrival_place: '',
      departure_timezone: '',
      arrival_timezone: '',
      arrival_time: '',
      arrival_date: '',
      service_number: '',
      departure_lat: null,
      departure_lng: null,
      arrival_lat: null,
      arrival_lng: null,
    };
  };

  const reset = ({ cleanupPending = true, kind = 'point', time = '12:00', scheduled = false }: { cleanupPending?: boolean; kind?: 'point' | 'transport'; time?: string; scheduled?: boolean } = {}) => {
    if (cleanupPending) cleanupPendingUploads();
    setEditingId(null);
    setForm({
      ...emptyForm({ day: currentDay, date: currentDate, time, kind, scheduled }),
      timezone: currentDayTimezone,
      departure_timezone: currentDayTimezone,
      arrival_timezone: currentDayTimezone,
    });
    setImageUrlInput('');
    setPendingUploadUrls([]);
  };

  const edit = (node: ItineraryNode) => {
    cleanupPendingUploads();
    const { id, ...values } = node;
    const scheduled = isScheduledNode(node);
    const kind = node.type === 'transport' ? 'transport' : 'point';
    setEditingId(id);
    setForm({
      ...emptyForm({
        day: scheduled ? node.day : currentDay,
        date: scheduled ? node.date : currentDate,
        time: scheduled ? node.time : '12:00',
        kind,
        scheduled,
      }),
      ...values,
      image_urls: node.image_urls?.length ? node.image_urls : node.image_url ? [node.image_url] : [],
    });
    setPendingUploadUrls([]);
    if (scheduled) setActiveDay(node.day);
    setActiveNodeId(node.id);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const normalized = normalizeFormForSubmit(form);
      if (editingExistingTransport) {
        toast('交通项目需删除后重新录入');
        return;
      }
      if (editingId) await updateNode(editingId, normalized);
      else await addNode({ id: `node-${Date.now()}`, ...normalized });
      toast(editingId ? `已保存：${normalized.title}` : `已新增：${normalized.title}`);
      reset({
        cleanupPending: false,
        kind: normalized.type === 'transport' ? 'transport' : 'point',
        time: normalized.time || '12:00',
        scheduled: normalized.type === 'transport',
      });
    } catch {
      toast('保存失败，请检查输入内容');
    }
  };

  const uploadImage = async (file: File) => {
    if (!selectedTripSlug || !file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const data = new FormData();
      data.append('image', file);
      const response = await fetch(`/api/trips/${selectedTripSlug}/images`, { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '图片上传失败');
      addImageUrl(result.url);
      setPendingUploadUrls((current) => current.includes(result.url) ? current : [...current, result.url]);
      toast('图片已上传');
    } catch (error) {
      toast(error instanceof Error ? error.message : '图片上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addImageUrl = (value = imageUrlInput) => {
    const url = value.trim();
    if (!url) return;
    setForm((current) => {
      const images = current.image_urls || [];
      const next = images.includes(url) ? images : [...images, url];
      return { ...current, image_url: next[0] || '', image_urls: next };
    });
    setImageUrlInput('');
  };

  const removeImage = (url: string) => {
    setForm((current) => {
      const next = (current.image_urls || []).filter((image) => image !== url);
      return { ...current, image_urls: next, image_url: next[0] || '' };
    });
    if (pendingUploadUrls.includes(url)) {
      setPendingUploadUrls((current) => current.filter((image) => image !== url));
      void cleanupUploadedImage(url);
    }
  };

  const pasteImage = async (event: React.ClipboardEvent<HTMLElement>) => {
    for (let index = 0; index < event.clipboardData.items.length; index += 1) {
      const item = event.clipboardData.items[index];
      const file = item.kind === 'file' && item.type.startsWith('image/') ? item.getAsFile() : null;
      if (file) {
        event.preventDefault();
        await uploadImage(file);
        break;
      }
    }
  };

  const setFormDay = (day: number) => {
    const nextDate = dateByDay.get(day) || currentDate;
    setForm((current) => ({
      ...current,
      day,
      date: nextDate,
      timezone: current.type === 'transport' ? current.timezone : current.timezone || currentDayTimezone,
      ...(current.type !== 'transport' && isScheduledNode({ id: editingId || 'draft', ...current, day, date: nextDate })
        ? endFromStart(day, nextDate, current.time, eventDurationMinutes({ id: editingId || 'draft', ...current, day, date: nextDate }), dateByDay)
        : {}),
      arrival_date: current.type === 'transport' && (!current.arrival_date || current.arrival_date === current.date) ? nextDate : current.arrival_date,
    }));
  };

  const beginDrag = (event: React.DragEvent<HTMLElement>, node: ItineraryNode) => {
    if (node.type === 'transport') {
      event.preventDefault();
      toast('交通项目不可拖动修改，请删除后重新录入');
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-itinerary-node', node.id);
    event.dataTransfer.setData('text/plain', node.id);
    setDragPreview(null);
    setDraggedNodeId(node.id);
  };

  const scheduleNode = async (nodeId: string, day: number, time: string) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return;
    if (node.type === 'transport') {
      toast('交通项目不可拖动修改，请删除后重新录入');
      return;
    }

    const date = dateByDay.get(day) || node.date || currentDate;
    const patch: Partial<ItineraryNode> = {
      day,
      date,
      time,
      timezone: normaliseTimeZone(node.timezone || inferTimeZoneFromLocation({
        place: node.title,
        city: node.city,
        address: node.address,
        lat: node.lat,
        lng: node.lng,
        fallback: dayTimeZones.get(day) || currentDayTimezone,
      })),
      ...endFromStart(day, date, time, eventDurationMinutes(node), dateByDay),
      status: node.status === 'unscheduled' ? 'planned' : node.status,
    };
    if (node.type === 'transport' && (!node.arrival_date || node.arrival_date === node.date)) {
      patch.arrival_date = date;
    }

    try {
      await updateNode(nodeId, patch);
      setActiveDay(day);
      setActiveNodeId(nodeId);
      if (editingId === nodeId) setForm((current) => ({ ...current, ...patch }));
      toast(`已安排：${node.title} · D${day} ${time}`);
    } catch {
      toast('拖拽排期失败，请重试');
    }
  };

  const minutesFromSchedulePointer = (clientY: number, fallbackMinutes: number) => {
    const rect = scheduleGridRef.current?.getBoundingClientRect();
    if (!rect) return fallbackMinutes;
    const offsetY = Math.max(0, Math.min(rect.height, clientY - rect.top));
    return START_MINUTES + (offsetY / SLOT_HEIGHT) * SLOT_MINUTES;
  };

  const nearestScheduleBoundary = (minutes: number, movingNodeId: string, boundary: 'start' | 'end') => {
    let nearest: { minutes: number; distance: number } | null = null;
    scheduleEvents.forEach((scheduleEvent) => {
      if (scheduleEvent.node.id === movingNodeId) return;
      const candidate = scheduleEvent[boundary];
      if (candidate <= START_MINUTES || candidate >= END_MINUTES) return;
      const distance = Math.abs(candidate - minutes);
      if (distance > CONNECTION_SNAP_THRESHOLD_MINUTES) return;
      if (!nearest || distance < nearest.distance) nearest = { minutes: candidate, distance };
    });
    return nearest?.minutes ?? null;
  };

  const snapScheduleStart = (minutes: number, movingNodeId: string) =>
    nearestScheduleBoundary(minutes, movingNodeId, 'end') ?? snapScheduleMinutes(minutes);

  const snapScheduleDuration = (start: number, rawDuration: number, maxDuration: number, movingNodeId: string) => {
    const connectedEnd = nearestScheduleBoundary(start + rawDuration, movingNodeId, 'start');
    if (connectedEnd != null && connectedEnd > start) {
      return Math.max(SLOT_MINUTES, Math.min(maxDuration, connectedEnd - start));
    }
    return clampDurationMinutes(rawDuration, maxDuration);
  };

  const getDraggedNodeId = (event: React.DragEvent<HTMLElement>) =>
    event.dataTransfer.getData('application/x-itinerary-node') || event.dataTransfer.getData('text/plain') || draggedNodeId || '';

  const previewScheduleStart = (rawMinutes: number, movingNodeId: string) => {
    const connectedStart = nearestScheduleBoundary(rawMinutes, movingNodeId, 'end');
    return {
      minutes: connectedStart ?? snapScheduleMinutes(rawMinutes),
      connected: connectedStart != null,
    };
  };

  const handleScheduleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    const nodeId = getDraggedNodeId(event);
    if (!nodeId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const preview = previewScheduleStart(minutesFromSchedulePointer(event.clientY, START_MINUTES), nodeId);
    setDragPreview((current) =>
      current?.nodeId === nodeId && current.minutes === preview.minutes && current.connected === preview.connected
        ? current
        : { nodeId, ...preview },
    );
  };

  const beginResizeDuration = (event: React.PointerEvent<HTMLElement>, node: ItineraryNode) => {
    event.preventDefault();
    event.stopPropagation();
    if (node.type === 'transport') return;

    const startDuration = eventDurationMinutes(node);
    const maxDuration = Math.max(SLOT_MINUTES, END_MINUTES - parseTime(node.time));
    const initialDuration = clampDurationMinutes(startDuration, maxDuration);
    resizeStateRef.current = {
      node,
      startY: event.clientY,
      startDuration: initialDuration,
      latestDuration: initialDuration,
      maxDuration,
    };
    setResizeDraft({ nodeId: node.id, duration: initialDuration });

    const handleMove = (moveEvent: PointerEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;
      const deltaMinutes = ((moveEvent.clientY - state.startY) / SLOT_HEIGHT) * SLOT_MINUTES;
      const nextDuration = snapScheduleDuration(parseTime(state.node.time), state.startDuration + deltaMinutes, state.maxDuration, state.node.id);
      state.latestDuration = nextDuration;
      setResizeDraft({ nodeId: state.node.id, duration: nextDuration });
    };

    const handleEnd = async () => {
      const state = resizeStateRef.current;
      resizeStateRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
      setResizeDraft(null);
      if (!state) return;

      const duration = formatDurationText(state.latestDuration);
      const endPatch = endFromStart(state.node.day, state.node.date, state.node.time, state.latestDuration, dateByDay);
      try {
        await updateNode(state.node.id, { duration, ...endPatch });
        if (editingId === state.node.id) setForm((current) => ({ ...current, duration, ...endPatch }));
        toast(`已调整时长：${state.node.title} · ${duration}`);
      } catch {
        toast('调整时长失败，请重试');
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd, { once: true });
    window.addEventListener('pointercancel', handleEnd, { once: true });
  };

  const handleScheduleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const nodeId = getDraggedNodeId(event);
    if (!nodeId) {
      setDragPreview(null);
      return;
    }
    void scheduleNode(nodeId, currentDay, formatTime(snapScheduleStart(minutesFromSchedulePointer(event.clientY, START_MINUTES), nodeId)));
    setDraggedNodeId(null);
    setDragPreview(null);
  };

  const unscheduleNode = async (nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node || node.type === 'transport') return;
    if (!isScheduledNode(node)) return;

    const patch: Partial<ItineraryNode> = {
      day: node.day || currentDay,
      date: node.date || currentDate,
      time: node.time || '12:00',
      status: 'unscheduled',
    };

    try {
      await updateNode(nodeId, patch);
      setActiveNodeId(nodeId);
      if (editingId === nodeId) setForm((current) => ({ ...current, ...patch }));
      toast(`已取消排期：${node.title}`);
    } catch {
      toast('取消排期失败，请重试');
    }
  };

  const handleLibraryDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    const nodeId = event.dataTransfer.getData('application/x-itinerary-node') || event.dataTransfer.getData('text/plain') || draggedNodeId;
    setDraggedNodeId(null);
    setDragPreview(null);
    if (!nodeId) return;
    void unscheduleNode(nodeId);
  };

  const switchEditorMode = (next: 'point' | 'transport') => {
    if (editingExistingTransport) {
      toast('交通项目需删除后重新录入');
      return;
    }

    if (next === 'transport') {
      setForm((current) => ({
        ...current,
        type: 'transport',
        transport_mode: current.transport_mode || 'flight',
        day: current.day || currentDay,
        date: current.date || currentDate,
        time: current.time || '12:00',
        timezone: current.timezone || currentDayTimezone,
        departure_timezone: current.departure_timezone || current.timezone || currentDayTimezone,
        arrival_timezone: current.arrival_timezone || current.timezone || currentDayTimezone,
        status: current.status === 'unscheduled' ? 'planned' : current.status,
        arrival_date: current.arrival_date || current.date || currentDate,
        arrival_time: current.arrival_time || '14:00',
        end_day: current.end_day || current.day || currentDay,
        end_date: current.end_date || current.arrival_date || current.date || currentDate,
        end_time: current.end_time || current.arrival_time || '14:00',
      }));
      return;
    }

    setForm((current) => ({
      ...current,
      type: current.type === 'transport' ? 'sightseeing' : current.type,
      day: current.type === 'transport' ? 0 : current.day,
      date: current.type === 'transport' ? '' : current.date,
      time: current.type === 'transport' ? '' : current.time,
      end_day: current.type === 'transport' ? 0 : current.end_day,
      end_date: current.type === 'transport' ? '' : current.end_date,
      end_time: current.type === 'transport' ? '' : current.end_time,
      timezone: current.type === 'transport' ? currentDayTimezone : current.timezone,
      departure_timezone: current.type === 'transport' ? '' : current.departure_timezone,
      arrival_timezone: current.type === 'transport' ? '' : current.arrival_timezone,
      status: current.type === 'transport' ? 'unscheduled' : current.status,
      arrival_date: '',
      arrival_time: '',
    }));
  };

  const startNew = (kind: 'point' | 'transport', time = '12:00') => {
    reset({ kind, time, scheduled: kind === 'transport' });
  };

  const cancelPointSchedule = async () => {
    if (!editingId || form.type === 'transport') return;
    await unscheduleNode(editingId);
  };

  const deleteEditingTransport = async () => {
    if (!editingId || !editingExistingTransport) return;
    if (!window.confirm(`删除交通“${form.title}”？`)) return;
    try {
      await deleteNode(editingId);
      toast(`已删除交通：${form.title}`);
      reset({ cleanupPending: false, kind: 'transport', scheduled: true });
    } catch {
      toast('删除交通失败，请重试');
    }
  };

  return (
    <div className="h-full min-h-0">
      {message && <div className="fixed left-1/2 top-20 z-[10000] -translate-x-1/2 rounded-xl bg-slate-900 px-5 py-3 text-xs font-semibold text-white shadow-2xl">{message}</div>}

      <div className="grid h-full min-h-0 w-full grid-cols-1 gap-4 overflow-y-auto xl:overflow-visible xl:grid-cols-[360px_minmax(420px,1fr)_390px] 2xl:grid-cols-[440px_minmax(520px,1fr)_430px]">
        <aside
          onDragOver={(event) => {
            if (!canDropToLibrary) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={handleLibraryDrop}
          className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/50 p-3 shadow-lg backdrop-blur-xl transition xl:h-full ${canDropToLibrary ? 'ring-2 ring-indigo-300/60' : ''}`}
        >
          <div className="mb-3 shrink-0 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-slate-900">项目库</h3>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                  {filteredLibraryNodes.length} / {libraryNodes.length} 个待排期
                </p>
              </div>
              {libraryFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => {
                    setLibraryFilter('all');
                    setLibraryQuery('');
                  }}
                  className="rounded-lg px-2 py-1 text-[10px] font-bold text-slate-500 transition hover:bg-white hover:text-slate-900"
                >
                  清除
                </button>
              )}
            </div>

            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                placeholder="搜索名称、地点、车次"
                className="h-9 w-full rounded-xl border border-slate-200 bg-white/80 pl-8 pr-8 text-xs font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white"
              />
              {libraryQuery && (
                <button
                  type="button"
                  onClick={() => setLibraryQuery('')}
                  className="absolute right-2 top-1/2 rounded-full p-1 text-slate-400 transition -translate-y-1/2 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="清空搜索"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </label>

            <div className="flex gap-1 overflow-x-auto pb-1">
              {libraryFilterOptions.map((option) => {
                const selected = libraryFilter === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLibraryFilter(option.value)}
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black transition ${
                      selected
                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                        : 'border-slate-200 bg-white/70 text-slate-500 hover:border-indigo-200 hover:text-indigo-700'
                    }`}
                  >
                    {option.label} <span className={selected ? 'text-white/70' : 'text-slate-400'}>{option.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {filteredLibraryNodes.map((node) => {
              const tone = typeTone[node.type];
              const coverUrl = nodeImageUrl(node);
              const Icon = pointTypeOptions.find((option) => option.value === node.type)?.icon || MapPin;
              return (
                <article
                  key={node.id}
                  draggable={!saving}
                  onDragStart={(event) => beginDrag(event, node)}
                  onDragEnd={() => {
                    setDraggedNodeId(null);
                    setDragPreview(null);
                  }}
                  onClick={() => edit(node)}
                  className={`cursor-grab rounded-xl border p-2.5 shadow-sm transition active:cursor-grabbing ${tone.card} hover:border-white hover:bg-white ${activeNodeId === node.id ? 'ring-2 ring-indigo-400/40' : ''}`}
                >
                  <div className="flex items-stretch gap-3">
                    <div className="relative h-[74px] w-[92px] shrink-0 overflow-hidden rounded-xl border border-white/70 bg-white/65">
                      {coverUrl ? (
                        <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Icon className="h-6 w-6 text-slate-400" />
                        </div>
                      )}
                      <span className={`absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[8px] font-black shadow-sm ${tone.badge}`}>
                        {typeLabels[node.type]}
                      </span>
                      <span className="absolute bottom-1.5 left-1.5 rounded-full bg-slate-900/75 px-1.5 py-0.5 text-[8px] font-black text-white shadow-sm">
                        待排期
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[10px] font-black text-slate-500">{nodeTimingText(node)}</span>
                        <GripVertical className="h-4 w-4 shrink-0 text-slate-400" />
                      </div>
                      <h4 className="mt-1 truncate text-xs font-black text-slate-900">{node.title}</h4>
                      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">
                        {nodeLocationText(node)}
                      </p>
                      {node.description && (
                        <p className="mt-1 line-clamp-1 text-[9px] font-medium text-slate-400">{node.description}</p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
            {!filteredLibraryNodes.length && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white/65 px-4 py-8 text-center">
                <Search className="mx-auto h-5 w-5 text-slate-300" />
                <p className="mt-2 text-xs font-bold text-slate-500">没有匹配的项目</p>
                <p className="mt-1 text-[10px] font-medium text-slate-400">调整搜索词或切换类型筛选</p>
              </div>
            )}
          </div>
        </aside>

        <section className="flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/55 p-3 shadow-lg backdrop-blur-xl xl:h-full xl:min-h-0">
          <div className="mb-3 flex shrink-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h3 className="text-sm font-black text-slate-900">按天时间表</h3>
              <p className="mt-0.5 text-[10px] font-semibold text-slate-400">D{currentDay} · {formatShortDate(currentDate)} · {currentDayNodes.length} 个项目 · 旅程当地时间 · {currentDayTimeZoneText}</p>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100/80 p-1">
                {dayNumbers.map((day) => {
                  const selected = day === currentDay;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setActiveDay(day)}
                      className={`min-w-16 rounded-lg px-2.5 py-1.5 text-left transition ${selected ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'}`}
                    >
                      <span className="block text-xs font-black">D{day}</span>
                      <span className="block text-[9px] font-bold">{formatShortDate(dateByDay.get(day))}</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setShowBeijingTime((value) => !value)}
                className={`self-end rounded-full border px-3 py-1 text-[10px] font-black transition ${showBeijingTime ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white/70 text-slate-500 hover:text-slate-800'}`}
              >
                北京时间参考 {showBeijingTime ? '开' : '关'}
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
            <div
              ref={scheduleGridRef}
              onDragOver={handleScheduleDragOver}
              onDrop={handleScheduleDrop}
              onDragLeave={(event) => {
                const nextTarget = event.relatedTarget;
                if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                  setDragPreview(null);
                }
              }}
              className="relative"
              style={{ height: slots.length * SLOT_HEIGHT }}
            >
              {slots.map((minutes) => (
                <div
                  key={minutes}
                  className="grid border-t border-slate-100 first:border-t-0"
                  style={{ gridTemplateColumns: '58px minmax(0, 1fr)', height: SLOT_HEIGHT }}
                >
                  <div className="select-none border-r border-slate-100 pr-2 pt-1 text-right text-[9px] font-bold tabular-nums text-slate-400">
                    {minutes % 60 === 0 ? formatTime(minutes) : ''}
                  </div>
                  <button
                    type="button"
                    onClick={() => startNew('point')}
                    className="h-full w-full text-left transition hover:bg-indigo-50/45"
                    aria-label={`${formatTime(minutes)} 拖入地点项目`}
                  />
                </div>
              ))}

              <div className="pointer-events-none absolute left-[64px] right-3 top-0">
                {scheduleEvents.map((event) => {
                  const top = ((event.start - START_MINUTES) / SLOT_MINUTES) * SLOT_HEIGHT + 2;
                  const height = Math.max(28, ((event.end - event.start) / SLOT_MINUTES) * SLOT_HEIGHT - 4);
                  const width = 100 / event.lanes;
                  const left = event.lane * width;
                  const coverUrl = nodeImageUrl(event.node);
                  const Icon = event.node.type === 'transport'
                    ? transportModeOptions.find((option) => option.value === event.node.transport_mode)?.icon || Route
                    : pointTypeOptions.find((option) => option.value === event.node.type)?.icon || MapPin;
                  const showScheduleDetails = height >= 58;
                  const showScheduleThumb = height >= 74;
                  const canDragEvent = !saving && event.node.type !== 'transport';
                  if (event.node.type === 'transport') {
                    const transportMode = transportModeOptions.find((option) => option.value === event.node.transport_mode);
                    const TransportIcon = transportMode?.icon || Route;
                    const titlePlaces = event.node.title.split(/\s*→\s*|\s*飞往\s*/);
                    const departure = event.node.departure_place || titlePlaces[0] || '出发地';
                    const arrival = event.node.arrival_place || titlePlaces[1] || '到达地';
                    const departureTimezone = nodeDepartureTimeZone(event.node, currentDayTimezone);
                    const arrivalTimezone = nodeArrivalTimeZone(event.node, departureTimezone);
                    const departureOffset = localOffsetText(event.node.date, event.node.time, departureTimezone);
                    const arrivalDate = event.node.end_date || event.node.arrival_date || event.node.date;
                    const arrivalTime = event.node.end_time || event.node.arrival_time || event.displayEnd;
                    const arrivalOffset = localOffsetText(arrivalDate, arrivalTime, arrivalTimezone);
                    const timeRange = `${event.displayStart} ${departureOffset} - ${event.displayEnd} ${arrivalOffset}`;
                    const actualDuration = transportDurationText(event.node);
                    const zoneChangeText = departureTimezone === arrivalTimezone
                      ? `${timeZoneOptionLabel(departureTimezone)}`
                      : `${timeZoneOptionLabel(departureTimezone)} → ${timeZoneOptionLabel(arrivalTimezone)}`;
                    const segmentText = event.segmentKind === 'start'
                      ? `跨至 D${event.arrivalDay}`
                      : event.segmentKind === 'end'
                        ? `D${event.departureDay} 延续`
                        : event.segmentKind === 'middle'
                          ? '跨天途中'
                          : '';
                    const compactTransport = height < 68;
                    const roomyTransport = height >= 100;
                    return (
                      <button
                        key={`${event.node.id}-${currentDay}-${event.segmentKind}`}
                        type="button"
                        draggable={false}
                        onDragStart={(dragEvent) => dragEvent.preventDefault()}
                        onClick={() => edit(event.node)}
                        className={`pointer-events-auto absolute isolate overflow-hidden rounded-xl border px-3 py-2 text-left text-slate-800 backdrop-blur-xl backdrop-saturate-150 transition hover:-translate-y-0.5 hover:shadow-lg ${activeNodeId === event.node.id ? 'ring-2 ring-sky-400/30' : ''}`}
                        style={{
                          top,
                          height,
                          left: `calc(${left}% + 3px)`,
                          width: `calc(${width}% - 6px)`,
                          ...transportTicketStyle(event.node),
                        }}
                      >
                        <span className="pointer-events-none absolute inset-y-0 left-0 w-1.5" style={{ background: 'var(--transport-rail)' }} />
                        <span className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-sky-100/70" />
                        <span className="pointer-events-none absolute bottom-0 right-6 h-10 w-px rotate-12 bg-sky-100" />
                        {compactTransport ? (
                          <div className="relative z-10 flex h-full min-w-0 items-center gap-2 pl-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm">
                              <TransportIcon className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[10px] font-black tabular-nums text-slate-900">{timeRange} · {event.node.service_number || transportMode?.label || '交通'}</div>
                              <div className="truncate text-[8px] font-bold text-slate-500">{departure} → {arrival} · 实际 {actualDuration}</div>
                            </div>
                            <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                          </div>
                        ) : (
                          <div className="relative z-10 flex h-full min-w-0 flex-col justify-between pl-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm">
                                  <TransportIcon className="h-3.5 w-3.5" />
                                </span>
                                <span className="truncate text-[9px] font-black text-sky-700">{event.node.service_number || transportMode?.label || '交通'}</span>
                              </div>
                              <span className="flex shrink-0 items-center gap-1 rounded-full border border-sky-100 bg-white/75 px-1.5 py-0.5 text-[8px] font-black text-sky-700">
                                <LockKeyhole className="h-2.5 w-2.5" />{segmentText || '锁定'}
                              </span>
                            </div>

                            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                              <div className="min-w-0">
                                <div className="text-sm font-black tabular-nums text-slate-950">{event.displayStart}</div>
                                <div className="mt-0.5 text-[8px] font-black text-sky-600">{departureOffset}</div>
                                <div className="truncate text-[9px] font-bold text-slate-500">{departure}</div>
                              </div>
                              <div className="flex min-w-12 items-center gap-1 text-sky-500">
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                                <span className="h-px w-6 border-t border-dashed border-sky-300" />
                                <ArrowRight className="h-3 w-3 shrink-0" />
                              </div>
                              <div className="min-w-0 text-right">
                                <div className="text-sm font-black tabular-nums text-slate-950">{event.displayEnd}</div>
                                <div className="mt-0.5 text-[8px] font-black text-sky-600">{arrivalOffset}</div>
                                <div className="truncate text-[9px] font-bold text-slate-500">{arrival}</div>
                              </div>
                            </div>

                            {roomyTransport && (
                              <div className="flex items-center justify-between gap-2 border-t border-sky-100/80 pt-1 text-[8px] font-bold text-slate-500">
                                <span className="truncate">{zoneChangeText}</span>
                                <span className="shrink-0">
                                  实际 {actualDuration}{showBeijingTime ? ` · 北京 ${beijingRangeText(event.node)}` : segmentText ? ` · ${segmentText}` : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  }
                  const pointTimeText = event.segmentKind === 'single'
                    ? nodeTimingText(event.node)
                    : `${event.displayStart} - ${event.displayEnd} · ${event.segmentKind === 'start' ? `跨至 D${event.arrivalDay}` : event.segmentKind === 'end' ? `D${event.departureDay} 延续` : '跨天途中'}`;
                  const pointBeijingTime = showBeijingTime ? beijingPointTimeText(event.node, currentDayTimezone) : '';
                  return (
                    <button
                      key={`${event.node.id}-${currentDay}-${event.segmentKind}`}
                      type="button"
                      draggable={canDragEvent}
                      onDragStart={(dragEvent) => {
                        if (resizeStateRef.current?.node.id === event.node.id) {
                          dragEvent.preventDefault();
                          return;
                        }
                        beginDrag(dragEvent, event.node);
                      }}
                      onDragEnd={() => {
                        setDraggedNodeId(null);
                        setDragPreview(null);
                      }}
                      onClick={() => edit(event.node)}
                      className={`pointer-events-auto absolute isolate overflow-hidden rounded-xl border px-3 py-2 text-left text-white backdrop-blur-xl backdrop-saturate-150 transition hover:-translate-y-0.5 hover:brightness-105 ${canDragEvent ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${activeNodeId === event.node.id ? 'ring-2 ring-slate-950/20' : ''}`}
                      style={{
                        top,
                        height,
                        left: `calc(${left}% + 3px)`,
                        width: `calc(${width}% - 6px)`,
                        ...eventGlassStyle(event.node),
                      }}
                    >
                      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/55" />
                      <span className="pointer-events-none absolute bottom-2 left-2 top-2 w-1 rounded-full bg-[var(--event-rail)]/90 shadow-[0_0_16px_rgba(255,255,255,0.45)]" />
                      <span className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-white/18 blur-2xl" />
                      <span
                        title="取消排期"
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          void unscheduleNode(event.node.id);
                        }}
                        className="absolute right-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-white/16 text-white/85 shadow-sm backdrop-blur transition hover:bg-white/28 hover:text-white"
                      >
                        <X className="h-3 w-3" />
                      </span>
                      <div className="relative z-10 flex items-center justify-between gap-2 pl-2 text-[9px] font-black text-white/90">
                        <span className="truncate tabular-nums tracking-wide">{pointTimeText}</span>
                        <span className="mr-7 shrink-0 rounded-full bg-white/18 px-1.5 py-0.5 text-white/90 backdrop-blur">{typeLabels[event.node.type]}</span>
                      </div>
                      <div className={`relative z-10 min-w-0 pl-2 ${showScheduleThumb ? 'mt-1.5 flex items-start gap-2' : 'mt-0.5'}`}>
                        {showScheduleThumb && (
                          <div className="h-10 w-12 shrink-0 overflow-hidden rounded-lg border border-white/25 bg-white/16 shadow-inner backdrop-blur">
                            {coverUrl ? (
                              <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <Icon className="h-4 w-4 text-white/78" />
                              </div>
                            )}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11px] font-black text-white drop-shadow-sm">{event.node.title}</div>
                          {showScheduleDetails && (
                            <div className="mt-0.5 truncate text-[9px] font-semibold text-white/82">
                              {nodeScheduleDetailText(event.node)}
                            </div>
                          )}
                          {pointBeijingTime && (
                            <div className="mt-0.5 truncate text-[8px] font-black text-white/70">
                              北京时间 {pointBeijingTime}
                            </div>
                          )}
                          {showScheduleThumb && event.node.description && (
                            <div className="mt-0.5 line-clamp-1 text-[8px] font-medium leading-tight text-white/68">
                              {event.node.description}
                            </div>
                          )}
                        </div>
                      </div>
                      <span
                        title="调整时长"
                        onPointerDown={(pointerEvent) => beginResizeDuration(pointerEvent, event.node)}
                        onClick={(clickEvent) => clickEvent.stopPropagation()}
                        className="absolute inset-x-8 bottom-1 z-20 flex h-3 cursor-ns-resize items-center justify-center rounded-full text-white/80"
                      >
                        <span className="h-1 w-10 rounded-full bg-white/55 shadow-sm" />
                      </span>
                    </button>
                  );
                })}
              </div>

              {currentDayTimeZoneTransitions.map((transition) => (
                <div
                  key={transition.id}
                  className="pointer-events-none absolute left-[64px] right-3 z-40"
                  style={{ top: (transition.minutes / SLOT_MINUTES) * SLOT_HEIGHT }}
                >
                  <div className="absolute inset-x-0 top-0 border-t border-dashed border-sky-300" />
                  <div className="absolute right-2 top-0 -translate-y-1/2 rounded-full border border-sky-100 bg-white/95 px-2 py-1 text-[8px] font-black text-sky-700 shadow-sm">
                    切换为 {timeZoneOptionLabel(transition.arrivalTimezone)} · {formatTimeZoneOffset(transition.arrivalTimezone, zonedTimeToUtcMs(currentDate, formatTime(transition.minutes), transition.arrivalTimezone))}
                  </div>
                </div>
              ))}

              {dragPreview && (
                <div
                  className="pointer-events-none absolute left-[64px] right-3 z-50"
                  style={{ top: ((dragPreview.minutes - START_MINUTES) / SLOT_MINUTES) * SLOT_HEIGHT }}
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-indigo-500 shadow-[0_0_0_1px_rgba(99,102,241,0.14),0_0_18px_rgba(99,102,241,0.3)]" />
                  <div className="absolute -left-[58px] top-0 flex -translate-y-1/2 items-center gap-1 rounded-full border border-indigo-100 bg-white px-2 py-1 text-[9px] font-black tabular-nums text-indigo-700 shadow-lg">
                    <span>{formatTime(dragPreview.minutes)}</span>
                    {dragPreview.connected && (
                      <span className="rounded-full bg-indigo-50 px-1 text-[8px] text-indigo-600">接续</span>
                    )}
                  </div>
                  <div className="absolute -left-1 top-0 h-2 w-2 -translate-y-1/2 rounded-full bg-indigo-500 shadow-sm" />
                </div>
              )}
            </div>
          </div>
        </section>

        <form onSubmit={submit} className="min-h-0 min-w-0 space-y-3 rounded-2xl border border-white/60 bg-white/55 p-3 shadow-lg backdrop-blur-xl xl:h-full xl:overflow-y-auto">
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
            <button
              type="button"
              onClick={async () => {
                await autoConnectEdges();
                toast('已重建地点之间的路线连线');
              }}
              disabled={saving}
              className="absolute right-2 top-2 z-[500] flex items-center gap-1.5 rounded-xl border border-white/70 bg-white/85 px-2.5 py-1.5 text-[10px] font-black text-indigo-700 shadow-lg backdrop-blur transition hover:bg-white disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />路线
            </button>
            <div className="h-56">
              <MapView />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-black text-slate-900">{editingId ? '编辑项目' : '项目录入'}</h3>
              <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                {form.type === 'transport'
                  ? `交通 · D${form.day || currentDay} · ${form.date || currentDate} · ${form.time || '12:00'}`
                  : isScheduledNode({ id: editingId || 'draft', ...form })
                    ? `地点 · 已排期 D${form.day} · ${form.date} · ${form.time}`
                    : '地点 · 待排期'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => startNew('point')} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-black text-slate-600 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700">
                <Plus className="mr-1 inline h-3 w-3" />地点
              </button>
              <button type="button" onClick={() => startNew('transport')} className="rounded-lg border border-sky-100 bg-sky-50 px-2 py-1.5 text-[10px] font-black text-sky-700 shadow-sm transition hover:bg-sky-100">
                <Plus className="mr-1 inline h-3 w-3" />交通
              </button>
              {editingExistingTransport && (
                <button type="button" onClick={deleteEditingTransport} className="rounded-lg border border-red-100 bg-red-50 px-2 py-1.5 text-[10px] font-black text-red-600 shadow-sm transition hover:bg-red-100">
                  <Trash2 className="mr-1 inline h-3 w-3" />删除
                </button>
              )}
              {editingId && <button type="button" onClick={() => reset()} className="rounded-lg px-2 py-1.5 text-[10px] font-bold text-red-600 hover:bg-red-50">取消</button>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button type="button" disabled={editingExistingTransport} onClick={() => switchEditorMode('point')} className={`rounded-lg py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${form.type !== 'transport' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-white/60'}`}>
              <MapPin className="mr-1 inline h-3.5 w-3.5" />地点项目
            </button>
            <button type="button" disabled={editingExistingTransport} onClick={() => switchEditorMode('transport')} className={`rounded-lg py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${form.type === 'transport' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:bg-white/60'}`}>
              <Route className="mr-1 inline h-3.5 w-3.5" />交通
            </button>
          </div>

          <label className="block text-xs font-semibold text-slate-700">
            名称
            <input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={form.type === 'transport' ? '例如：北京飞往东京' : '景点、住宿或饭店名称'} className={inputClass} />
          </label>

          {form.type === 'transport' ? (
            <div className="space-y-3 rounded-2xl border border-sky-100 bg-sky-50/60 p-3">
              {editingExistingTransport && (
                <div className="rounded-xl border border-red-100 bg-white/80 px-3 py-2 text-[10px] font-black text-red-600">
                  交通已锁定，需删除后重新录入
                </div>
              )}
              <div className={editingExistingTransport ? 'pointer-events-none opacity-70' : ''}>
              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs font-semibold text-slate-700">
                  Day
                  <select value={form.day || currentDay} onChange={(event) => setFormDay(Number(event.target.value))} className={inputClass}>
                    {dayNumbers.map((day) => <option key={day} value={day}>D{day}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  日期
                  <input
                    required
                    type="date"
                    value={form.date || currentDate}
                    onChange={(event) => setForm({
                      ...form,
                      date: event.target.value,
                      arrival_date: form.arrival_date || event.target.value,
                      end_date: form.end_date || form.arrival_date || event.target.value,
                    })}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  出发
                  <input required type="time" value={form.time || '12:00'} onChange={(event) => setForm({ ...form, time: event.target.value })} className={inputClass} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-700">
                  出发时区
                  <select
                    value={form.departure_timezone || currentDayTimezone}
                    onChange={(event) => setForm({ ...form, departure_timezone: event.target.value })}
                    className={inputClass}
                  >
                    {TIMEZONE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label} · {option.hint}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  到达时区
                  <select
                    value={form.arrival_timezone || form.departure_timezone || currentDayTimezone}
                    onChange={(event) => setForm({ ...form, arrival_timezone: event.target.value, timezone: event.target.value })}
                    className={inputClass}
                  >
                    {TIMEZONE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label} · {option.hint}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="rounded-xl border border-sky-100 bg-white/65 px-3 py-2 text-[10px] font-bold text-slate-500">
                票面时间按机场当地时间录入 · {localOffsetText(form.date || currentDate, form.time || '12:00', form.departure_timezone || currentDayTimezone)}
                {' '}→ {localOffsetText(form.arrival_date || form.date || currentDate, form.arrival_time || '14:00', form.arrival_timezone || form.departure_timezone || currentDayTimezone)}
                {form.departure_timezone && form.arrival_timezone && form.departure_timezone !== form.arrival_timezone && (
                  <span className="ml-1 text-sky-700">· 实际 {transportDurationText({
                    date: form.date || currentDate,
                    time: form.time || '12:00',
                    end_date: form.arrival_date || form.date || currentDate,
                    end_time: form.arrival_time || '14:00',
                    departure_timezone: form.departure_timezone,
                    arrival_timezone: form.arrival_timezone,
                  })}</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {transportModeOptions.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm({ ...form, transport_mode: value })}
                    className={`flex items-center justify-center gap-1 rounded-xl border px-2 py-2 text-[11px] font-black transition ${form.transport_mode === value ? 'border-sky-300 bg-white text-sky-700 shadow-sm' : 'border-white/70 bg-white/45 text-slate-500 hover:bg-white'}`}
                  >
                    <Icon className="h-3.5 w-3.5" />{label}
                  </button>
                ))}
              </div>

              <label className="block text-xs font-semibold text-slate-700">
                航班 / 车次 / 班次
                <input value={form.service_number} onChange={(event) => setForm({ ...form, service_number: event.target.value })} placeholder="CA123 / G101 / 机场巴士" className={inputClass} />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-700">
                  到达日期
                  <input
                    required
                    type="date"
                    value={form.arrival_date || form.date}
                    onChange={(event) => {
                      const endDate = event.target.value;
                      setForm({
                        ...form,
                        arrival_date: endDate,
                        end_date: endDate,
                        end_day: dayForDate(endDate, dateByDay, trip?.start_date) || form.end_day || form.day,
                      });
                    }}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  到达时间
                  <input
                    required
                    type="time"
                    value={form.arrival_time}
                    onChange={(event) => setForm({ ...form, arrival_time: event.target.value, end_time: event.target.value })}
                    className={inputClass}
                  />
                </label>
              </div>

              <label className="block text-xs font-semibold text-slate-700">
                行程时长
                <input value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} placeholder="例如：3小时20分" className={inputClass} />
              </label>

              <div className="space-y-3">
                <div className="rounded-2xl border border-white/70 bg-white/55 p-2.5">
                  <label className="mb-2 block text-xs font-semibold text-slate-700">
                    出发地
                    <input required value={form.departure_place} onChange={(event) => setForm({ ...form, departure_place: event.target.value })} className={inputClass} />
                  </label>
                  <LocationPicker compact value={{ lat: form.departure_lat ?? form.lat, lng: form.departure_lng ?? form.lng, title: form.departure_place }} onChange={(location) => setForm((current) => ({
                    ...current,
                    departure_place: location.title || current.departure_place,
                    departure_lat: location.lat,
                    departure_lng: location.lng,
                    departure_timezone: inferTimeZoneFromLocation({
                      place: location.title || current.departure_place,
                      city: location.city,
                      address: location.address,
                      lat: location.lat,
                      lng: location.lng,
                      fallback: current.departure_timezone || currentDayTimezone,
                    }),
                  }))} />
                </div>

                <div className="rounded-2xl border border-white/70 bg-white/55 p-2.5">
                  <label className="mb-2 block text-xs font-semibold text-slate-700">
                    到达地
                    <input required value={form.arrival_place} onChange={(event) => setForm({ ...form, arrival_place: event.target.value })} className={inputClass} />
                  </label>
                  <LocationPicker compact value={{ lat: form.arrival_lat ?? form.lat, lng: form.arrival_lng ?? form.lng, title: form.arrival_place }} onChange={(location) => setForm((current) => {
                    const arrivalTimezone = inferTimeZoneFromLocation({
                      place: location.title || current.arrival_place,
                      city: location.city,
                      address: location.address,
                      lat: location.lat,
                      lng: location.lng,
                      fallback: current.arrival_timezone || current.departure_timezone || currentDayTimezone,
                    });
                    return {
                      ...current,
                      arrival_place: location.title || current.arrival_place,
                      arrival_lat: location.lat,
                      arrival_lng: location.lng,
                      lat: location.lat,
                      lng: location.lng,
                      timezone: arrivalTimezone,
                      arrival_timezone: arrivalTimezone,
                    };
                  })} />
                </div>
              </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {isScheduledNode({ id: editingId || 'draft', ...form }) ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[10px] font-black text-indigo-700">已排期</div>
                    <div className="mt-0.5 truncate text-xs font-bold text-slate-700">D{form.day} · {form.date} · {form.time}</div>
                  </div>
                  {editingId && (
                    <button type="button" onClick={cancelPointSchedule} className="shrink-0 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-[10px] font-black text-indigo-700 shadow-sm transition hover:border-red-200 hover:text-red-600">
                      取消排期
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-3 py-2.5 text-[10px] font-black text-slate-500">
                  待排期项目
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                {pointTypeOptions.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm({ ...form, type: value })}
                    className={`flex items-center justify-center gap-1 rounded-xl border px-2 py-2 text-[11px] font-black transition ${form.type === value ? 'border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-slate-200 bg-white/75 text-slate-500 hover:bg-white'}`}
                  >
                    <Icon className="h-3.5 w-3.5" />{label}
                  </button>
                ))}
              </div>

              {form.type !== 'sightseeing' && form.type !== 'hotel' && form.type !== 'restaurant' && (
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-700">
                  当前保留历史类型：{legacyPointTypeLabels[form.type] || typeLabels[form.type]}
                </div>
              )}

              <label className="block text-xs font-semibold text-slate-700">
                停留时长
                <input value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} placeholder="例如：1小时30分" className={inputClass} />
              </label>

              <label className="block text-xs font-semibold text-slate-700">
                当地时区
                <select
                  value={form.timezone || currentDayTimezone}
                  onChange={(event) => setForm({ ...form, timezone: event.target.value })}
                  className={inputClass}
                >
                  {TIMEZONE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label} · {option.hint}</option>
                  ))}
                </select>
              </label>

              <LocationPicker value={{ lat: form.lat, lng: form.lng, city: form.city, address: form.address, title: form.title }} onChange={(location) => setForm((current) => ({ ...current, lat: location.lat, lng: location.lng, city: location.city ?? current.city, address: location.address ?? current.address, title: current.title || location.title || '', timezone: inferTimeZoneFromLocation({ place: location.title || current.title, city: location.city, address: location.address, lat: location.lat, lng: location.lng, fallback: current.timezone || currentDayTimezone }) }))} />

              <div tabIndex={0} onPaste={pasteImage} className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 p-3 outline-none focus:border-indigo-400">
                <div className="grid grid-cols-3 gap-2">
                  {(form.image_urls || []).map((url, index) => (
                    <div key={url} className="group relative">
                      <img src={url} alt="" className="h-24 w-full rounded-xl object-cover" />
                      {index === 0 && <span className="absolute bottom-1 left-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-[8px] font-bold text-white">封面</span>}
                      <button type="button" onClick={() => removeImage(url)} className="absolute right-1 top-1 rounded-full bg-slate-950/70 p-1 text-white opacity-0 transition group-hover:opacity-100"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
                {!(form.image_urls || []).length && (
                  <div className="flex min-h-20 flex-col items-center justify-center text-center">
                    <Image className="h-5 w-5 text-indigo-500" />
                    <div className="mt-1 text-[10px] text-slate-500">图片</div>
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Image className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input value={imageUrlInput} onChange={(event) => setImageUrlInput(event.target.value)} placeholder="图片 URL" className={`${inputClass} mt-0 pl-9`} />
                  </div>
                  <button type="button" onClick={() => addImageUrl()} className="rounded-xl border border-indigo-200 bg-white px-3 text-[11px] font-bold text-indigo-700"><Plus className="h-3.5 w-3.5" /></button>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && void uploadImage(event.target.files[0])} className="hidden" />
                  <button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 rounded-xl bg-indigo-600 px-3 text-[11px] font-bold text-white disabled:opacity-50">
                    {uploading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}上传
                  </button>
                </div>
              </div>
            </div>
          )}

          <label className="block text-xs font-semibold text-slate-700">
            说明
            <textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={inputClass} />
          </label>

          <button disabled={saving || editingExistingTransport} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-semibold text-white disabled:opacity-50">
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {editingExistingTransport ? '删除后重新录入' : editingId ? '保存修改' : '新增内容'}
          </button>
        </form>
      </div>
    </div>
  );
}
