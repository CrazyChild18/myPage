import React, { useMemo, useState } from 'react';
import { useItineraryStore } from '../store/useItineraryStore';
import { ItineraryNode, ItineraryType } from '../types';
import TransportTicket from '../components/TransportTicket/TransportTicket';
import {
  Bed,
  CalendarDays,
  Car,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Image as ImageIcon,
  MapPin,
  Plane,
  Printer,
  Users,
  X,
} from 'lucide-react';

const typeLabels: Record<ItineraryType, string> = {
  transfer: '转机',
  transport: '交通',
  hotel: '住宿',
  restaurant: '餐饮',
  sightseeing: '景点',
  leisure: '休闲',
  shopping: '采购',
};

const typeStyles: Record<ItineraryType, string> = {
  transfer: 'bg-sky-50 text-sky-700',
  transport: 'bg-cyan-50 text-cyan-700',
  hotel: 'bg-emerald-50 text-emerald-700',
  restaurant: 'bg-rose-50 text-rose-700',
  sightseeing: 'bg-violet-50 text-violet-700',
  leisure: 'bg-amber-50 text-amber-700',
  shopping: 'bg-pink-50 text-pink-700',
};

const nodeImages = (node: ItineraryNode) =>
  node.image_urls?.length ? node.image_urls : node.image_url ? [node.image_url] : [];
const isTicketTransport = (node: ItineraryNode) => Boolean(node.transport_mode || node.departure_place || node.arrival_place || /航班|高铁|火车|飞往|→/.test(node.title));

const formatDisplayDate = (date: string) =>
  new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
    .format(new Date(`${date}T00:00:00`));

export default function DetailView() {
  const { trip, nodes } = useItineraryStore();
  const [preview, setPreview] = useState<{ images: string[]; index: number; title: string } | null>(null);
  const sorted = useMemo(() => [...nodes].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)), [nodes]);
  const days = useMemo(() => Array.from(new Set(sorted.map((node) => node.day))), [sorted]);

  const open = (node: ItineraryNode, index: number) => {
    const images = nodeImages(node);
    if (images.length) setPreview({ images, index, title: node.title });
  };

  const movePreview = (offset: number) => {
    setPreview((current) => {
      if (!current) return null;
      const index = (current.index + offset + current.images.length) % current.images.length;
      return { ...current, index };
    });
  };

  return (
    <div className="visa-itinerary space-y-5">
      {preview && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-slate-950/92 p-4 print:hidden">
          <button onClick={() => setPreview(null)} className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white backdrop-blur">
            <X className="h-5 w-5" />
          </button>
          {preview.images.length > 1 && (
            <>
              <button onClick={() => movePreview(-1)} className="absolute left-3 rounded-full bg-white/10 p-2.5 text-white backdrop-blur sm:left-8">
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button onClick={() => movePreview(1)} className="absolute right-3 rounded-full bg-white/10 p-2.5 text-white backdrop-blur sm:right-8">
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
          <figure className="max-w-5xl">
            <img src={preview.images[preview.index]} alt={preview.title} className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl" />
            <figcaption className="mt-4 text-center text-sm font-semibold text-white">
              {preview.title}
              {preview.images.length > 1 && <span className="ml-2 text-white/50">{preview.index + 1} / {preview.images.length}</span>}
            </figcaption>
            {preview.images.length > 1 && (
              <div className="mt-3 flex justify-center gap-1.5">
                {preview.images.map((image, index) => (
                  <button
                    key={image}
                    onClick={() => setPreview({ ...preview, index })}
                    className={`h-1.5 rounded-full transition ${index === preview.index ? 'w-6 bg-white' : 'w-1.5 bg-white/35'}`}
                    aria-label={`查看第 ${index + 1} 张图片`}
                  />
                ))}
              </div>
            )}
          </figure>
        </div>
      )}

      <section className="visa-cover overflow-hidden rounded-3xl border border-white/60 bg-white/65 shadow-xl backdrop-blur-xl print:rounded-none print:border-0 print:bg-white print:shadow-none">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between print:p-0">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-indigo-600 print:text-slate-700">
              <FileText className="h-3.5 w-3.5" /> Visa Travel Itinerary
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 print:text-xl">{trip?.title}</h2>
            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-500 print:text-[10px] print:text-slate-700">{trip?.summary}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-600 print:mt-3 print:text-[9px]">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 print:rounded-none print:bg-white print:p-0"><CalendarDays className="mr-1 inline h-3 w-3" />{trip?.start_date} 至 {trip?.end_date}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 print:rounded-none print:bg-white print:p-0"><Users className="mr-1 inline h-3 w-3" />{trip?.travelers} 人 · {trip?.origin}出发</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 print:rounded-none print:bg-white print:p-0"><Plane className="mr-1 inline h-3 w-3" />共 {days.length} 天</span>
            </div>
          </div>
          <button onClick={() => window.print()} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-500 print:hidden">
            <Printer className="h-4 w-4" /> 导出签证行程单 PDF
          </button>
        </div>

        <div className="grid gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4 print:mt-4 print:grid-cols-2 print:border print:border-slate-300">
          <div className="bg-white/90 p-4 print:p-2">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 print:text-slate-500"><Car className="h-3.5 w-3.5" />交通安排</div>
            <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-slate-600 print:text-[8px]">{trip?.car}</p>
          </div>
          {trip?.accommodations.map((stay) => (
            <div key={stay.name} className="bg-white/90 p-4 print:p-2">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 print:text-slate-500"><Bed className="h-3.5 w-3.5" />{stay.name}</div>
              <div className="mt-1 text-[9px] font-bold text-indigo-600 print:text-slate-700">{stay.dates}</div>
              <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500 print:text-[8px]">{stay.address}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="space-y-4 print:space-y-3">
        {days.map((day) => {
          const dayNodes = sorted.filter((node) => node.day === day);
          const first = dayNodes[0];
          const cities = Array.from(new Set(dayNodes.map((node) => node.city).filter(Boolean)));
          return (
            <section key={day} className="day-sheet overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-lg backdrop-blur-xl print:break-inside-avoid print:rounded-none print:border-slate-300 print:bg-white print:shadow-none">
              <header className="flex flex-col gap-1 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between print:bg-slate-100 print:px-2 print:py-1.5 print:text-slate-900">
                <div className="flex items-center gap-3">
                  <span className="rounded-lg bg-indigo-500 px-2.5 py-1 text-xs font-black print:rounded-none print:bg-white print:p-0 print:text-[10px]">DAY {day}</span>
                  <span className="text-xs font-bold print:text-[9px]">{formatDisplayDate(first.date)}</span>
                </div>
                <span className="text-[10px] font-semibold text-slate-300 print:text-[8px] print:text-slate-600">{cities.join(' · ')}</span>
              </header>

              <div className="divide-y divide-slate-100 print:divide-slate-200">
                {dayNodes.map((node) => {
                  const images = nodeImages(node);
                  if (node.type === 'transport' && isTicketTransport(node)) {
                    return (
                      <article key={node.id} className="bg-slate-50/60 p-3 print:bg-white print:p-1.5">
                        <TransportTicket node={node} />
                      </article>
                    );
                  }
                  return (
                    <article key={node.id} className="itinerary-row grid gap-3 p-4 sm:grid-cols-[64px_minmax(150px,0.8fr)_minmax(240px,1.4fr)_180px] sm:items-center print:grid-cols-[42px_145px_1fr_82px] print:gap-1.5 print:p-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 sm:block print:text-[8px]">
                        <Clock className="h-3.5 w-3.5 text-indigo-500 sm:mb-1 print:hidden" />
                        {node.time}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-[8px] font-black ${typeStyles[node.type]} print:rounded-none print:bg-white print:p-0 print:text-slate-500`}>{typeLabels[node.type]}</span>
                          <span className="truncate text-sm font-black text-slate-900 print:text-[9px]">{node.title}</span>
                        </div>
                        <div className="mt-1 flex items-start gap-1 text-[9px] font-semibold text-slate-400 print:text-[7px]">
                          <MapPin className="mt-0.5 h-2.5 w-2.5 shrink-0" /> <span className="line-clamp-2">{node.address || node.city || '地点待补充'}</span>
                        </div>
                      </div>

                      <p className="text-[11px] leading-relaxed text-slate-600 print:text-[8px] print:leading-snug">{node.description || '暂无补充说明'}</p>

                      <div className="image-strip flex min-h-14 items-center gap-1.5 print:min-h-0">
                        {images.length ? images.slice(0, 3).map((image, index) => (
                          <button
                            key={image}
                            onClick={() => open(node, index)}
                            className={`image-thumb group relative overflow-hidden rounded-lg border border-white bg-slate-100 shadow-sm print:rounded-none print:border-slate-300 print:shadow-none ${index === 0 ? 'h-16 w-20' : 'h-14 w-12'} print:h-11 print:w-16`}
                          >
                            <img src={image} alt={`${node.title} ${index + 1}`} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                            {index === 2 && images.length > 3 && <span className="absolute inset-0 flex items-center justify-center bg-slate-950/65 text-[10px] font-black text-white print:hidden">+{images.length - 3}</span>}
                          </button>
                        )) : (
                          <div className="flex h-14 w-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-[9px] text-slate-400 print:hidden">
                            <ImageIcon className="mr-1 h-3.5 w-3.5" /> 暂无图片
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <footer className="hidden border-t border-slate-300 pt-2 text-[7px] text-slate-500 print:flex print:justify-between">
        <span>Travel itinerary prepared for visa application purposes.</span>
        <span>Generated from VoyagePlanner</span>
      </footer>
    </div>
  );
}
