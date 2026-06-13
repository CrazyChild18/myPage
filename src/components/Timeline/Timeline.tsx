import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock, Image as ImageIcon, MapPin, X } from 'lucide-react';
import TransportTicket from '../TransportTicket/TransportTicket';
import { useItineraryStore } from '../../store/useItineraryStore';
import { ItineraryNode, ItineraryType } from '../../types';

const meta: Record<Exclude<ItineraryType, 'transport'>, { label: string; tone: string }> = {
  transfer: { label: '转机', tone: 'bg-sky-50 text-sky-700' },
  hotel: { label: '住宿', tone: 'bg-emerald-50 text-emerald-700' },
  restaurant: { label: '餐饮', tone: 'bg-rose-50 text-rose-700' },
  sightseeing: { label: '景点', tone: 'bg-violet-50 text-violet-700' },
  leisure: { label: '休闲', tone: 'bg-amber-50 text-amber-700' },
  shopping: { label: '购物', tone: 'bg-pink-50 text-pink-700' },
};

const imagesOf = (node: ItineraryNode) => node.image_urls?.length ? node.image_urls : node.image_url ? [node.image_url] : [];
const isTicketTransport = (node: ItineraryNode) => Boolean(node.transport_mode || node.departure_place || node.arrival_place || /航班|高铁|火车|飞往|→/.test(node.title));

export default function Timeline() {
  const { nodes, activeNodeId, setActiveNodeId, activeDay, setActiveDay, updateNode } = useItineraryStore();
  const [preview, setPreview] = useState<{ node: ItineraryNode; index: number } | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const scrollEndTimer = useRef<number | null>(null);
  const days = Array.from(new Set(nodes.map((node) => node.day))).sort((a, b) => a - b);
  const filtered = nodes.filter((node) => activeDay === 'all' || node.day === activeDay).sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));

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
    }, 120);
  };

  const move = (offset: number) => setPreview((current) => {
    if (!current) return null;
    const images = imagesOf(current.node);
    return { ...current, index: (current.index + offset + images.length) % images.length };
  });

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {preview && <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-slate-950/90 p-4">
        <button onClick={() => setPreview(null)} className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white"><X className="h-5 w-5" /></button>
        {imagesOf(preview.node).length > 1 && <><button onClick={() => move(-1)} className="absolute left-5 rounded-full bg-white/10 p-2 text-white"><ChevronLeft /></button><button onClick={() => move(1)} className="absolute right-5 rounded-full bg-white/10 p-2 text-white"><ChevronRight /></button></>}
        <figure><img src={imagesOf(preview.node)[preview.index]} alt={preview.node.title} className="max-h-[80vh] max-w-[86vw] rounded-2xl object-contain shadow-2xl" /><figcaption className="mt-3 text-center text-sm font-bold text-white">{preview.node.title}</figcaption></figure>
      </div>}

      <div className="mb-3 shrink-0 rounded-2xl border border-white/50 bg-white/40 p-3 shadow-lg backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-800"><span>行程时间线</span><span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] text-indigo-700">{nodes.filter((node) => node.type !== 'transport').length} 个地点 · {nodes.filter((node) => node.type === 'transport').length} 段交通</span></div>
        <div className="grid grid-cols-4 gap-1.5"><button onClick={() => setActiveDay('all')} className={`rounded-xl border py-1.5 text-xs font-semibold ${activeDay === 'all' ? 'border-slate-900 bg-slate-900 text-white' : 'border-white bg-white/50 text-slate-700'}`}>全览</button>{days.map((day) => <button key={day} onClick={() => setActiveDay(day)} className={`rounded-xl border py-1.5 text-xs font-semibold ${activeDay === day ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-white bg-white/50 text-slate-700'}`}>D{day}</button>)}</div>
      </div>

      <div
        ref={trackRef}
        onScroll={syncActiveCard}
        className="flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden px-[7%] pb-4 no-scrollbar sm:block sm:space-y-2.5 sm:overflow-x-hidden sm:overflow-y-auto sm:px-0 sm:pr-1"
      >
        {filtered.map((node) => {
          if (node.type === 'transport') return <div ref={(element) => setCardRef(node.id, element)} key={node.id} onClick={() => setActiveNodeId(node.id)} className={`w-[86%] shrink-0 snap-center cursor-pointer rounded-2xl transition sm:w-auto ${activeNodeId === node.id ? 'ring-2 ring-indigo-500/30' : ''}`}>{isTicketTransport(node) ? <TransportTicket node={node} compact /> : <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/70 px-3 py-2.5"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black text-sky-700">{node.time} · 路线衔接</span><span className="text-[9px] font-bold text-slate-400">D{node.day}</span></div><div className="mt-1 text-xs font-bold text-slate-700">{node.title}</div><p className="mt-0.5 line-clamp-1 text-[9px] text-slate-400">{node.description}</p></div>}</div>;
          const nodeMeta = meta[node.type];
          const images = imagesOf(node);
          const selected = activeNodeId === node.id;
          return <article ref={(element) => setCardRef(node.id, element)} key={node.id} onClick={() => setActiveNodeId(node.id)} className={`w-[86%] shrink-0 snap-center cursor-pointer overflow-hidden rounded-2xl border transition sm:w-auto ${selected ? 'border-indigo-200 bg-white/90 shadow-xl ring-2 ring-indigo-500/10' : 'border-white/60 bg-white/50 shadow-md hover:bg-white/75'}`}>
            {images[0] && <button onClick={(event) => { event.stopPropagation(); setPreview({ node, index: 0 }); }} className="group relative block h-28 w-full overflow-hidden"><img src={images[0]} alt={node.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /><span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-slate-950/70 px-2 py-1 text-[8px] font-bold text-white opacity-0 backdrop-blur transition group-hover:opacity-100"><ImageIcon className="h-3 w-3" />查看 {images.length} 张图片</span></button>}
            <div className="p-3.5">
              <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1 text-[9px] font-bold text-slate-400"><Clock className="h-3 w-3" />{node.time} · D{node.day} · {node.date.slice(5)}</span><span className={`rounded-full px-2 py-0.5 text-[8px] font-black ${nodeMeta.tone}`}>{nodeMeta.label}</span></div>
              <h4 className="mt-1.5 text-sm font-black text-slate-900">{node.title}</h4>
              <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{node.description || node.address || '暂无说明'}</p>
              <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                <span className="flex min-w-0 items-center gap-1 truncate text-[9px] font-semibold text-slate-400"><MapPin className="h-3 w-3 shrink-0" />{node.city || node.address || '已选择地点'}</span>
                <button onClick={(event) => { event.stopPropagation(); void updateNode(node.id, { status: node.status === 'completed' ? 'planned' : 'completed' }); }} className="text-slate-400">{node.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-indigo-600" /> : <Circle className="h-4 w-4" />}</button>
              </div>
            </div>
          </article>;
        })}
      </div>
    </div>
  );
}
