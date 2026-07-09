import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bed,
  Bus,
  Car,
  Footprints,
  Image as ImageIcon,
  MapPin,
  Route,
  Ship,
  TrainFront,
} from 'lucide-react';
import ImagePreviewModal from '../ImagePreviewModal/ImagePreviewModal';
import TransportTicket from '../TransportTicket/TransportTicket';
import { useItineraryStore } from '../../store/useItineraryStore';
import { ItineraryEdge, ItineraryNode, Lodging, RouteSegment, Stay } from '../../types';
import { compareItineraryNodes, isScheduledNode, itineraryTypeLabel, itineraryTypeTone } from '../../utils/itinerary';

type ScheduleEntry =
  | { kind: 'event'; node: ItineraryNode }
  | { kind: 'route'; edge: ItineraryEdge; segment?: RouteSegment; source: ItineraryNode; target: ItineraryNode }
  | { kind: 'lodging'; stay: Stay; lodging: Lodging };

const imagesOf = (node: ItineraryNode) => node.image_urls?.length ? node.image_urls : node.image_url ? [node.image_url] : [];

const isTicketTransport = (node: ItineraryNode) =>
  Boolean(node.transport_mode || node.departure_place || node.arrival_place || /航班|高铁|火车|飞往|→/.test(node.title));

const timeValue = (time?: string) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(time || '');
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[1]) * 60 + Number(match[2]);
};

const endTimeOf = (node: ItineraryNode) =>
  node.end_time || node.arrival_time || '';

const timeRangeOf = (node: ItineraryNode) => {
  const end = endTimeOf(node);
  if (!end || end === node.time) return node.time || '--:--';
  const crossesDay = node.end_day && node.end_day !== node.day;
  return `${node.time} - ${end}${crossesDay ? ` · D${node.end_day}` : ''}`;
};

const durationBetween = (left: ItineraryNode, right: ItineraryNode) => {
  if (left.day !== right.day) return '';
  const start = timeValue(endTimeOf(left) || left.time);
  const end = timeValue(right.time);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '';
  const minutes = end - start;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}分钟`;
  return rest ? `${hours}小时${rest}分钟` : `${hours}小时`;
};

const routeSegmentKey = (linkType: RouteSegment['linkType'], linkId: string) => `${linkType}:${linkId}`;

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

const routeTone = (type?: string) => {
  switch (type) {
    case 'walk': return 'bg-orange-500 text-orange-600';
    case 'car':
    case 'taxi': return 'bg-rose-500 text-rose-600';
    case 'bus':
    case 'transit':
    case 'subway':
    case 'train':
    case 'high_speed_rail': return 'bg-emerald-500 text-emerald-600';
    case 'ferry': return 'bg-blue-500 text-blue-600';
    default: return 'bg-slate-400 text-slate-600';
  }
};

const routeMetricText = (edge: ItineraryEdge, segment?: RouteSegment) =>
  [segment?.distanceText || edge.distance, segment?.durationText || edge.duration].filter(Boolean).join(' · ');

const findEdgeBetween = (edges: ItineraryEdge[], source: ItineraryNode, target: ItineraryNode) =>
  edges.find((edge) =>
    edge.displayStatus !== 'hidden' &&
    edge.source === source.id &&
    edge.target === target.id
  );

const dayTitle = (activeDay: number | 'all', nodes: ItineraryNode[]) => {
  if (activeDay === 'all') return '全览';
  const date = nodes.find((node) => node.day === activeDay)?.date;
  return `D${activeDay}${date ? ` · ${date.slice(5)}` : ''}`;
};

const sameDayStays = (stays: Stay[], lodgings: Map<string, Lodging>, activeDay: number | 'all') =>
  stays
    .filter((stay) =>
      stay.status !== 'cancelled' &&
      (activeDay === 'all' || (stay.check_in_day <= activeDay && stay.check_out_day > activeDay))
    )
    .map((stay) => {
      const lodging = lodgings.get(stay.lodging_id);
      return lodging ? { stay, lodging } : null;
    })
    .filter((entry): entry is { stay: Stay; lodging: Lodging } => Boolean(entry));

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

  sameDayStays(stays, lodgingLookup, activeDay).forEach(({ stay, lodging }) => {
    entries.push({ kind: 'lodging', stay, lodging });
  });

  return entries;
};

function EventCard({
  node,
  selected,
  setCardRef,
  onPreview,
  onSelect,
}: {
  node: ItineraryNode;
  selected: boolean;
  setCardRef: (id: string, element: HTMLDivElement | null) => void;
  onPreview: (preview: { node: ItineraryNode; index: number }) => void;
  onSelect: () => void;
}) {
  const nodeMeta = itineraryTypeTone(node);
  const images = imagesOf(node);

  if (node.type === 'transport') {
    return (
      <div
        ref={(element) => setCardRef(node.id, element)}
        onClick={onSelect}
        className={`w-[82vw] shrink-0 snap-center cursor-pointer transition sm:w-auto ${
          selected ? 'rounded-2xl ring-2 ring-indigo-500/30' : ''
        }`}
      >
        {isTicketTransport(node) ? (
          <TransportTicket node={node} compact />
        ) : (
          <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-3 py-2.5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black text-sky-700">{timeRangeOf(node)}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[8px] font-black text-sky-600 shadow-sm">交通</span>
            </div>
            <div className="mt-1 text-xs font-black text-slate-800">{node.title}</div>
            <p className="mt-0.5 line-clamp-1 text-[9px] font-bold text-slate-500">{node.description}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <article
      ref={(element) => setCardRef(node.id, element)}
      onClick={onSelect}
      className={`w-[82vw] shrink-0 snap-center cursor-pointer overflow-hidden rounded-2xl border transition sm:w-auto ${
        selected
          ? 'border-indigo-200 bg-white/92 shadow-xl ring-2 ring-indigo-500/12'
          : 'border-white/60 bg-white/58 shadow-md hover:bg-white/78'
      }`}
    >
      <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 p-3">
        <button
          onClick={(event) => {
            event.stopPropagation();
            if (images[0]) onPreview({ node, index: 0 });
          }}
          className={`group relative h-20 overflow-hidden rounded-xl ${images[0] ? 'bg-slate-200' : nodeMeta.card}`}
          type="button"
        >
          {images[0] ? (
            <>
              <img src={images[0]} alt={node.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
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
              <div className="text-[10px] font-black tabular-nums text-slate-500">{timeRangeOf(node)}</div>
              <h4 className="mt-1 truncate text-sm font-black text-slate-950">{node.title}</h4>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-black ${nodeMeta.timeline}`}>
              {itineraryTypeLabel(node)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{node.description || node.address || '暂无说明'}</p>
          <div className="mt-2 border-t border-slate-100/80 pt-2">
            <span className="flex min-w-0 items-center gap-1 truncate text-[9px] font-semibold text-slate-400">
              <MapPin className="h-3 w-3 shrink-0" />
              {node.city || node.address || '已选择地点'}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function RouteCard({
  entry,
  active,
  onSelect,
  onHover,
}: {
  entry: Extract<ScheduleEntry, { kind: 'route' }>;
  active: boolean;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
}) {
  const Icon = edgeTransportIcon(entry.edge.transportType);
  const tone = routeTone(entry.edge.transportType);
  const metric = routeMetricText(entry.edge, entry.segment) || durationBetween(entry.source, entry.target) || '路线待补充';

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className={`group flex w-[70vw] shrink-0 snap-center items-center gap-2 rounded-2xl border px-3 py-2 text-left transition sm:w-auto sm:rounded-xl sm:py-2 ${
        active
          ? 'border-indigo-200 bg-white/86 shadow-md ring-1 ring-indigo-200'
          : 'border-white/45 bg-white/34 hover:bg-white/58'
      }`}
    >
      <span className={`h-1.5 w-8 shrink-0 rounded-full ${tone.split(' ')[0]} shadow-[0_0_0_2px_rgba(255,255,255,.75)]`} />
      <Icon className={`h-3.5 w-3.5 shrink-0 ${tone.split(' ')[1]}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[10px] font-black text-slate-700">
          {edgeTransportLabel(entry.edge.transportType)}
          <span className="mx-1 text-slate-300">/</span>
          {entry.source.title} → {entry.target.title}
        </span>
        <span className="mt-0.5 block truncate text-[9px] font-bold text-slate-500">{metric}</span>
      </span>
    </button>
  );
}

function LodgingCard({
  stay,
  lodging,
  selected,
  setCardRef,
  onSelect,
}: {
  stay: Stay;
  lodging: Lodging;
  selected: boolean;
  setCardRef: (id: string, element: HTMLDivElement | null) => void;
  onSelect: () => void;
}) {
  return (
    <div
      ref={(element) => setCardRef(lodging.id, element)}
      onClick={onSelect}
      className={`w-[74vw] shrink-0 snap-center cursor-pointer rounded-2xl border p-3 shadow-sm transition sm:w-auto ${
        selected
          ? 'border-emerald-300 bg-emerald-50/90 ring-2 ring-emerald-400/20'
          : 'border-emerald-100 bg-emerald-50/74 hover:border-emerald-200 hover:bg-emerald-50/90'
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
      <div className="mt-1.5 truncate text-sm font-black text-slate-950">{lodging.name}</div>
      <div className="mt-1 truncate text-[10px] font-bold text-slate-500">{lodging.city || lodging.address || '住宿地址待补充'}</div>
    </div>
  );
}

export default function Timeline() {
  const {
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
  const [preview, setPreview] = useState<{ node: ItineraryNode; index: number } | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const scrollEndTimer = useRef<number | null>(null);
  const scheduledNodes = nodes.filter(isScheduledNode);
  const days = Array.from(new Set(scheduledNodes.map((node) => node.day))).sort((a, b) => a - b);
  const visibleEventCount = scheduledNodes.filter((node) => activeDay === 'all' || node.day === activeDay).length;
  const visibleTransportCount = scheduledNodes.filter((node) => node.type === 'transport' && (activeDay === 'all' || node.day === activeDay)).length;
  const entries = useMemo(
    () => buildEntries(nodes, edges, routeSegments, stays, lodgings, activeDay),
    [activeDay, edges, lodgings, nodes, routeSegments, stays],
  );

  const setCardRef = useCallback((id: string, element: HTMLDivElement | null) => {
    if (element) cardRefs.current.set(id, element);
    else cardRefs.current.delete(id);
  }, []);

  useEffect(() => {
    if (!activeNodeId) return;
    cardRefs.current.get(activeNodeId)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }, [activeNodeId, activeDay]);

  const syncActiveCard = () => {
    if (!window.matchMedia('(max-width: 639px)').matches) return;
    if (scrollEndTimer.current !== null) window.clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = window.setTimeout(() => {
      scrollEndTimer.current = null;
      const track = trackRef.current;
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

      <div className="mb-3 shrink-0 rounded-2xl border border-white/50 bg-white/42 p-3 shadow-lg backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-black text-slate-900">行程简表</div>
            <div className="mt-0.5 text-[10px] font-bold text-slate-500">{dayTitle(activeDay, scheduledNodes)}</div>
          </div>
          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-700">
            {visibleEventCount - visibleTransportCount} 个地点 · {visibleTransportCount} 段交通
          </span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          <button
            onClick={() => setActiveDay('all')}
            className={`shrink-0 rounded-xl border px-4 py-1.5 text-xs font-semibold ${
              activeDay === 'all' ? 'border-slate-900 bg-slate-900 text-white' : 'border-white bg-white/50 text-slate-700'
            }`}
            type="button"
          >
            全览
          </button>
          {days.map((day) => (
            <button
              key={day}
              onClick={() => setActiveDay(day)}
              className={`shrink-0 rounded-xl border px-4 py-1.5 text-xs font-semibold ${
                activeDay === day ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-white bg-white/50 text-slate-700'
              }`}
              type="button"
            >
              D{day}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={trackRef}
        onScroll={syncActiveCard}
        className="flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden px-[7%] pb-4 no-scrollbar sm:block sm:space-y-2.5 sm:overflow-x-hidden sm:overflow-y-auto sm:px-0 sm:pr-1"
      >
        {entries.map((entry, index) => {
          if (entry.kind === 'event') {
            return (
              <EventCard
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
              <RouteCard
                key={`route-${entry.edge.id}-${index}`}
                entry={entry}
                active={active}
                onSelect={() => setActiveEdgeId(entry.edge.id)}
                onHover={(hovered) => setHoveredEdgeId(hovered ? entry.edge.id : null)}
              />
            );
          }
          return (
            <LodgingCard
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
    </div>
  );
}
