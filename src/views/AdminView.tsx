import React, { useMemo, useRef, useState } from 'react';
import { Clipboard, Edit3, Image, LoaderCircle, MapPin, Plane, Plus, RefreshCw, Save, Settings, Trash2, Upload, X } from 'lucide-react';
import LocationPicker from '../components/LocationPicker/LocationPicker';
import TransportTicket from '../components/TransportTicket/TransportTicket';
import { useItineraryStore } from '../store/useItineraryStore';
import { ItineraryNode, ItineraryType, TransportMode } from '../types';

const emptyForm = (): Omit<ItineraryNode, 'id'> => ({
  title: '', description: '', type: 'sightseeing', time: '12:00', day: 1, date: '2026-09-26',
  city: '', address: '', lat: 64.1466, lng: -21.9426, status: 'planned', image_url: '', image_urls: [],
  transport_mode: 'flight', departure_place: '', arrival_place: '', arrival_time: '14:00',
  arrival_date: '2026-09-26', service_number: '', duration: '',
});

export default function AdminView() {
  const { selectedTripSlug, nodes, addNode, updateNode, deleteNode, autoConnectEdges, saving } = useItineraryStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sortedNodes = useMemo(() => [...nodes].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)), [nodes]);
  const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white/85 px-3 py-2.5 text-xs outline-none transition focus:border-indigo-400';

  const toast = (value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(null), 3000);
  };

  const reset = () => {
    setEditingId(null);
    setForm(emptyForm());
    setImageUrlInput('');
  };

  const edit = (node: ItineraryNode) => {
    const { id, ...values } = node;
    setEditingId(id);
    setForm({ ...emptyForm(), ...values, image_urls: node.image_urls?.length ? node.image_urls : node.image_url ? [node.image_url] : [] });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (editingId) await updateNode(editingId, form);
      else await addNode({ id: `node-${Date.now()}`, ...form });
      toast(editingId ? `已保存：${form.title}` : `已新增：${form.title}`);
      reset();
    } catch {
      toast('保存失败，请检查输入内容');
    }
  };

  const uploadImage = async (file: File) => {
    if (!selectedTripSlug || !file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const data = new FormData();
      data.append('image', file);
      const response = await fetch(`/api/trips/${selectedTripSlug}/images`, { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '图片上传失败');
      addImageUrl(result.url);
      toast('图片已上传');
    } catch (error) {
      toast(error instanceof Error ? error.message : '图片上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addImageUrl = (value = imageUrlInput) => {
    const url = value.trim();
    if (!url) return;
    setForm((current) => {
      const images = current.image_urls || [];
      const next = images.includes(url) ? images : [...images, url];
      return { ...current, image_url: next[0] || '', image_urls: next };
    });
    setImageUrlInput('');
  };

  const pasteImage = async (event: React.ClipboardEvent<HTMLElement>) => {
    for (let index = 0; index < event.clipboardData.items.length; index += 1) {
      const item = event.clipboardData.items[index];
      const file = item.kind === 'file' && item.type.startsWith('image/') ? item.getAsFile() : null;
      if (file) {
        event.preventDefault();
        await uploadImage(file);
        break;
      }
    }
  };

  return (
    <div className="space-y-5">
      {message && <div className="fixed left-1/2 top-20 z-[10000] -translate-x-1/2 rounded-xl bg-slate-900 px-5 py-3 text-xs font-semibold text-white shadow-2xl">{message}</div>}

      <div className="flex flex-col gap-3 rounded-2xl border border-white/50 bg-white/40 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700"><Settings className="h-6 w-6" /></div>
          <div><h2 className="font-bold text-slate-800">旅行计划维护</h2><p className="text-xs text-slate-500">地点用于地图展示，飞机与高铁等作为独立区间行程。</p></div>
        </div>
        <button onClick={async () => { await autoConnectEdges(); toast('已重建地点之间的路线连线'); }} disabled={saving} className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" /> 重建地点连线</button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-white/50 bg-white/45 p-5 shadow-xl lg:col-span-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-800">{editingId ? '编辑行程内容' : '添加行程内容'}</h3>
            {editingId && <button type="button" onClick={reset} className="text-xs font-semibold text-red-600">取消编辑</button>}
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button type="button" onClick={() => setForm({ ...form, type: 'sightseeing' })} className={`rounded-lg py-2 text-xs font-bold ${form.type !== 'transport' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}><MapPin className="mr-1 inline h-3.5 w-3.5" />地点</button>
            <button type="button" onClick={() => setForm({ ...form, type: 'transport' })} className={`rounded-lg py-2 text-xs font-bold ${form.type === 'transport' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}><Plane className="mr-1 inline h-3.5 w-3.5" />区间行程</button>
          </div>

          <label className="block text-xs font-semibold text-slate-700">名称<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={form.type === 'transport' ? '例如：北京飞往东京' : '景点、餐厅或住宿名称'} className={inputClass} /></label>

          {form.type === 'transport' ? (
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-sky-100 bg-sky-50/60 p-3">
              <label className="text-xs font-semibold text-slate-700">交通方式<select value={form.transport_mode} onChange={(e) => setForm({ ...form, transport_mode: e.target.value as TransportMode })} className={inputClass}><option value="flight">飞机</option><option value="high_speed_rail">高铁</option><option value="train">火车</option><option value="bus">巴士</option><option value="ferry">轮渡</option><option value="other">其他</option></select></label>
              <label className="text-xs font-semibold text-slate-700">航班 / 车次<input value={form.service_number} onChange={(e) => setForm({ ...form, service_number: e.target.value })} placeholder="CA123 / G101" className={inputClass} /></label>
              <label className="text-xs font-semibold text-slate-700">出发地<input required value={form.departure_place} onChange={(e) => setForm({ ...form, departure_place: e.target.value })} className={inputClass} /></label>
              <label className="text-xs font-semibold text-slate-700">到达地<input required value={form.arrival_place} onChange={(e) => setForm({ ...form, arrival_place: e.target.value })} className={inputClass} /></label>
              <label className="text-xs font-semibold text-slate-700">到达日期<input required type="date" value={form.arrival_date || form.date} onChange={(e) => setForm({ ...form, arrival_date: e.target.value })} className={inputClass} /></label>
              <label className="text-xs font-semibold text-slate-700">到达时间<input required type="time" value={form.arrival_time} onChange={(e) => setForm({ ...form, arrival_time: e.target.value })} className={inputClass} /></label>
              <label className="col-span-2 text-xs font-semibold text-slate-700">行程时长<input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="例如：3 小时 20 分" className={inputClass} /></label>
            </div>
          ) : (
            <LocationPicker value={{ lat: form.lat, lng: form.lng, city: form.city, address: form.address, title: form.title }} onChange={(location) => setForm((current) => ({ ...current, lat: location.lat, lng: location.lng, city: location.city ?? current.city, address: location.address ?? current.address, title: current.title || location.title || '' }))} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-slate-700">日期<input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value, arrival_date: form.arrival_date || e.target.value })} className={inputClass} /></label>
            <label className="text-xs font-semibold text-slate-700">{form.type === 'transport' ? '出发时间' : '时间'}<input required type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={inputClass} /></label>
            <label className="text-xs font-semibold text-slate-700">Day<input required min="1" type="number" value={form.day} onChange={(e) => setForm({ ...form, day: Number(e.target.value) })} className={inputClass} /></label>
            {form.type !== 'transport' && <label className="text-xs font-semibold text-slate-700">类型<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ItineraryType })} className={inputClass}><option value="sightseeing">景点</option><option value="hotel">住宿</option><option value="restaurant">餐饮</option><option value="leisure">休闲</option><option value="shopping">采购</option></select></label>}
          </div>

          {form.type !== 'transport' && <div tabIndex={0} onPaste={pasteImage} className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 p-3 outline-none focus:border-indigo-400">
            <div className="grid grid-cols-3 gap-2">
              {(form.image_urls || []).map((url, index) => <div key={url} className="group relative"><img src={url} alt="" className="h-24 w-full rounded-xl object-cover" />{index === 0 && <span className="absolute bottom-1 left-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-[8px] font-bold text-white">封面</span>}<button type="button" onClick={() => setForm((current) => { const next = (current.image_urls || []).filter((image) => image !== url); return { ...current, image_urls: next, image_url: next[0] || '' }; })} className="absolute right-1 top-1 rounded-full bg-slate-950/70 p-1 text-white opacity-0 group-hover:opacity-100"><X className="h-3 w-3" /></button></div>)}
            </div>
            {!(form.image_urls || []).length && <div className="flex min-h-20 flex-col items-center justify-center text-center"><Clipboard className="h-5 w-5 text-indigo-500" /><div className="mt-1 text-[10px] text-slate-500">点击后粘贴图片，或使用下方上传</div></div>}
            <div className="mt-3 flex gap-2"><div className="relative min-w-0 flex-1"><Image className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={imageUrlInput} onChange={(e) => setImageUrlInput(e.target.value)} placeholder="图片 URL" className={`${inputClass} mt-0 pl-9`} /></div><button type="button" onClick={() => addImageUrl()} className="rounded-xl border border-indigo-200 bg-white px-3 text-[11px] font-bold text-indigo-700"><Plus className="h-3.5 w-3.5" /></button><input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && void uploadImage(e.target.files[0])} className="hidden" /><button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 rounded-xl bg-indigo-600 px-3 text-[11px] font-bold text-white">{uploading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}上传</button></div>
          </div>}

          <label className="block text-xs font-semibold text-slate-700">说明<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} /></label>
          <button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" /> {editingId ? '保存修改' : '新增内容'}</button>
        </form>

        <div className="max-h-[calc(100vh-210px)] space-y-2.5 overflow-y-auto rounded-2xl border border-white/50 bg-white/35 p-4 shadow-lg lg:col-span-7">
          {sortedNodes.map((node) => (
            <div key={node.id} className="rounded-xl border border-white/60 bg-white/70 p-3">
              {node.type === 'transport' ? <TransportTicket node={node} compact /> : <div className="flex gap-3">{node.image_url ? <img src={node.image_url} alt="" className="h-20 w-24 shrink-0 rounded-lg object-cover" /> : <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-lg bg-slate-100"><MapPin className="h-5 w-5 text-slate-400" /></div>}<div className="min-w-0 flex-1"><div className="text-[10px] font-bold text-indigo-600">D{node.day} · {node.date} · {node.time} · {node.city}</div><div className="mt-1 font-bold text-slate-800">{node.title}</div><p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{node.description}</p></div></div>}
              <div className="mt-2 flex justify-end gap-1"><button onClick={() => edit(node)} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50"><Edit3 className="h-4 w-4" /></button><button onClick={async () => { if (window.confirm(`删除“${node.title}”？`)) await deleteNode(node.id); }} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
