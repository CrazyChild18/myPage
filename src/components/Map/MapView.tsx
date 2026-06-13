/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useItineraryStore } from '../../store/useItineraryStore';
import { ItineraryNode, ItineraryEdge } from '../../types';
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
function FitBoundsController({ nodes, activeDay }: { nodes: ItineraryNode[]; activeDay: string | number }) {
  const map = useMap();

  useEffect(() => {
    if (nodes && nodes.length > 0) {
      const bounds = L.latLngBounds(nodes.map(n => [n.lat, n.lng]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    }
  }, [activeDay, map, nodes]);

  return null;
}

export default function MapView() {
  const { 
    nodes, 
    edges, 
    activeNodeId, 
    setActiveNodeId, 
    hoveredEdgeId, 
    setHoveredEdgeId, 
    activeDay 
  } = useItineraryStore();

  const [mapStyle, setMapStyle] = useState<'light' | 'dark' | 'voyager'>('voyager');
  const [preview, setPreview] = useState<{ node: ItineraryNode; index: number } | null>(null);

  // Filter nodes according to current activeDay selector
  const visibleNodes = nodes.filter(n => n.type !== 'transport' && (activeDay === 'all' || n.day === activeDay));

  const activeNode = nodes.find(n => n.id === activeNodeId && n.type !== 'transport') || null;

  // Filter edges where both end-nodes are currently visible/valid
  const visibleEdges = edges.filter(edge => {
    const srcExists = visibleNodes.some(n => n.id === edge.source);
    const tarExists = visibleNodes.some(n => n.id === edge.target);
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

  const mapCenter: [number, number] = visibleNodes.length > 0 
    ? [visibleNodes[0].lat, visibleNodes[0].lng] 
    : [64.1466, -21.9426]; // Default to Reykjavik

  return (
    <div className="relative w-full h-full shadow-inner bg-slate-100 overflow-hidden rounded-2xl border border-white/20">
      {preview && <div className="absolute inset-0 z-[12000] flex items-center justify-center bg-slate-950/75 p-5 backdrop-blur-sm">
        <button onClick={() => setPreview(null)} className="absolute right-5 top-5 rounded-full bg-white/15 p-2 text-white"><X className="h-5 w-5" /></button>
        {(preview.node.image_urls?.length || 0) > 1 && <><button onClick={() => setPreview({ ...preview, index: (preview.index - 1 + (preview.node.image_urls?.length || 1)) % (preview.node.image_urls?.length || 1) })} className="absolute left-4 rounded-full bg-white/15 p-2 text-white"><ChevronLeft /></button><button onClick={() => setPreview({ ...preview, index: (preview.index + 1) % (preview.node.image_urls?.length || 1) })} className="absolute right-4 rounded-full bg-white/15 p-2 text-white"><ChevronRight /></button></>}
        <img src={(preview.node.image_urls?.length ? preview.node.image_urls : [preview.node.image_url || ''])[preview.index]} alt={preview.node.title} className="max-h-[78%] max-w-[85%] rounded-2xl object-contain shadow-2xl" />
      </div>}
      
      {/* Map Custom Theme Selector Trigger */}
      <div className="absolute top-4 right-4 z-[9999] flex items-center space-x-1 bg-white/70 backdrop-blur-md rounded-full px-2.5 py-1 shadow-md border border-white/60">
        <span className="text-[11px] font-semibold text-slate-600 px-1.5 py-0.5">地图底图</span>
        <button 
          onClick={() => setMapStyle('voyager')}
          className={`text-[10px] tracking-wide px-2.5 py-1 rounded-full font-medium transition-all ${mapStyle === 'voyager' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-700 hover:bg-white/50'}`}
        >
          人文
        </button>
        <button 
          onClick={() => setMapStyle('light')}
          className={`text-[10px] tracking-wide px-2.5 py-1 rounded-full font-medium transition-all ${mapStyle === 'light' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-700 hover:bg-white/50'}`}
        >
          浅色
        </button>
        <button 
          onClick={() => setMapStyle('dark')}
          className={`text-[10px] tracking-wide px-2.5 py-1 rounded-full font-medium transition-all ${mapStyle === 'dark' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-700 hover:bg-white/50'}`}
        >
          暗色
        </button>
      </div>

      <MapContainer
        center={mapCenter}
        zoom={12}
        className="w-full h-full"
        zoomControl={false} // Custom zoom buttons in desktop layout
      >
        {/* Tilings */}
        {mapStyle === 'voyager' && (
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CartoDB</a> voyager'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
        )}
        {mapStyle === 'light' && (
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CartoDB</a> light'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
        )}
        {mapStyle === 'dark' && (
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CartoDB</a> dark'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
        )}

        {/* Sync controllers */}
        <MapNavController activeNode={activeNode} />
        {visibleNodes.length > 0 && <FitBoundsController nodes={visibleNodes} activeDay={activeDay} />}

        {/* Draw edges (connecting networks) */}
        {visibleEdges.map((edge) => {
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
        {visibleNodes.map((node) => {
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
                                        node.type === 'leisure' ? '#f59e0b' :
                                        node.type === 'shopping' ? '#ec4899' : '#06b6d4'
                          }}>
                      {node.type === 'hotel' ? '酒店' :
                       node.type === 'restaurant' ? '餐厅' :
                       node.type === 'sightseeing' ? '景点' :
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
