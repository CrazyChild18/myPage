/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, Tooltip, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useItineraryStore } from '../../store/useItineraryStore';
import { ItineraryNode, ItineraryEdge, TripSummary } from '../../types';
import { Plane, Car, Train, Navigation, Compass, X, ChevronLeft, ChevronRight } from 'lucide-react';

// Custom icons setup using dynamic SVG inside DivIcon
const createCustomMarkerIcon = (node: ItineraryNode, isSelected: boolean) => {
  let color = '#3b82f6'; // default blue
  let iconSvg = '';

  switch (node.type) {
    case 'hotel':
      color = '#10b981'; // emerald green
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
      color = '#f43f5e'; // rose pink
      iconSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-white">
          <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
          <path d="M7 2v20" />
          <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
        </svg>
      `;
      break;
    case 'sightseeing':
      color = '#8b5cf6'; // violet royal
      iconSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-white">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <circle cx="12" cy="11" r="3" />
        </svg>
      `;
      break;
    case 'leisure':
      color = '#f59e0b'; // amber gold
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
      color = '#0ea5e9';
      iconSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-white">
          <path d="M22 2 9 15" /><path d="m22 2-7 20-4-9-9-4Z" />
        </svg>
      `;
      break;
    case 'shopping':
      color = '#ec4899'; // bubblegum pink
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
      color = '#06b6d4'; // teal cyan
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
    ? 'border-[3px] border-white scale-125 shadow-[0_0_15px_rgba(59,130,246,0.6)] animate-pulse z-[2000]' 
    : 'border-2 border-white/90 scale-100 shadow-md hover:scale-110 z-[100]';
  
  const size = isSelected ? 44 : 36;

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

const transportPath = (node: ItineraryNode): [number, number][] => {
  if (node.departure_lat == null || node.departure_lng == null || node.arrival_lat == null || node.arrival_lng == null) return [];
  let endLng = node.arrival_lng;
  const startLng = node.departure_lng;
  if (endLng - startLng > 180) endLng -= 360;
  if (endLng - startLng < -180) endLng += 360;
  const distance = Math.hypot(node.arrival_lat - node.departure_lat, endLng - startLng);
  const lift = Math.min(24, Math.max(4, distance * 0.16));
  return Array.from({ length: 25 }, (_, index) => {
    const t = index / 24;
    const lat = node.departure_lat! + (node.arrival_lat! - node.departure_lat!) * t + Math.sin(Math.PI * t) * lift;
    const lng = startLng + (endLng - startLng) * t;
    return [lat, lng];
  });
};

// Map view controller focusing on the active node
function MapNavController({ activeNode }: { activeNode: ItineraryNode | null }) {
  const map = useMap();

  useEffect(() => {
    if (activeNode) {
      map.flyTo([activeNode.lat, activeNode.lng], 14, {
        animate: true,
        duration: 1.2
      });
    }
  }, [activeNode, map]);

  return null;
}

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

export default function MapView({ mode = 'trip', trips = [], selectedHomeSlug = null, onSelectHomeTrip, onOpenHomeTrip }: MapViewProps) {
  const { 
    nodes, 
    edges, 
    activeNodeId, 
    setActiveNodeId, 
    hoveredEdgeId, 
    setHoveredEdgeId, 
    activeDay 
  } = useItineraryStore();

  const [preview, setPreview] = useState<{ node: ItineraryNode; index: number } | null>(null);

  // Filter nodes according to current activeDay selector
  const visibleNodes = nodes.filter(n => n.type !== 'transport' && (activeDay === 'all' || n.day === activeDay));
  const visibleTransportRoutes = nodes.filter((node) =>
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

  const activeNode = nodes.find(n => n.id === activeNodeId && n.type !== 'transport') || null;

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
  return (
    <div className="relative isolate z-0 h-full w-full overflow-hidden bg-slate-100">
      {preview && <div className="absolute inset-0 z-[12000] flex items-center justify-center bg-slate-950/75 p-5 backdrop-blur-sm">
        <button onClick={() => setPreview(null)} className="absolute right-5 top-5 rounded-full bg-white/15 p-2 text-white"><X className="h-5 w-5" /></button>
        {(preview.node.image_urls?.length || 0) > 1 && <><button onClick={() => setPreview({ ...preview, index: (preview.index - 1 + (preview.node.image_urls?.length || 1)) % (preview.node.image_urls?.length || 1) })} className="absolute left-4 rounded-full bg-white/15 p-2 text-white"><ChevronLeft /></button><button onClick={() => setPreview({ ...preview, index: (preview.index + 1) % (preview.node.image_urls?.length || 1) })} className="absolute right-4 rounded-full bg-white/15 p-2 text-white"><ChevronRight /></button></>}
        <img src={(preview.node.image_urls?.length ? preview.node.image_urls : [preview.node.image_url || ''])[preview.index]} alt={preview.node.title} className="max-h-[78%] max-w-[85%] rounded-2xl object-contain shadow-2xl" />
      </div>}
      
      {mode === 'trip' && <div className="absolute bottom-7 left-[calc(33.333%+2rem)] z-[9999] hidden items-center gap-3 rounded-full border border-white/70 bg-white/80 px-3 py-2 text-[9px] font-bold text-slate-600 shadow-lg backdrop-blur-md md:flex">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-6 border-t-2 border-dashed border-sky-400" /><Plane className="h-3 w-3 text-sky-500" />区间交通</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-6 border-t-2 border-dashed border-slate-400" />地面路线</span>
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
          <MapNavController activeNode={activeNode} />
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
          const path = transportPath(route);
          const selected = activeNodeId === route.id;
          const midpoint = path[Math.floor(path.length / 2)];
          return <React.Fragment key={`transport-route-${route.id}`}>
            <Polyline
              positions={path}
              pathOptions={{ color: selected ? '#2563eb' : '#38bdf8', weight: selected ? 4 : 2.5, opacity: selected ? 1 : 0.78, dashArray: selected ? undefined : '9, 9' }}
              eventHandlers={{ click: () => setActiveNodeId(route.id) }}
            >
              <Popup position={midpoint}>
                <div className="min-w-48 font-sans">
                  <div className="flex items-center gap-1.5 text-xs font-black text-sky-700">{getTransportIcon(route.transport_mode === 'flight' ? 'flight' : route.transport_mode === 'train' || route.transport_mode === 'high_speed_rail' ? 'train' : 'other')}{route.service_number || '区间交通'}</div>
                  <div className="mt-2 text-[11px] font-bold text-slate-800">{route.departure_place} → {route.arrival_place}</div>
                  <div className="mt-1 text-[9px] text-slate-500">D{route.day} · {route.time} - {route.arrival_time || '--:--'} · {route.duration || '时长待补充'}</div>
                </div>
              </Popup>
            </Polyline>
            <Marker position={[route.departure_lat!, route.departure_lng!]} icon={transportEndpointIcon(selected)} eventHandlers={{ click: () => setActiveNodeId(route.id) }} />
            <Marker position={[route.arrival_lat!, route.arrival_lng!]} icon={transportEndpointIcon(selected)} eventHandlers={{ click: () => setActiveNodeId(route.id) }} />
          </React.Fragment>;
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
        {mode === 'trip' && visibleNodes.map((node) => {
          const isSelected = activeNodeId === node.id;
          
          return (
            <Marker
              key={node.id}
              position={[node.lat, node.lng]}
              icon={createCustomMarkerIcon(node, isSelected)}
              eventHandlers={{
                click: () => {
                  setActiveNodeId(node.id);
                }
              }}
            >
              <Popup>
                <div className="text-sm font-sans max-w-[200px]">
                  {node.image_url && (
                    <button onClick={() => setPreview({ node, index: 0 })} className="group relative mb-2 block h-24 w-full overflow-hidden rounded-lg">
                      <img src={node.image_url} alt={node.title} className="h-full w-full object-cover transition group-hover:scale-105" />
                      <span className="absolute inset-0 flex items-center justify-center bg-slate-950/0 text-[10px] font-bold text-white transition group-hover:bg-slate-950/35">点击查看大图</span>
                    </button>
                  )}
                  <div className="font-bold text-slate-900 leading-tight mb-1">{node.title}</div>
                  <div className="flex items-center space-x-2 mb-1.5">
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider px-2 py-0.5 rounded-full" 
                          style={{
                            background: node.type === 'hotel' ? '#10b981' :
                                        node.type === 'restaurant' ? '#f43f5e' :
                                        node.type === 'sightseeing' ? '#8b5cf6' :
                                        node.type === 'transfer' ? '#0ea5e9' :
                                        node.type === 'leisure' ? '#f59e0b' :
                                        node.type === 'shopping' ? '#ec4899' : '#06b6d4'
                          }}>
                      {node.type === 'hotel' ? '酒店' :
                       node.type === 'restaurant' ? '餐厅' :
                       node.type === 'sightseeing' ? '景点' :
                       node.type === 'transfer' ? '转机' :
                       node.type === 'leisure' ? '休闲' :
                       node.type === 'shopping' ? '购物' : '交通'}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500 font-mono">
                      Day {node.day} · {node.date.slice(5)} · {node.time}
                    </span>
                  </div>
                  {node.description && (
                    <p className="text-xs text-slate-600 line-clamp-2 leading-snug mt-1">{node.description}</p>
                  )}
                  <button 
                    onClick={() => setActiveNodeId(node.id)}
                    className="w-full mt-2 text-center text-[10px] bg-indigo-50 hover:bg-indigo-100 text-indigo-600 py-1 rounded font-semibold transition"
                  >
                    聚焦时间轴节点
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
