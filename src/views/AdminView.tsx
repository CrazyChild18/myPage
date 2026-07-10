import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  BedDouble,
  Bus,
  Car,
  Eye,
  EyeOff,
  GripVertical,
  Image,
  LockKeyhole,
  LoaderCircle,
  MapPin,
  Pencil,
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
import { useItineraryStore } from '../store/useItineraryStore';
import { ActivitySubtype, EdgeAnchor, EdgeDisplayStatus, EdgeTransportType, ItineraryEdge, ItineraryNode, ItineraryType, Lodging, Stay, TransportMode } from '../types';
import { mapProviderForTrip } from '../map/provider';
import { responsiveImageProps } from '../utils/images';
import {
  activitySubtypeLabels,
  activitySubtypeOf,
  compareItineraryNodes,
  isScheduledNode,
  isUnscheduledPointNode,
  itineraryTypeLabel,
  itineraryTypeTone,
} from '../utils/itinerary';
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
const CONNECTION_APPROACH_THRESHOLD_MINUTES = SCHEDULE_SNAP_MINUTES;
const CONNECTION_RELEASE_THRESHOLD_MINUTES = SCHEDULE_SNAP_MINUTES;
const CONNECTION_GAP_MINUTES = 0;

const pointTypeOptions: Array<{ value: ActivitySubtype; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'sightseeing', label: activitySubtypeLabels.sightseeing, icon: MapPin },
  { value: 'meal', label: activitySubtypeLabels.meal, icon: Utensils },
  { value: 'shopping', label: activitySubtypeLabels.shopping, icon: Image },
  { value: 'leisure', label: activitySubtypeLabels.leisure, icon: Eye },
  { value: 'tour', label: activitySubtypeLabels.tour, icon: Route },
  { value: 'layover', label: activitySubtypeLabels.layover, icon: Plane },
  { value: 'other', label: activitySubtypeLabels.other, icon: MapPin },
];

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

const edgeTransportOptions: Array<{ value: EdgeTransportType; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'walk', label: '步行', hint: '短距离城市移动', icon: MapPin },
  { value: 'car', label: '自驾', hint: '租车/驾车路线', icon: Car },
  { value: 'taxi', label: '打车', hint: '按驾车路线估算', icon: Car },
  { value: 'transit', label: '公共交通', hint: '公交/地铁/铁路', icon: Bus },
  { value: 'ferry', label: '轮渡', hint: '暂按人工/直线兜底', icon: Ship },
  { value: 'other', label: '其他', hint: '保留接续关系', icon: Route },
];

const typeLabels: Record<ItineraryType, string> = {
  transport: '交通',
  activity: '活动',
  transfer: '转机',
  hotel: '住宿',
  restaurant: '饭店',
  sightseeing: '景点',
  leisure: '休闲',
  shopping: '采购',
};

const edgeTransportLabel = (type?: EdgeTransportType) =>
  edgeTransportOptions.find((option) => option.value === type)?.label || '接续';

const edgeAnchorPoint = (node: ItineraryNode, anchor?: EdgeAnchor) => {
  if (anchor === 'departure' && node.departure_lat != null && node.departure_lng != null) {
    return { lat: node.departure_lat, lng: node.departure_lng };
  }
  if (anchor === 'arrival' && node.arrival_lat != null && node.arrival_lng != null) {
    return { lat: node.arrival_lat, lng: node.arrival_lng };
  }
  return { lat: node.lat, lng: node.lng };
};

const defaultEdgeTransportType = (
  source?: ItineraryNode | null,
  target?: ItineraryNode | null,
  sourceAnchor?: EdgeAnchor,
  targetAnchor?: EdgeAnchor,
): EdgeTransportType => {
  if (!source || !target) return 'car';
  const sourcePoint = edgeAnchorPoint(source, sourceAnchor);
  const targetPoint = edgeAnchorPoint(target, targetAnchor);
  const km = Math.sqrt((sourcePoint.lat - targetPoint.lat) ** 2 + (sourcePoint.lng - targetPoint.lng) ** 2) * 85;
  return km < 2 ? 'walk' : 'car';
};

const typeTone: Record<ItineraryType, { card: string; badge: string; event: string }> = {
  activity: {
    card: 'border-violet-100 bg-violet-50/70',
    badge: 'bg-violet-100 text-violet-700',
    event: 'border-violet-200 bg-violet-600 text-white',
  },
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
  activity: 90,
  sightseeing: 90,
  hotel: 45,
  restaurant: 75,
  transport: 60,
  transfer: 60,
  leisure: 90,
  shopping: 60,
};

const defaultDurationByActivitySubtype: Record<ActivitySubtype, number> = {
  sightseeing: 90,
  meal: 75,
  shopping: 60,
  leisure: 90,
  tour: 120,
  ticketed_event: 120,
  layover: 60,
  errand: 45,
  buffer: 30,
  other: 60,
};

const defaultDurationForNode = (node: Pick<ItineraryNode, 'type' | 'activity_subtype'>) =>
  node.type === 'transport'
    ? defaultDurationByType.transport
    : defaultDurationByActivitySubtype[activitySubtypeOf(node)];

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
    type: isTransport ? 'transport' : 'activity',
    activity_subtype: isTransport ? undefined : 'sightseeing',
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
    place_provider: 'manual',
    provider_place_id: '',
    coord_system: 'wgs84',
    departure_place_provider: 'manual',
    departure_provider_place_id: '',
    arrival_place_provider: 'manual',
    arrival_provider_place_id: '',
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

const emptyLodgingDraft = ({
  id = `lodging-${Date.now()}`,
  timezone = DEFAULT_TIMEZONE,
}: {
  id?: string;
  timezone?: string;
} = {}): Lodging => ({
  id,
  name: '',
  address: '',
  city: '',
  lat: 64.1466,
  lng: -21.9426,
  timezone,
  image_url: '',
  image_urls: [],
  booking_site: '爱彼迎',
  reservation_no: '',
  notes: '',
  place_provider: 'manual',
  provider_place_id: '',
  coord_system: 'wgs84',
});

const emptyStayDraft = ({
  id = `stay-${Date.now()}`,
  lodgingId = '',
  day = 1,
  date = '2026-09-26',
}: {
  id?: string;
  lodgingId?: string;
  day?: number;
  date?: string;
} = {}): Stay => ({
  id,
  lodging_id: lodgingId,
  check_in_day: day,
  check_in_date: date,
  check_in_time: '15:00',
  check_out_day: day + 1,
  check_out_date: addDays(date, 1),
  check_out_time: '11:00',
  guests: 0,
  room_type: '',
  price: '',
  status: 'planned',
  notes: '',
});

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
    if (end > start) return Math.max(SCHEDULE_SNAP_MINUTES, end - start);
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
  return Math.max(30, parsed || defaultDurationForNode(node) || 60);
};

const clampDurationMinutes = (minutes: number, maxMinutes = 12 * 60) => {
  const snapped = Math.round(minutes / SCHEDULE_SNAP_MINUTES) * SCHEDULE_SNAP_MINUTES;
  return Math.max(SLOT_MINUTES, Math.min(maxMinutes, snapped));
};

const clampDurationRange = (minutes: number, maxMinutes: number) =>
  Math.max(SLOT_MINUTES, Math.min(maxMinutes, Math.round(minutes)));

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

const durationBetweenRange = (startDay: number, startTime: string, endDay: number, endTime: string) => {
  const start = (Math.max(1, startDay) - 1) * END_MINUTES + parseTime(startTime);
  const end = (Math.max(1, endDay) - 1) * END_MINUTES + parseTime(endTime);
  return end > start ? end - start : null;
};

const snapScheduleMinutes = (minutes: number) => {
  const snapped = Math.round(minutes / SCHEDULE_SNAP_MINUTES) * SCHEDULE_SNAP_MINUTES;
  return Math.max(START_MINUTES, Math.min(END_MINUTES - SCHEDULE_SNAP_MINUTES, snapped));
};

const nodeImageUrl = (node: ItineraryNode) => node.image_urls?.[0] || node.image_url || '';

const lodgingImageUrl = (lodging: Lodging) => lodging.image_urls?.[0] || lodging.image_url || '';

const stayNightCount = (stay: Stay) => Math.max(1, dateDeltaDays(stay.check_in_date, stay.check_out_date) || 1);

const stayNightIndex = (stay: Stay, date: string) => {
  const offset = dateDeltaDays(stay.check_in_date, date);
  if (offset == null || offset < 0 || offset >= stayNightCount(stay)) return null;
  return offset + 1;
};

const stayDurationText = (stay: Stay) => {
  const nights = stayNightCount(stay);
  return nights > 1 ? `${nights} 晚` : '1 晚';
};

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
  activity: [
    { from: 'rgba(124, 58, 237, 0.94)', via: 'rgba(147, 51, 234, 0.9)', to: 'rgba(217, 70, 239, 0.88)', border: 'rgba(221, 214, 254, 0.76)', shadow: 'rgba(124, 58, 237, 0.24)', rail: '#f5d0fe' },
    { from: 'rgba(37, 99, 235, 0.94)', via: 'rgba(79, 70, 229, 0.9)', to: 'rgba(124, 58, 237, 0.88)', border: 'rgba(191, 219, 254, 0.76)', shadow: 'rgba(37, 99, 235, 0.22)', rail: '#bfdbfe' },
  ],
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
  const paletteKey: ItineraryType = node.type === 'activity'
    ? activitySubtypeOf(node) === 'meal'
      ? 'restaurant'
      : activitySubtypeOf(node) === 'layover'
      ? 'transfer'
      : activitySubtypeOf(node) === 'shopping'
      ? 'shopping'
      : activitySubtypeOf(node) === 'leisure'
      ? 'leisure'
      : 'activity'
    : node.type;
  const palette = eventGlassPalettes[paletteKey] || eventGlassPalettes.activity;
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

type ScheduleDragPreview = {
  nodeId: string;
  visibleDay: number;
  startAbsolute: number;
  start: number;
  end: number;
  connected: boolean;
  title: string;
  detail: string;
  durationText: string;
};

type ImageTarget = 'item' | 'lodging';

type LibraryFilter = 'all' | ActivitySubtype;

const libraryFilterOrder: ActivitySubtype[] = ['sightseeing', 'meal', 'shopping', 'leisure', 'tour', 'layover', 'other'];

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
  if (endAbsolute <= startAbsolute) {
    endAbsolute = startAbsolute + eventDurationMinutes(node);
  }

  const arrivalDay = Math.max(departureDay, Math.ceil(endAbsolute / END_MINUTES));
  return { departureDay, arrivalDay, startAbsolute, endAbsolute };
};

const nodeDaySpan = (node: ItineraryNode, dateByDay: Map<number, string>, tripStartDate?: string) => {
  const { departureDay, arrivalDay } = nodeScheduleRange(node, dateByDay, tripStartDate);
  return { departureDay, arrivalDay };
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

export default function AdminView() {
  const {
    selectedTripSlug,
    trip,
    nodes,
    edges,
    routeSegments,
    lodgings,
    stays,
    addNode,
    updateNode,
    updateEdge,
    deleteNode,
    saveLodging,
    deleteLodging,
    saveStay,
    deleteStay,
    autoConnectEdges,
    saving,
    syncingNodeIds,
    activeDay,
    activeNodeId,
    activeEdgeId,
    setActiveDay,
    setActiveNodeId,
    setActiveEdgeId,
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
    const fromStays = stays.flatMap((stay) => [stay.check_in_day, stay.check_out_day]).filter((day) => day > 0);
    return Array.from(new Set([...fromTrip, ...fromNodes, ...fromEndNodes, ...fromStays, 1])).sort((a, b) => a - b);
  }, [nodes, stays, trip?.end_date, trip?.start_date]);

  const dateByDay = useMemo(() => {
    const map = new Map<number, string>();
    if (trip?.start_date) {
      dayNumbers.forEach((day) => map.set(day, addDays(trip.start_date, day - 1)));
    }
    nodes.filter(isScheduledNode).forEach((node) => {
      if (!map.has(node.day) && node.date) map.set(node.day, node.date);
    });
    stays.forEach((stay) => {
      if (!map.has(stay.check_in_day) && stay.check_in_date) map.set(stay.check_in_day, stay.check_in_date);
      if (!map.has(stay.check_out_day) && stay.check_out_date) map.set(stay.check_out_day, stay.check_out_date);
    });
    return map;
  }, [dayNumbers, nodes, stays, trip?.start_date]);

  const currentDay = activeDay === 'all' ? dayNumbers[0] || 1 : activeDay;
  const currentDate = dateByDay.get(currentDay) || trip?.start_date || '2026-09-26';
  const syncingNodeIdSet = useMemo(() => new Set(syncingNodeIds), [syncingNodeIds]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const nonNodeSaving = saving && syncingNodeIds.length === 0;
  const editingNodeSyncing = Boolean(editingId && syncingNodeIdSet.has(editingId));
  const formSubmitSaving = nonNodeSaving || editingNodeSyncing;
  const [form, setForm] = useState(emptyForm({ day: currentDay, date: currentDate }));
  const [editorMode, setEditorMode] = useState<'item' | 'lodging'>('item');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingLodgingId, setEditingLodgingId] = useState<string | null>(null);
  const [editingStayId, setEditingStayId] = useState<string | null>(null);
  const [lodgingForm, setLodgingForm] = useState<Lodging>(() => emptyLodgingDraft());
  const [stayForm, setStayForm] = useState<Stay>(() => emptyStayDraft());
  const [edgeDraft, setEdgeDraft] = useState<{ transportType: EdgeTransportType; displayStatus: EdgeDisplayStatus; isLocked: boolean }>({
    transportType: 'car',
    displayStatus: 'visible',
    isLocked: true,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [pendingUploadUrls, setPendingUploadUrls] = useState<string[]>([]);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [resizeDraft, setResizeDraft] = useState<{ nodeId: string; duration: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<ScheduleDragPreview | null>(null);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [showBeijingTime, setShowBeijingTime] = useState(false);
  const [compactPanel, setCompactPanel] = useState<'library' | 'schedule'>('schedule');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scheduleGridRef = useRef<HTMLDivElement>(null);
  const scheduleScrollRef = useRef<HTMLDivElement>(null);
  const editorDialogRef = useRef<HTMLFormElement>(null);
  const editorCloseRef = useRef<HTMLButtonElement>(null);
  const resizeStateRef = useRef<{
    node: ItineraryNode;
    startY: number;
    startDuration: number;
    latestDuration: number;
    maxDuration: number;
    segmentStart: number;
    segmentOffset: number;
  } | null>(null);
  const draggedSegmentOffsetRef = useRef(0);
  const draggedPointerOffsetRef = useRef(0);
  const draggedStartVisibleRef = useRef<number | null>(null);
  const draggedOriginPointerRef = useRef<number | null>(null);
  const dragPreviewRef = useRef<ScheduleDragPreview | null>(null);
  const suppressLibraryClickRef = useRef(false);
  const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white/85 px-3 py-2.5 text-xs outline-none transition focus:border-indigo-400';

  const clearDragPreview = () => {
    dragPreviewRef.current = null;
    setDragPreview(null);
  };

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
  const editingEdge = useMemo(() => activeEdgeId ? edges.find((edge) => edge.id === activeEdgeId) || null : null, [activeEdgeId, edges]);
  const editingEdgeSource = useMemo(() => editingEdge ? nodes.find((node) => node.id === editingEdge.source) || null : null, [editingEdge, nodes]);
  const editingEdgeTarget = useMemo(() => editingEdge ? nodes.find((node) => node.id === editingEdge.target) || null : null, [editingEdge, nodes]);
  const editingRouteSegment = useMemo(
    () => editingEdge ? routeSegments.find((segment) => segment.linkType === 'edge' && segment.linkId === editingEdge.id) || null : null,
    [editingEdge, routeSegments],
  );
  const mapProvider = mapProviderForTrip(trip);
  const lodgingById = useMemo(() => new Map(lodgings.map((lodging) => [lodging.id, lodging])), [lodgings]);
  const activeStays = useMemo(() => stays.filter((stay) => stay.status !== 'cancelled'), [stays]);
  const currentNightStays = useMemo(
    () => activeStays
      .map((stay) => {
        const nightIndex = stayNightIndex(stay, currentDate);
        const lodging = lodgingById.get(stay.lodging_id);
        return nightIndex && lodging ? { stay, lodging, nightIndex, nightCount: stayNightCount(stay) } : null;
      })
      .filter((item): item is { stay: Stay; lodging: Lodging; nightIndex: number; nightCount: number } => Boolean(item)),
    [activeStays, currentDate, lodgingById],
  );
  const currentLodgingBands = useMemo(
    () => activeStays
      .flatMap((stay) => {
        const lodging = lodgingById.get(stay.lodging_id);
        const daysFromCheckIn = dateDeltaDays(stay.check_in_date, currentDate);
        const daysUntilCheckOut = dateDeltaDays(currentDate, stay.check_out_date);
        if (!lodging || daysFromCheckIn == null || daysUntilCheckOut == null || daysFromCheckIn < 0 || daysUntilCheckOut < 0) return [];

        const start = stay.check_in_date === currentDate ? parseTime(stay.check_in_time) : START_MINUTES;
        const end = stay.check_out_date === currentDate ? parseTime(stay.check_out_time) : END_MINUTES;
        if (end <= start) return [];

        const nightCount = stayNightCount(stay);
        const nightIndex = Math.max(1, Math.min(nightCount, daysFromCheckIn + 1));
        return [{
          id: `${stay.id}-lodging-band`,
          stay,
          lodging,
          start,
          end,
          nightIndex,
          nightCount,
          displayStart: formatTime(start),
          displayEnd: end === END_MINUTES ? '24:00' : formatTime(end),
        }];
      })
      .sort((a, b) => a.start - b.start || a.lodging.name.localeCompare(b.lodging.name, 'zh-CN')),
    [activeStays, currentDate, lodgingById],
  );
  const editingLodging = editingLodgingId ? lodgings.find((lodging) => lodging.id === editingLodgingId) || null : null;
  const editingStay = editingStayId ? stays.find((stay) => stay.id === editingStayId) || null : null;
  const stayCheckInDate = stayForm.check_in_date || currentDate;
  const stayCheckOutDate = stayForm.check_out_date && (dateDeltaDays(stayCheckInDate, stayForm.check_out_date) || 0) > 0
    ? stayForm.check_out_date
    : addDays(stayCheckInDate, 1);
  const stayCheckInDay = dayForDate(stayCheckInDate, dateByDay, trip?.start_date) || stayForm.check_in_day || currentDay;
  const stayCheckOutDay = Math.max(
    stayCheckInDay,
    dayForDate(stayCheckOutDate, dateByDay, trip?.start_date) || stayForm.check_out_day || stayCheckInDay + 1,
  );
  const displayedStayForm: Stay = {
    ...stayForm,
    check_in_day: stayCheckInDay,
    check_in_date: stayCheckInDate,
    check_out_day: stayCheckOutDay,
    check_out_date: stayCheckOutDate,
  };

  useEffect(() => {
    if (!editingEdge) return;
    setEditorOpen(true);
    setEditorMode('item');
    setEditingLodgingId(null);
    setEditingStayId(null);
    setEditingId(null);
    setEdgeDraft({
      transportType: editingEdge.transportType || 'car',
      displayStatus: editingEdge.displayStatus || 'visible',
      isLocked: editingEdge.isLocked ?? true,
    });
  }, [editingEdge]);

  useEffect(() => {
    if (!editorOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') reset();
      if (event.key === 'Tab' && editorDialogRef.current) {
        const focusable = [...editorDialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    editorCloseRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [editorOpen]);

  const currentDayNodes = useMemo(
    () => sortedNodes.filter((node) => node.type !== 'hotel' && isScheduledNode(node) && scheduleSegmentForDay(node, currentDay, dateByDay, trip?.start_date)),
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
  useEffect(() => {
    if (!scheduleScrollRef.current) return;
    const earliest = scheduleEvents.reduce((minimum, event) => Math.min(minimum, event.start), END_MINUTES);
    const targetMinutes = Math.max(START_MINUTES, (earliest === END_MINUTES ? 8 * 60 : earliest) - 60);
    scheduleScrollRef.current.scrollTo({
      top: (targetMinutes / SLOT_MINUTES) * SLOT_HEIGHT,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [currentDay, scheduleEvents.length]);
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
  const libraryNodes = useMemo(() => sortedNodes.filter((node) => node.type !== 'hotel' && isUnscheduledPointNode(node)), [sortedNodes]);
  const libraryTypeCounts = useMemo(
    () => libraryNodes.reduce<Partial<Record<ActivitySubtype, number>>>((counts, node) => {
      const subtype = activitySubtypeOf(node);
      counts[subtype] = (counts[subtype] || 0) + 1;
      return counts;
    }, {}),
    [libraryNodes],
  );
  const libraryFilterOptions = useMemo(
    () => [
      { value: 'all' as const, label: '全部', count: libraryNodes.length },
      ...libraryFilterOrder
        .filter((type) => libraryTypeCounts[type])
        .map((type) => ({ value: type, label: activitySubtypeLabels[type], count: libraryTypeCounts[type] || 0 })),
    ],
    [libraryNodes.length, libraryTypeCounts],
  );
  const filteredLibraryNodes = useMemo(() => {
    const keyword = libraryQuery.trim().toLocaleLowerCase();
    return libraryNodes.filter((node) => {
      if (libraryFilter !== 'all' && activitySubtypeOf(node) !== libraryFilter) return false;
      if (!keyword) return true;

      return [
        itineraryTypeLabel(node),
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
  const filteredLodgings = useMemo(() => {
    const keyword = libraryQuery.trim().toLocaleLowerCase();
    if (libraryFilter !== 'all') return [];
    return lodgings.filter((lodging) => {
      if (!keyword) return true;
      return [lodging.name, lodging.city, lodging.address, lodging.booking_site, lodging.reservation_no]
        .some((value) => (value || '').toLocaleLowerCase().includes(keyword));
    });
  }, [libraryFilter, libraryQuery, lodgings]);
  const staysByLodgingId = useMemo(
    () => activeStays.reduce<Record<string, Stay[]>>((lookup, stay) => {
      lookup[stay.lodging_id] = [...(lookup[stay.lodging_id] || []), stay];
      return lookup;
    }, {}),
    [activeStays],
  );
  const draggedNode = useMemo(
    () => draggedNodeId ? nodes.find((node) => node.id === draggedNodeId) || null : null,
    [draggedNodeId, nodes],
  );
  const canDropToLibrary = Boolean(draggedNode && draggedNode.type !== 'transport' && draggedNode.type !== 'hotel' && isScheduledNode(draggedNode));
  const isPointFormScheduled = isScheduledNode({ id: editingId || 'draft', ...form });

  const formStartDay = (draft = form) =>
    dayForDate(draft.date || currentDate, dateByDay, trip?.start_date) || draft.day || currentDay;

  const formEndDay = (draft = form) => {
    const startDay = formStartDay(draft);
    const endDate = draft.end_date || draft.arrival_date || draft.date || currentDate;
    return Math.max(startDay, dayForDate(endDate, dateByDay, trip?.start_date) || draft.end_day || startDay);
  };

  const formRangeDuration = (draft = form) => {
    const parsed = parseDurationMinutes(draft.duration);
    const startDay = formStartDay(draft);
    const scheduledDraft = { id: editingId || 'draft', ...draft, day: startDay };
    if (!isScheduledNode(scheduledDraft)) {
      return Math.max(SLOT_MINUTES, parsed || defaultDurationForNode(draft) || SLOT_MINUTES);
    }
    return durationBetweenRange(
      startDay,
      draft.time || '12:00',
      formEndDay(draft),
      draft.end_time || draft.time || '12:00',
    ) || Math.max(SLOT_MINUTES, parsed || defaultDurationForNode(draft) || SLOT_MINUTES);
  };

  const schedulePointForm = (time = form.time || '12:00') => {
    setForm((current) => {
      const date = current.date || currentDate;
      const day = dayForDate(date, dateByDay, trip?.start_date) || current.day || currentDay;
      const duration = formRangeDuration({ ...current, day, date, time, status: 'planned' });
      return {
        ...current,
        day,
        date,
        time,
        status: 'planned',
        duration: current.duration || formatDurationText(duration),
        ...endFromStart(day, date, time, duration, dateByDay),
      };
    });
  };

  const updatePointStart = (patch: Partial<Pick<ItineraryNode, 'day' | 'date' | 'time'>>) => {
    setForm((current) => {
      const duration = formRangeDuration(current);
      const nextDate = patch.date || (patch.day ? dateByDay.get(patch.day) || current.date || currentDate : current.date || currentDate);
      const nextDay = dayForDate(nextDate, dateByDay, trip?.start_date) || patch.day || current.day || currentDay;
      const nextTime = patch.time || current.time || '12:00';
      return {
        ...current,
        ...patch,
        day: nextDay,
        date: nextDate,
        time: nextTime,
        status: 'planned',
        duration: formatDurationText(duration),
        ...endFromStart(nextDay, nextDate, nextTime, duration, dateByDay),
      };
    });
  };

  const updatePointEnd = (patch: Partial<Pick<ItineraryNode, 'end_day' | 'end_date' | 'end_time'>>) => {
    setForm((current) => {
      const startDay = formStartDay(current);
      const nextEndDate = patch.end_date || (patch.end_day ? dateByDay.get(patch.end_day) || current.end_date || current.date || currentDate : current.end_date || current.date || currentDate);
      const nextEndDay = dayForDate(nextEndDate, dateByDay, trip?.start_date) || patch.end_day || current.end_day || startDay;
      const clampedEndDay = Math.max(startDay, nextEndDay);
      const next = {
        ...current,
        ...patch,
        end_day: clampedEndDay,
        end_date: nextEndDate,
        end_time: patch.end_time || current.end_time || current.time || '12:00',
        status: 'planned' as const,
      };
      const duration = formRangeDuration(next);
      if (!durationBetweenRange(formStartDay(next), next.time || '12:00', formEndDay(next), next.end_time || '12:00')) {
        return {
          ...next,
          duration: formatDurationText(SLOT_MINUTES),
          ...endFromStart(formStartDay(next), next.date || currentDate, next.time || '12:00', SLOT_MINUTES, dateByDay),
        };
      }
      return { ...next, duration: formatDurationText(duration) };
    });
  };

  const updatePointDuration = (value: string) => {
    setForm((current) => {
      const parsed = parseDurationMinutes(value);
      const scheduledDraft = { id: editingId || 'draft', ...current, day: formStartDay(current) };
      if (!parsed || !isScheduledNode(scheduledDraft)) {
        return { ...current, duration: value };
      }
      return {
        ...current,
        duration: value,
        ...endFromStart(formStartDay(current), current.date || currentDate, current.time || '12:00', parsed, dateByDay),
      };
    });
  };
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
      const date = draft.date || currentDate;
      const day = dayForDate(date, dateByDay, trip?.start_date) || draft.day || currentDay;
      const time = draft.time || '12:00';
      const endDate = draft.arrival_date || draft.end_date || date;
      const endDay = Math.max(day, dayForDate(endDate, dateByDay, trip?.start_date) || draft.end_day || day);
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
        place_provider: draft.arrival_place_provider || draft.place_provider || 'manual',
        provider_place_id: draft.arrival_provider_place_id || draft.provider_place_id || '',
        coord_system: draft.coord_system || 'wgs84',
        departure_place_provider: draft.departure_place_provider || 'manual',
        departure_provider_place_id: draft.departure_provider_place_id || '',
        arrival_place_provider: draft.arrival_place_provider || 'manual',
        arrival_provider_place_id: draft.arrival_provider_place_id || '',
      };
    }

    const fallbackDate = draft.date || currentDate;
    const fallbackDay = dayForDate(fallbackDate, dateByDay, trip?.start_date) || draft.day || currentDay;
    const fallbackTime = draft.time || '12:00';
    const scheduled = draft.status !== 'unscheduled' && Boolean(fallbackDate) && Boolean(fallbackTime);
    const explicitEndDate = draft.end_date || fallbackDate;
    const explicitEndDay = Math.max(
      fallbackDay,
      dayForDate(explicitEndDate, dateByDay, trip?.start_date) || draft.end_day || fallbackDay,
    );
    const explicitDuration = scheduled && draft.end_time
      ? durationBetweenRange(fallbackDay, fallbackTime, explicitEndDay, draft.end_time)
      : null;
    const durationMinutes = explicitDuration || parseDurationMinutes(draft.duration) || eventDurationMinutes({ id: 'draft', ...draft, day: fallbackDay, date: fallbackDate, time: fallbackTime });
    const endPatch = scheduled
      ? explicitDuration
        ? {
          end_day: explicitEndDay,
          end_date: explicitEndDate,
          end_time: draft.end_time,
        }
        : endFromStart(fallbackDay, fallbackDate, fallbackTime, durationMinutes, dateByDay)
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
      place_provider: draft.place_provider || 'manual',
      provider_place_id: draft.provider_place_id || '',
      coord_system: draft.coord_system || 'wgs84',
      day: fallbackDay,
      date: fallbackDate,
      time: fallbackTime,
      ...endPatch,
      duration: scheduled ? formatDurationText(durationMinutes) : draft.duration,
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
      departure_place_provider: 'manual',
      departure_provider_place_id: '',
      arrival_place_provider: 'manual',
      arrival_provider_place_id: '',
    };
  };
  const reset = ({ cleanupPending = true, kind = 'point', time = '12:00', scheduled = false }: { cleanupPending?: boolean; kind?: 'point' | 'transport'; time?: string; scheduled?: boolean } = {}) => {
    if (cleanupPending) cleanupPendingUploads();
    setEditorOpen(false);
    const base = {
      ...emptyForm({ day: currentDay, date: currentDate, time, kind, scheduled }),
      timezone: currentDayTimezone,
      departure_timezone: currentDayTimezone,
      arrival_timezone: currentDayTimezone,
    };
    const pointDuration = defaultDurationForNode(base) || SLOT_MINUTES;
    setEditorMode('item');
    setEditingLodgingId(null);
    setEditingStayId(null);
    setEditingId(null);
    setActiveEdgeId(null);
    setForm(kind === 'point' && scheduled
      ? { ...base, duration: formatDurationText(pointDuration), ...endFromStart(currentDay, currentDate, time, pointDuration, dateByDay) }
      : base);
    setImageUrlInput('');
    setPendingUploadUrls([]);
  };

  const setLodgingEditor = (lodging: Lodging, stay: Stay, options: { editingLodgingId?: string | null; editingStayId?: string | null } = {}) => {
    cleanupPendingUploads();
    setEditorOpen(true);
    setEditorMode('lodging');
    setEditingId(null);
    setActiveNodeId(null);
    setActiveEdgeId(null);
    setEditingLodgingId(options.editingLodgingId ?? lodging.id);
    setEditingStayId(options.editingStayId ?? stay.id);
    setLodgingForm({
      ...emptyLodgingDraft({ id: lodging.id, timezone: lodging.timezone || currentDayTimezone }),
      ...lodging,
      image_urls: lodging.image_urls?.length ? lodging.image_urls : lodging.image_url ? [lodging.image_url] : [],
      booking_site: lodging.booking_site || '爱彼迎',
      coord_system: lodging.coord_system || 'wgs84',
      place_provider: lodging.place_provider || 'manual',
      provider_place_id: lodging.provider_place_id || '',
    });
    setStayForm({
      ...emptyStayDraft({
        id: stay.id,
        lodgingId: lodging.id,
        day: stay.check_in_day || currentDay,
        date: stay.check_in_date || currentDate,
      }),
      ...stay,
      lodging_id: lodging.id,
      status: stay.status || 'planned',
    });
    setImageUrlInput('');
    setPendingUploadUrls([]);
  };

  const startNewLodging = () => {
    const lodging = emptyLodgingDraft({ timezone: currentDayTimezone });
    const stay = emptyStayDraft({ lodgingId: lodging.id, day: currentDay, date: currentDate });
    setLodgingEditor(lodging, stay, { editingLodgingId: null, editingStayId: null });
  };

  const arrangeLodging = (lodging: Lodging) => {
    const stay = emptyStayDraft({ lodgingId: lodging.id, day: currentDay, date: currentDate });
    setLodgingEditor(lodging, stay, { editingLodgingId: lodging.id, editingStayId: null });
  };

  const editStay = (stay: Stay) => {
    const lodging = lodgingById.get(stay.lodging_id);
    if (!lodging) return;
    setLodgingEditor(lodging, stay, { editingLodgingId: lodging.id, editingStayId: stay.id });
    setActiveDay(stay.check_in_day || currentDay);
  };

  const lodgingStaysFor = (lodgingId: string) => (staysByLodgingId[lodgingId] || [])
    .slice()
    .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date) || a.check_in_time.localeCompare(b.check_in_time));

  const preferredStayForLodging = (lodging: Lodging) => {
    const lodgingStays = lodgingStaysFor(lodging.id);
    return lodgingStays.find((stay) => stay.check_in_day <= currentDay && stay.check_out_day >= currentDay)
      || lodgingStays.find((stay) => stay.check_in_day >= currentDay)
      || lodgingStays.at(-1)
      || null;
  };

  const openLodging = (lodging: Lodging) => {
    const stay = preferredStayForLodging(lodging);
    if (stay) {
      editStay(stay);
      return;
    }
    arrangeLodging(lodging);
  };

  const updateStayCheckInDate = (date: string) => {
    setStayForm((current) => {
      const nextDay = dayForDate(date, dateByDay, trip?.start_date) || current.check_in_day || currentDay;
      const checkOutDate = current.check_out_date && dateDeltaDays(date, current.check_out_date) != null && (dateDeltaDays(date, current.check_out_date) || 0) > 0
        ? current.check_out_date
        : addDays(date, 1);
      const checkOutDay = dayForDate(checkOutDate, dateByDay, trip?.start_date) || nextDay + 1;
      return { ...current, check_in_date: date, check_in_day: nextDay, check_out_date: checkOutDate, check_out_day: checkOutDay };
    });
  };

  const updateStayCheckOutDate = (date: string) => {
    setStayForm((current) => {
      const checkInDate = current.check_in_date || currentDate;
      const checkOutDate = (dateDeltaDays(checkInDate, date) || 0) > 0 ? date : addDays(checkInDate, 1);
      const checkInDay = dayForDate(checkInDate, dateByDay, trip?.start_date) || current.check_in_day || currentDay;
      const checkOutDay = dayForDate(checkOutDate, dateByDay, trip?.start_date) || checkInDay + 1;
      return {
        ...current,
        check_out_date: checkOutDate,
        check_out_day: Math.max(checkInDay, checkOutDay),
      };
    });
  };
  const submitLodgingStay = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = lodgingForm.name.trim();
    if (!name) {
      toast('请填写住宿名称');
      return;
    }
    try {
      const lodgingPayload: Lodging = {
        ...lodgingForm,
        name,
        address: lodgingForm.address || lodgingForm.city || '',
        timezone: normaliseTimeZone(lodgingForm.timezone || currentDayTimezone),
        booking_site: lodgingForm.booking_site || '爱彼迎',
        image_url: lodgingForm.image_urls?.[0] || lodgingForm.image_url || '',
        image_urls: lodgingForm.image_urls || [],
        place_provider: lodgingForm.place_provider || 'manual',
        provider_place_id: lodgingForm.provider_place_id || '',
        coord_system: lodgingForm.coord_system || 'wgs84',
      };
      const stayPayload: Stay = {
        ...displayedStayForm,
        lodging_id: lodgingPayload.id,
        status: stayForm.status || 'planned',
      };
      await saveLodging(lodgingPayload);
      await saveStay(stayPayload);
      setEditingLodgingId(lodgingPayload.id);
      setEditingStayId(stayPayload.id);
      setLodgingForm(lodgingPayload);
      setStayForm(stayPayload);
      setPendingUploadUrls([]);
      setEditorOpen(false);
      toast(editingStayId ? `已保存住宿：${name}` : `已安排住宿：${name}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : '住宿保存失败，请检查输入内容');
    }
  };

  const deleteEditingStay = async () => {
    if (!editingStayId) return;
    if (!window.confirm('删除这个入住区间？住宿资料会保留，可重新安排。')) return;
    try {
      await deleteStay(editingStayId);
      toast('已删除入住区间');
      arrangeLodging(lodgingForm);
    } catch {
      toast('删除入住区间失败，请重试');
    }
  };

  const deleteEditingLodging = async () => {
    if (!editingLodgingId) return;
    if (!window.confirm(`删除住宿“${lodgingForm.name}”及其入住区间？`)) return;
    try {
      await deleteLodging(editingLodgingId);
      toast(`已删除住宿：${lodgingForm.name}`);
      reset({ cleanupPending: false });
    } catch {
      toast('删除住宿失败，请重试');
    }
  };

  const edit = (node: ItineraryNode, focusDay?: number) => {
    cleanupPendingUploads();
    const { id, ...values } = node;
    const scheduled = isScheduledNode(node);
    const kind = node.type === 'transport' ? 'transport' : 'point';
    setEditorMode('item');
    setEditorOpen(true);
    setEditingLodgingId(null);
    setEditingStayId(null);
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
    if (scheduled) setActiveDay(focusDay || node.day);
    setActiveNodeId(node.id);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editingEdge) {
      await submitEdge();
      return;
    }
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

  const submitEdge = async () => {
    if (!editingEdge) return;
    try {
      await updateEdge(editingEdge.id, {
        transportType: edgeDraft.transportType,
        displayStatus: edgeDraft.displayStatus,
        isManual: true,
        isLocked: edgeDraft.isLocked,
      });
      setActiveEdgeId(null);
      setEditorOpen(false);
      toast(`已更新路段：${edgeTransportLabel(edgeDraft.transportType)}`);
    } catch {
      toast('路段保存失败，请检查路线服务');
    }
  };

  const followAutoRoute = async () => {
    if (!editingEdge) return;
    const autoTransportType = defaultEdgeTransportType(
      editingEdgeSource,
      editingEdgeTarget,
      editingEdge.sourceAnchor,
      editingEdge.targetAnchor,
    );
    try {
      await updateEdge(editingEdge.id, {
        transportType: autoTransportType,
        displayStatus: edgeDraft.displayStatus,
        isManual: false,
        isLocked: false,
      });
      setEdgeDraft((current) => ({ ...current, transportType: autoTransportType, isLocked: false }));
      toast('该路段已改为跟随自动重建');
    } catch {
      toast('路段更新失败，请重试');
    }
  };

  const updateImageUrls = (target: ImageTarget, updater: (images: string[]) => string[]) => {
    if (target === 'lodging') {
      setLodgingForm((current) => {
        const next = updater(current.image_urls || []);
        return { ...current, image_url: next[0] || '', image_urls: next };
      });
      return;
    }

    setForm((current) => {
      const next = updater(current.image_urls || []);
      return { ...current, image_url: next[0] || '', image_urls: next };
    });
  };

  const uploadImage = async (file: File, target: ImageTarget = editorMode === 'lodging' ? 'lodging' : 'item') => {
    if (!selectedTripSlug || !file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const data = new FormData();
      data.append('image', file);
      const response = await fetch(`/api/trips/${selectedTripSlug}/images`, { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '图片上传失败');
      addImageUrl(result.url, target);
      setPendingUploadUrls((current) => current.includes(result.url) ? current : [...current, result.url]);
      toast('图片已上传');
    } catch (error) {
      toast(error instanceof Error ? error.message : '图片上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addImageUrl = (value = imageUrlInput, target: ImageTarget = editorMode === 'lodging' ? 'lodging' : 'item') => {
    const url = value.trim();
    if (!url) return;
    updateImageUrls(target, (images) => images.includes(url) ? images : [...images, url]);
    setImageUrlInput('');
  };

  const removeImage = (url: string, target: ImageTarget = editorMode === 'lodging' ? 'lodging' : 'item') => {
    updateImageUrls(target, (images) => images.filter((image) => image !== url));
    if (pendingUploadUrls.includes(url)) {
      setPendingUploadUrls((current) => current.filter((image) => image !== url));
      void cleanupUploadedImage(url);
    }
  };

  const pasteImage = async (event: React.ClipboardEvent<HTMLElement>, target: ImageTarget = editorMode === 'lodging' ? 'lodging' : 'item') => {
    for (let index = 0; index < event.clipboardData.items.length; index += 1) {
      const item = event.clipboardData.items[index];
      const file = item.kind === 'file' && item.type.startsWith('image/') ? item.getAsFile() : null;
      if (file) {
        event.preventDefault();
        await uploadImage(file, target);
        break;
      }
    }
  };
  const pointerOffsetInEventMinutes = (event: React.DragEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.height) return 0;
    const offsetY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    return (offsetY / SLOT_HEIGHT) * SLOT_MINUTES;
  };

  const setTransparentDragImage = (event: React.DragEvent<HTMLElement>) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    event.dataTransfer.setDragImage(canvas, 0, 0);
  };

  const beginDrag = (
    event: React.DragEvent<HTMLElement>,
    node: ItineraryNode,
    segmentOffsetMinutes = 0,
    visibleStartMinutes: number | null = null,
  ) => {
    if (node.type === 'transport') {
      event.preventDefault();
      toast('交通项目不可拖动修改，请删除后重新录入');
      return;
    }
    if (node.type === 'hotel') {
      event.preventDefault();
      toast('住宿请在右侧编辑入住区间');
      return;
    }
    const pointerOffsetMinutes = pointerOffsetInEventMinutes(event);
    event.dataTransfer.effectAllowed = 'move';
    setTransparentDragImage(event);
    event.dataTransfer.setData('application/x-itinerary-node', node.id);
    event.dataTransfer.setData('application/x-itinerary-segment-offset', String(Math.max(0, Math.round(segmentOffsetMinutes))));
    event.dataTransfer.setData('application/x-itinerary-pointer-offset', String(Math.max(0, Math.round(pointerOffsetMinutes))));
    if (visibleStartMinutes != null) {
      const startVisible = Math.max(START_MINUTES, Math.round(visibleStartMinutes));
      const originPointer = minutesFromSchedulePointer(event.clientY, startVisible + pointerOffsetMinutes);
      event.dataTransfer.setData('application/x-itinerary-drag-start-visible', String(startVisible));
      event.dataTransfer.setData('application/x-itinerary-drag-origin-pointer', String(originPointer));
      draggedStartVisibleRef.current = startVisible;
      draggedOriginPointerRef.current = originPointer;
    } else {
      draggedStartVisibleRef.current = null;
      draggedOriginPointerRef.current = null;
    }
    event.dataTransfer.setData('text/plain', node.id);
    draggedSegmentOffsetRef.current = Math.max(0, Math.round(segmentOffsetMinutes));
    draggedPointerOffsetRef.current = Math.max(0, Math.round(pointerOffsetMinutes));
    setDragPreview(null);
    setDraggedNodeId(node.id);
  };

  const scheduleNode = async (nodeId: string, startAbsolute: number, visibleDay = currentDay) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return;
    if (node.type === 'transport') {
      toast('交通项目不可拖动修改，请删除后重新录入');
      return;
    }
    if (node.type === 'hotel') {
      toast('住宿请在右侧编辑入住区间');
      return;
    }

    const duration = eventDurationMinutes(node);
    const nextStartAbsolute = Math.max(0, Math.round(startAbsolute));
    const startDay = Math.floor(nextStartAbsolute / END_MINUTES) + 1;
    const startMinutes = nextStartAbsolute % END_MINUTES;
    const startTime = formatTime(startMinutes);
    const date = dateByDay.get(startDay) || (trip?.start_date ? addDays(trip.start_date, startDay - 1) : node.date || currentDate);
    const patch: Partial<ItineraryNode> = {
      day: startDay,
      date,
      time: startTime,
      timezone: normaliseTimeZone(node.timezone || inferTimeZoneFromLocation({
        place: node.title,
        city: node.city,
        address: node.address,
        lat: node.lat,
        lng: node.lng,
        fallback: dayTimeZones.get(startDay) || currentDayTimezone,
      })),
      ...endFromStart(startDay, date, startTime, duration, dateByDay),
      duration: formatDurationText(duration),
      status: node.status === 'unscheduled' ? 'planned' : node.status,
    };

    setActiveDay(visibleDay);
    setActiveNodeId(nodeId);
    if (editingId === nodeId) setForm((current) => ({ ...current, ...patch }));
    toast(`已移动：${node.title} · D${startDay} ${startTime}，正在同步`);

    try {
      await updateNode(nodeId, patch);
    } catch {
      toast('拖拽排期失败，已恢复原位置');
    }
  };

  const minutesFromSchedulePointer = (clientY: number, fallbackMinutes: number) => {
    const rect = scheduleGridRef.current?.getBoundingClientRect();
    if (!rect) return fallbackMinutes;
    const offsetY = Math.max(0, Math.min(rect.height, clientY - rect.top));
    return START_MINUTES + (offsetY / SLOT_HEIGHT) * SLOT_MINUTES;
  };

  const nearestScheduleBoundary = (
    minutes: number,
    movingNodeId: string,
    boundary: 'start' | 'end',
    options: { min?: number; max?: number; approachFrom?: 'before' | 'after' | 'either' } = {},
  ) => {
    let nearest: { minutes: number; distance: number } | null = null;
    const min = options.min ?? START_MINUTES;
    const max = options.max ?? END_MINUTES;
    const approachFrom = options.approachFrom ?? 'either';
    scheduleEvents.forEach((scheduleEvent) => {
      if (scheduleEvent.node.id === movingNodeId) return;
      const candidate = scheduleEvent[boundary];
      if (candidate <= START_MINUTES || candidate >= END_MINUTES) return;
      if (candidate < min || candidate > max) return;
      const delta = minutes - candidate;
      const distance = Math.abs(delta);
      const threshold = approachFrom === 'before'
        ? (delta <= 0 ? CONNECTION_APPROACH_THRESHOLD_MINUTES : CONNECTION_RELEASE_THRESHOLD_MINUTES)
        : approachFrom === 'after'
          ? (delta >= 0 ? CONNECTION_APPROACH_THRESHOLD_MINUTES : CONNECTION_RELEASE_THRESHOLD_MINUTES)
          : CONNECTION_APPROACH_THRESHOLD_MINUTES;
      if (distance >= threshold && distance !== 0) return;
      if (!nearest || distance < nearest.distance) nearest = { minutes: candidate, distance };
    });
    return nearest?.minutes ?? null;
  };

  const snapSchedulePlacement = (pointerMinutes: number, movingNodeId: string, segmentOffsetMinutes = 0, pointerOffsetMinutes = 0) => {
    const node = nodes.find((item) => item.id === movingNodeId);
    const duration = node ? eventDurationMinutes(node) : SLOT_MINUTES;
    const safeSegmentOffset = Math.max(0, Math.round(segmentOffsetMinutes));
    const safePointerOffset = Math.max(0, Math.round(pointerOffsetMinutes));
    const dayStartAbsolute = (currentDay - 1) * END_MINUTES;
    const rawVisibleStart = Math.max(START_MINUTES, Math.min(END_MINUTES, pointerMinutes - safePointerOffset));
    const rawStartAbsolute = dayStartAbsolute + rawVisibleStart - safeSegmentOffset;
    const rawVisibleEnd = rawStartAbsolute + duration - dayStartAbsolute;
    const snappedVisibleStart = snapScheduleMinutes(rawVisibleStart);
    const snappedStartAbsolute = dayStartAbsolute + snappedVisibleStart - safeSegmentOffset;
    const candidates: Array<{ startAbsolute: number; previewMinutes: number; distance: number }> = [];

    const connectedStart = nearestScheduleBoundary(rawVisibleStart, movingNodeId, 'end', { approachFrom: 'after' });
    if (connectedStart != null) {
      const connectedVisibleStart = Math.min(END_MINUTES - SCHEDULE_SNAP_MINUTES, connectedStart + CONNECTION_GAP_MINUTES);
      const startAbsolute = dayStartAbsolute + connectedVisibleStart - safeSegmentOffset;
      candidates.push({
        startAbsolute,
        previewMinutes: connectedVisibleStart,
        distance: Math.abs(connectedStart - rawVisibleStart),
      });
    }

    const connectedEnd = nearestScheduleBoundary(rawVisibleEnd, movingNodeId, 'start', {
      min: START_MINUTES + SLOT_MINUTES,
      approachFrom: 'before',
    });
    if (connectedEnd != null) {
      const connectedVisibleEnd = Math.max(START_MINUTES + SLOT_MINUTES, connectedEnd - CONNECTION_GAP_MINUTES);
      const startAbsolute = dayStartAbsolute + connectedVisibleEnd - duration;
      const previewMinutes = startAbsolute + safeSegmentOffset - dayStartAbsolute;
      if (previewMinutes >= START_MINUTES && previewMinutes <= END_MINUTES - SCHEDULE_SNAP_MINUTES) {
        candidates.push({
          startAbsolute,
          previewMinutes,
          distance: Math.abs(connectedEnd - rawVisibleEnd),
        });
      }
    }

    const connected = candidates.sort((left, right) => left.distance - right.distance)[0];
    if (connected) {
      return {
        startAbsolute: Math.max(0, connected.startAbsolute),
        minutes: Math.max(START_MINUTES, Math.min(END_MINUTES - SCHEDULE_SNAP_MINUTES, connected.previewMinutes)),
        connected: true,
      };
    }

    return {
      startAbsolute: Math.max(0, snappedStartAbsolute),
      minutes: snappedVisibleStart,
      connected: false,
    };
  };

  const snapScheduleDuration = (
    visibleStart: number,
    segmentOffsetMinutes: number,
    rawDuration: number,
    maxDuration: number,
    movingNodeId: string,
  ) => {
    const segmentOffset = Math.max(0, Math.round(segmentOffsetMinutes));
    const rawEnd = visibleStart + clampDurationRange(rawDuration, maxDuration) - segmentOffset;
    const snappedDuration = clampDurationMinutes(rawDuration, maxDuration);
    const connectedEnd = nearestScheduleBoundary(rawEnd, movingNodeId, 'start', {
      min: visibleStart + SLOT_MINUTES,
      approachFrom: 'before',
    });
    if (connectedEnd != null && connectedEnd > visibleStart) {
      return Math.max(
        SLOT_MINUTES,
        Math.min(maxDuration, segmentOffset + connectedEnd - visibleStart - CONNECTION_GAP_MINUTES),
      );
    }
    return snappedDuration;
  };

  const getDraggedNodeId = (event: React.DragEvent<HTMLElement>) =>
    event.dataTransfer.getData('application/x-itinerary-node') || event.dataTransfer.getData('text/plain') || draggedNodeId || '';

  const getDraggedSegmentOffset = (event: React.DragEvent<HTMLElement>) => {
    const raw = event.dataTransfer.getData('application/x-itinerary-segment-offset');
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : draggedSegmentOffsetRef.current;
  };

  const getDraggedPointerOffset = (event: React.DragEvent<HTMLElement>) => {
    const raw = event.dataTransfer.getData('application/x-itinerary-pointer-offset');
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : draggedPointerOffsetRef.current;
  };

  const getDraggedStartVisible = (event: React.DragEvent<HTMLElement>) => {
    const raw = event.dataTransfer.getData('application/x-itinerary-drag-start-visible');
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(START_MINUTES, parsed) : draggedStartVisibleRef.current;
  };

  const getDraggedOriginPointer = (event: React.DragEvent<HTMLElement>) => {
    const raw = event.dataTransfer.getData('application/x-itinerary-drag-origin-pointer');
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : draggedOriginPointerRef.current;
  };

  const scheduleDragPlacementInput = (event: React.DragEvent<HTMLElement>) => {
    const pointerMinutes = minutesFromSchedulePointer(event.clientY, START_MINUTES);
    const startVisible = getDraggedStartVisible(event);
    const originPointer = getDraggedOriginPointer(event);
    if (startVisible != null && originPointer != null) {
      return {
        rawMinutes: startVisible + pointerMinutes - originPointer,
        pointerOffsetMinutes: 0,
      };
    }
    return {
      rawMinutes: pointerMinutes,
      pointerOffsetMinutes: getDraggedPointerOffset(event),
    };
  };

  const previewScheduleStart = (rawMinutes: number, movingNodeId: string, segmentOffsetMinutes = 0, pointerOffsetMinutes = 0) =>
    snapSchedulePlacement(rawMinutes, movingNodeId, segmentOffsetMinutes, pointerOffsetMinutes);

  const createScheduleDragPreview = (
    rawMinutes: number,
    movingNodeId: string,
    segmentOffsetMinutes = 0,
    pointerOffsetMinutes = 0,
  ): ScheduleDragPreview | null => {
    const node = nodes.find((item) => item.id === movingNodeId);
    if (!node) return null;
    const placement = previewScheduleStart(rawMinutes, movingNodeId, segmentOffsetMinutes, pointerOffsetMinutes);
    const segmentOffset = Math.max(0, Math.round(segmentOffsetMinutes));
    const duration = eventDurationMinutes(node);
    const dayStartAbsolute = (currentDay - 1) * END_MINUTES;
    const visibleStart = Math.max(START_MINUTES, Math.min(END_MINUTES - SLOT_MINUTES, placement.minutes));
    const fullEndAbsolute = placement.startAbsolute + duration;
    const visibleEndAbsolute = Math.min(dayStartAbsolute + END_MINUTES, fullEndAbsolute);
    const visibleEnd = Math.max(
      visibleStart + SLOT_MINUTES,
      Math.min(END_MINUTES, visibleEndAbsolute - dayStartAbsolute),
    );
    const visibleDuration = Math.max(SLOT_MINUTES, duration - segmentOffset);

    return {
      nodeId: movingNodeId,
      visibleDay: currentDay,
      startAbsolute: placement.startAbsolute,
      start: visibleStart,
      end: visibleEnd,
      connected: placement.connected,
      title: node.title || '未命名项目',
      detail: nodeScheduleDetailText(node),
      durationText: node.duration || formatDurationText(Math.min(duration, visibleDuration)),
    };
  };

  const maxDurationFromNodeStart = (node: ItineraryNode) => {
    const lastDay = Math.max(...dayNumbers, node.end_day || node.day || currentDay);
    const startAbsolute = (Math.max(1, node.day || currentDay) - 1) * END_MINUTES + parseTime(node.time);
    const tripEndAbsolute = lastDay * END_MINUTES;
    return Math.max(SLOT_MINUTES, tripEndAbsolute - startAbsolute);
  };

  const handleScheduleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    const nodeId = getDraggedNodeId(event);
    if (!nodeId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const placementInput = scheduleDragPlacementInput(event);
    const nextPreview = createScheduleDragPreview(
      placementInput.rawMinutes,
      nodeId,
      getDraggedSegmentOffset(event),
      placementInput.pointerOffsetMinutes,
    );
    if (!nextPreview) return;
    dragPreviewRef.current = nextPreview;
    setDragPreview((current) =>
      current?.nodeId === nextPreview.nodeId &&
      current.visibleDay === nextPreview.visibleDay &&
      current.startAbsolute === nextPreview.startAbsolute &&
      current.start === nextPreview.start &&
      current.end === nextPreview.end &&
      current.connected === nextPreview.connected
        ? current
        : nextPreview,
    );
  };

  const beginResizeDuration = (
    event: React.PointerEvent<HTMLElement>,
    node: ItineraryNode,
    segmentStart = parseTime(node.time),
    segmentOffsetMinutes = 0,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (node.type === 'transport') return;

    const startDuration = eventDurationMinutes(node);
    const maxDuration = maxDurationFromNodeStart(node);
    const initialDuration = clampDurationRange(startDuration, maxDuration);
    resizeStateRef.current = {
      node,
      startY: event.clientY,
      startDuration: initialDuration,
      latestDuration: initialDuration,
      maxDuration,
      segmentStart,
      segmentOffset: Math.max(0, Math.round(segmentOffsetMinutes)),
    };
    setResizeDraft({ nodeId: node.id, duration: initialDuration });

    const handleMove = (moveEvent: PointerEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;
      const deltaMinutes = ((moveEvent.clientY - state.startY) / SLOT_HEIGHT) * SLOT_MINUTES;
      const nextDuration = snapScheduleDuration(
        state.segmentStart,
        state.segmentOffset,
        state.startDuration + deltaMinutes,
        state.maxDuration,
        state.node.id,
      );
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
      clearDragPreview();
      return;
    }
    const latestPreview = dragPreviewRef.current;
    const placementInput = scheduleDragPlacementInput(event);
    const placement = latestPreview?.nodeId === nodeId && latestPreview.visibleDay === currentDay
      ? { startAbsolute: latestPreview.startAbsolute }
      : previewScheduleStart(
        placementInput.rawMinutes,
        nodeId,
        getDraggedSegmentOffset(event),
        placementInput.pointerOffsetMinutes,
      );
    void scheduleNode(
      nodeId,
      placement.startAbsolute,
      currentDay,
    );
    setDraggedNodeId(null);
    draggedSegmentOffsetRef.current = 0;
    draggedPointerOffsetRef.current = 0;
    draggedStartVisibleRef.current = null;
    draggedOriginPointerRef.current = null;
    clearDragPreview();
  };

  const unscheduleNode = async (nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node || node.type === 'transport' || node.type === 'hotel') return;
    if (!isScheduledNode(node)) return;

    const patch: Partial<ItineraryNode> = {
      day: node.day || currentDay,
      date: node.date || currentDate,
      time: node.time || '12:00',
      end_day: 0,
      end_date: '',
      end_time: '',
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
    draggedSegmentOffsetRef.current = 0;
    draggedPointerOffsetRef.current = 0;
    draggedStartVisibleRef.current = null;
    draggedOriginPointerRef.current = null;
    clearDragPreview();
    if (!nodeId) return;
    void unscheduleNode(nodeId);
  };

  const startNew = (kind: 'point' | 'transport', time = '12:00', scheduled = kind === 'transport') => {
    setEditorMode('item');
    setEditingLodgingId(null);
    setEditingStayId(null);
    reset({ kind, time, scheduled });
    setEditorOpen(true);
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

  const editorTitle = editingEdge
    ? '路段设置'
    : editorMode === 'lodging'
      ? editingStayId
        ? '编辑住宿'
        : editingLodgingId
          ? '安排住宿'
          : '新增住宿'
      : form.type === 'transport'
        ? editingId
          ? '编辑交通'
          : '新增交通'
        : editingId
          ? '编辑地点'
          : '新增地点';

  const editorSubtitle = editingEdge
    ? `${editingEdgeSource?.title || '起点'} → ${editingEdgeTarget?.title || '终点'}`
    : editorMode === 'lodging'
      ? `${editingStayId ? '入住区间' : '新增入住'} · ${stayCheckInDate} ${stayForm.check_in_time || '15:00'} → ${stayCheckOutDate} ${stayForm.check_out_time || '11:00'}`
      : form.type === 'transport'
        ? `交通 · ${form.date || currentDate} · ${form.time || '12:00'}`
        : isScheduledNode({ id: editingId || 'draft', ...form })
          ? `地点 · 已排期 ${form.date} · ${form.time}`
          : '地点 · 待排期';

  const lodgingLocationPanel = (
    <aside className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/45 p-3 shadow-inner shadow-emerald-100/40">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-black text-emerald-700">
            <MapPin className="h-4 w-4" />地图定位
          </div>
          <div className="mt-1 truncate text-[10px] font-semibold text-slate-500">
            {lodgingForm.city || lodgingForm.address || lodgingForm.name || '住宿位置'}
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-100 bg-white/80 px-2 py-1 text-[9px] font-black text-emerald-700">
          住宿
        </span>
      </div>
      <LocationPicker provider={mapProvider} value={{ lat: lodgingForm.lat, lng: lodgingForm.lng, city: lodgingForm.city, address: lodgingForm.address, title: lodgingForm.name, place_provider: lodgingForm.place_provider, provider_place_id: lodgingForm.provider_place_id, coord_system: lodgingForm.coord_system }} onChange={(location) => setLodgingForm((current) => ({ ...current, lat: location.lat, lng: location.lng, city: location.city ?? current.city, address: location.address ?? current.address, name: current.name || location.title || '', place_provider: location.place_provider || current.place_provider || 'manual', provider_place_id: location.provider_place_id || current.provider_place_id || '', coord_system: location.coord_system || current.coord_system || 'wgs84', timezone: inferTimeZoneFromLocation({ place: location.title || current.name, city: location.city, address: location.address, lat: location.lat, lng: location.lng, fallback: current.timezone || currentDayTimezone }) }))} />
    </aside>
  );

  const transportLocationPanel = (
    <aside className="space-y-3">
      <div className="rounded-2xl border border-sky-100 bg-sky-50/55 p-3 shadow-inner shadow-sky-100/40">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs font-black text-sky-700">
            <ArrowRight className="h-4 w-4 rotate-180" />出发地
          </div>
          <span className="rounded-full border border-sky-100 bg-white/80 px-2 py-1 text-[9px] font-black text-sky-700">
            起点
          </span>
        </div>
        <label className="mb-2 block text-xs font-semibold text-slate-700">
          <input required value={form.departure_place} onChange={(event) => setForm({ ...form, departure_place: event.target.value })} placeholder="机场、车站或集合点" className={inputClass} />
        </label>
        <LocationPicker compact provider={mapProvider} value={{ lat: form.departure_lat ?? form.lat, lng: form.departure_lng ?? form.lng, title: form.departure_place }} onChange={(location) => setForm((current) => ({
          ...current,
          departure_place: location.title || current.departure_place,
          departure_lat: location.lat,
          departure_lng: location.lng,
          coord_system: location.coord_system || current.coord_system || 'wgs84',
          departure_place_provider: location.place_provider || current.departure_place_provider || 'manual',
          departure_provider_place_id: location.provider_place_id || current.departure_provider_place_id || '',
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

      <div className="rounded-2xl border border-sky-100 bg-white/70 p-3 shadow-inner shadow-sky-100/30">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs font-black text-sky-700">
            <ArrowRight className="h-4 w-4" />到达地
          </div>
          <span className="rounded-full border border-sky-100 bg-sky-50 px-2 py-1 text-[9px] font-black text-sky-700">
            终点
          </span>
        </div>
        <label className="mb-2 block text-xs font-semibold text-slate-700">
          <input required value={form.arrival_place} onChange={(event) => setForm({ ...form, arrival_place: event.target.value })} placeholder="机场、车站或目的地" className={inputClass} />
        </label>
        <LocationPicker compact provider={mapProvider} value={{ lat: form.arrival_lat ?? form.lat, lng: form.arrival_lng ?? form.lng, title: form.arrival_place }} onChange={(location) => setForm((current) => {
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
            coord_system: location.coord_system || current.coord_system || 'wgs84',
            arrival_place_provider: location.place_provider || current.arrival_place_provider || 'manual',
            arrival_provider_place_id: location.provider_place_id || current.arrival_provider_place_id || '',
          };
        })} />
      </div>
    </aside>
  );

  const pointLocationPanel = (
    <aside className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/45 p-3 shadow-inner shadow-indigo-100/40">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-black text-indigo-700">
            <MapPin className="h-4 w-4" />地图定位
          </div>
          <div className="mt-1 truncate text-[10px] font-semibold text-slate-500">
            {form.city || form.address || form.title || '地点位置'}
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-indigo-100 bg-white/80 px-2 py-1 text-[9px] font-black text-indigo-700">
          {activitySubtypeLabels[activitySubtypeOf(form)]}
        </span>
      </div>
      <LocationPicker provider={mapProvider} value={{ lat: form.lat, lng: form.lng, city: form.city, address: form.address, title: form.title, place_provider: form.place_provider, provider_place_id: form.provider_place_id, coord_system: form.coord_system }} onChange={(location) => setForm((current) => ({ ...current, lat: location.lat, lng: location.lng, city: location.city ?? current.city, address: location.address ?? current.address, title: current.title || location.title || '', place_provider: location.place_provider || current.place_provider || 'manual', provider_place_id: location.provider_place_id || current.provider_place_id || '', coord_system: location.coord_system || current.coord_system || 'wgs84', timezone: inferTimeZoneFromLocation({ place: location.title || current.title, city: location.city, address: location.address, lat: location.lat, lng: location.lng, fallback: current.timezone || currentDayTimezone }) }))} />
    </aside>
  );

  const editorLocationPanel = editingEdge
    ? null
    : editorMode === 'lodging'
      ? lodgingLocationPanel
      : form.type === 'transport'
        ? transportLocationPanel
        : pointLocationPanel;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {message && <div className="fixed left-1/2 top-20 z-[10000] -translate-x-1/2 rounded-xl bg-slate-900 px-5 py-3 text-xs font-semibold text-white shadow-2xl" role="status" aria-live="polite">{message}</div>}

      <div className="mb-3 grid shrink-0 grid-cols-2 rounded-xl border border-white/70 bg-white/55 p-1 shadow-sm backdrop-blur-xl xl:hidden" role="tablist" aria-label="编辑行程面板">
        <button
          type="button"
          role="tab"
          aria-selected={compactPanel === 'library'}
          onClick={() => setCompactPanel('library')}
          className={`min-h-11 rounded-lg px-3 text-xs font-black transition ${compactPanel === 'library' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}
        >
          项目库 · {libraryNodes.length}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={compactPanel === 'schedule'}
          onClick={() => setCompactPanel('schedule')}
          className={`min-h-11 rounded-lg px-3 text-xs font-black transition ${compactPanel === 'schedule' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}
        >
          D{currentDay} 时间表
        </button>
      </div>

      <div className="grid min-h-0 w-full flex-1 grid-cols-1 gap-4 overflow-hidden xl:grid-cols-[360px_minmax(520px,1fr)] 2xl:grid-cols-[440px_minmax(680px,1fr)]">
        <aside
          onDragOver={(event) => {
            if (!canDropToLibrary) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={handleLibraryDrop}
          className={`${compactPanel === 'library' ? 'flex' : 'hidden'} h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/50 p-3 shadow-lg backdrop-blur-xl transition xl:flex ${canDropToLibrary ? 'ring-2 ring-indigo-300/60' : ''}`}
        >
          <div className="mb-3 shrink-0 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-slate-900">项目库</h3>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                  {filteredLibraryNodes.length} / {libraryNodes.length} 个待排期 · {filteredLodgings.length} / {lodgings.length} 个住宿
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
            {filteredLodgings.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-black text-emerald-700">住宿库</span>
                  <button
                    type="button"
                    onClick={startNewLodging}
                    className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-700 transition hover:bg-emerald-100"
                  >
                    <Plus className="mr-0.5 inline h-3 w-3" />住宿
                  </button>
                </div>
                {filteredLodgings.map((lodging) => {
                  const coverUrl = lodgingImageUrl(lodging);
                  const lodgingStays = lodgingStaysFor(lodging.id);
                  const hasStays = lodgingStays.length > 0;
                  return (
                    <article
                      key={lodging.id}
                      className={`rounded-xl border p-2.5 shadow-sm transition hover:bg-white ${editingLodgingId === lodging.id ? 'border-emerald-200 bg-emerald-50 ring-2 ring-emerald-300/30' : 'border-emerald-100 bg-emerald-50/65'}`}
                    >
                      <div className="flex items-stretch gap-3">
                        <button
                          type="button"
                          onClick={() => openLodging(lodging)}
                          className="relative h-[74px] w-[92px] shrink-0 overflow-hidden rounded-xl border border-white/70 bg-white/65 text-slate-400 transition hover:scale-[1.01]"
                          aria-label={`${hasStays ? '编辑' : '安排'}住宿 ${lodging.name}`}
                        >
                          {coverUrl ? (
                            <img src={coverUrl} {...responsiveImageProps(coverUrl, '96px')} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center">
                              <BedDouble className="h-6 w-6" />
                            </span>
                          )}
                          <span className="absolute left-1.5 top-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[8px] font-black text-emerald-700 shadow-sm">住宿</span>
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <button type="button" onClick={() => openLodging(lodging)} className="min-w-0 text-left">
                              <h4 className="truncate text-xs font-black text-slate-900">{lodging.name}</h4>
                              <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">
                                {lodging.city || lodging.address || '住宿地址待补充'}
                              </p>
                            </button>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openLodging(lodging)}
                                className="rounded-lg border border-white/80 bg-white px-2 py-1 text-[9px] font-black text-emerald-700 shadow-sm transition hover:border-emerald-200"
                              >
                                {hasStays ? '编辑' : '安排'}
                              </button>
                              {hasStays && (
                                <button
                                  type="button"
                                  onClick={() => arrangeLodging(lodging)}
                                  className="rounded-lg border border-emerald-100 bg-emerald-100/80 px-2 py-1 text-[9px] font-black text-emerald-700 transition hover:bg-emerald-200"
                                  aria-label={`新增 ${lodging.name} 的入住区间`}
                                >
                                  + 区间
                                </button>
                              )}
                            </div>
                          </div>
                          {lodgingStays.length > 0 ? (
                            <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
                              {lodgingStays.map((stay) => (
                                <button
                                  key={stay.id}
                                  type="button"
                                  onClick={() => editStay(stay)}
                                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-black transition ${editingStayId === stay.id ? 'border-emerald-300 bg-white text-emerald-700' : 'border-white/80 bg-white/70 text-slate-500 hover:text-emerald-700'}`}
                                >
                                  D{stay.check_in_day}-D{stay.check_out_day} · {stayDurationText(stay)}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-[9px] font-bold text-emerald-700/70">尚未安排入住区间</p>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {filteredLibraryNodes.map((node) => {
              const tone = itineraryTypeTone(node);
              const coverUrl = nodeImageUrl(node);
              const Icon = pointTypeOptions.find((option) => option.value === activitySubtypeOf(node))?.icon || MapPin;
              const nodeSyncing = syncingNodeIdSet.has(node.id);
              return (
                <article
                  key={node.id}
                  draggable={!nodeSyncing}
                  onDragStart={(event) => {
                    suppressLibraryClickRef.current = true;
                    beginDrag(event, node);
                  }}
                  onDragEnd={() => {
                    setDraggedNodeId(null);
                    draggedSegmentOffsetRef.current = 0;
                    draggedPointerOffsetRef.current = 0;
                    draggedStartVisibleRef.current = null;
                    draggedOriginPointerRef.current = null;
                    clearDragPreview();
                    window.setTimeout(() => {
                      suppressLibraryClickRef.current = false;
                    }, 80);
                  }}
                  onClick={() => {
                    if (suppressLibraryClickRef.current) return;
                    edit(node);
                  }}
                  className={`${nodeSyncing ? 'cursor-wait opacity-80' : 'cursor-grab active:cursor-grabbing'} rounded-xl border p-2.5 shadow-sm transition ${tone.card} hover:border-white hover:bg-white ${activeNodeId === node.id ? 'ring-2 ring-indigo-400/40' : ''} ${draggedNodeId === node.id ? 'opacity-45' : ''}`}
                >
                  <div className="flex items-stretch gap-3">
                    <div className="relative h-[74px] w-[92px] shrink-0 overflow-hidden rounded-xl border border-white/70 bg-white/65">
                      {coverUrl ? (
                        <img src={coverUrl} {...responsiveImageProps(coverUrl, '96px')} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Icon className="h-6 w-6 text-slate-400" />
                        </div>
                      )}
                      <span className={`absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[8px] font-black shadow-sm ${tone.badge}`}>
                        {itineraryTypeLabel(node)}
                      </span>
                      <span className="absolute bottom-1.5 left-1.5 rounded-full bg-slate-900/75 px-1.5 py-0.5 text-[8px] font-black text-white shadow-sm">
                        待排期
                      </span>
                      {nodeSyncing && (
                        <span className="absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-indigo-600 shadow-sm" title="Syncing">
                          <LoaderCircle className="h-3 w-3 animate-spin" />
                        </span>
                      )}
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
            {!filteredLibraryNodes.length && !filteredLodgings.length && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white/65 px-4 py-8 text-center">
                <Search className="mx-auto h-5 w-5 text-slate-300" />
                <p className="mt-2 text-xs font-bold text-slate-500">没有匹配的项目</p>
                <p className="mt-1 text-[10px] font-medium text-slate-400">调整搜索词或切换类型筛选</p>
              </div>
            )}
          </div>
        </aside>

        <section className={`${compactPanel === 'schedule' ? 'flex' : 'hidden'} h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/55 p-3 shadow-lg backdrop-blur-xl xl:flex`}>
          <div className="mb-3 flex shrink-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h3 className="text-sm font-black text-slate-900">按天时间表</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => startNew('point', '12:00', false)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-100 bg-white/80 px-3 py-2 text-[11px] font-black text-indigo-700 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50"
                >
                  <Plus className="h-3.5 w-3.5" />地点
                </button>
                <button
                  type="button"
                  onClick={() => startNew('transport', '12:00', true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-sky-100 bg-white/80 px-3 py-2 text-[11px] font-black text-sky-700 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-50"
                >
                  <Plus className="h-3.5 w-3.5" />交通
                </button>
                <button
                  type="button"
                  onClick={startNewLodging}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-100 bg-white/80 px-3 py-2 text-[11px] font-black text-emerald-700 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50"
                >
                  <Plus className="h-3.5 w-3.5" />住宿
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await autoConnectEdges();
                    toast('已重建地点之间的路线连线');
                  }}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-900 px-3 py-2 text-[11px] font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />重建路线
                </button>
              </div>
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

          {currentNightStays.length > 0 && (
            <div className="mb-3 grid shrink-0 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {currentNightStays.map(({ stay, lodging, nightIndex, nightCount }) => {
                const coverUrl = lodgingImageUrl(lodging);
                return (
                  <button
                    key={stay.id}
                    type="button"
                    onClick={() => editStay(stay)}
                    className={`group flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl border bg-gradient-to-br px-3 py-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${editingStayId === stay.id ? 'border-emerald-300 from-emerald-50 to-white ring-2 ring-emerald-300/30' : 'border-emerald-100 from-white to-emerald-50/70 hover:border-emerald-200'}`}
                  >
                    <span className="relative flex h-12 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-100 text-emerald-700 shadow-sm">
                      {coverUrl ? <img src={coverUrl} {...responsiveImageProps(coverUrl, '96px')} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <BedDouble className="h-5 w-5" />}
                      <span className="absolute inset-x-0 bottom-0 bg-slate-950/55 px-1 py-0.5 text-center text-[8px] font-black text-white">N{nightIndex}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 text-[9px] font-black text-emerald-700"><BedDouble className="h-3 w-3" />夜宿 · {stayDurationText(stay)}</span>
                      <span className="mt-0.5 block truncate text-xs font-black text-slate-900">{lodging.name}</span>
                      <span className="mt-0.5 block truncate text-[10px] font-bold text-slate-500">
                        第 {nightIndex} 晚 / 共 {nightCount} 晚 · {lodging.city || lodging.address || '地址待补充'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div ref={scheduleScrollRef} className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
            <div
              ref={scheduleGridRef}
              onDragOver={handleScheduleDragOver}
              onDrop={handleScheduleDrop}
              onDragLeave={(event) => {
                const nextTarget = event.relatedTarget;
                if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                  clearDragPreview();
                }
              }}
              className="admin-schedule-grid relative"
              style={{ height: slots.length * SLOT_HEIGHT }}
            >
              {slots.map((minutes) => (
                <div
                  key={minutes}
                  className="grid border-t border-slate-100 first:border-t-0"
                  style={{ gridTemplateColumns: 'var(--schedule-time-axis) var(--schedule-lodging-axis) minmax(0, 1fr)', height: SLOT_HEIGHT }}
                >
                  <div className="select-none border-r border-slate-100 pr-2 pt-1 text-right text-[9px] font-bold tabular-nums text-slate-400">
                    {minutes % 60 === 0 ? formatTime(minutes) : ''}
                  </div>
                  <button
                    type="button"
                    onClick={() => startNew('point', formatTime(minutes), true)}
                    className="col-start-3 h-full w-full text-left transition hover:bg-indigo-50/45"
                    aria-label={`${formatTime(minutes)} 拖入地点项目`}
                  />
                </div>
              ))}

              <div className="pointer-events-none absolute top-0 z-10 h-full border-r border-slate-200/90 bg-gradient-to-r from-slate-50/85 via-white/60 to-slate-50/45" style={{ left: 'var(--schedule-time-axis)', width: 'var(--schedule-lodging-axis)' }}>
                <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-emerald-100/70" />
                <span className="absolute inset-y-0 right-0 w-px bg-slate-200" />
              </div>

              <div className="pointer-events-none absolute top-0 z-20 px-1" style={{ left: 'var(--schedule-time-axis)', width: 'var(--schedule-lodging-axis)' }}>
                {currentLodgingBands.map((band) => {
                  const top = ((band.start - START_MINUTES) / SLOT_MINUTES) * SLOT_HEIGHT + 2;
                  const height = Math.max(30, ((band.end - band.start) / SLOT_MINUTES) * SLOT_HEIGHT - 4);
                  const compact = height < 58;
                  return (
                    <button
                      key={band.id}
                      type="button"
                      onClick={() => editStay(band.stay)}
                      className={`pointer-events-auto absolute inset-x-2 overflow-hidden rounded-lg border px-2 py-1.5 text-left shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-100/90 hover:shadow-md ${editingStayId === band.stay.id ? 'border-emerald-400 bg-emerald-100 text-emerald-950 ring-2 ring-emerald-300/35' : 'border-emerald-200/70 bg-emerald-50/85 text-emerald-800'}`}
                      style={{ top, height }}
                    >
                      <span className="absolute inset-y-2 left-1 w-1 rounded-full bg-emerald-400/45" />
                      <span className="relative z-10 flex min-w-0 items-center gap-1 pl-1 text-[8px] font-black text-emerald-700">
                        <BedDouble className="h-3 w-3 shrink-0 text-emerald-500" />
                        <span className="truncate">{compact ? '夜宿' : `${band.displayStart}-${band.displayEnd}`}</span>
                      </span>
                      {!compact && (
                        <span className="relative z-10 mt-1 block min-w-0 truncate pl-1 text-[9px] font-black leading-tight text-emerald-900">
                          {band.lodging.name}
                        </span>
                      )}
                      {height >= 82 && (
                        <span className="relative z-10 mt-1 block truncate pl-1 text-[8px] font-bold text-emerald-600/75">
                          第 {band.nightIndex} / {band.nightCount} 晚
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="pointer-events-none absolute right-3 top-0" style={{ left: 'calc(var(--schedule-time-axis) + var(--schedule-lodging-axis))' }}>
                {scheduleEvents.map((event) => {
                  const top = ((event.start - START_MINUTES) / SLOT_MINUTES) * SLOT_HEIGHT + 2;
                  const height = Math.max(28, ((event.end - event.start) / SLOT_MINUTES) * SLOT_HEIGHT - 4);
                  const width = 100 / event.lanes;
                  const left = event.lane * width;
                  const coverUrl = nodeImageUrl(event.node);
                  const Icon = event.node.type === 'transport'
                    ? transportModeOptions.find((option) => option.value === event.node.transport_mode)?.icon || Route
                    : pointTypeOptions.find((option) => option.value === activitySubtypeOf(event.node))?.icon || MapPin;
                  const showScheduleDetails = height >= 58;
                  const showScheduleThumb = height >= 74;
                  const nodeSyncing = syncingNodeIdSet.has(event.node.id);
                  const canDragEvent = !nodeSyncing && event.node.type !== 'transport';
                  const segmentOffsetMinutes = Math.max(
                    0,
                    (currentDay - 1) * END_MINUTES + event.start - nodeScheduleRange(event.node, dateByDay, trip?.start_date).startAbsolute,
                  );
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
                        onClick={() => edit(event.node, currentDay)}
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
                        <span
                          title="编辑"
                          onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            edit(event.node, currentDay);
                          }}
                          className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-white/70 bg-white/75 text-sky-700 shadow-sm backdrop-blur transition hover:bg-white"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </span>
                        {compactTransport ? (
                          <div className="relative z-10 flex h-full min-w-0 items-center gap-2 pl-2 pr-8">
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
                          <div className="relative z-10 flex h-full min-w-0 flex-col justify-between pl-2 pr-8">
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
                  const compactPointCard = height < 76;
                  const tinyPointCard = height < 46;
                  const narrowPointCard = event.lanes > 1;
                  const compactPointTimeText = event.segmentKind === 'single'
                    ? [event.displayStart, event.node.duration].filter(Boolean).join(' · ')
                    : `${event.displayStart}-${event.displayEnd}`;
                  const showCompactThumb = Boolean(coverUrl) && height >= 42 && (!narrowPointCard || height >= 58);
                  const showCompactDetail = height >= 42 && (!narrowPointCard || height >= 54);
                  const showCompactDescription = height >= 60 && !narrowPointCard && Boolean(event.node.description);
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
                        suppressLibraryClickRef.current = true;
                        beginDrag(dragEvent, event.node, segmentOffsetMinutes, event.start);
                      }}
                      onDragEnd={() => {
                        setDraggedNodeId(null);
                        draggedSegmentOffsetRef.current = 0;
                        draggedPointerOffsetRef.current = 0;
                        draggedStartVisibleRef.current = null;
                        draggedOriginPointerRef.current = null;
                        clearDragPreview();
                        window.setTimeout(() => {
                          suppressLibraryClickRef.current = false;
                        }, 80);
                      }}
                      onClick={() => {
                        if (suppressLibraryClickRef.current) return;
                        edit(event.node, currentDay);
                      }}
                      className={`pointer-events-auto absolute isolate overflow-hidden rounded-xl border px-3 py-2 text-left text-white backdrop-blur-xl backdrop-saturate-150 transition hover:-translate-y-0.5 hover:brightness-105 ${canDragEvent ? 'cursor-grab active:cursor-grabbing' : nodeSyncing ? 'cursor-wait' : 'cursor-pointer'} ${activeNodeId === event.node.id ? 'ring-2 ring-slate-950/20' : ''} ${draggedNodeId === event.node.id ? 'opacity-35' : ''} ${nodeSyncing ? 'brightness-95' : ''}`}
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
                      {nodeSyncing && (
                        <span className="absolute bottom-2 right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-white/18 text-white shadow-sm backdrop-blur" title="Syncing">
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        </span>
                      )}
                      <span
                        title="编辑"
                        onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          edit(event.node, currentDay);
                        }}
                        className="absolute right-9 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-white/16 text-white/85 shadow-sm backdrop-blur transition hover:bg-white/28 hover:text-white"
                      >
                        <Pencil className="h-3 w-3" />
                      </span>
                      <span
                        title="取消排期"
                        onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          void unscheduleNode(event.node.id);
                        }}
                        className="absolute right-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-white/16 text-white/85 shadow-sm backdrop-blur transition hover:bg-white/28 hover:text-white"
                      >
                        <X className="h-3 w-3" />
                      </span>
                      {compactPointCard ? (
                        <div className="relative z-10 flex h-full min-w-0 items-center gap-2 pl-2 pr-14">
                          {showCompactThumb ? (
                            <div className={`${narrowPointCard ? 'h-8 w-9' : 'h-9 w-12'} shrink-0 overflow-hidden rounded-lg border border-white/25 bg-white/16 shadow-inner backdrop-blur`}>
                              <img src={coverUrl} {...responsiveImageProps(coverUrl, '160px')} alt="" className="h-full w-full object-cover" />
                            </div>
                          ) : (
                            <span className={`${tinyPointCard ? 'h-6 w-6' : 'h-8 w-8'} flex shrink-0 items-center justify-center rounded-lg bg-white/16 text-white/80 backdrop-blur`}>
                              <Icon className={tinyPointCard ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="shrink-0 text-[9px] font-black tabular-nums text-white/95">{compactPointTimeText}</span>
                              <span className={`${tinyPointCard ? 'text-[10px]' : 'text-[11px]'} min-w-0 flex-1 truncate font-black text-white drop-shadow-sm`}>
                                {event.node.title}
                              </span>
                            </div>
                            {showCompactDetail && (
                              <div className="mt-0.5 truncate text-[8px] font-semibold text-white/78">
                                {nodeScheduleDetailText(event.node)}
                              </div>
                            )}
                            {showCompactDescription && (
                              <div className="mt-0.5 truncate text-[8px] font-medium text-white/66">
                                {event.node.description}
                              </div>
                            )}
                            {pointBeijingTime && height >= 58 && !narrowPointCard && (
                              <div className="mt-0.5 truncate text-[8px] font-black text-white/70">
                                北京时间 {pointBeijingTime}
                              </div>
                            )}
                          </div>
                          {!tinyPointCard && !narrowPointCard && (
                            <span className="shrink-0 rounded-full bg-white/18 px-1.5 py-0.5 text-[8px] font-black text-white/88 backdrop-blur">
                              {itineraryTypeLabel(event.node)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="relative z-10 flex items-center justify-between gap-2 pl-2 text-[9px] font-black text-white/90">
                            <span className="truncate tabular-nums tracking-wide">{pointTimeText}</span>
                            <span className="mr-14 shrink-0 rounded-full bg-white/18 px-1.5 py-0.5 text-white/90 backdrop-blur">{itineraryTypeLabel(event.node)}</span>
                          </div>
                          <div className={`relative z-10 min-w-0 pl-2 ${showScheduleThumb ? 'mt-1.5 flex items-start gap-2' : 'mt-0.5'}`}>
                            {showScheduleThumb && (
                              <div className="h-10 w-12 shrink-0 overflow-hidden rounded-lg border border-white/25 bg-white/16 shadow-inner backdrop-blur">
                                {coverUrl ? (
                                  <img src={coverUrl} {...responsiveImageProps(coverUrl, '160px')} alt="" className="h-full w-full object-cover" />
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
                        </>
                      )}
                      <span
                        title="调整时长"
                        onPointerDown={(pointerEvent) => beginResizeDuration(pointerEvent, event.node, event.start, segmentOffsetMinutes)}
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
                  className="pointer-events-none absolute right-3 z-40"
                  style={{ left: 'calc(var(--schedule-time-axis) + var(--schedule-lodging-axis))', top: (transition.minutes / SLOT_MINUTES) * SLOT_HEIGHT }}
                >
                  <div className="absolute inset-x-0 top-0 border-t border-dashed border-sky-300" />
                  <div className="absolute right-2 top-0 -translate-y-1/2 rounded-full border border-sky-100 bg-white/95 px-2 py-1 text-[8px] font-black text-sky-700 shadow-sm">
                    切换为 {timeZoneOptionLabel(transition.arrivalTimezone)} · {formatTimeZoneOffset(transition.arrivalTimezone, zonedTimeToUtcMs(currentDate, formatTime(transition.minutes), transition.arrivalTimezone))}
                  </div>
                </div>
              ))}

              {dragPreview && (() => {
                const previewTop = ((dragPreview.start - START_MINUTES) / SLOT_MINUTES) * SLOT_HEIGHT + 2;
                const previewHeight = Math.max(30, ((dragPreview.end - dragPreview.start) / SLOT_MINUTES) * SLOT_HEIGHT - 4);
                const roomyPreview = previewHeight >= 54;
                return (
                  <div
                    className="pointer-events-none absolute right-3 z-50"
                    style={{ left: 'calc(var(--schedule-time-axis) + var(--schedule-lodging-axis))', top: previewTop, height: previewHeight }}
                  >
                    <div className="absolute inset-0 rounded-xl border border-indigo-400/80 bg-indigo-500/12 shadow-[0_16px_34px_rgba(79,70,229,0.18),inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur-[2px]" />
                    <div className="absolute inset-x-0 top-0 border-t-2 border-indigo-500" />
                    <div className="absolute -left-[60px] top-0 flex -translate-y-1/2 items-center gap-1 rounded-full border border-indigo-100 bg-white px-2 py-1 text-[9px] font-black tabular-nums text-indigo-700 shadow-lg">
                      <span>{formatTime(dragPreview.start)}</span>
                      <span className="rounded-full bg-indigo-50 px-1 text-[8px] text-indigo-600">
                        {dragPreview.connected ? '贴合' : '落点'}
                      </span>
                    </div>
                    {roomyPreview && (
                      <div className="absolute -left-[60px] bottom-0 flex translate-y-1/2 items-center rounded-full border border-slate-100 bg-white px-2 py-1 text-[9px] font-black tabular-nums text-slate-500 shadow-md">
                        {formatTime(dragPreview.end)}
                      </div>
                    )}
                    <div className="relative z-10 flex h-full min-w-0 items-center gap-2 px-3 py-2 text-indigo-950">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/90 text-indigo-600 shadow-sm">
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="shrink-0 text-[10px] font-black tabular-nums">
                            {formatTime(dragPreview.start)} - {formatTime(dragPreview.end)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[11px] font-black">
                            {dragPreview.title}
                          </span>
                        </div>
                        {roomyPreview && (
                          <div className="mt-0.5 truncate text-[9px] font-bold text-indigo-700/75">
                            {dragPreview.detail || dragPreview.durationText}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </section>

        {editorOpen && createPortal((
        <div className="fixed inset-0 z-[30000] flex items-center justify-center bg-slate-950/35 px-3 py-16 backdrop-blur-md sm:px-5 sm:py-24">
          <button type="button" aria-label="关闭编辑弹窗" onClick={() => reset()} className="absolute inset-0 cursor-default" />
          <form ref={editorDialogRef} role="dialog" aria-modal="true" aria-labelledby="trip-editor-title" onSubmit={editorMode === 'lodging' ? submitLodgingStay : submit} className="relative z-10 max-h-[calc(100dvh-3rem)] w-full max-w-[780px] min-w-0 space-y-3 overflow-y-auto rounded-[24px] border border-white/70 bg-white/82 p-4 shadow-[0_28px_90px_rgba(15,23,42,0.30)] backdrop-blur-2xl backdrop-saturate-150 sm:max-h-[calc(100dvh-6rem)] sm:p-5 lg:max-w-[1120px]">
          <button
            ref={editorCloseRef}
            type="button"
            onClick={() => reset()}
            aria-label="关闭"
            className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/80 text-slate-500 shadow-sm backdrop-blur transition hover:bg-white hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 pr-10">
            <div>
              <h3 id="trip-editor-title" className="text-sm font-black text-slate-900">{editorTitle}</h3>
              <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                {editorSubtitle}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {editingEdge ? (
                <>
                  <button type="button" onClick={followAutoRoute} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-black text-slate-600 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700">
                    自动
                  </button>
                  <button type="button" onClick={() => reset()} className="rounded-lg px-2 py-1.5 text-[10px] font-bold text-red-600 hover:bg-red-50">取消</button>
                </>
              ) : (
                <>
                  {editingExistingTransport && (
                    <button type="button" onClick={deleteEditingTransport} className="rounded-lg border border-red-100 bg-red-50 px-2 py-1.5 text-[10px] font-black text-red-600 shadow-sm transition hover:bg-red-100">
                      <Trash2 className="mr-1 inline h-3 w-3" />删除
                    </button>
                  )}
                  <button type="button" onClick={() => reset()} className="rounded-lg px-2 py-1.5 text-[10px] font-bold text-red-600 hover:bg-red-50">取消</button>
                </>
              )}
            </div>
          </div>

          {editingEdge ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-black text-rose-700">事件接续路线</div>
                    <div className="mt-1 truncate text-xs font-black text-slate-900">{editingEdgeSource?.title || '起点'}</div>
                    <div className="mt-0.5 truncate text-[10px] font-bold text-slate-500">→ {editingEdgeTarget?.title || '终点'}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] font-black text-slate-500">{edgeTransportLabel(edgeDraft.transportType)}</div>
                    <div className="mt-1 text-[10px] font-bold text-rose-700">
                      {[editingRouteSegment?.distanceText || editingEdge.distance, editingRouteSegment?.durationText || editingEdge.duration].filter(Boolean).join(' · ') || '待计算'}
                    </div>
                  </div>
                </div>
                {editingRouteSegment?.status === 'failed' && (
                  <div className="mt-2 rounded-xl border border-amber-100 bg-white/80 px-3 py-2 text-[10px] font-bold text-amber-700">
                    真实路线暂不可用，地图已回退为直线/大圆线。
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {edgeTransportOptions.map(({ value, label, hint, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setEdgeDraft((current) => ({ ...current, transportType: value, isLocked: true }))}
                    className={`rounded-xl border px-2.5 py-2 text-left transition ${edgeDraft.transportType === value ? 'border-rose-200 bg-rose-50 text-rose-700 shadow-sm' : 'border-slate-200 bg-white/75 text-slate-500 hover:bg-white'}`}
                  >
                    <span className="flex items-center gap-1.5 text-[11px] font-black">
                      <Icon className="h-3.5 w-3.5" />{label}
                    </span>
                    <span className="mt-0.5 block text-[9px] font-bold opacity-65">{hint}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEdgeDraft((current) => ({ ...current, displayStatus: current.displayStatus === 'hidden' ? 'visible' : 'hidden' }))}
                  className={`rounded-xl border px-3 py-2 text-left transition ${edgeDraft.displayStatus === 'hidden' ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`}
                >
                  <span className="flex items-center gap-1.5 text-[11px] font-black">
                    {edgeDraft.displayStatus === 'hidden' ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {edgeDraft.displayStatus === 'hidden' ? '地图隐藏' : '地图显示'}
                  </span>
                  <span className="mt-0.5 block text-[9px] font-bold opacity-65">不删除路段关系</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEdgeDraft((current) => ({ ...current, isLocked: !current.isLocked }))}
                  className={`rounded-xl border px-3 py-2 text-left transition ${edgeDraft.isLocked ? 'border-indigo-100 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white/75 text-slate-500'}`}
                >
                  <span className="flex items-center gap-1.5 text-[11px] font-black">
                    <LockKeyhole className="h-3.5 w-3.5" />{edgeDraft.isLocked ? '锁定选择' : '跟随自动'}
                  </span>
                  <span className="mt-0.5 block text-[9px] font-bold opacity-65">{edgeDraft.isLocked ? '重建路线不覆盖' : '重建时可覆盖'}</span>
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white/75 px-3 py-2 text-[10px] font-bold text-slate-500">
                保存后会重新计算这一段的实际路线、距离和时间。
              </div>
            </div>
          ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_410px] lg:items-start">
          <div className="min-w-0 space-y-3">
          {editorMode === 'lodging' ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-black text-emerald-700">入住区间</div>
                    <div className="mt-0.5 truncate text-xs font-bold text-slate-700">
                      {stayCheckInDate} {stayForm.check_in_time || '15:00'} → {stayCheckOutDate} {stayForm.check_out_time || '11:00'} · {stayDurationText(displayedStayForm)}
                    </div>
                  </div>
                  {editingStayId && (
                    <button type="button" onClick={deleteEditingStay} className="shrink-0 rounded-xl border border-red-100 bg-white px-3 py-2 text-[10px] font-black text-red-600 shadow-sm transition hover:bg-red-50">
                      删除区间
                    </button>
                  )}
                </div>
                <div className="mt-2 rounded-xl border border-white/80 bg-white/70 px-3 py-2 text-[10px] font-bold text-emerald-700">
                  住宿固定进入日程：顶部显示夜宿，时间轴只显示入住/退房标记。
                </div>
              </div>

              <label className="block text-xs font-semibold text-slate-700">
                住宿名称
                <input required value={lodgingForm.name} onChange={(event) => setLodgingForm({ ...lodgingForm, name: event.target.value })} placeholder="酒店、民宿或营地名称" className={inputClass} />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-700">
                  预订网站
                  <input value={lodgingForm.booking_site || ''} onChange={(event) => setLodgingForm({ ...lodgingForm, booking_site: event.target.value })} placeholder="爱彼迎" className={inputClass} />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  订单号
                  <input value={lodgingForm.reservation_no || ''} onChange={(event) => setLodgingForm({ ...lodgingForm, reservation_no: event.target.value })} placeholder="可选" className={inputClass} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-700">
                  入住日期
                  <input required type="date" value={stayCheckInDate} onChange={(event) => updateStayCheckInDate(event.target.value)} className={inputClass} />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  入住时间
                  <input required type="time" value={stayForm.check_in_time || '15:00'} onChange={(event) => setStayForm({ ...stayForm, check_in_time: event.target.value })} className={inputClass} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-700">
                  退房日期
                  <input required type="date" min={stayCheckInDate} value={stayCheckOutDate} onChange={(event) => updateStayCheckOutDate(event.target.value)} className={inputClass} />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  退房时间
                  <input required type="time" value={stayForm.check_out_time || '11:00'} onChange={(event) => setStayForm({ ...stayForm, check_out_time: event.target.value })} className={inputClass} />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs font-semibold text-slate-700">
                  住客
                  <input type="number" min={0} value={stayForm.guests || 0} onChange={(event) => setStayForm({ ...stayForm, guests: Number(event.target.value) })} className={inputClass} />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  房型
                  <input value={stayForm.room_type || ''} onChange={(event) => setStayForm({ ...stayForm, room_type: event.target.value })} placeholder="可选" className={inputClass} />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  价格
                  <input value={stayForm.price || ''} onChange={(event) => setStayForm({ ...stayForm, price: event.target.value })} placeholder="可选" className={inputClass} />
                </label>
              </div>

              <label className="block text-xs font-semibold text-slate-700">
                住宿当地时区
                <select
                  value={lodgingForm.timezone || currentDayTimezone}
                  onChange={(event) => setLodgingForm({ ...lodgingForm, timezone: event.target.value })}
                  className={inputClass}
                >
                  {TIMEZONE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label} · {option.hint}</option>
                  ))}
                </select>
              </label>

              <div tabIndex={0} onPaste={(event) => pasteImage(event, 'lodging')} className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40 p-3 outline-none focus:border-emerald-400">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-black text-emerald-700">
                    <Image className="h-4 w-4" />住宿图片
                  </div>
                  <div className="rounded-full bg-white/80 px-2 py-1 text-[9px] font-bold text-emerald-700">粘贴上传</div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(lodgingForm.image_urls || []).map((url, index) => (
                    <div key={url} className="group relative">
                      <img src={url} {...responsiveImageProps(url, '240px')} alt="" className="h-24 w-full rounded-xl object-cover" />
                      {index === 0 && <span className="absolute bottom-1 left-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-[8px] font-bold text-white">封面</span>}
                      <button type="button" onClick={() => removeImage(url, 'lodging')} className="absolute right-1 top-1 rounded-full bg-slate-950/70 p-1 text-white opacity-0 transition group-hover:opacity-100"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
                {!(lodgingForm.image_urls || []).length && (
                  <div className="mt-2 flex min-h-20 flex-col items-center justify-center rounded-xl border border-white/70 bg-white/55 text-center">
                    <Image className="h-5 w-5 text-emerald-500" />
                    <div className="mt-1 text-[10px] font-bold text-slate-500">点击后 Ctrl+V 粘贴图片，或从本地上传</div>
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Image className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input value={imageUrlInput} onChange={(event) => setImageUrlInput(event.target.value)} placeholder="图片 URL" className={`${inputClass} mt-0 pl-9`} />
                  </div>
                  <button type="button" onClick={() => addImageUrl(imageUrlInput, 'lodging')} className="rounded-xl border border-emerald-200 bg-white px-3 text-[11px] font-bold text-emerald-700"><Plus className="h-3.5 w-3.5" /></button>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && void uploadImage(event.target.files[0], 'lodging')} className="hidden" />
                  <button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 text-[11px] font-bold text-white disabled:opacity-50">
                    {uploading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}上传
                  </button>
                </div>
              </div>

              <label className="block text-xs font-semibold text-slate-700">
                住宿备注
                <textarea rows={2} value={lodgingForm.notes || ''} onChange={(event) => setLodgingForm({ ...lodgingForm, notes: event.target.value })} className={inputClass} />
              </label>

              <label className="block text-xs font-semibold text-slate-700">
                入住备注
                <textarea rows={2} value={stayForm.notes || ''} onChange={(event) => setStayForm({ ...stayForm, notes: event.target.value })} className={inputClass} />
              </label>

              {editingLodgingId && (
                <button type="button" onClick={deleteEditingLodging} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 py-2.5 text-xs font-black text-red-600 transition hover:bg-red-100">
                  <Trash2 className="h-4 w-4" />删除住宿资料
                </button>
              )}
            </div>
          ) : (
          <>
          <label className="block text-xs font-semibold text-slate-700">
            名称
            <input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={form.type === 'transport' ? '例如：北京飞往东京' : '景点或饭店名称'} className={inputClass} />
          </label>

          {form.type === 'transport' ? (
            <div className="space-y-3 rounded-2xl border border-sky-100 bg-sky-50/60 p-3">
              {editingExistingTransport && (
                <div className="rounded-xl border border-red-100 bg-white/80 px-3 py-2 text-[10px] font-black text-red-600">
                  交通已锁定，需删除后重新录入
                </div>
              )}
              <div className={editingExistingTransport ? 'pointer-events-none opacity-70' : ''}>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-700">
                  出发日期
                  <input
                    required
                    type="date"
                    value={form.date || currentDate}
                    onChange={(event) => {
                      const date = event.target.value;
                      setForm((current) => {
                        const day = dayForDate(date, dateByDay, trip?.start_date) || current.day || currentDay;
                        const arrivalTracksStart = !current.arrival_date || current.arrival_date === current.date;
                        const arrivalDate = arrivalTracksStart ? date : current.arrival_date;
                        const endDate = !current.end_date || current.end_date === current.date || arrivalTracksStart
                          ? arrivalDate || date
                          : current.end_date;
                        return {
                          ...current,
                          day,
                          date,
                          arrival_date: arrivalDate,
                          end_date: endDate,
                          end_day: dayForDate(endDate, dateByDay, trip?.start_date) || current.end_day || day,
                        };
                      });
                    }}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  出发时间
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
                      setForm((current) => {
                        const startDay = dayForDate(current.date || currentDate, dateByDay, trip?.start_date) || current.day || currentDay;
                        const endDay = dayForDate(endDate, dateByDay, trip?.start_date) || current.end_day || startDay;
                        return {
                          ...current,
                          arrival_date: endDate,
                          end_date: endDate,
                          end_day: Math.max(startDay, endDay),
                        };
                      });
                    }}                    className={inputClass}
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

              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {isPointFormScheduled ? (
                <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-black text-indigo-700">时间安排</div>
                      <div className="mt-0.5 truncate text-xs font-bold text-slate-700">
                        {form.date || currentDate} {form.time} - {form.end_date || form.date || currentDate} {form.end_time || '--:--'}
                      </div>
                    </div>
                    {editingId && (
                      <button type="button" onClick={cancelPointSchedule} className="shrink-0 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-[10px] font-black text-indigo-700 shadow-sm transition hover:border-red-200 hover:text-red-600">
                        取消排期
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-semibold text-slate-700">
                      开始日期
                      <input type="date" value={form.date || currentDate} onChange={(event) => updatePointStart({ date: event.target.value })} className={inputClass} />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      开始时间
                      <input type="time" value={form.time || '12:00'} onChange={(event) => updatePointStart({ time: event.target.value })} className={inputClass} />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-semibold text-slate-700">
                      结束日期
                      <input type="date" min={form.date || currentDate} value={form.end_date || form.date || currentDate} onChange={(event) => updatePointEnd({ end_date: event.target.value })} className={inputClass} />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      结束时间
                      <input type="time" value={form.end_time || form.time || '12:00'} onChange={(event) => updatePointEnd({ end_time: event.target.value })} className={inputClass} />
                    </label>
                  </div>
                  <label className="block text-xs font-semibold text-slate-700">
                    持续时长
                    <input value={form.duration} onChange={(event) => updatePointDuration(event.target.value)} placeholder="例如：1小时30分" className={inputClass} />
                  </label>

                  <div className="rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-[10px] font-bold text-slate-500">
                    持续 {formatDurationText(formRangeDuration())} · {timeZoneOptionLabel(form.timezone || currentDayTimezone)}
                  </div>
                </div>
              ) : (
                <div className="space-y-2 rounded-2xl border border-dashed border-slate-200 bg-white/70 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-black text-slate-500">待排期项目</div>
                      <div className="mt-0.5 text-[10px] font-semibold text-slate-400">未设置开始结束时间</div>
                    </div>
                    <button type="button" onClick={() => schedulePointForm()} className="shrink-0 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-[10px] font-black text-indigo-700 transition hover:bg-indigo-100">
                      设置时间
                    </button>
                  </div>
                  <label className="block text-xs font-semibold text-slate-700">
                    默认停留时长
                    <input value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} placeholder="例如：1小时30分" className={inputClass} />
                  </label>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                {pointTypeOptions.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm({ ...form, type: 'activity', activity_subtype: value })}
                    className={`flex items-center justify-center gap-1 rounded-xl border px-2 py-2 text-[11px] font-black transition ${activitySubtypeOf(form) === value ? 'border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-slate-200 bg-white/75 text-slate-500 hover:bg-white'}`}
                  >
                    <Icon className="h-3.5 w-3.5" />{label}
                  </button>
                ))}
              </div>

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

              <div tabIndex={0} onPaste={pasteImage} className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 p-3 outline-none focus:border-indigo-400">
                <div className="grid grid-cols-3 gap-2">
                  {(form.image_urls || []).map((url, index) => (
                    <div key={url} className="group relative">
                      <img src={url} {...responsiveImageProps(url, '240px')} alt="" className="h-24 w-full rounded-xl object-cover" />
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
          </>
          )}
          </div>
          {editorLocationPanel && (
            <div className="min-w-0 lg:sticky lg:top-0 lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto lg:pr-1">
              {editorLocationPanel}
            </div>
          )}
          </div>
          )}

          <button disabled={formSubmitSaving || editingExistingTransport} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-semibold text-white disabled:opacity-50">
            {formSubmitSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {editingEdge ? '保存路段设置' : editorMode === 'lodging' ? (editingStayId ? '保存住宿区间' : '安排住宿') : editingExistingTransport ? '删除后重新录入' : editingId ? '保存修改' : '新增内容'}
          </button>
          </form>
        </div>
        ), document.body)}
      </div>
    </div>
  );
}
