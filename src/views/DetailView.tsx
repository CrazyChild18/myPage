import React, { useState } from 'react';
import { useItineraryStore } from '../store/useItineraryStore';
import { Bed, CalendarDays, Car, ClipboardList, Image as ImageIcon, MapPin, Printer, Users, X } from 'lucide-react';

export default function DetailView() {
  const { trip, nodes } = useItineraryStore();
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const sorted = [...nodes].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  const sights = sorted.filter((node) => node.type !== 'hotel' && node.image_url);

  const open = (url: string | undefined, title: string) => {
    if (url) setPreview({ url, title });
  };

  return (
    <div className="space-y-5">
      {preview && (
        <button onClick={() => setPreview(null)} className="fixed inset-0 z-[20000] flex cursor-zoom-out items-center justify-center bg-slate-950/90 p-4">
          <X className="absolute right-5 top-5 h-7 w-7 text-white" />
          <figure className="max-w-5xl">
            <img src={preview.url} alt={preview.title} className="max-h-[82vh] rounded-2xl object-contain shadow-2xl" />
            <figcaption className="mt-3 text-center text-sm font-semibold text-white">{preview.title}</figcaption>
          </figure>
        </button>
      )}

      <section className="flex flex-col gap-4 rounded-2xl border border-white/50 bg-white/45 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-700"><ClipboardList className="h-4 w-4" /> 完整详情与图片预览</div>
          <h2 className="mt-1 text-xl font-black text-slate-900">{trip?.title}</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">{trip?.summary}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-600">
            <span className="rounded-full bg-white px-3 py-1"><CalendarDays className="mr-1 inline h-3 w-3" />{trip?.start_date} 至 {trip?.end_date}</span>
            <span className="rounded-full bg-white px-3 py-1"><Users className="mr-1 inline h-3 w-3" />{trip?.travelers} 人 · {trip?.origin}出发</span>
          </div>
        </div>
        <button onClick={() => window.print()} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white"><Printer className="h-4 w-4" />打印 / PDF</button>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-4 print:hidden">
        <article onClick={() => open(trip?.car_image_url, 'Land Rover Defender 4x4')} className="group cursor-zoom-in overflow-hidden rounded-2xl border border-white/50 bg-white/60 shadow-md">
          <img src={trip?.car_image_url} alt="Land Rover Defender 4x4" className="h-40 w-full object-cover transition group-hover:scale-105" />
          <div className="p-4"><div className="flex items-center gap-2 font-bold text-slate-900"><Car className="h-4 w-4 text-indigo-600" />租车</div><p className="mt-2 text-[11px] leading-relaxed text-slate-500">{trip?.car}</p></div>
        </article>
        {trip?.accommodations.map((stay) => (
          <article key={stay.name} onClick={() => open(stay.image_url, stay.name)} className="group cursor-zoom-in overflow-hidden rounded-2xl border border-white/50 bg-white/60 shadow-md">
            <img src={stay.image_url} alt={stay.name} className="h-40 w-full object-cover transition group-hover:scale-105" />
            <div className="p-4">
              <div className="flex items-center gap-2 font-bold text-slate-900"><Bed className="h-4 w-4 text-emerald-600" />{stay.name}</div>
              <div className="mt-1 text-[10px] font-bold text-indigo-600">{stay.dates}</div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{stay.address}</p>
              <p className="mt-1 text-[10px] text-amber-700">参考图，实际房源以预订页面为准</p>
            </div>
          </article>
        ))}
      </section>

      <section className="print:hidden">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-black text-slate-900"><ImageIcon className="h-4 w-4 text-violet-600" />景点与行程图片</h3>
          <span className="text-[11px] font-semibold text-slate-500">{sights.length} 个可预览节点</span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {sights.map((node) => (
            <button key={node.id} onClick={() => open(node.image_url, node.title)} className="group overflow-hidden rounded-2xl bg-white/65 text-left shadow-md">
              <img src={node.image_url} alt={node.title} loading="lazy" className="h-32 w-full object-cover transition duration-300 group-hover:scale-105" />
              <div className="p-3">
                <div className="text-[9px] font-bold text-indigo-600">D{node.day} · {node.date.slice(5)} · {node.city}</div>
                <div className="mt-1 line-clamp-2 text-xs font-bold text-slate-800">{node.title}</div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/50 bg-white/60 shadow-xl print:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-xs text-slate-700">
            <thead><tr className="bg-slate-900 text-left text-white"><th className="px-4 py-4">日期</th><th className="px-3 py-4">时间</th><th className="px-4 py-4">地点</th><th className="px-3 py-4">区域</th><th className="px-4 py-4">安排与备注</th><th className="px-3 py-4 print:hidden">状态</th></tr></thead>
            <tbody>
              {sorted.map((node) => (
                <tr key={node.id} className="border-b border-slate-100 even:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3 font-bold">D{node.day} · {node.date}</td>
                  <td className="px-3 py-3 font-mono">{node.time}</td>
                  <td className="px-4 py-3"><div className="font-bold text-slate-900">{node.title}</div><div className="mt-1 text-[9px] text-slate-400"><MapPin className="mr-1 inline h-2.5 w-2.5" />{node.lat.toFixed(4)}, {node.lng.toFixed(4)}</div></td>
                  <td className="px-3 py-3">{node.city}</td>
                  <td className="px-4 py-3 text-[11px] leading-relaxed text-slate-600">{node.description}</td>
                  <td className="px-3 py-3 print:hidden"><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold">{node.status === 'completed' ? '已完成' : node.status === 'ongoing' ? '进行中' : '计划中'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
