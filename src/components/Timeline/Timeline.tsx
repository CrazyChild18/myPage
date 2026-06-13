/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useItineraryStore } from '../../store/useItineraryStore';
import { ItineraryNode, ItineraryType } from '../../types';
import { 
  Clock, MapPin, CheckCircle2, Circle, 
  ChevronRight, Compass, Car, Train, Plane, Navigation, 
  Map 
} from 'lucide-react';

// Meta data helper to render category badges & matching background colors
const getCategoryMeta = (type: ItineraryType) => {
  switch (type) {
    case 'hotel':
      return { label: '酒店住宿', color: 'bg-emerald-500', text: 'text-emerald-500', bg: 'bg-emerald-500/10' };
    case 'restaurant':
      return { label: '餐饮美食', color: 'bg-rose-500', text: 'text-rose-500', bg: 'bg-rose-500/10' };
    case 'sightseeing':
      return { label: '观光景点', color: 'bg-violet-500', text: 'text-violet-500', bg: 'bg-violet-500/10' };
    case 'leisure':
      return { label: '休闲娱乐', color: 'bg-amber-500', text: 'text-amber-500', bg: 'bg-amber-500/10' };
    case 'shopping':
      return { label: '购物血拼', color: 'bg-pink-500', text: 'text-pink-500', bg: 'bg-pink-500/10' };
    case 'transport':
    default:
      return { label: '交通出行', color: 'bg-cyan-500', text: 'text-cyan-500', bg: 'bg-cyan-500/10' };
  }
};

export default function Timeline() {
  const { 
    nodes, 
    edges, 
    activeNodeId, 
    setActiveNodeId, 
    activeDay, 
    setActiveDay,
    updateNode,
    setHoveredEdgeId
  } = useItineraryStore();

  // Group days
  const days = Array.from(new Set(nodes.map(n => n.day))).sort((a, b) => a - b);

  // Filter nodes
  const filteredNodes = activeDay === 'all'
    ? [...nodes].sort((a, b) => {
        if (a.day !== b.day) return a.day - b.day;
        return a.time.localeCompare(b.time);
      })
    : nodes.filter(n => n.day === activeDay).sort((a, b) => a.time.localeCompare(b.time));

  // Find intermediate edge connecting current node to the next in the visible array
  const findConnectingEdge = (sourceId: string, targetId: string) => {
    return edges.find(e => e.source === sourceId && e.target === targetId);
  };

  const statusToggles = (node: ItineraryNode) => {
    const nextStatus = node.status === 'completed' 
      ? 'ongoing' 
      : node.status === 'ongoing' 
        ? 'planned' 
        : 'completed';
    updateNode(node.id, { status: nextStatus });
  };

  const getEdgeTransportIcon = (type?: string) => {
    switch(type) {
      case 'walk': return <Compass className="w-3.5 h-3.5 text-orange-500 shrink-0" />;
      case 'car': return <Car className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
      case 'train': return <Train className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
      case 'flight': return <Plane className="w-3.5 h-3.5 text-sky-500 shrink-0" />;
      default: return <Navigation className="w-3.5 h-3.5 text-stone-500 shrink-0" />;
    }
  };

  return (
    <div className="flex flex-col h-full w-full min-h-0">
      {/* Day Picker / Navigation (Fully glazed header) */}
      <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-2xl p-3 shadow-lg mb-2 sm:mb-3 shrink-0 animate-fade-in">
        <div className="text-xs font-bold text-slate-800 tracking-wider uppercase mb-2 flex items-center justify-between">
          <span>行程天数序列</span>
          <span className="text-[11px] bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full font-semibold">
            共 {nodes.length} 个节点
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          <button
            onClick={() => setActiveDay('all')}
            className={`text-xs py-1.5 rounded-xl border transition-all font-semibold cursor-pointer ${
              activeDay === 'all'
                ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                : 'bg-white/50 border-white/20 hover:bg-white/80 text-slate-700'
            }`}
          >
            全览
          </button>
          {days.map((dayNum) => (
            <button
              key={dayNum}
              onClick={() => setActiveDay(dayNum)}
              className={`text-xs py-1.5 rounded-xl border transition-all font-semibold cursor-pointer ${
                activeDay === dayNum
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                  : 'bg-white/50 border-white/20 hover:bg-white/80 text-slate-700'
              }`}
            >
              D{dayNum}
            </button>
          ))}
        </div>
      </div>

      {/* 
        ========================================================
        1. DESKTOP LAYOUT STORY: VERTICAL LIST SCROLLER (sm:flex hidden)
        ========================================================
      */}
      <div className="hidden sm:flex flex-col flex-1 min-h-0 overflow-y-auto pr-1 pb-4 no-scrollbar">
        <div className="space-y-3">
          {filteredNodes.length === 0 ? (
            <div className="bg-white/30 backdrop-blur-xl border border-white/40 p-10 rounded-2xl text-center text-slate-500 shadow-md">
              <Map className="w-8 h-8 mx-auto text-slate-400 mb-2" />
              <p className="text-xs font-semibold">该天无已设行程节点</p>
              <p className="text-[11px] mt-1 text-slate-400">请于管理中心添加新点</p>
            </div>
          ) : (
            filteredNodes.map((node, index) => {
              const meta = getCategoryMeta(node.type);
              const isSelected = activeNodeId === node.id;
              
              const nextNode = filteredNodes[index + 1];
              const connectingEdge = nextNode ? findConnectingEdge(node.id, nextNode.id) : null;

              return (
                <div key={node.id} className="relative group">
                  {/* Glassmorphic timeline item card */}
                  <div
                    onClick={() => setActiveNodeId(node.id)}
                    className={`cursor-pointer transition-all duration-300 p-4 rounded-2xl border text-left ${
                      isSelected
                        ? 'bg-white/85 border-indigo-200 shadow-xl ring-2 ring-indigo-500/10'
                        : 'bg-white/35 hover:bg-white/55 border-white/50 shadow-md'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {/* Interactive Status Indicator Toggle */}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            statusToggles(node);
                          }}
                          className="mt-1 text-slate-400 hover:text-indigo-600 transition shrink-0 cursor-pointer animate-pulse-slow"
                          title="点击切换完成状态"
                        >
                          {node.status === 'completed' ? (
                            <CheckCircle2 className="w-4 h-4 text-indigo-600 fill-indigo-50" />
                          ) : node.status === 'ongoing' ? (
                            <div className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                          ) : (
                            <Circle className="w-4 h-4 text-slate-400 hover:border-slate-600" />
                          )}
                        </button>

                        <div>
                          {/* Time & Day */}
                          <div className="flex items-center space-x-2 text-[10px] font-mono tracking-wide text-slate-500">
                            <span className="flex items-center">
                              <Clock className="w-3 h-3 mr-1" />
                              {node.time}
                            </span>
                            <span>·</span>
                            <span className="font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded">
                              Day {node.day} · {node.date.slice(5)}
                            </span>
                          </div>

                          {/* Title */}
                          <h4 className={`text-sm font-semibold mt-1 tracking-tight leading-snug ${
                            isSelected ? 'text-indigo-950 font-bold' : 'text-slate-800'
                          }`}>
                            {node.title}
                          </h4>
                          
                          {/* Description */}
                          <p className={`text-[11px] leading-relaxed mt-1.5 line-clamp-3 ${
                            isSelected ? 'text-slate-700' : 'text-slate-500'
                          }`}>
                            {node.description || '暂无描述信息'}
                          </p>
                        </div>
                      </div>

                      {/* Right Tag badge for category */}
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap shrink-0 ${meta.bg} ${meta.text}`}>
                        {meta.label}
                      </span>
                    </div>

                    {/* Footer Actions inside Card for focused mode */}
                    {isSelected && (
                      <div className="flex items-center justify-between border-t border-slate-100 mt-3 pt-2 text-[10px] font-medium text-slate-500">
                        <span className="flex items-center text-slate-400">
                          <MapPin className="w-3 h-3 mr-1" />
                          {node.lat.toFixed(4)}, {node.lng.toFixed(4)}
                        </span>
                        
                        <span className="text-indigo-600 flex items-center bg-indigo-50 px-2 py-0.5 rounded-full font-semibold">
                          已聚焦视角
                          <ChevronRight className="w-3 h-3 ml-0.5" />
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Connecting edge visual segment (Between elements) */}
                  {nextNode && (
                    <div className="relative h-7 flex items-center pl-10 z-[10]">
                      <div className="absolute left-[24px] top-0 bottom-0 w-0.5 border-l-2 border-dashed border-indigo-300"></div>
                      
                      {connectingEdge ? (
                        <div 
                          className="flex items-center space-x-1.5 py-0.5 px-2 bg-indigo-50 border border-indigo-100/60 rounded-full text-[9px] font-mono font-medium text-indigo-700 hover:scale-105 pointer-events-auto transition cursor-pointer"
                          onMouseEnter={() => setHoveredEdgeId(connectingEdge.id)}
                          onMouseLeave={() => setHoveredEdgeId(null)}
                        >
                          {getEdgeTransportIcon(connectingEdge.transportType)}
                          <span>
                            {connectingEdge.transportType === 'walk' ? '步行' : 
                             connectingEdge.transportType === 'car' ? '自驾' : 
                             connectingEdge.transportType === 'train' ? '轨交' : 
                             connectingEdge.transportType === 'flight' ? '航线' : '联络'}
                          </span>
                          {connectingEdge.distance && <span>{connectingEdge.distance}</span>}
                          {connectingEdge.duration && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="font-semibold">{connectingEdge.duration}</span>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="text-[9px] text-slate-400 bg-white/40 border border-white p-0.5 rounded px-2 select-none italic scale-95 origin-left">
                          接驳路线
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 
        ========================================================
        2. MOBILE LAYOUT STORY: HORIZONTAL SWIPE LIST (sm:hidden)
        ========================================================
      */}
      <div className="flex sm:hidden flex-col flex-grow min-h-0 overflow-hidden pr-1">
        {filteredNodes.length === 0 ? (
          <div className="bg-white/30 backdrop-blur-xl border border-white/40 p-6 rounded-2xl text-center text-slate-500 shadow-md">
            <p className="text-xs font-semibold">该天无已设行程节点</p>
          </div>
        ) : (
          <div className="flex flex-row overflow-x-auto no-scrollbar gap-3 px-1 py-2 snap-x snap-mandatory">
            {filteredNodes.map((node, index) => {
              const meta = getCategoryMeta(node.type);
              const isSelected = activeNodeId === node.id;
              
              const nextNode = filteredNodes[index + 1];
              const connectingEdge = nextNode ? findConnectingEdge(node.id, nextNode.id) : null;

              return (
                <div key={node.id} className="flex flex-row items-center shrink-0 snap-center w-[85%] max-w-[275px]">
                  {/* Frosted Swiper slider child item */}
                  <div
                    onClick={() => setActiveNodeId(node.id)}
                    className={`flex-1 transition-all duration-300 p-3.5 rounded-2xl border text-left flex flex-col justify-between h-[135px] cursor-pointer ${
                      isSelected
                        ? 'bg-white/95 border-indigo-200 shadow-md ring-2 ring-indigo-500/10'
                        : 'bg-white/45 hover:bg-white/60 border-white/50 shadow-xs'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center space-x-1 font-mono text-[9px] text-slate-500">
                          <Clock className="w-2.5 h-2.5 text-slate-400" />
                          <span>{node.time}</span>
                          <span>·</span>
                          <span className="font-bold text-indigo-700 bg-indigo-50 px-1 py-0.2 rounded">
                            D{node.day}
                          </span>
                        </div>
                        <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wider whitespace-nowrap ${meta.bg} ${meta.text}`}>
                          {meta.label}
                        </span>
                      </div>
                      
                      <h4 className={`text-xs font-bold mt-1.5 line-clamp-1 truncate ${
                        isSelected ? 'text-indigo-950' : 'text-slate-800'
                      }`}>
                        {node.title}
                      </h4>
                      <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">
                        {node.description || '暂无描述信息'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-150 pt-2 text-[9px] mt-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          statusToggles(node);
                        }}
                        className="flex items-center space-x-1 text-slate-500 font-semibold cursor-pointer"
                        title="点击完成状态"
                      >
                        {node.status === 'completed' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 fill-indigo-50" />
                        ) : node.status === 'ongoing' ? (
                          <div className="w-3 h-3 rounded-full border border-indigo-500 border-t-transparent animate-spin shrink-0" />
                        ) : (
                          <Circle className="w-3.5 h-3.5 text-slate-400" />
                        )}
                        <span>{node.status === 'completed' ? '已达成' : node.status === 'ongoing' ? '进行中' : '计划中'}</span>
                      </button>

                      {isSelected ? (
                        <span className="text-indigo-600 font-bold text-[8.5px] bg-indigo-50 px-1.5 rounded">
                          已聚焦
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[8.5px]">点击聚焦</span>
                      )}
                    </div>
                  </div>

                  {/* Horizontal routing connection indicators on mobile */}
                  {nextNode && (
                    <div className="flex flex-col items-center justify-center shrink-0 w-8 mx-0.5 text-slate-400">
                      <div className="w-3.5 border-t-2 border-dashed border-indigo-200"></div>
                      {connectingEdge ? (
                        <div 
                          className="flex flex-col items-center justify-center space-y-0.5 bg-white/75 border border-indigo-100 px-1 py-1 rounded-lg text-[8px] font-bold text-indigo-700 w-7 shadow-xs scale-90"
                          title={`${connectingEdge.distance || ''} ${connectingEdge.duration || ''}`}
                        >
                          {getEdgeTransportIcon(connectingEdge.transportType)}
                          <span className="truncate max-w-full font-mono text-[7px] tracking-tight">{connectingEdge.duration || '转场'}</span>
                        </div>
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                      )}
                      <div className="w-3.5 border-t-2 border-dashed border-indigo-200"></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
