/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Marker, Polyline, Popup, Tooltip, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import ImagePreviewModal from '../ImagePreviewModal/ImagePreviewModal';
import { useItineraryStore } from '../../store/useItineraryStore';
import { ItineraryNode, ItineraryEdge, Lodging, RouteSegment, Stay, TripSummary } from '../../types';
import { activitySubtypeColors, activitySubtypeOf, isScheduledNode, itineraryTypeLabel } from '../../utils/itinerary';
import { Plane, Car, Train, Navigation, Compass } from 'lucide-react';
import { toProviderPoint } from '../../map/coordinates';
import { amapBrowserKey, amapSecurityCode, googleMapsBrowserKey, mapProviderForTrip, mapProviderLabel } from '../../map/provider';
import { loadAmap, loadGoogleMaps } from '../../map/scriptLoaders';

type PreviewState = { node: ItineraryNode; index: number } | null;
type VisibleLodgingMarker = { lodging: Lodging; stays: Stay[] };
const imagesOf = (node: ItineraryNode) => node.image_urls?.length ? node.image_urls : node.image_url ? [node.image_url] : [];
const lodgingImagesOf = (lodging: Lodging) => lodging.image_urls?.length ? lodging.image_urls : lodging.image_url ? [lodging.image_url] : [];

const escapeHtml = (value?: string | number) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const nodeColor = (node: Pick<ItineraryNode, 'type' | 'activity_subtype'>) => {
  if (node.type === 'transport') return '#06b6d4';
  if (node.type === 'hotel') return '#10b981';
  return activitySubtypeColors[activitySubtypeOf(node)];
};

const nodeTypeLabel = (node: Pick<ItineraryNode, 'type' | 'activity_subtype'>) =>
  node.type === 'hotel' ? '酒店' : itineraryTypeLabel(node);

// Custom icons setup using dynamic SVG inside DivIcon
const createCustomMarkerIcon = (node: ItineraryNode, isSelected: boolean) => {
  let color = '#3b82f6'; // default blue
  let iconSvg = '';
  const visualType = node.type === 'transport' || node.type === 'hotel' ? node.type : activitySubtypeOf(node);

  switch (visualType) {
    case 'hotel':
      color = nodeColor(node);
      iconSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-white">
          <path d="M3 10V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5" />
          <path d="M21 21v-4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4" />
          <path d="M2 11h20" />
          <circle cx="7" cy="7" r="1" />
          <circle cx="17" cy="7" r="1" />
        </svg>
      `;
      break;
    case 'meal':
      color = nodeColor(node);
      iconSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-white">
          <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
          <path d="M7 2v20" />
          <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
        </svg>
      `;
      break;
    case 'sightseeing':
      color = nodeColor(node);
      iconSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-white">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <circle cx="12" cy="11" r="3" />
        </svg>
      `;
      break;
    case 'leisure':
      color = nodeColor(node);
      iconSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-white">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      `;
      break;
    case 'layover':
      color = nodeColor(node);
      iconSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-white">
          <path d="M22 2 9 15" /><path d="m22 2-7 20-4-9-9-4Z" />
        </svg>
      `;
      break;
    case 'shopping':
      color = nodeColor(node);
      iconSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-white">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      `;
      break;
    case 'transport':
    default:
      color = nodeColor(node);
      iconSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-white">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      `;
      break;
  }

  const borderClass = isSelected
    ? 'box-border border-[3px] border-white shadow-[0_0_0_4px_rgba(99,102,241,0.22),0_10px_24px_rgba(79,70,229,0.34)] z-[2000]'
    : 'box-border border-2 border-white/90 scale-100 shadow-md hover:scale-110 z-[100]';
  
  const size = 36;

  // Render HTML inside Leaflet
  return L.divIcon({
    className: 'custom-leaflet-marker-wrapper',
    html: `
      <div class="relative flex items-center justify-center rounded-full ${borderClass} transition-all duration-300 pointer-events-auto" 
           style="background: ${color}; width: ${size}px; height: ${size}px;">
        ${iconSvg}
        <!-- Tiny arrow helper -->
        <div class="absolute -bottom-1 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] transition-all" 
             style="border-t-color: ${isSelected ? '#ffffff' : color};"></div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size + 4],
    popupAnchor: [0, -size],
  });
};

const createLodgingMarkerIcon = () => {
  const size = 36;
  return L.divIcon({
    className: 'lodging-leaflet-marker-wrapper',
    html: `
      <div class="relative flex items-center justify-center rounded-full box-border border-2 border-white/95 shadow-[0_10px_24px_rgba(16,185,129,0.35)] transition-all duration-300 pointer-events-auto"
           style="background:#10b981;width:${size}px;height:${size}px;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:17px;height:17px">
          <path d="M3 10V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5" />
          <path d="M21 21v-4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4" />
          <path d="M2 11h20" />
        </svg>
        <div class="absolute -bottom-1 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px]" style="border-top-color:#10b981"></div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size + 4],
    popupAnchor: [0, -size],
  });
};

const transportEndpointIcon = (selected = false) => L.divIcon({
  className: 'transport-endpoint-marker',
  html: `<div style="width:${selected ? 28 : 22}px;height:${selected ? 28 : 22}px;border-radius:999px;background:#0ea5e9;border:3px solid white;box-shadow:0 4px 14px rgba(14,165,233,.45);display:flex;align-items:center;justify-content:center"><div style="width:6px;height:6px;border-radius:999px;background:white"></div></div>`,
  iconSize: [selected ? 28 : 22, selected ? 28 : 22],
  iconAnchor: [selected ? 14 : 11, selected ? 14 : 11],
});

const tripPinIcon = (trip: TripSummary, selected: boolean) => L.divIcon({
  className: 'trip-pin-marker',
  html: `<div class="trip-pin ${selected ? 'trip-pin-selected' : ''}"><div class="trip-pin-dot"></div><span>${trip.title}</span></div>`,
  iconSize: [180, 42],
  iconAnchor: [18, 36],
});

const homeTripZoom = (trip?: Pick<TripSummary, 'slug' | 'title'> | null) => {
  const label = `${trip?.slug || ''} ${trip?.title || ''}`.toLowerCase();
  if (label.includes('dalian') || label.includes('大连')) return 8;
  if (label.includes('iceland') || label.includes('冰岛')) return 5;
  return trip ? 5 : 2;
};
const toRadians = (value: number) => (value * Math.PI) / 180;
const toDegrees = (value: number) => (value * 180) / Math.PI;

const normalizedEndLng = (startLng: number, endLng: number) => {
  if (endLng - startLng > 180) return endLng - 360;
  if (endLng - startLng < -180) return endLng + 360;
  return endLng;
};

const routeDistanceKm = (startLat: number, startLng: number, endLat: number, endLng: number) => {
  const radiusKm = 6371;
  const lat1 = toRadians(startLat);
  const lat2 = toRadians(endLat);
  const deltaLat = toRadians(endLat - startLat);
  const deltaLng = toRadians(endLng - startLng);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * radiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const greatCirclePath = (startLat: number, startLng: number, endLat: number, endLng: number): [number, number][] => {
  const startPhi = toRadians(startLat);
  const startLambda = toRadians(startLng);
  const endPhi = toRadians(endLat);
  const endLambda = toRadians(endLng);
  const start = [
    Math.cos(startPhi) * Math.cos(startLambda),
    Math.cos(startPhi) * Math.sin(startLambda),
    Math.sin(startPhi),
  ];
  const end = [
    Math.cos(endPhi) * Math.cos(endLambda),
    Math.cos(endPhi) * Math.sin(endLambda),
    Math.sin(endPhi),
  ];
  const omega = Math.acos(Math.max(-1, Math.min(1, start[0] * end[0] + start[1] * end[1] + start[2] * end[2])));
  if (!Number.isFinite(omega) || omega < 1e-6) return [[startLat, startLng], [endLat, endLng]];

  let previousLng = startLng;
  return Array.from({ length: 33 }, (_, index) => {
    const t = index / 32;
    const a = Math.sin((1 - t) * omega) / Math.sin(omega);
    const b = Math.sin(t * omega) / Math.sin(omega);
    const x = a * start[0] + b * end[0];
    const y = a * start[1] + b * end[1];
    const z = a * start[2] + b * end[2];
    const lat = toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y)));
    let lng = toDegrees(Math.atan2(y, x));
    while (lng - previousLng > 180) lng -= 360;
    while (lng - previousLng < -180) lng += 360;
    previousLng = lng;
    return [lat, lng] as [number, number];
  });
};

const isAirTransport = (node: ItineraryNode) => node.transport_mode === 'flight';

const transportPath = (node: ItineraryNode): [number, number][] => {
  if (node.departure_lat == null || node.departure_lng == null || node.arrival_lat == null || node.arrival_lng == null) return [];
  const endLng = normalizedEndLng(node.departure_lng, node.arrival_lng);
  const distanceKm = routeDistanceKm(node.departure_lat, node.departure_lng, node.arrival_lat, endLng);
  if (!isAirTransport(node) || distanceKm < 280) {
    return [
      [node.departure_lat, node.departure_lng],
      [node.arrival_lat, endLng],
    ];
  }
  return greatCirclePath(node.departure_lat, node.departure_lng, node.arrival_lat, endLng);
};

const cleanGeometry = (segment?: RouteSegment | null, includeProviderGeometry = false): [number, number][] => {
  if (!segment || (segment.coordSystem === 'gcj02' && !includeProviderGeometry)) return [];
  return (segment.geometry || [])
    .filter((point): point is [number, number] =>
      Array.isArray(point) &&
      point.length >= 2 &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1])
    );
};

const routeSegmentKey = (linkType: RouteSegment['linkType'], linkId: string) => `${linkType}:${linkId}`;

const routeSegmentFor = (segments: RouteSegment[], linkType: RouteSegment['linkType'], linkId: string) =>
  segments.find((segment) => segment.linkType === linkType && segment.linkId === linkId);

const routePathForTransport = (node: ItineraryNode, segment?: RouteSegment | null, includeProviderGeometry = false): [number, number][] => {
  const geometry = cleanGeometry(segment, includeProviderGeometry);
  return geometry.length >= 2 ? geometry : transportPath(node);
};

const nodeAnchorPoint = (node: ItineraryNode, anchor?: string): [number, number] => {
  if (anchor === 'departure' && node.departure_lat != null && node.departure_lng != null) {
    return [node.departure_lat, node.departure_lng];
  }
  if (anchor === 'arrival' && node.arrival_lat != null && node.arrival_lng != null) {
    return [node.arrival_lat, node.arrival_lng];
  }
  return [node.lat, node.lng];
};

const routePathForEdge = (edge: ItineraryEdge, nodes: ItineraryNode[], segment?: RouteSegment | null, includeProviderGeometry = false): [number, number][] => {
  const geometry = cleanGeometry(segment, includeProviderGeometry);
  if (geometry.length >= 2) return geometry;
  const srcNode = nodes.find(n => n.id === edge.source);
  const tarNode = nodes.find(n => n.id === edge.target);
  if (!srcNode || !tarNode) return [];
  return [nodeAnchorPoint(srcNode, edge.sourceAnchor), nodeAnchorPoint(tarNode, edge.targetAnchor)];
};

const routePathForSegment = (segment: RouteSegment, includeProviderGeometry = false): [number, number][] => {
  const geometry = cleanGeometry(segment, includeProviderGeometry);
  if (geometry.length >= 2) return geometry;
  return [
    [segment.origin_lat, segment.origin_lng],
    [segment.destination_lat, segment.destination_lng],
  ];
};

const pathMidpoint = (path: [number, number][]): [number, number] => path[Math.floor(path.length / 2)] || [0, 0];
const ROUTE_HALO_COLOR = '#ffffff';
const EDGE_ROUTE_COLOR = '#e11d48';
const EDGE_ROUTE_HOVER_COLOR = '#be123c';
const LODGING_ROUTE_COLOR = '#059669';
const LODGING_ROUTE_HOVER_COLOR = '#047857';
const FALLBACK_ROUTE_COLOR = '#f59e0b';
const ROUTE_FOCUS_DIM_OPACITY = 0.18;
const ROUTE_BASE_Z_INDEX = 20;
const ROUTE_HOVER_Z_INDEX = 120;

const transportLineStyle = (node: ItineraryNode, selected: boolean, muted = false): L.PolylineOptions => {
  const air = isAirTransport(node);
  const railway = node.transport_mode === 'train' || node.transport_mode === 'high_speed_rail' || node.transport_mode === 'subway';
  const ground = node.transport_mode === 'car' || node.transport_mode === 'bus';
  const color = air ? '#1d4ed8' : railway ? '#059669' : ground ? '#db2777' : '#7c3aed';
  return {
    color,
    weight: selected ? 5.2 : air ? 3.4 : 4,
    opacity: muted ? ROUTE_FOCUS_DIM_OPACITY : selected ? 1 : air ? 0.9 : 0.88,
    dashArray: selected ? undefined : air ? '12, 10' : undefined,
    lineCap: 'round',
    lineJoin: 'round',
  };
};

const routeHaloStyle = (weight: number, opacity = 0.92): L.PolylineOptions => ({
  color: ROUTE_HALO_COLOR,
  weight,
  opacity,
  lineCap: 'round',
  lineJoin: 'round',
});

const edgeColorByType = (type?: string) => {
  switch (type) {
    case 'walk': return '#f97316';
    case 'car': return '#e11d48';
    case 'taxi': return '#d946ef';
    case 'transit':
    case 'bus':
    case 'subway':
    case 'train':
    case 'high_speed_rail':
      return '#059669';
    case 'ferry': return '#2563eb';
    default: return EDGE_ROUTE_COLOR;
  }
};

const edgeLineStyle = (edge: ItineraryEdge, segment: RouteSegment | undefined, hovered: boolean, selected = false, muted = false): L.PolylineOptions => {
  const failed = segment?.status === 'failed';
  const baseColor = edgeColorByType(edge.transportType);
  return {
    color: failed ? FALLBACK_ROUTE_COLOR : hovered || selected ? EDGE_ROUTE_HOVER_COLOR : baseColor,
    weight: selected ? 5.6 : hovered ? 5 : 3.8,
    opacity: muted ? ROUTE_FOCUS_DIM_OPACITY : failed ? 0.82 : 0.94,
    dashArray: failed ? '8, 8' : undefined,
    lineCap: 'round',
    lineJoin: 'round',
  };
};

const routeHoverMarkerStyle = (color: string) => ({
  color: ROUTE_HALO_COLOR,
  weight: 3,
  fillColor: color,
  fillOpacity: 1,
  opacity: 1,
});

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

const transportModeLabel = (route: ItineraryNode) => {
  if (route.transport_mode === 'flight') return '航班';
  if (route.transport_mode === 'high_speed_rail') return '高铁';
  if (route.transport_mode === 'train') return '火车';
  if (route.transport_mode === 'subway') return '地铁';
  if (route.transport_mode === 'bus') return '巴士';
  if (route.transport_mode === 'car') return '驾车';
  if (route.transport_mode === 'ferry') return '轮渡';
  return '交通';
};

const transportRouteLabel = (route: ItineraryNode, segment?: RouteSegment) => ({
  title: route.service_number || transportModeLabel(route),
  subtitle: `${route.departure_place || '出发地'} → ${route.arrival_place || '到达地'}`,
  metric: [segment?.distanceText, segment?.durationText || route.duration].filter(Boolean).join(' · '),
  warning: segment?.status === 'failed' ? '真实路线暂不可用，已回退直线' : '',
});

const edgeRouteLabel = (edge: ItineraryEdge, segment?: RouteSegment) => ({
  title: edgeTransportLabel(edge.transportType),
  subtitle: edge.linkKind === 'transport_leg' ? '交通区间路线' : '事件接续路线',
  metric: [segment?.distanceText || edge.distance, segment?.durationText || edge.duration].filter(Boolean).join(' · '),
  warning: segment?.status === 'failed' ? '真实路线暂不可用，已回退直线' : '',
});

const lodgingConnectionKind = (segment: RouteSegment) =>
  segment.linkId.startsWith('lodging-start:') ? 'start' : 'end';

const lodgingConnectionDay = (segment: RouteSegment) => {
  const match = segment.linkId.match(/:D(\d+):/);
  return match ? Number(match[1]) : null;
};

const lodgingConnectionLabel = (segment: RouteSegment) => {
  const start = lodgingConnectionKind(segment) === 'start';
  return {
    title: start ? '住宿出发' : '返回住宿',
    subtitle: start ? '住宿 → 当天第一站' : '当天最后一站 → 夜宿住宿',
    metric: [segment.distanceText, segment.durationText].filter(Boolean).join(' · '),
    warning: segment.status === 'failed' ? '真实路线暂不可用，已回退直线' : '',
  };
};

const lodgingConnectionLineStyle = (segment: RouteSegment, hovered = false, selected = false, muted = false): L.PolylineOptions => ({
  color: segment.status === 'failed' ? FALLBACK_ROUTE_COLOR : hovered || selected ? LODGING_ROUTE_HOVER_COLOR : LODGING_ROUTE_COLOR,
  weight: selected ? 5.3 : hovered ? 4.8 : 3.5,
  opacity: muted ? ROUTE_FOCUS_DIM_OPACITY : segment.status === 'failed' ? 0.82 : 0.92,
  dashArray: segment.status === 'failed' ? '8, 8' : '3, 9',
  lineCap: 'round',
  lineJoin: 'round',
});

const routeLabelHtml = ({ title, subtitle, metric, warning }: { title: string; subtitle: string; metric?: string; warning?: string }) => `
  <div style="min-width:150px;font-family:Inter,system-ui,sans-serif;padding:2px 0">
    <div style="font-size:11px;font-weight:900;color:#0f172a;line-height:1.25">${title}</div>
    <div style="margin-top:4px;font-size:10px;font-weight:700;color:#475569;line-height:1.3">${subtitle}</div>
    ${metric ? `<div style="margin-top:5px;font-size:10px;font-weight:900;color:#e11d48">${metric}</div>` : ''}
    ${warning ? `<div style="margin-top:4px;font-size:9px;font-weight:800;color:#b45309">${warning}</div>` : ''}
  </div>
`;

const transportIconType = (route: ItineraryNode) => {
  if (route.transport_mode === 'flight') return 'flight';
  if (route.transport_mode === 'train' || route.transport_mode === 'high_speed_rail' || route.transport_mode === 'subway') return 'train';
  if (route.transport_mode === 'car' || route.transport_mode === 'bus') return 'car';
  return 'other';
};

// Fit-Bounds helper to encompass active items automatically
function FitBoundsController({ points, activeDay }: { points: [number, number][]; activeDay: string | number }) {
  const map = useMap();
  const lastFittedDay = useRef<string | number | null>(null);

  useEffect(() => {
    if (points.length === 0 || lastFittedDay.current === activeDay) return;

    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    lastFittedDay.current = activeDay;
  }, [activeDay, map, points]);

  return null;
}

interface MapViewProps {
  mode?: 'home' | 'trip';
  trips?: TripSummary[];
  selectedHomeSlug?: string | null;
  onSelectHomeTrip?: (slug: string) => void;
  onOpenHomeTrip?: (slug: string) => void;
}

function HomeMapController({ trip }: { trip: TripSummary | null }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(trip ? [trip.center_lat, trip.center_lng] : [32, 12], homeTripZoom(trip), { duration: 1.25 });
  }, [map, trip]);
  return null;
}

type TransportRouteLayerProps = {
  route: ItineraryNode;
  routeSegment?: RouteSegment;
  selected: boolean;
  onSelect: () => void;
  renderTransportIcon: (type?: string) => React.ReactNode;
};

const TransportRouteLayer: React.FC<TransportRouteLayerProps> = ({
  route,
  routeSegment,
  selected,
  onSelect,
  renderTransportIcon,
}) => {
  const haloRef = useRef<L.Polyline>(null);
  const lineRef = useRef<L.Polyline>(null);
  const [hovered, setHovered] = useState(false);
  const path = routePathForTransport(route, routeSegment);
  const midpoint = pathMidpoint(path);
  const lineStyle = transportLineStyle(route, selected || hovered);
  const label = transportRouteLabel(route, routeSegment);

  useEffect(() => {
    if (selected) lineRef.current?.openPopup();
  }, [selected]);

  useEffect(() => {
    if (!selected && !hovered) return;
    haloRef.current?.bringToFront();
    lineRef.current?.bringToFront();
  }, [hovered, selected]);

  if (path.length < 2 || !midpoint) return null;

  return (
    <React.Fragment>
      <Polyline
        ref={haloRef}
        positions={path}
        pathOptions={routeHaloStyle(Number(lineStyle.weight || 3) + 4)}
        eventHandlers={{ click: onSelect, mouseover: () => setHovered(true), mouseout: () => setHovered(false) }}
      />
      <Polyline
        ref={lineRef}
        positions={path}
        pathOptions={lineStyle}
        eventHandlers={{ click: onSelect, mouseover: () => setHovered(true), mouseout: () => setHovered(false) }}
      >
        <Popup position={midpoint} autoPan={false} closeButton={false} closeOnClick={false}>
          <div className="min-w-48 font-sans">
            <div className="flex items-center gap-1.5 text-xs font-black text-sky-700">{renderTransportIcon(transportIconType(route))}{route.service_number || '区间交通'}</div>
            <div className="mt-2 text-[11px] font-bold text-slate-800">{route.departure_place} → {route.arrival_place}</div>
            <div className="mt-1 text-[9px] text-slate-500">D{route.day} · {route.time} - {route.arrival_time || '--:--'} · {routeSegment?.durationText || route.duration || '时长待补充'}</div>
            {routeSegment?.status === 'failed' && <div className="mt-1 text-[9px] font-bold text-amber-600">真实路线暂不可用，已回退为直线</div>}
          </div>
        </Popup>
      </Polyline>
      {hovered && !selected && (
        <CircleMarker center={midpoint} radius={7} pathOptions={routeHoverMarkerStyle(String(lineStyle.color || '#db2777'))}>
          <Tooltip direction="top" offset={[0, -10]} opacity={0.98} permanent>
            <div className="min-w-36 py-0.5 text-[10px] leading-tight">
              <div className="font-black text-slate-950">{label.title}</div>
              <div className="mt-0.5 font-bold text-slate-500">{label.subtitle}</div>
              {label.metric && <div className="mt-1 font-black text-rose-600">{label.metric}</div>}
              {label.warning && <div className="mt-0.5 font-bold text-amber-600">{label.warning}</div>}
            </div>
          </Tooltip>
        </CircleMarker>
      )}
      <Marker position={[route.departure_lat!, route.departure_lng!]} icon={transportEndpointIcon(selected)} eventHandlers={{ click: onSelect }} />
      <Marker position={[route.arrival_lat!, route.arrival_lng!]} icon={transportEndpointIcon(selected)} eventHandlers={{ click: onSelect }} />
    </React.Fragment>
  );
};

type ItineraryNodeMarkerProps = {
  node: ItineraryNode;
  selected: boolean;
  onSelect: () => void;
  onPreview: (preview: NonNullable<PreviewState>) => void;
};

const ItineraryNodeMarker: React.FC<ItineraryNodeMarkerProps> = ({
  node,
  selected,
  onSelect,
  onPreview,
}) => {
  const markerRef = useRef<L.Marker>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (selected) markerRef.current?.openPopup();
  }, [selected]);

  return (
    <Marker
      ref={markerRef}
      position={[node.lat, node.lng]}
      icon={createCustomMarkerIcon(node, selected)}
      eventHandlers={{ click: onSelect, mouseover: () => setHovered(true), mouseout: () => setHovered(false) }}
    >
      {hovered && !selected && (
        <Tooltip direction="top" offset={[0, -34]} opacity={0.98} permanent>
          <div className="min-w-40 max-w-56 py-0.5 text-[10px] leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: nodeColor(node) }} />
              <span className="font-black text-slate-950">{node.title}</span>
            </div>
            <div className="mt-1 font-bold text-slate-500">
              {nodeTypeLabel(node)} · D{node.day} · {node.time || '时间待定'}
            </div>
            {(node.city || node.address) && (
              <div className="mt-0.5 font-semibold text-slate-600">{node.city || node.address}</div>
            )}
            {node.description && <div className="mt-1 line-clamp-2 text-slate-500">{node.description}</div>}
          </div>
        </Tooltip>
      )}
      <Popup autoPan={false} closeButton={false} closeOnClick={false} className="itinerary-detail-popup">
        <div className="max-w-[220px] text-sm font-sans">
          {node.image_url && (
            <button onClick={() => onPreview({ node, index: 0 })} className="group relative mb-2 block h-24 w-full overflow-hidden rounded-lg">
              <img src={node.image_url} alt={node.title} className="h-full w-full object-cover transition group-hover:scale-105" />
              <span className="absolute inset-0 flex items-center justify-center bg-slate-950/0 text-[10px] font-bold text-white transition group-hover:bg-slate-950/35">点击查看大图</span>
            </button>
          )}
          <div className="mb-1 font-bold leading-tight text-slate-900">{node.title}</div>
          <div className="mb-1.5 flex items-center space-x-2">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
              style={{ background: nodeColor(node) }}
            >
              {nodeTypeLabel(node)}
            </span>
            <span className="font-mono text-[11px] font-semibold text-slate-500">
              Day {node.day} · {node.date.slice(5)} · {node.time}
            </span>
          </div>
          {node.description && (
            <p className="mt-1 line-clamp-3 text-xs leading-snug text-slate-600">{node.description}</p>
          )}
        </div>
      </Popup>
    </Marker>
  );
};

type ProviderMapCanvasProps = {
  provider: 'google' | 'amap';
  mode: 'home' | 'trip';
  trips: TripSummary[];
  selectedHomeTrip: TripSummary | null;
  selectedHomeSlug: string | null;
  visibleNodes: ItineraryNode[];
  visibleTransportRoutes: ItineraryNode[];
  visibleLodgings: VisibleLodgingMarker[];
  visibleLodgingRouteSegments: RouteSegment[];
  visibleEdges: ItineraryEdge[];
  routeSegments: RouteSegment[];
  nodes: ItineraryNode[];
  activeNodeId: string | null;
  activeEdgeId: string | null;
  setActiveNodeId: (id: string | null) => void;
  setActiveEdgeId: (id: string | null) => void;
  onSelectHomeTrip?: (slug: string) => void;
  onOpenHomeTrip?: (slug: string) => void;
};

const ProviderMissingFallback = ({
  provider,
  children,
}: {
  provider: 'google' | 'amap';
  children: React.ReactNode;
}) => (
  <div className="relative h-full w-full">
    {children}
    <div className="absolute left-1/2 top-5 z-[10000] -translate-x-1/2 rounded-2xl border border-white/70 bg-white/90 px-4 py-3 text-center text-[11px] font-bold text-slate-700 shadow-xl backdrop-blur-xl">
      <div className="text-slate-950">{mapProviderLabel[provider]} 浏览器 Key 未配置</div>
      <div className="mt-1 text-[10px] font-semibold text-slate-500">当前仅使用开发预览底图；配置 Key 后自动切换正式地图。</div>
    </div>
  </div>
);

const googleLatLng = (point: [number, number]) => ({ lat: point[0], lng: point[1] });

const clearGoogleHomeCameraTimers = (timersRef: React.MutableRefObject<number[]>) => {
  timersRef.current.forEach((timer) => window.clearTimeout(timer));
  timersRef.current = [];
};

const queueGoogleHomeCameraStep = (timersRef: React.MutableRefObject<number[]>, delay: number, step: () => void) => {
  const timer = window.setTimeout(() => {
    timersRef.current = timersRef.current.filter((item) => item !== timer);
    step();
  }, delay);
  timersRef.current.push(timer);
};

const animateGoogleZoom = (
  map: any,
  fromZoom: number,
  toZoom: number,
  delay: number,
  timersRef: React.MutableRefObject<number[]>,
) => {
  const start = Math.round(fromZoom);
  const end = Math.round(toZoom);
  const direction = Math.sign(end - start);
  if (!direction) return;
  const steps = Math.abs(end - start);
  for (let index = 1; index <= steps; index += 1) {
    queueGoogleHomeCameraStep(timersRef, delay + index * 115, () => map.setZoom(start + direction * index));
  }
};

const runGoogleHomeCameraTransition = (
  map: any,
  trip: TripSummary,
  previousSlug: string | null,
  timersRef: React.MutableRefObject<number[]>,
) => {
  clearGoogleHomeCameraTimers(timersRef);
  const target = { lat: trip.center_lat, lng: trip.center_lng };
  const targetZoom = homeTripZoom(trip);
  const currentZoom = Number(map.getZoom?.() ?? targetZoom);
  const currentCenter = map.getCenter?.();
  const currentLat = Number(currentCenter?.lat?.() ?? target.lat);
  const currentLng = Number(currentCenter?.lng?.() ?? target.lng);
  const distanceKm = routeDistanceKm(currentLat, currentLng, target.lat, target.lng);
  const shouldTravelAcrossWorld = Boolean(previousSlug && previousSlug !== trip.slug && distanceKm > 900);

  if (!shouldTravelAcrossWorld) {
    map.panTo(target);
    animateGoogleZoom(map, currentZoom, targetZoom, 120, timersRef);
    return;
  }

  const overviewZoom = distanceKm > 5200 ? 3 : 4;
  const zoomOutDuration = Math.abs(Math.round(currentZoom) - overviewZoom) * 115;
  const panDelay = zoomOutDuration + 140;
  animateGoogleZoom(map, currentZoom, overviewZoom, 0, timersRef);
  queueGoogleHomeCameraStep(timersRef, panDelay, () => map.panTo(target));
  queueGoogleHomeCameraStep(timersRef, panDelay + 560, () => animateGoogleZoom(map, overviewZoom, targetZoom, 0, timersRef));
};
const nodeInfoHtml = (node: ItineraryNode) => {
  const image = imagesOf(node)[0];
  return `
    <div style="max-width:230px;font-family:Inter,system-ui,sans-serif">
      ${image ? `<img src="${escapeHtml(image)}" alt="" style="width:100%;height:92px;object-fit:cover;border-radius:12px;margin-bottom:8px" />` : ''}
      <div style="font-weight:900;color:#0f172a;font-size:13px;line-height:1.25">${escapeHtml(node.title)}</div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:6px">
        <span style="border-radius:999px;background:${nodeColor(node)};color:white;padding:2px 8px;font-size:10px;font-weight:800">${nodeTypeLabel(node)}</span>
        <span style="font-size:10px;color:#64748b;font-weight:700">D${node.day} · ${escapeHtml(node.time)}</span>
      </div>
      ${node.city || node.address ? `<div style="margin-top:6px;color:#334155;font-size:11px;font-weight:700;line-height:1.35">${escapeHtml(node.city || node.address)}</div>` : ''}
      ${node.description ? `<div style="margin-top:6px;color:#475569;font-size:11px;line-height:1.45">${escapeHtml(node.description)}</div>` : ''}
    </div>
  `;
};

const nodeHoverLabelHtml = (node: ItineraryNode) => `
  <div style="min-width:160px;max-width:220px;font-family:Inter,system-ui,sans-serif">
    <div style="display:flex;align-items:center;gap:6px">
      <span style="width:9px;height:9px;border-radius:999px;background:${nodeColor(node)};box-shadow:0 0 0 3px rgba(255,255,255,.92)"></span>
      <span style="font-size:12px;font-weight:900;color:#0f172a;line-height:1.25">${escapeHtml(node.title)}</span>
    </div>
    <div style="margin-top:5px;font-size:10px;font-weight:800;color:#64748b">${escapeHtml(nodeTypeLabel(node))} · D${node.day} · ${escapeHtml(node.time || '时间待定')}</div>
    ${node.city || node.address ? `<div style="margin-top:4px;font-size:10px;font-weight:700;color:#475569;line-height:1.35">${escapeHtml(node.city || node.address)}</div>` : ''}
    ${node.description ? `<div style="margin-top:5px;font-size:10px;color:#64748b;line-height:1.35">${escapeHtml(node.description)}</div>` : ''}
  </div>
`;

const lodgingStayText = (stays: Stay[]) =>
  stays
    .map((stay) => `D${stay.check_in_day}-D${stay.check_out_day} · ${stay.check_in_date.slice(5)} 入住`)
    .join(' / ');

const lodgingInfoHtml = (lodging: Lodging, stays: Stay[]) => {
  const image = lodgingImagesOf(lodging)[0];
  return `
    <div style="max-width:230px;font-family:Inter,system-ui,sans-serif">
      ${image ? `<img src="${escapeHtml(image)}" alt="" style="width:100%;height:92px;object-fit:cover;border-radius:12px;margin-bottom:8px" />` : ''}
      <div style="font-weight:900;color:#0f172a;font-size:13px;line-height:1.25">${escapeHtml(lodging.name)}</div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:6px">
        <span style="border-radius:999px;background:#10b981;color:white;padding:2px 8px;font-size:10px;font-weight:800">住宿</span>
        <span style="font-size:10px;color:#64748b;font-weight:700">${escapeHtml(lodging.booking_site || '住宿')}</span>
      </div>
      <div style="margin-top:6px;color:#475569;font-size:11px;line-height:1.45">${escapeHtml(lodging.address || lodging.city || '地址待补充')}</div>
      ${stays.length ? `<div style="margin-top:6px;color:#047857;font-size:10px;font-weight:800">${escapeHtml(lodgingStayText(stays))}</div>` : ''}
    </div>
  `;
};

const transportInfoHtml = (route: ItineraryNode) => `
  <div style="min-width:190px;font-family:Inter,system-ui,sans-serif">
    <div style="font-size:12px;font-weight:900;color:#0369a1">${route.service_number || '区间交通'}</div>
    <div style="margin-top:8px;font-size:12px;font-weight:800;color:#0f172a">${route.departure_place || '出发地'} → ${route.arrival_place || '到达地'}</div>
    <div style="margin-top:4px;font-size:10px;color:#64748b;font-weight:700">D${route.day} · ${route.time} - ${route.arrival_time || '--:--'} · ${route.duration || '时长待补充'}</div>
  </div>
`;

const GoogleMapCanvas: React.FC<ProviderMapCanvasProps> = ({
  mode,
  trips,
  selectedHomeTrip,
  selectedHomeSlug,
  visibleNodes,
  visibleTransportRoutes,
  visibleLodgings,
  visibleLodgingRouteSegments,
  visibleEdges,
  routeSegments,
  nodes,
  activeNodeId,
  activeEdgeId,
  setActiveNodeId,
  setActiveEdgeId,
  onSelectHomeTrip,
  onOpenHomeTrip,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const infoRef = useRef<any>(null);
  const hoverInfoRef = useRef<any>(null);
  const hoverOverlaysRef = useRef<any[]>([]);
  const homeCameraTimersRef = useRef<number[]>([]);
  const lastHomeSlugRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(googleMapsBrowserKey())
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        setError(null);
        if (!mapRef.current) {
          mapRef.current = new maps.Map(containerRef.current, {
            center: selectedHomeTrip ? { lat: selectedHomeTrip.center_lat, lng: selectedHomeTrip.center_lng } : { lat: 32, lng: 12 },
            zoom: homeTripZoom(selectedHomeTrip),
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            gestureHandling: 'greedy',
          });
          infoRef.current = new maps.InfoWindow();
          hoverInfoRef.current = new maps.InfoWindow();
        }
        if (!infoRef.current) infoRef.current = new maps.InfoWindow();
        if (!hoverInfoRef.current) hoverInfoRef.current = new maps.InfoWindow();

        const clearRouteHover = () => {
          hoverOverlaysRef.current.forEach((overlay) => overlay.setMap?.(null));
          hoverOverlaysRef.current = [];
          hoverInfoRef.current?.close();
        };
        clearRouteHover();
        overlaysRef.current.forEach((overlay) => overlay.setMap?.(null));
        overlaysRef.current = [];
        const bounds = new maps.LatLngBounds();
        let hasBounds = false;
        const remember = (lat: number, lng: number) => {
          bounds.extend({ lat, lng });
          hasBounds = true;
        };
        const routeVisuals: Array<{
          id: string;
          line: any;
          halo: any;
          color: string;
          weight: number;
          opacity: number;
          haloWeight: number;
          lineZIndex: number;
          haloZIndex: number;
        }> = [];
        const resetRouteVisualFocus = () => {
          routeVisuals.forEach((route) => {
            route.halo.setOptions({
              strokeOpacity: 0.9,
              strokeWeight: route.haloWeight,
              zIndex: route.haloZIndex,
            });
            route.line.setOptions({
              strokeColor: route.color,
              strokeOpacity: route.opacity,
              strokeWeight: route.weight,
              zIndex: route.lineZIndex,
            });
          });
        };
        const focusRouteVisual = (id: string, color: string, weight: number) => {
          routeVisuals.forEach((route) => {
            const focused = route.id === id;
            route.halo.setOptions({
              strokeOpacity: focused ? 1 : ROUTE_FOCUS_DIM_OPACITY,
              strokeWeight: focused ? weight + 7 : route.haloWeight,
              zIndex: focused ? ROUTE_HOVER_Z_INDEX - 1 : route.haloZIndex,
            });
            route.line.setOptions({
              strokeColor: focused ? color : route.color,
              strokeOpacity: focused ? 1 : ROUTE_FOCUS_DIM_OPACITY,
              strokeWeight: focused ? weight : route.weight,
              zIndex: focused ? ROUTE_HOVER_Z_INDEX : route.lineZIndex,
            });
          });
        };

        if (mode === 'home') {
          trips.forEach((trip) => {
            remember(trip.center_lat, trip.center_lng);
            const marker = new maps.Marker({
              map: mapRef.current,
              position: { lat: trip.center_lat, lng: trip.center_lng },
              title: trip.title,
              label: { text: trip.title.slice(0, 8), color: '#111827', fontWeight: '800', fontSize: '11px' },
            });
            marker.addListener('click', () => {
              onSelectHomeTrip?.(trip.slug);
              infoRef.current?.close();
            });
            overlaysRef.current.push(marker);
          });
          if (selectedHomeTrip) {
            runGoogleHomeCameraTransition(mapRef.current, selectedHomeTrip, lastHomeSlugRef.current, homeCameraTimersRef);
            lastHomeSlugRef.current = selectedHomeTrip.slug;
          } else {
            clearGoogleHomeCameraTimers(homeCameraTimersRef);
            lastHomeSlugRef.current = null;
          }
        } else {
          visibleTransportRoutes.forEach((route) => {
            const routeSegment = routeSegmentFor(routeSegments, 'transport_node', route.id);
            const path = routePathForTransport(route, routeSegment).map(googleLatLng);
            if (path.length < 2) return;
            path.forEach((point) => remember(point.lat, point.lng));
            const selected = activeNodeId === route.id;
            const style = transportLineStyle(route, selected);
            const hoverStyle = transportLineStyle(route, true);
            const midpoint = path[Math.floor(path.length / 2)];
            const label = transportRouteLabel(route, routeSegment);
            const halo = new maps.Polyline({
              map: mapRef.current,
              path,
              strokeColor: ROUTE_HALO_COLOR,
              strokeOpacity: 0.9,
              strokeWeight: Number(style.weight || 3) + 5,
              zIndex: selected ? ROUTE_HOVER_Z_INDEX - 1 : 10,
            });
            const line = new maps.Polyline({
              map: mapRef.current,
              path,
              strokeColor: String(style.color || '#0ea5e9'),
              strokeOpacity: Number(style.opacity || 0.8),
              strokeWeight: Number(style.weight || 3),
              zIndex: selected ? ROUTE_HOVER_Z_INDEX : ROUTE_BASE_Z_INDEX,
            });
            const routeVisualId = `transport:${route.id}`;
            routeVisuals.push({
              id: routeVisualId,
              line,
              halo,
              color: String(style.color || '#0ea5e9'),
              weight: Number(style.weight || 3),
              opacity: Number(style.opacity || 0.8),
              haloWeight: Number(style.weight || 3) + 5,
              lineZIndex: selected ? ROUTE_HOVER_Z_INDEX : ROUTE_BASE_Z_INDEX,
              haloZIndex: selected ? ROUTE_HOVER_Z_INDEX - 1 : 10,
            });
            line.addListener('click', () => {
              setActiveNodeId(route.id);
              infoRef.current.setContent(transportInfoHtml(route));
              infoRef.current.setPosition(path[Math.floor(path.length / 2)]);
              infoRef.current.open(mapRef.current);
            });
            line.addListener('mouseover', () => {
              clearRouteHover();
              focusRouteVisual(routeVisualId, String(hoverStyle.color || style.color || '#db2777'), Number(hoverStyle.weight || 5));
              line.setOptions({
                strokeWeight: Number(hoverStyle.weight || 5),
                strokeOpacity: 1,
              });
              const marker = new maps.Marker({
                map: mapRef.current,
                position: midpoint,
                icon: {
                  path: maps.SymbolPath.CIRCLE,
                  fillColor: String(style.color || '#db2777'),
                  fillOpacity: 1,
                  strokeColor: ROUTE_HALO_COLOR,
                  strokeWeight: 3,
                  scale: 7,
                },
              });
              hoverOverlaysRef.current.push(marker);
              hoverInfoRef.current.setContent(routeLabelHtml(label));
              hoverInfoRef.current.setPosition(midpoint);
              hoverInfoRef.current.open(mapRef.current);
            });
            line.addListener('mouseout', () => {
              resetRouteVisualFocus();
              clearRouteHover();
            });
            overlaysRef.current.push(halo);
            overlaysRef.current.push(line);
          });

          visibleEdges.forEach((edge) => {
            const routeSegment = routeSegmentFor(routeSegments, 'edge', edge.id);
            const path = routePathForEdge(edge, nodes, routeSegment).map(googleLatLng);
            if (path.length < 2) return;
            path.forEach((point) => remember(point.lat, point.lng));
            const selected = activeEdgeId === edge.id;
            const style = edgeLineStyle(edge, routeSegment, false, selected);
            const hoverStyle = edgeLineStyle(edge, routeSegment, true, selected);
            const midpoint = path[Math.floor(path.length / 2)];
            const label = edgeRouteLabel(edge, routeSegment);
            const halo = new maps.Polyline({
              map: mapRef.current,
              path,
              strokeColor: ROUTE_HALO_COLOR,
              strokeOpacity: 0.9,
              strokeWeight: Number(style.weight || 3) + 5,
              zIndex: selected ? ROUTE_HOVER_Z_INDEX - 1 : 8,
            });
            const line = new maps.Polyline({
              map: mapRef.current,
              path,
              strokeColor: String(style.color || EDGE_ROUTE_COLOR),
              strokeOpacity: Number(style.opacity || 0.9),
              strokeWeight: Number(style.weight || 3),
              zIndex: selected ? ROUTE_HOVER_Z_INDEX : ROUTE_BASE_Z_INDEX - 2,
            });
            const routeVisualId = `edge:${edge.id}`;
            routeVisuals.push({
              id: routeVisualId,
              line,
              halo,
              color: String(style.color || EDGE_ROUTE_COLOR),
              weight: Number(style.weight || 3),
              opacity: Number(style.opacity || 0.9),
              haloWeight: Number(style.weight || 3) + 5,
              lineZIndex: selected ? ROUTE_HOVER_Z_INDEX : ROUTE_BASE_Z_INDEX - 2,
              haloZIndex: selected ? ROUTE_HOVER_Z_INDEX - 1 : 8,
            });
            line.addListener('click', () => setActiveEdgeId(edge.id));
            line.addListener('mouseover', () => {
              clearRouteHover();
              focusRouteVisual(routeVisualId, String(hoverStyle.color || EDGE_ROUTE_HOVER_COLOR), Number(hoverStyle.weight || 5));
              line.setOptions({
                strokeColor: String(hoverStyle.color || EDGE_ROUTE_HOVER_COLOR),
                strokeWeight: Number(hoverStyle.weight || 5),
                strokeOpacity: 1,
              });
              const marker = new maps.Marker({
                map: mapRef.current,
                position: midpoint,
                icon: {
                  path: maps.SymbolPath.CIRCLE,
                  fillColor: String(hoverStyle.color || EDGE_ROUTE_HOVER_COLOR),
                  fillOpacity: 1,
                  strokeColor: ROUTE_HALO_COLOR,
                  strokeWeight: 3,
                  scale: 7,
                },
              });
              hoverOverlaysRef.current.push(marker);
              hoverInfoRef.current.setContent(routeLabelHtml(label));
              hoverInfoRef.current.setPosition(midpoint);
              hoverInfoRef.current.open(mapRef.current);
            });
            line.addListener('mouseout', () => {
              resetRouteVisualFocus();
              clearRouteHover();
            });
            overlaysRef.current.push(halo);
            overlaysRef.current.push(line);
          });

          visibleLodgingRouteSegments.forEach((segment) => {
            const path = routePathForSegment(segment).map(googleLatLng);
            if (path.length < 2) return;
            path.forEach((point) => remember(point.lat, point.lng));
            const selected = activeEdgeId === `lodging:${segment.id}`;
            const muted = Boolean(activeEdgeId) && !selected;
            const style = lodgingConnectionLineStyle(segment, false, selected, muted);
            const hoverStyle = lodgingConnectionLineStyle(segment, true, selected);
            const midpoint = path[Math.floor(path.length / 2)];
            const label = lodgingConnectionLabel(segment);
            const halo = new maps.Polyline({
              map: mapRef.current,
              path,
              strokeColor: ROUTE_HALO_COLOR,
              strokeOpacity: 0.9,
              strokeWeight: Number(style.weight || 3) + 5,
              zIndex: selected ? ROUTE_HOVER_Z_INDEX - 1 : 7,
            });
            const line = new maps.Polyline({
              map: mapRef.current,
              path,
              strokeColor: String(style.color || LODGING_ROUTE_COLOR),
              strokeOpacity: Number(style.opacity || 0.9),
              strokeWeight: Number(style.weight || 3),
              zIndex: selected ? ROUTE_HOVER_Z_INDEX : ROUTE_BASE_Z_INDEX - 3,
            });
            const routeVisualId = `lodging:${segment.id}`;
            routeVisuals.push({
              id: routeVisualId,
              line,
              halo,
              color: String(style.color || LODGING_ROUTE_COLOR),
              weight: Number(style.weight || 3),
              opacity: Number(style.opacity || 0.9),
              haloWeight: Number(style.weight || 3) + 5,
              lineZIndex: selected ? ROUTE_HOVER_Z_INDEX : ROUTE_BASE_Z_INDEX - 3,
              haloZIndex: selected ? ROUTE_HOVER_Z_INDEX - 1 : 7,
            });
            line.addListener('click', () => setActiveEdgeId(routeVisualId));
            line.addListener('mouseover', () => {
              clearRouteHover();
              focusRouteVisual(routeVisualId, String(hoverStyle.color || LODGING_ROUTE_HOVER_COLOR), Number(hoverStyle.weight || 5));
              line.setOptions({
                strokeColor: String(hoverStyle.color || LODGING_ROUTE_HOVER_COLOR),
                strokeWeight: Number(hoverStyle.weight || 5),
                strokeOpacity: 1,
              });
              const marker = new maps.Marker({
                map: mapRef.current,
                position: midpoint,
                icon: {
                  path: maps.SymbolPath.CIRCLE,
                  fillColor: LODGING_ROUTE_HOVER_COLOR,
                  fillOpacity: 1,
                  strokeColor: ROUTE_HALO_COLOR,
                  strokeWeight: 3,
                  scale: 7,
                },
              });
              hoverOverlaysRef.current.push(marker);
              hoverInfoRef.current.setContent(routeLabelHtml(label));
              hoverInfoRef.current.setPosition(midpoint);
              hoverInfoRef.current.open(mapRef.current);
            });
            line.addListener('mouseout', () => {
              resetRouteVisualFocus();
              clearRouteHover();
            });
            overlaysRef.current.push(halo);
            overlaysRef.current.push(line);
          });

          visibleLodgings.forEach(({ lodging, stays }) => {
            remember(lodging.lat, lodging.lng);
            const marker = new maps.Marker({
              map: mapRef.current,
              position: { lat: lodging.lat, lng: lodging.lng },
              title: lodging.name,
              icon: {
                path: maps.SymbolPath.CIRCLE,
                fillColor: '#10b981',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 3,
                scale: 11,
              },
              label: { text: '宿', color: '#ffffff', fontWeight: '900', fontSize: '11px' },
            });
            marker.addListener('click', () => {
              infoRef.current.setContent(lodgingInfoHtml(lodging, stays));
              infoRef.current.open(mapRef.current, marker);
            });
            overlaysRef.current.push(marker);
          });

          visibleNodes.forEach((node) => {
            remember(node.lat, node.lng);
            const marker = new maps.Marker({
              map: mapRef.current,
              position: { lat: node.lat, lng: node.lng },
              title: node.title,
              icon: {
                path: maps.SymbolPath.CIRCLE,
                fillColor: nodeColor(node),
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: activeNodeId === node.id ? 4 : 2,
                scale: activeNodeId === node.id ? 12 : 10,
              },
            });
            const openNodeInfo = () => {
              infoRef.current.setContent(nodeInfoHtml(node));
              infoRef.current.open(mapRef.current, marker);
            };
            marker.addListener('click', () => {
              clearRouteHover();
              setActiveNodeId(node.id);
              openNodeInfo();
            });
            marker.addListener('mouseover', () => {
              clearRouteHover();
              hoverInfoRef.current.setContent(nodeHoverLabelHtml(node));
              hoverInfoRef.current.open(mapRef.current, marker);
            });
            marker.addListener('mouseout', () => hoverInfoRef.current?.close());
            if (activeNodeId === node.id) openNodeInfo();
            overlaysRef.current.push(marker);
          });
        }

        if (hasBounds && mode === 'trip') mapRef.current.fitBounds(bounds, 80);
        else if (hasBounds && !selectedHomeTrip) mapRef.current.fitBounds(bounds, 80);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Google Maps 加载失败'));

    return () => {
      cancelled = true;
      clearGoogleHomeCameraTimers(homeCameraTimersRef);
    };
  }, [activeEdgeId, activeNodeId, mode, nodes, onOpenHomeTrip, onSelectHomeTrip, routeSegments, selectedHomeTrip, selectedHomeSlug, setActiveEdgeId, setActiveNodeId, trips, visibleEdges, visibleLodgingRouteSegments, visibleLodgings, visibleNodes, visibleTransportRoutes]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {error && (
        <div className="absolute inset-0 z-[10000] flex items-center justify-center bg-slate-950/70 p-6 text-center text-white backdrop-blur-sm">
          <div className="max-w-sm rounded-3xl border border-white/15 bg-slate-950/80 p-5 shadow-2xl">
            <div className="text-sm font-black">Google Maps 未启用</div>
            <div className="mt-2 text-xs font-semibold text-slate-300">{error}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const AmapCanvas: React.FC<ProviderMapCanvasProps> = ({
  mode,
  trips,
  selectedHomeTrip,
  selectedHomeSlug,
  visibleNodes,
  visibleTransportRoutes,
  visibleLodgings,
  visibleLodgingRouteSegments,
  visibleEdges,
  routeSegments,
  nodes,
  activeNodeId,
  activeEdgeId,
  setActiveNodeId,
  setActiveEdgeId,
  onSelectHomeTrip,
  onOpenHomeTrip,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const infoRef = useRef<any>(null);
  const hoverInfoRef = useRef<any>(null);
  const hoverOverlaysRef = useRef<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAmap(amapBrowserKey(), amapSecurityCode())
      .then((AMap) => {
        if (cancelled || !containerRef.current) return;
        setError(null);
        const centerSource = selectedHomeTrip ? [selectedHomeTrip.center_lat, selectedHomeTrip.center_lng] : [34, 108];
        const [centerLat, centerLng] = toProviderPoint(centerSource[0], centerSource[1], 'amap');
        if (!mapRef.current) {
          mapRef.current = new AMap.Map(containerRef.current, {
            center: [centerLng, centerLat],
            zoom: selectedHomeTrip ? homeTripZoom(selectedHomeTrip) : 4,
            viewMode: '2D',
          });
          mapRef.current.addControl(new AMap.Scale());
          mapRef.current.addControl(new AMap.ToolBar({ position: 'RB' }));
        }
        if (!hoverInfoRef.current) {
          hoverInfoRef.current = new AMap.InfoWindow({
            isCustom: false,
            offset: new AMap.Pixel(0, -18),
          });
        }
        if (!infoRef.current) {
          infoRef.current = new AMap.InfoWindow({
            isCustom: false,
            offset: new AMap.Pixel(0, -18),
          });
        }
        const clearRouteHover = () => {
          hoverOverlaysRef.current.forEach((overlay) => mapRef.current?.remove(overlay));
          hoverOverlaysRef.current = [];
          hoverInfoRef.current?.close();
        };
        clearRouteHover();
        overlaysRef.current.forEach((overlay) => mapRef.current.remove(overlay));
        overlaysRef.current = [];
        const boundsPoints: [number, number][] = [];
        const remember = (lat: number, lng: number) => {
          const [gcjLat, gcjLng] = toProviderPoint(lat, lng, 'amap');
          boundsPoints.push([gcjLng, gcjLat]);
          return [gcjLng, gcjLat] as [number, number];
        };
        const rememberProviderPoint = (lat: number, lng: number) => {
          boundsPoints.push([lng, lat]);
          return [lng, lat] as [number, number];
        };
        const routeVisuals: Array<{
          id: string;
          line: any;
          halo: any;
          color: string;
          weight: number;
          opacity: number;
          haloWeight: number;
          lineZIndex: number;
          haloZIndex: number;
        }> = [];
        const resetRouteVisualFocus = () => {
          routeVisuals.forEach((route) => {
            route.halo.setOptions({
              strokeOpacity: 0.92,
              strokeWeight: route.haloWeight,
              zIndex: route.haloZIndex,
            });
            route.line.setOptions({
              strokeColor: route.color,
              strokeOpacity: route.opacity,
              strokeWeight: route.weight,
              zIndex: route.lineZIndex,
            });
          });
        };
        const focusRouteVisual = (id: string, color: string, weight: number) => {
          routeVisuals.forEach((route) => {
            const focused = route.id === id;
            route.halo.setOptions({
              strokeOpacity: focused ? 1 : ROUTE_FOCUS_DIM_OPACITY,
              strokeWeight: focused ? weight + 7 : route.haloWeight,
              zIndex: focused ? ROUTE_HOVER_Z_INDEX - 1 : route.haloZIndex,
            });
            route.line.setOptions({
              strokeColor: focused ? color : route.color,
              strokeOpacity: focused ? 1 : ROUTE_FOCUS_DIM_OPACITY,
              strokeWeight: focused ? weight : route.weight,
              zIndex: focused ? ROUTE_HOVER_Z_INDEX : route.lineZIndex,
            });
          });
        };

        if (mode === 'home') {
          trips.forEach((trip) => {
            const position = remember(trip.center_lat, trip.center_lng);
            const marker = new AMap.Marker({
              map: mapRef.current,
              position,
              title: trip.title,
              label: { content: trip.title, direction: 'top' },
            });
            marker.on('click', () => {
              onSelectHomeTrip?.(trip.slug);
              infoRef.current?.close();
            });
            overlaysRef.current.push(marker);
          });
        } else {
          visibleTransportRoutes.forEach((route) => {
            const routeSegment = routeSegmentFor(routeSegments, 'transport_node', route.id);
            const pathPoints = routePathForTransport(route, routeSegment, true);
            const path = routeSegment?.coordSystem === 'gcj02'
              ? pathPoints.map(([lat, lng]) => rememberProviderPoint(lat, lng))
              : pathPoints.map(([lat, lng]) => remember(lat, lng));
            if (path.length < 2) return;
            const selected = activeNodeId === route.id;
            const style = transportLineStyle(route, selected);
            const hoverStyle = transportLineStyle(route, true);
            const midpoint = path[Math.floor(path.length / 2)];
            const label = transportRouteLabel(route, routeSegment);
            const halo = new AMap.Polyline({
              map: mapRef.current,
              path,
              strokeColor: ROUTE_HALO_COLOR,
              strokeOpacity: 0.92,
              strokeWeight: Number(style.weight || 3) + 5,
              strokeStyle: 'solid',
              zIndex: selected ? ROUTE_HOVER_Z_INDEX - 1 : 10,
            });
            const line = new AMap.Polyline({
              map: mapRef.current,
              path,
              strokeColor: String(style.color || '#0ea5e9'),
              strokeOpacity: Number(style.opacity || 0.8),
              strokeWeight: Number(style.weight || 3),
              strokeStyle: !selected && isAirTransport(route) ? 'dashed' : 'solid',
              zIndex: selected ? ROUTE_HOVER_Z_INDEX : ROUTE_BASE_Z_INDEX,
            });
            const routeVisualId = `transport:${route.id}`;
            routeVisuals.push({
              id: routeVisualId,
              line,
              halo,
              color: String(style.color || '#0ea5e9'),
              weight: Number(style.weight || 3),
              opacity: Number(style.opacity || 0.8),
              haloWeight: Number(style.weight || 3) + 5,
              lineZIndex: selected ? ROUTE_HOVER_Z_INDEX : ROUTE_BASE_Z_INDEX,
              haloZIndex: selected ? ROUTE_HOVER_Z_INDEX - 1 : 10,
            });
            line.on('click', () => setActiveNodeId(route.id));
            line.on('mouseover', () => {
              clearRouteHover();
              focusRouteVisual(routeVisualId, String(hoverStyle.color || style.color || '#db2777'), Number(hoverStyle.weight || 5));
              line.setOptions({
                strokeWeight: Number(hoverStyle.weight || 5),
                strokeOpacity: 1,
              });
              const marker = new AMap.Marker({
                map: mapRef.current,
                position: midpoint,
                content: `<div style="width:16px;height:16px;border-radius:999px;background:${String(style.color || '#db2777')};border:3px solid white;box-shadow:0 8px 18px rgba(15,23,42,.28)"></div>`,
                offset: new AMap.Pixel(-8, -8),
              });
              hoverOverlaysRef.current.push(marker);
              hoverInfoRef.current.setContent(routeLabelHtml(label));
              hoverInfoRef.current.open(mapRef.current, midpoint);
            });
            line.on('mouseout', () => {
              resetRouteVisualFocus();
              clearRouteHover();
            });
            overlaysRef.current.push(halo);
            overlaysRef.current.push(line);
          });
          visibleEdges.forEach((edge) => {
            const routeSegment = routeSegmentFor(routeSegments, 'edge', edge.id);
            const pathPoints = routePathForEdge(edge, nodes, routeSegment, true);
            if (pathPoints.length < 2) return;
            const path = routeSegment?.coordSystem === 'gcj02'
              ? pathPoints.map(([lat, lng]) => rememberProviderPoint(lat, lng))
              : pathPoints.map(([lat, lng]) => remember(lat, lng));
            const selected = activeEdgeId === edge.id;
            const style = edgeLineStyle(edge, routeSegment, false, selected);
            const hoverStyle = edgeLineStyle(edge, routeSegment, true, selected);
            const midpoint = path[Math.floor(path.length / 2)];
            const label = edgeRouteLabel(edge, routeSegment);
            const halo = new AMap.Polyline({
              map: mapRef.current,
              path,
              strokeColor: ROUTE_HALO_COLOR,
              strokeOpacity: 0.92,
              strokeWeight: Number(style.weight || 3) + 5,
              strokeStyle: 'solid',
              zIndex: selected ? ROUTE_HOVER_Z_INDEX - 1 : 8,
            });
            const line = new AMap.Polyline({
              map: mapRef.current,
              path,
              strokeColor: String(style.color || EDGE_ROUTE_COLOR),
              strokeOpacity: Number(style.opacity || 0.9),
              strokeWeight: Number(style.weight || 3),
              strokeStyle: routeSegment?.status === 'failed' ? 'dashed' : 'solid',
              zIndex: selected ? ROUTE_HOVER_Z_INDEX : ROUTE_BASE_Z_INDEX - 2,
            });
            const routeVisualId = `edge:${edge.id}`;
            routeVisuals.push({
              id: routeVisualId,
              line,
              halo,
              color: String(style.color || EDGE_ROUTE_COLOR),
              weight: Number(style.weight || 3),
              opacity: Number(style.opacity || 0.9),
              haloWeight: Number(style.weight || 3) + 5,
              lineZIndex: selected ? ROUTE_HOVER_Z_INDEX : ROUTE_BASE_Z_INDEX - 2,
              haloZIndex: selected ? ROUTE_HOVER_Z_INDEX - 1 : 8,
            });
            line.on('click', () => setActiveEdgeId(edge.id));
            line.on('mouseover', () => {
              clearRouteHover();
              focusRouteVisual(routeVisualId, String(hoverStyle.color || EDGE_ROUTE_HOVER_COLOR), Number(hoverStyle.weight || 5));
              line.setOptions({
                strokeColor: String(hoverStyle.color || EDGE_ROUTE_HOVER_COLOR),
                strokeWeight: Number(hoverStyle.weight || 5),
                strokeOpacity: 1,
              });
              const marker = new AMap.Marker({
                map: mapRef.current,
                position: midpoint,
                content: `<div style="width:16px;height:16px;border-radius:999px;background:${String(hoverStyle.color || EDGE_ROUTE_HOVER_COLOR)};border:3px solid white;box-shadow:0 8px 18px rgba(15,23,42,.28)"></div>`,
                offset: new AMap.Pixel(-8, -8),
              });
              hoverOverlaysRef.current.push(marker);
              hoverInfoRef.current.setContent(routeLabelHtml(label));
              hoverInfoRef.current.open(mapRef.current, midpoint);
            });
            line.on('mouseout', () => {
              resetRouteVisualFocus();
              clearRouteHover();
            });
            overlaysRef.current.push(halo);
            overlaysRef.current.push(line);
          });
          visibleLodgingRouteSegments.forEach((segment) => {
            const pathPoints = routePathForSegment(segment, true);
            const path = segment.coordSystem === 'gcj02'
              ? pathPoints.map(([lat, lng]) => rememberProviderPoint(lat, lng))
              : pathPoints.map(([lat, lng]) => remember(lat, lng));
            if (path.length < 2) return;
            const routeVisualId = `lodging:${segment.id}`;
            const selected = activeEdgeId === routeVisualId;
            const muted = Boolean(activeEdgeId) && !selected;
            const style = lodgingConnectionLineStyle(segment, false, selected, muted);
            const hoverStyle = lodgingConnectionLineStyle(segment, true, selected);
            const midpoint = path[Math.floor(path.length / 2)];
            const label = lodgingConnectionLabel(segment);
            const halo = new AMap.Polyline({
              map: mapRef.current,
              path,
              strokeColor: ROUTE_HALO_COLOR,
              strokeOpacity: 0.92,
              strokeWeight: Number(style.weight || 3) + 5,
              strokeStyle: 'solid',
              zIndex: selected ? ROUTE_HOVER_Z_INDEX - 1 : 7,
            });
            const line = new AMap.Polyline({
              map: mapRef.current,
              path,
              strokeColor: String(style.color || LODGING_ROUTE_COLOR),
              strokeOpacity: Number(style.opacity || 0.9),
              strokeWeight: Number(style.weight || 3),
              strokeStyle: segment.status === 'failed' ? 'dashed' : 'dashed',
              zIndex: selected ? ROUTE_HOVER_Z_INDEX : ROUTE_BASE_Z_INDEX - 3,
            });
            routeVisuals.push({
              id: routeVisualId,
              line,
              halo,
              color: String(style.color || LODGING_ROUTE_COLOR),
              weight: Number(style.weight || 3),
              opacity: Number(style.opacity || 0.9),
              haloWeight: Number(style.weight || 3) + 5,
              lineZIndex: selected ? ROUTE_HOVER_Z_INDEX : ROUTE_BASE_Z_INDEX - 3,
              haloZIndex: selected ? ROUTE_HOVER_Z_INDEX - 1 : 7,
            });
            line.on('click', () => setActiveEdgeId(routeVisualId));
            line.on('mouseover', () => {
              clearRouteHover();
              focusRouteVisual(routeVisualId, String(hoverStyle.color || LODGING_ROUTE_HOVER_COLOR), Number(hoverStyle.weight || 5));
              line.setOptions({
                strokeColor: String(hoverStyle.color || LODGING_ROUTE_HOVER_COLOR),
                strokeWeight: Number(hoverStyle.weight || 5),
                strokeOpacity: 1,
              });
              const marker = new AMap.Marker({
                map: mapRef.current,
                position: midpoint,
                content: `<div style="width:16px;height:16px;border-radius:999px;background:${LODGING_ROUTE_HOVER_COLOR};border:3px solid white;box-shadow:0 8px 18px rgba(15,23,42,.28)"></div>`,
                offset: new AMap.Pixel(-8, -8),
              });
              hoverOverlaysRef.current.push(marker);
              hoverInfoRef.current.setContent(routeLabelHtml(label));
              hoverInfoRef.current.open(mapRef.current, midpoint);
            });
            line.on('mouseout', () => {
              resetRouteVisualFocus();
              clearRouteHover();
            });
            overlaysRef.current.push(halo);
            overlaysRef.current.push(line);
          });
          visibleLodgings.forEach(({ lodging, stays }) => {
            const position = remember(lodging.lat, lodging.lng);
            const marker = new AMap.Marker({
              map: mapRef.current,
              position,
              title: lodging.name,
              content: '<div style="width:32px;height:32px;border-radius:999px;background:#10b981;border:3px solid white;box-shadow:0 10px 24px rgba(16,185,129,.35);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:900">宿</div>',
              offset: new AMap.Pixel(-16, -16),
            });
            marker.on('click', () => {
              clearRouteHover();
              infoRef.current.setContent(lodgingInfoHtml(lodging, stays));
              infoRef.current.open(mapRef.current, position);
            });
            overlaysRef.current.push(marker);
          });

          visibleNodes.forEach((node) => {
            const position = remember(node.lat, node.lng);
            const marker = new AMap.Marker({
              map: mapRef.current,
              position,
              title: node.title,
              content: `<div style="width:${activeNodeId === node.id ? 32 : 26}px;height:${activeNodeId === node.id ? 32 : 26}px;border-radius:999px;background:${nodeColor(node)};border:3px solid white;box-shadow:0 10px 24px rgba(15,23,42,.25)"></div>`,
              offset: new AMap.Pixel(-13, -13),
            });
            const openNodeInfo = () => {
              infoRef.current.setContent(nodeInfoHtml(node));
              infoRef.current.open(mapRef.current, position);
            };
            marker.on('click', () => {
              clearRouteHover();
              setActiveNodeId(node.id);
              openNodeInfo();
            });
            marker.on('mouseover', () => {
              clearRouteHover();
              hoverInfoRef.current.setContent(nodeHoverLabelHtml(node));
              hoverInfoRef.current.open(mapRef.current, position);
            });
            marker.on('mouseout', () => hoverInfoRef.current?.close());
            if (activeNodeId === node.id) openNodeInfo();
            overlaysRef.current.push(marker);
          });
        }
        if (mode === 'home' && selectedHomeTrip) {
          mapRef.current.setZoomAndCenter(homeTripZoom(selectedHomeTrip), [selectedHomeTrip.center_lng, selectedHomeTrip.center_lat]);
        } else if (boundsPoints.length) mapRef.current.setFitView(overlaysRef.current, false, [70, 70, 70, 70]);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : '高德地图加载失败'));

    return () => {
      cancelled = true;
    };
  }, [activeEdgeId, activeNodeId, mode, nodes, onOpenHomeTrip, onSelectHomeTrip, routeSegments, selectedHomeTrip, selectedHomeSlug, setActiveEdgeId, setActiveNodeId, trips, visibleEdges, visibleLodgingRouteSegments, visibleLodgings, visibleNodes, visibleTransportRoutes]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {error && (
        <div className="absolute inset-0 z-[10000] flex items-center justify-center bg-slate-950/70 p-6 text-center text-white backdrop-blur-sm">
          <div className="max-w-sm rounded-3xl border border-white/15 bg-slate-950/80 p-5 shadow-2xl">
            <div className="text-sm font-black">高德地图未启用</div>
            <div className="mt-2 text-xs font-semibold text-slate-300">{error}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function MapView({ mode = 'trip', trips = [], selectedHomeSlug = null, onSelectHomeTrip, onOpenHomeTrip }: MapViewProps) {
  const { 
    trip,
    nodes, 
    edges, 
    routeSegments,
    lodgings,
    stays,
    activeNodeId, 
    activeEdgeId,
    setActiveNodeId, 
    setActiveEdgeId,
    hoveredEdgeId, 
    setHoveredEdgeId, 
    activeDay 
  } = useItineraryStore();

  const [preview, setPreview] = useState<PreviewState>(null);
  const routeSegmentLookup = new Map(routeSegments.map((segment) => [routeSegmentKey(segment.linkType, segment.linkId), segment]));
  const lodgingById = new Map(lodgings.map((lodging) => [lodging.id, lodging]));

  // Filter nodes according to current activeDay selector
  const visibleNodes = nodes.filter(n => isScheduledNode(n) && n.type !== 'transport' && n.type !== 'hotel' && (activeDay === 'all' || n.day === activeDay));
  const visibleTransportRoutes = nodes.filter((node) =>
    isScheduledNode(node) &&
    node.type === 'transport' &&
    node.departure_lat != null &&
    node.departure_lng != null &&
    node.arrival_lat != null &&
    node.arrival_lng != null &&
    (activeDay === 'all' || node.day === activeDay)
  );
  const visibleLodgings = Array.from(stays
    .filter((stay) =>
      stay.status !== 'cancelled' &&
      (activeDay === 'all' || (typeof activeDay === 'number' && stay.check_in_day <= activeDay && stay.check_out_day >= activeDay))
    )
    .reduce<Map<string, VisibleLodgingMarker>>((lookup, stay) => {
      const lodging = lodgingById.get(stay.lodging_id);
      if (!lodging) return lookup;
      const current = lookup.get(lodging.id);
      if (current) current.stays.push(stay);
      else lookup.set(lodging.id, { lodging, stays: [stay] });
      return lookup;
    }, new Map()).values());
  const visibleLodgingRouteSegments = routeSegments.filter((segment) =>
    segment.linkType === 'lodging_connection' &&
    (activeDay === 'all' || lodgingConnectionDay(segment) === activeDay)
  );

  // Filter route links where both end-events exist and either side belongs to the active day.
  const visibleEdges = edges.filter(edge => {
    if (edge.displayStatus === 'hidden') return false;
    const source = nodes.find((node) => node.id === edge.source && isScheduledNode(node));
    const target = nodes.find((node) => node.id === edge.target && isScheduledNode(node));
    if (!source || !target) return false;
    return activeDay === 'all' || source.day === activeDay || target.day === activeDay;
  });
  const focusedEdgeId = hoveredEdgeId || activeEdgeId;
  const renderEdges = focusedEdgeId
    ? [...visibleEdges].sort((left, right) => Number(left.id === focusedEdgeId) - Number(right.id === focusedEdgeId))
    : visibleEdges;

  const fitPoints: [number, number][] = [
    ...visibleNodes.map((node) => [node.lat, node.lng] as [number, number]),
    ...visibleLodgings.map(({ lodging }) => [lodging.lat, lodging.lng] as [number, number]),
    ...visibleTransportRoutes.flatMap((node) =>
      routePathForTransport(node, routeSegmentLookup.get(routeSegmentKey('transport_node', node.id)))
    ),
    ...visibleEdges.flatMap((edge) =>
      routePathForEdge(edge, nodes, routeSegmentLookup.get(routeSegmentKey('edge', edge.id)))
    ),
    ...visibleLodgingRouteSegments.flatMap((segment) => routePathForSegment(segment)),
  ];

  // Calculate midpoints to draw transport-specific popup helper
  const getEdgeCoordinatesAndMeta = (edge: ItineraryEdge) => {
    const srcNode = nodes.find(n => n.id === edge.source);
    const tarNode = nodes.find(n => n.id === edge.target);
    if (!srcNode || !tarNode) return null;
    const routeSegment = routeSegmentLookup.get(routeSegmentKey('edge', edge.id));
    const positions = routePathForEdge(edge, nodes, routeSegment);
    if (positions.length < 2) return null;

    return {
      positions,
      midpoint: pathMidpoint(positions),
      meta: edge,
      routeSegment,
    };
  };

  // Icon representations for popup tags
  const getTransportIcon = (type?: string) => {
    switch(type) {
      case 'walk': return <Compass className="w-3.5 h-3.5 text-orange-500 inline mr-1" />;
      case 'car': return <Car className="w-3.5 h-3.5 text-blue-500 inline mr-1" />;
      case 'train': return <Train className="w-3.5 h-3.5 text-emerald-500 inline mr-1" />;
      case 'flight': return <Plane className="w-3.5 h-3.5 text-sky-500 inline mr-1" />;
      default: return <Navigation className="w-3.5 h-3.5 text-slate-500 inline mr-1" />;
    }
  };

  const selectedHomeTrip = trips.find((trip) => trip.slug === selectedHomeSlug) || null;
  const activeProvider = mode === 'home'
    ? 'google'
    : mapProviderForTrip(trip);
  const sdkMapProps: ProviderMapCanvasProps = {
    provider: activeProvider,
    mode,
    trips,
    selectedHomeTrip,
    selectedHomeSlug,
    visibleNodes,
    visibleTransportRoutes,
    visibleLodgings,
    visibleLodgingRouteSegments,
    visibleEdges: renderEdges,
    routeSegments,
    nodes,
    activeNodeId,
    activeEdgeId,
    setActiveNodeId,
    setActiveEdgeId,
    onSelectHomeTrip,
    onOpenHomeTrip,
  };
  const providerHasBrowserKey = activeProvider === 'google' ? Boolean(googleMapsBrowserKey()) : Boolean(amapBrowserKey());

  if (providerHasBrowserKey) {
    return (
      <div className="relative isolate z-0 h-full w-full overflow-hidden bg-slate-100">
        {preview && (
          <ImagePreviewModal
            images={imagesOf(preview.node)}
            index={preview.index}
            title={preview.node.title}
            onClose={() => setPreview(null)}
            onIndexChange={(index) => setPreview({ ...preview, index })}
          />
        )}
        {activeProvider === 'google' ? <GoogleMapCanvas {...sdkMapProps} /> : <AmapCanvas {...sdkMapProps} />}
      </div>
    );
  }

  return (
    <div className="relative isolate z-0 h-full w-full overflow-hidden bg-slate-100">
      {preview && (
        <ImagePreviewModal
          images={imagesOf(preview.node)}
          index={preview.index}
          title={preview.node.title}
          onClose={() => setPreview(null)}
          onIndexChange={(index) => setPreview({ ...preview, index })}
        />
      )}
      <ProviderMissingFallback provider={activeProvider}>
      
      {mode === 'trip' && <div className="absolute bottom-7 left-[calc(33.333%+2rem)] z-[9999] hidden items-center gap-3 rounded-full border border-white/70 bg-white/80 px-3 py-2 text-[9px] font-bold text-slate-600 shadow-lg backdrop-blur-md md:flex">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-6 border-t-2 border-dashed border-blue-700" /><Plane className="h-3 w-3 text-blue-700" />航班/跨城</span>
        <span className="flex items-center gap-1.5"><span className="h-1 w-6 rounded-full bg-pink-600 shadow-[0_0_0_2px_rgba(255,255,255,.9)]" /><Car className="h-3 w-3 text-pink-600" />地面交通</span>
        <span className="flex items-center gap-1.5"><span className="h-1 w-6 rounded-full bg-rose-600 shadow-[0_0_0_2px_rgba(255,255,255,.9)]" />事件接续</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-500 ring-2 ring-white" />区间端点 / 转机</span>
      </div>}

      <MapContainer
        center={[32, 12]}
        zoom={2}
        dragging
        scrollWheelZoom
        touchZoom
        doubleClickZoom
        className="w-full h-full"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CartoDB</a> voyager'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        <ZoomControl position="bottomright" />
        {/* Sync controllers */}
        {mode === 'home' ? <HomeMapController trip={selectedHomeTrip} /> : <>
          {fitPoints.length > 0 && <FitBoundsController points={fitPoints} activeDay={activeDay} />}
        </>}

        {mode === 'home' && trips.map((trip) => (
          <Marker
            key={trip.slug}
            position={[trip.center_lat, trip.center_lng]}
            icon={tripPinIcon(trip, trip.slug === selectedHomeSlug)}
            eventHandlers={{
              click: () => {
                onSelectHomeTrip?.(trip.slug);
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -34]} opacity={0.96}>
              <div className="min-w-40 py-0.5">
                <div className="text-xs font-black text-slate-900">{trip.title}</div>
                <div className="mt-1 text-[10px] font-semibold text-slate-500">{trip.start_date} - {trip.end_date} · {trip.day_count} 天</div>
              </div>
            </Tooltip>
          </Marker>
        ))}

        {mode === 'trip' && visibleTransportRoutes.map((route) => {
          const selected = activeNodeId === route.id;
          return (
            <TransportRouteLayer
              key={`transport-route-${route.id}`}
              route={route}
              routeSegment={routeSegmentLookup.get(routeSegmentKey('transport_node', route.id))}
              selected={selected}
              onSelect={() => setActiveNodeId(route.id)}
              renderTransportIcon={getTransportIcon}
            />
          );
        })}

        {/* Draw edges (connecting networks) */}
        {mode === 'trip' && renderEdges.map((edge) => {
          const data = getEdgeCoordinatesAndMeta(edge);
          if (!data) return null;

          const isHovered = hoveredEdgeId === edge.id;
          const selected = activeEdgeId === edge.id;
          const muted = Boolean(focusedEdgeId) && !isHovered && !selected;
          const edgeStyle = edgeLineStyle(edge, data.routeSegment, isHovered, selected, muted);
          const label = edgeRouteLabel(edge, data.routeSegment);
          
          return (
            <React.Fragment key={edge.id}>
              {/* Outer stroke for mouse-sensing thickness */}
              <Polyline
                positions={data.positions}
                pathOptions={{
                  color: 'transparent',
                  weight: 15,
                  lineCap: 'round'
                }}
                eventHandlers={{
                  click: () => setActiveEdgeId(edge.id),
                  mouseover: () => setHoveredEdgeId(edge.id),
                  mouseout: () => setHoveredEdgeId(null)
                }}
              />

              {/* White halo keeps routes legible on top of native map roads */}
              <Polyline
                positions={data.positions}
                pathOptions={routeHaloStyle(Number(edgeStyle.weight || 3) + 4, 0.88)}
              />
              
              {/* Inner visible line */}
              <Polyline
                positions={data.positions}
                pathOptions={edgeStyle}
                eventHandlers={{
                  click: () => setActiveEdgeId(edge.id),
                  mouseover: () => setHoveredEdgeId(edge.id),
                  mouseout: () => setHoveredEdgeId(null)
                }}
              />

              {(isHovered || selected) && (
                <CircleMarker center={data.midpoint} radius={7} pathOptions={routeHoverMarkerStyle(String(edgeStyle.color || EDGE_ROUTE_HOVER_COLOR))}>
                  <Tooltip direction="top" offset={[0, -10]} opacity={0.98} permanent>
                    <div className="min-w-32 py-0.5 text-[10px] leading-tight">
                      <div className="font-black text-slate-950">{label.title}</div>
                      <div className="mt-0.5 font-bold text-slate-500">{label.subtitle}</div>
                      {label.metric && <div className="mt-1 font-black text-rose-600">{label.metric}</div>}
                      {label.warning && <div className="mt-0.5 font-bold text-amber-600">{label.warning}</div>}
                    </div>
                  </Tooltip>
                </CircleMarker>
              )}
            </React.Fragment>
          );
        })}

        {mode === 'trip' && visibleLodgingRouteSegments.map((segment) => {
          const positions = routePathForSegment(segment);
          if (positions.length < 2) return null;
          const routeStateId = `lodging:${segment.id}`;
          const isHovered = hoveredEdgeId === routeStateId;
          const selected = activeEdgeId === routeStateId;
          const muted = Boolean(focusedEdgeId) && !isHovered && !selected;
          const style = lodgingConnectionLineStyle(segment, isHovered, selected, muted);
          const label = lodgingConnectionLabel(segment);

          return (
            <React.Fragment key={segment.id}>
              <Polyline
                positions={positions}
                pathOptions={{ color: 'transparent', weight: 15, lineCap: 'round' }}
                eventHandlers={{
                  click: () => setActiveEdgeId(routeStateId),
                  mouseover: () => setHoveredEdgeId(routeStateId),
                  mouseout: () => setHoveredEdgeId(null),
                }}
              />
              <Polyline
                positions={positions}
                pathOptions={routeHaloStyle(Number(style.weight || 3) + 4, 0.86)}
              />
              <Polyline
                positions={positions}
                pathOptions={style}
                eventHandlers={{
                  click: () => setActiveEdgeId(routeStateId),
                  mouseover: () => setHoveredEdgeId(routeStateId),
                  mouseout: () => setHoveredEdgeId(null),
                }}
              />
              {(isHovered || selected) && (
                <CircleMarker center={pathMidpoint(positions)} radius={7} pathOptions={routeHoverMarkerStyle(String(style.color || LODGING_ROUTE_HOVER_COLOR))}>
                  <Tooltip direction="top" offset={[0, -10]} opacity={0.98} permanent>
                    <div className="min-w-32 py-0.5 text-[10px] leading-tight">
                      <div className="font-black text-slate-950">{label.title}</div>
                      <div className="mt-0.5 font-bold text-slate-500">{label.subtitle}</div>
                      {label.metric && <div className="mt-1 font-black text-emerald-700">{label.metric}</div>}
                      {label.warning && <div className="mt-0.5 font-bold text-amber-600">{label.warning}</div>}
                    </div>
                  </Tooltip>
                </CircleMarker>
              )}
            </React.Fragment>
          );
        })}

        {/* Draw Nodes MapPins */}
        {mode === 'trip' && visibleNodes.map((node) => (
          <ItineraryNodeMarker
            key={node.id}
            node={node}
            selected={activeNodeId === node.id}
            onSelect={() => setActiveNodeId(node.id)}
            onPreview={setPreview}
          />
        ))}

        {mode === 'trip' && visibleLodgings.map(({ lodging, stays }) => (
          <Marker
            key={`lodging-${lodging.id}`}
            position={[lodging.lat, lodging.lng]}
            icon={createLodgingMarkerIcon()}
          >
            <Tooltip direction="top" offset={[0, -32]} opacity={0.96}>
              <div className="min-w-32 py-0.5">
                <div className="text-xs font-black text-slate-900">{lodging.name}</div>
                <div className="mt-1 text-[10px] font-semibold text-emerald-700">{lodgingStayText(stays)}</div>
              </div>
            </Tooltip>
            <Popup minWidth={230}>
              <div className="space-y-2">
                {lodgingImagesOf(lodging)[0] && (
                  <img src={lodgingImagesOf(lodging)[0]} alt="" className="h-24 w-full rounded-xl object-cover" />
                )}
                <div>
                  <div className="text-sm font-black text-slate-900">{lodging.name}</div>
                  <div className="mt-1 text-[11px] font-bold text-slate-500">{lodging.address || lodging.city || '地址待补充'}</div>
                  <div className="mt-1 text-[10px] font-black text-emerald-700">{lodgingStayText(stays)}</div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      </ProviderMissingFallback>
    </div>
  );
}
