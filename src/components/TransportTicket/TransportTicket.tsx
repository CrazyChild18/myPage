import React from 'react';
import { Bus, Clock3, Plane, Ship, TrainFront } from 'lucide-react';
import { ItineraryNode, TransportMode } from '../../types';

const modes: Record<TransportMode, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  flight: { label: '航班', icon: Plane, tone: 'from-sky-500 to-indigo-600' },
  high_speed_rail: { label: '高铁', icon: TrainFront, tone: 'from-emerald-500 to-teal-600' },
  train: { label: '火车', icon: TrainFront, tone: 'from-orange-500 to-rose-500' },
  bus: { label: '巴士', icon: Bus, tone: 'from-violet-500 to-indigo-600' },
  ferry: { label: '轮渡', icon: Ship, tone: 'from-cyan-500 to-blue-600' },
  other: { label: '交通', icon: TrainFront, tone: 'from-slate-500 to-slate-700' },
};

export default function TransportTicket({ node, compact = false }: { node: ItineraryNode; compact?: boolean }) {
  const inferredMode: TransportMode = node.transport_mode || (/航班|飞往|→/.test(node.title) ? 'flight' : 'other');
  const meta = modes[inferredMode];
  const Icon = meta.icon;
  const titlePlaces = node.title.split(/\s*→\s*|\s*飞往\s*/);
  const departure = node.departure_place || titlePlaces[0] || node.city || '出发地';
  const arrival = node.arrival_place || titlePlaces[1] || '目的地';

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/70 bg-white shadow-md ${compact ? 'p-3' : 'p-4'}`}>
      <div className={`absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b ${meta.tone}`} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 rounded-full bg-gradient-to-r ${meta.tone} px-2.5 py-1 text-[9px] font-black text-white`}>
            <Icon className="h-3 w-3" /> {meta.label}
          </span>
          {node.service_number && <span className="text-[10px] font-black tracking-wider text-slate-500">{node.service_number}</span>}
        </div>
        <span className="text-[9px] font-bold text-slate-400">DAY {node.day} · {node.date.slice(5)}</span>
      </div>

      <div className={`mt-3 grid grid-cols-[1fr_auto_1fr] items-center ${compact ? 'gap-2' : 'gap-4'}`}>
        <div>
          <div className={`${compact ? 'text-lg' : 'text-2xl'} font-black tabular-nums text-slate-950`}>{node.time}</div>
          <div className="mt-0.5 truncate text-[10px] font-bold text-slate-500">{departure}</div>
        </div>
        <div className="flex min-w-16 flex-col items-center text-slate-400">
          <Icon className="h-4 w-4" />
          <div className="my-1 w-full border-t border-dashed border-slate-300" />
          <span className="flex items-center gap-1 text-[8px] font-bold"><Clock3 className="h-2.5 w-2.5" />{node.duration || '待补充'}</span>
        </div>
        <div className="text-right">
          <div className={`${compact ? 'text-lg' : 'text-2xl'} font-black tabular-nums text-slate-950`}>{node.arrival_time || '--:--'}</div>
          <div className="mt-0.5 truncate text-[10px] font-bold text-slate-500">{arrival}</div>
        </div>
      </div>
      {!compact && node.description && <p className="mt-3 border-t border-dashed border-slate-200 pt-2 text-[10px] leading-relaxed text-slate-500">{node.description}</p>}
    </div>
  );
}
