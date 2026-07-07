/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, Tooltip, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import ImagePreviewModal from '../ImagePreviewModal/ImagePreviewModal';
import { useItineraryStore } from '../../store/useItineraryStore';
import { ItineraryNode, ItineraryEdge, TripSummary } from '../../types';
import { isScheduledNode } from '../../utils/itinerary';
import { Plane, Car, Train, Navigation, Compass } from 'lucide-react';
import { toProviderPoint } from '../../map/coordinates';
import { amapBrowserKey, amapSecurityCode, googleMapsBrowserKey, mapProviderForTrip, mapProviderLabel } from '../../map/provider';
import { loadAmap, loadGoogleMaps } from '../../map/scriptLoaders';

type PreviewState = { node: ItineraryNode; index: number } | null;
const imagesOf = (node: ItineraryNode) => node.image_urls?.length ? node.image_urls : node.image_url ? [node.image_url] : [];

const nodeColor = (node: Pick<ItineraryNode, 'type'>) => {
  switch (node.type) {
    case 'hotel': return '#10b981';
    case 'restaurant': return '#f43f5e';
    case 'sightseeing': return '#8b5cf6';
    case 'transfer': return '#0ea5e9';
    case 'leisure': return '#f59e0b';
    case 'shopping': return '#ec4899';
    case 'transport':
    default: return '#06b6d4';
  }
};

const nodeTypeLabel = (node: Pick<ItineraryNode, 'type'>) => {
  switch (node.type) {
    case 'hotel': return '酒店';
    case 'restaurant': return '餐厅';
    case 'sightseeing': return '景点';
    case 'transfer': return '转机';
    case 'leisure': return '休闲';
    case 'shopping': return '购物';
    case 'transport':
    default: return '交通';
  }
};

// Custom icons setup using dynamic SVG inside DivIcon
const createCustomMarkerIcon = (node: ItineraryNode, isSelected: boolean) => {
  let color = '#3b82f6'; // default blue
  let iconSvg = '';

  switch (node.type) {
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
    case 'restaurant':
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
    case 'transfer':
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

const transportLineStyle = (node: ItineraryNode, selected: boolean): L.PolylineOptions => {
  const air = isAirTransport(node);
  const railway = node.transport_mode === 'train' || node.transport_mode === 'high_speed_rail' || node.transport_mode === 'subway';
  const ground = node.transport_mode === 'car' || node.transport_mode === 'bus';
  const color = air ? '#2563eb' : railway ? '#10b981' : ground ? '#0284c7' : '#0ea5e9';
  return {
    color,
    weight: selected ? 4.2 : air ? 2.8 : 3,
    opacity: selected ? 1 : air ? 0.82 : 0.72,
    dashArray: selected ? undefined : air ? '10, 10' : '6, 8',
    lineCap: 'round',
    lineJoin: 'round',
  };
};

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
    map.flyTo(trip ? [trip.center_lat, trip.center_lng] : [32, 12], trip ? 5 : 2, { duration: 1.25 });
  }, [map, trip]);
  return null;
}

type TransportRouteLayerProps = {
  route: ItineraryNode;
  selected: boolean;
  onSelect: () => void;
  renderTransportIcon: (type?: string) => React.ReactNode;
};

const TransportRouteLayer: React.FC<TransportRouteLayerProps> = ({
  route,
  selected,
  onSelect,
  renderTransportIcon,
}) => {
  const lineRef = useRef<L.Polyline>(null);
  const path = transportPath(route);
  const midpoint = path[Math.floor(path.length / 2)];
  const lineStyle = transportLineStyle(route, selected);

  useEffect(() => {
    if (selected) lineRef.current?.openPopup();
  }, [selected]);

  if (path.length < 2 || !midpoint) return null;

  return (
    <React.Fragment>
      <Polyline
        ref={lineRef}
        positions={path}
        pathOptions={lineStyle}
        eventHandlers={{ click: onSelect }}
      >
        <Popup position={midpoint} autoPan={false} closeButton={false} closeOnClick={false}>
          <div className="min-w-48 font-sans">
            <div className="flex items-center gap-1.5 text-xs font-black text-sky-700">{renderTransportIcon(transportIconType(route))}{route.service_number || '区间交通'}</div>
            <div className="mt-2 text-[11px] font-bold text-slate-800">{route.departure_place} → {route.arrival_place}</div>
            <div className="mt-1 text-[9px] text-slate-500">D{route.day} · {route.time} - {route.arrival_time || '--:--'} · {route.duration || '时长待补充'}</div>
          </div>
        </Popup>
      </Polyline>
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

  useEffect(() => {
    if (selected) markerRef.current?.openPopup();
  }, [selected]);

  return (
    <Marker
      ref={markerRef}
      position={[node.lat, node.lng]}
      icon={createCustomMarkerIcon(node, selected)}
      eventHandlers={{ click: onSelect }}
    >
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
              style={{
                background: node.type === 'hotel' ? '#10b981' :
                            node.type === 'restaurant' ? '#f43f5e' :
                            node.type === 'sightseeing' ? '#8b5cf6' :
                            node.type === 'transfer' ? '#0ea5e9' :
                            node.type === 'leisure' ? '#f59e0b' :
                            node.type === 'shopping' ? '#ec4899' : '#06b6d4'
              }}
            >
              {node.type === 'hotel' ? '酒店' :
               node.type === 'restaurant' ? '餐厅' :
               node.type === 'sightseeing' ? '景点' :
               node.type === 'transfer' ? '转机' :
               node.type === 'leisure' ? '休闲' :
               node.type === 'shopping' ? '购物' : '交通'}
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
  visibleEdges: ItineraryEdge[];
  nodes: ItineraryNode[];
  activeNodeId: string | null;
  setActiveNodeId: (id: string | null) => void;
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

const nodeInfoHtml = (node: ItineraryNode) => {
  const image = imagesOf(node)[0];
  return `
    <div style="max-width:230px;font-family:Inter,system-ui,sans-serif">
      ${image ? `<img src="${image}" alt="" style="width:100%;height:92px;object-fit:cover;border-radius:12px;margin-bottom:8px" />` : ''}
      <div style="font-weight:900;color:#0f172a;font-size:13px;line-height:1.25">${node.title}</div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:6px">
        <span style="border-radius:999px;background:${nodeColor(node)};color:white;padding:2px 8px;font-size:10px;font-weight:800">${nodeTypeLabel(node)}</span>
        <span style="font-size:10px;color:#64748b;font-weight:700">D${node.day} · ${node.time}</span>
      </div>
      ${node.description ? `<div style="margin-top:6px;color:#475569;font-size:11px;line-height:1.45">${node.description}</div>` : ''}
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
  visibleEdges,
  nodes,
  activeNodeId,
  setActiveNodeId,
  onSelectHomeTrip,
  onOpenHomeTrip,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const infoRef = useRef<any>(null);
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
            zoom: selectedHomeTrip ? 5 : 2,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            gestureHandling: 'greedy',
          });
          infoRef.current = new maps.InfoWindow();
        }

        overlaysRef.current.forEach((overlay) => overlay.setMap?.(null));
        overlaysRef.current = [];
        const bounds = new maps.LatLngBounds();
        let hasBounds = false;
        const remember = (lat: number, lng: number) => {
          bounds.extend({ lat, lng });
          hasBounds = true;
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
              window.setTimeout(() => onOpenHomeTrip?.(trip.slug), 650);
            });
            overlaysRef.current.push(marker);
          });
          if (selectedHomeTrip) mapRef.current.panTo({ lat: selectedHomeTrip.center_lat, lng: selectedHomeTrip.center_lng });
        } else {
          visibleTransportRoutes.forEach((route) => {
            const path = transportPath(route).map(googleLatLng);
            if (path.length < 2) return;
            path.forEach((point) => remember(point.lat, point.lng));
            const selected = activeNodeId === route.id;
            const style = transportLineStyle(route, selected);
            const line = new maps.Polyline({
              map: mapRef.current,
              path,
              strokeColor: String(style.color || '#0ea5e9'),
              strokeOpacity: Number(style.opacity || 0.8),
              strokeWeight: Number(style.weight || 3),
            });
            line.addListener('click', () => {
              setActiveNodeId(route.id);
              infoRef.current.setContent(transportInfoHtml(route));
              infoRef.current.setPosition(path[Math.floor(path.length / 2)]);
              infoRef.current.open(mapRef.current);
            });
            overlaysRef.current.push(line);
          });

          visibleEdges.forEach((edge) => {
            const src = nodes.find((node) => node.id === edge.source);
            const target = nodes.find((node) => node.id === edge.target);
            if (!src || !target) return;
            const path = [{ lat: src.lat, lng: src.lng }, { lat: target.lat, lng: target.lng }];
            const line = new maps.Polyline({
              map: mapRef.current,
              path,
              strokeColor: '#94a3b8',
              strokeOpacity: 0.6,
              strokeWeight: 2,
            });
            overlaysRef.current.push(line);
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
            marker.addListener('click', () => {
              setActiveNodeId(node.id);
              infoRef.current.setContent(nodeInfoHtml(node));
              infoRef.current.open(mapRef.current, marker);
            });
            overlaysRef.current.push(marker);
          });
        }

        if (hasBounds && mode === 'trip') mapRef.current.fitBounds(bounds, 80);
        else if (hasBounds && !selectedHomeTrip) mapRef.current.fitBounds(bounds, 80);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Google Maps 加载失败'));

    return () => {
      cancelled = true;
    };
  }, [activeNodeId, mode, nodes, onOpenHomeTrip, onSelectHomeTrip, selectedHomeTrip, selectedHomeSlug, setActiveNodeId, trips, visibleEdges, visibleNodes, visibleTransportRoutes]);

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
  visibleEdges,
  nodes,
  activeNodeId,
  setActiveNodeId,
  onSelectHomeTrip,
  onOpenHomeTrip,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
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
            zoom: selectedHomeTrip ? 5 : 4,
            viewMode: '2D',
          });
          mapRef.current.addControl(new AMap.Scale());
          mapRef.current.addControl(new AMap.ToolBar({ position: 'RB' }));
        }
        overlaysRef.current.forEach((overlay) => mapRef.current.remove(overlay));
        overlaysRef.current = [];
        const boundsPoints: [number, number][] = [];
        const remember = (lat: number, lng: number) => {
          const [gcjLat, gcjLng] = toProviderPoint(lat, lng, 'amap');
          boundsPoints.push([gcjLng, gcjLat]);
          return [gcjLng, gcjLat] as [number, number];
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
              window.setTimeout(() => onOpenHomeTrip?.(trip.slug), 650);
            });
            overlaysRef.current.push(marker);
          });
        } else {
          visibleTransportRoutes.forEach((route) => {
            const path = transportPath(route).map(([lat, lng]) => remember(lat, lng));
            if (path.length < 2) return;
            const selected = activeNodeId === route.id;
            const style = transportLineStyle(route, selected);
            const line = new AMap.Polyline({
              map: mapRef.current,
              path,
              strokeColor: String(style.color || '#0ea5e9'),
              strokeOpacity: Number(style.opacity || 0.8),
              strokeWeight: Number(style.weight || 3),
              strokeStyle: selected ? 'solid' : 'dashed',
            });
            line.on('click', () => setActiveNodeId(route.id));
            overlaysRef.current.push(line);
          });
          visibleEdges.forEach((edge) => {
            const src = nodes.find((node) => node.id === edge.source);
            const target = nodes.find((node) => node.id === edge.target);
            if (!src || !target) return;
            const line = new AMap.Polyline({
              map: mapRef.current,
              path: [remember(src.lat, src.lng), remember(target.lat, target.lng)],
              strokeColor: '#94a3b8',
              strokeOpacity: 0.62,
              strokeWeight: 2,
              strokeStyle: 'dashed',
            });
            overlaysRef.current.push(line);
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
            marker.on('click', () => setActiveNodeId(node.id));
            overlaysRef.current.push(marker);
          });
        }
        if (boundsPoints.length) mapRef.current.setFitView(overlaysRef.current, false, [70, 70, 70, 70]);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : '高德地图加载失败'));

    return () => {
      cancelled = true;
    };
  }, [activeNodeId, mode, nodes, onOpenHomeTrip, onSelectHomeTrip, selectedHomeTrip, selectedHomeSlug, setActiveNodeId, trips, visibleEdges, visibleNodes, visibleTransportRoutes]);

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
    activeNodeId, 
    setActiveNodeId, 
    hoveredEdgeId, 
    setHoveredEdgeId, 
    activeDay 
  } = useItineraryStore();

  const [preview, setPreview] = useState<PreviewState>(null);

  // Filter nodes according to current activeDay selector
  const visibleNodes = nodes.filter(n => isScheduledNode(n) && n.type !== 'transport' && (activeDay === 'all' || n.day === activeDay));
  const visibleTransportRoutes = nodes.filter((node) =>
    isScheduledNode(node) &&
    node.type === 'transport' &&
    node.departure_lat != null &&
    node.departure_lng != null &&
    node.arrival_lat != null &&
    node.arrival_lng != null &&
    (activeDay === 'all' || node.day === activeDay)
  );
  const fitPoints: [number, number][] = [
    ...visibleNodes.map((node) => [node.lat, node.lng] as [number, number]),
    ...visibleTransportRoutes.flatMap((node) => [
      [node.departure_lat!, node.departure_lng!] as [number, number],
      [node.arrival_lat!, node.arrival_lng!] as [number, number],
    ]),
  ];

  // Filter edges where both end-nodes are currently visible/valid
  const visibleEdges = edges.filter(edge => {
    const srcExists = visibleNodes.some(n => n.id === edge.source && n.type !== 'transfer');
    const tarExists = visibleNodes.some(n => n.id === edge.target && n.type !== 'transfer');
    return srcExists && tarExists;
  });

  // Calculate midpoints to draw transport-specific popup helper
  const getEdgeCoordinatesAndMeta = (edge: ItineraryEdge) => {
    const srcNode = nodes.find(n => n.id === edge.source);
    const tarNode = nodes.find(n => n.id === edge.target);
    if (!srcNode || !tarNode) return null;

    return {
      positions: [
        [srcNode.lat, srcNode.lng] as [number, number],
        [tarNode.lat, tarNode.lng] as [number, number]
      ],
      midpoint: [
        (srcNode.lat + tarNode.lat) / 2,
        (srcNode.lng + tarNode.lng) / 2
      ] as [number, number],
      meta: edge
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
    ? mapProviderForTrip(selectedHomeTrip)
    : mapProviderForTrip(trip);
  const sdkMapProps: ProviderMapCanvasProps = {
    provider: activeProvider,
    mode,
    trips,
    selectedHomeTrip,
    selectedHomeSlug,
    visibleNodes,
    visibleTransportRoutes,
    visibleEdges,
    nodes,
    activeNodeId,
    setActiveNodeId,
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
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-6 border-t-2 border-dashed border-blue-600" /><Plane className="h-3 w-3 text-blue-600" />航班/跨城</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-6 border-t-2 border-dashed border-sky-600" /><Car className="h-3 w-3 text-sky-600" />地面交通</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-6 border-t-2 border-dashed border-slate-400" />地点接续</span>
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
                window.setTimeout(() => onOpenHomeTrip?.(trip.slug), 650);
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
          return <TransportRouteLayer key={`transport-route-${route.id}`} route={route} selected={selected} onSelect={() => setActiveNodeId(route.id)} renderTransportIcon={getTransportIcon} />;
        })}

        {/* Draw edges (connecting networks) */}
        {mode === 'trip' && visibleEdges.map((edge) => {
          const data = getEdgeCoordinatesAndMeta(edge);
          if (!data) return null;

          const isHovered = hoveredEdgeId === edge.id;
          
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
                  mouseover: () => setHoveredEdgeId(edge.id),
                  mouseout: () => setHoveredEdgeId(null)
                }}
              />
              
              {/* Inner visible line */}
              <Polyline
                positions={data.positions}
                pathOptions={{
                  color: isHovered ? '#2563eb' : '#94a3b8',
                  weight: isHovered ? 4.5 : 2.5,
                  dashArray: isHovered ? '0' : '6, 8',
                  opacity: isHovered ? 1.0 : 0.65,
                  className: 'transition-all duration-300'
                }}
              />
              
              {/* Tooltip Popup on Edge Click or Hover */}
              {isHovered && (
                <Popup position={data.midpoint} closeButton={false} autoPan={false}>
                  <div className="px-1 text-center font-sans">
                    <div className="text-xs font-bold text-slate-800 flex items-center justify-center">
                      {getTransportIcon(edge.transportType)}
                      {edge.transportType === 'walk' ? '步行' : 
                       edge.transportType === 'car' ? '打车/驾车' : 
                       edge.transportType === 'train' ? '地铁/铁路' : 
                       edge.transportType === 'flight' ? '航空飞行' : '接驳'}
                    </div>
                    {(edge.distance || edge.duration) && (
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {edge.distance && <span className="mr-1.5 font-medium">{edge.distance}</span>}
                        {edge.duration && <span className="text-indigo-600 font-semibold">{edge.duration}</span>}
                      </div>
                    )}
                  </div>
                </Popup>
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
      </MapContainer>
      </ProviderMissingFallback>
    </div>
  );
}
