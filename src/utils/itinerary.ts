import { ActivitySubtype, ItineraryNode, ItineraryType, LegacyItineraryType } from '../types';

export const legacyActivitySubtypeMap: Record<LegacyItineraryType, ActivitySubtype> = {
  sightseeing: 'sightseeing',
  restaurant: 'meal',
  shopping: 'shopping',
  leisure: 'leisure',
  transfer: 'layover',
  hotel: 'other',
};

export const activitySubtypeLabels: Record<ActivitySubtype, string> = {
  sightseeing: '景点',
  meal: '饭店',
  shopping: '购物',
  leisure: '休闲',
  tour: '活动',
  ticketed_event: '票务',
  layover: '中转',
  errand: '事务',
  buffer: '缓冲',
  other: '其他',
};

export const activitySubtypeTones: Record<ActivitySubtype, { card: string; badge: string; event: string; timeline: string }> = {
  sightseeing: {
    card: 'border-violet-100 bg-violet-50/70',
    badge: 'bg-violet-100 text-violet-700',
    event: 'border-violet-200 bg-violet-600 text-white',
    timeline: 'bg-violet-50 text-violet-700',
  },
  meal: {
    card: 'border-rose-100 bg-rose-50/75',
    badge: 'bg-rose-100 text-rose-700',
    event: 'border-rose-200 bg-rose-600 text-white',
    timeline: 'bg-rose-50 text-rose-700',
  },
  shopping: {
    card: 'border-pink-100 bg-pink-50/75',
    badge: 'bg-pink-100 text-pink-700',
    event: 'border-pink-200 bg-pink-600 text-white',
    timeline: 'bg-pink-50 text-pink-700',
  },
  leisure: {
    card: 'border-amber-100 bg-amber-50/70',
    badge: 'bg-amber-100 text-amber-700',
    event: 'border-amber-200 bg-amber-500 text-slate-950',
    timeline: 'bg-amber-50 text-amber-700',
  },
  tour: {
    card: 'border-indigo-100 bg-indigo-50/70',
    badge: 'bg-indigo-100 text-indigo-700',
    event: 'border-indigo-200 bg-indigo-600 text-white',
    timeline: 'bg-indigo-50 text-indigo-700',
  },
  ticketed_event: {
    card: 'border-fuchsia-100 bg-fuchsia-50/70',
    badge: 'bg-fuchsia-100 text-fuchsia-700',
    event: 'border-fuchsia-200 bg-fuchsia-600 text-white',
    timeline: 'bg-fuchsia-50 text-fuchsia-700',
  },
  layover: {
    card: 'border-cyan-100 bg-cyan-50/70',
    badge: 'bg-cyan-100 text-cyan-700',
    event: 'border-cyan-200 bg-cyan-600 text-white',
    timeline: 'bg-sky-50 text-sky-700',
  },
  errand: {
    card: 'border-slate-100 bg-slate-50/80',
    badge: 'bg-slate-100 text-slate-700',
    event: 'border-slate-200 bg-slate-600 text-white',
    timeline: 'bg-slate-50 text-slate-700',
  },
  buffer: {
    card: 'border-teal-100 bg-teal-50/70',
    badge: 'bg-teal-100 text-teal-700',
    event: 'border-teal-200 bg-teal-600 text-white',
    timeline: 'bg-teal-50 text-teal-700',
  },
  other: {
    card: 'border-slate-100 bg-white/75',
    badge: 'bg-slate-100 text-slate-700',
    event: 'border-slate-200 bg-slate-700 text-white',
    timeline: 'bg-slate-50 text-slate-700',
  },
};

export const activitySubtypeColors: Record<ActivitySubtype, string> = {
  sightseeing: '#8b5cf6',
  meal: '#f43f5e',
  shopping: '#ec4899',
  leisure: '#f59e0b',
  tour: '#6366f1',
  ticketed_event: '#c026d3',
  layover: '#0ea5e9',
  errand: '#64748b',
  buffer: '#14b8a6',
  other: '#475569',
};

export const activitySubtypeOf = (node: Pick<ItineraryNode, 'type' | 'activity_subtype'>): ActivitySubtype => {
  if (node.type === 'activity' && node.activity_subtype) return node.activity_subtype;
  return legacyActivitySubtypeMap[node.type as LegacyItineraryType] || 'sightseeing';
};

export const itineraryTypeLabel = (node: Pick<ItineraryNode, 'type' | 'activity_subtype'> | { type: ItineraryType; activity_subtype?: ActivitySubtype }) =>
  node.type === 'transport' ? '交通' : activitySubtypeLabels[activitySubtypeOf(node)];

export const itineraryTypeTone = (node: Pick<ItineraryNode, 'type' | 'activity_subtype'>) =>
  node.type === 'transport'
    ? {
        card: 'border-sky-100 bg-sky-50/80',
        badge: 'bg-sky-100 text-sky-700',
        event: 'border-sky-200 bg-sky-600 text-white',
        timeline: 'bg-cyan-50 text-cyan-700',
      }
    : activitySubtypeTones[activitySubtypeOf(node)];

export const isScheduledNode = (node: ItineraryNode) =>
  node.status !== 'unscheduled' && node.day > 0 && Boolean(node.date) && Boolean(node.time);

export const isPointNode = (node: ItineraryNode) => node.type !== 'transport';

export const isUnscheduledPointNode = (node: ItineraryNode) =>
  isPointNode(node) && !isScheduledNode(node);

export const compareItineraryNodes = (a: ItineraryNode, b: ItineraryNode) => {
  const aScheduled = isScheduledNode(a);
  const bScheduled = isScheduledNode(b);

  if (aScheduled && bScheduled) {
    return a.day - b.day || a.time.localeCompare(b.time) || a.title.localeCompare(b.title, 'zh-CN');
  }

  if (aScheduled !== bScheduled) return aScheduled ? -1 : 1;

  return a.type.localeCompare(b.type, 'zh-CN') || a.title.localeCompare(b.title, 'zh-CN');
};
