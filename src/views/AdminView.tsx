import React, { useMemo, useState } from 'react';
import { useItineraryStore } from '../store/useItineraryStore';
import { ItineraryNode, ItineraryType } from '../types';
import { Edit3, Image, MapPin, RefreshCw, Save, Settings, Sparkles, Trash2 } from 'lucide-react';

const ICELAND_PRESETS = [
  { name: '黄金瀑布', lat: 64.3271, lng: -20.1199, city: '黄金圈' },
  { name: '哈尔格林姆教堂', lat: 64.1417, lng: -21.9266, city: '雷克雅未克' },
  { name: '塞里雅兰瀑布', lat: 63.6156, lng: -19.9886, city: '南岸' },
  { name: 'Jökulsárlón Glacier Lagoon', lat: 64.0784, lng: -16.2306, city: '东南冰岛' },
  { name: '蓝湖温泉', lat: 63.8804, lng: -22.4495, city: '雷克雅内斯半岛' },
];

const emptyForm = (): Omit<ItineraryNode, 'id'> => ({
  title: '',
  description: '',
  type: 'sightseeing',
  time: '12:00',
  day: 1,
  date: '2026-09-26',
  city: '',
  lat: 64.1466,
  lng: -21.9426,
  status: 'planned',
  image_url: '',
});

export default function AdminView() {
  const { nodes, addNode, updateNode, deleteNode, autoConnectEdges, saving } = useItineraryStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [message, setMessage] = useState<string | null>(null);
  const sortedNodes = useMemo(() => [...nodes].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)), [nodes]);

  const toast = (value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(null), 3000);
  };

  const edit = (node: ItineraryNode) => {
    const { id, ...values } = node;
    setEditingId(id);
    setForm(values);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (editingId) {
        await updateNode(editingId, form);
        toast(`已保存：${form.title}`);
      } else {
        await addNode({ id: `node-${Date.now()}`, ...form });
        toast(`已新增：${form.title}`);
      }
      setEditingId(null);
      setForm(emptyForm());
    } catch {
      toast('保存失败，请查看页面顶部错误信息');
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 outline-none transition focus:border-indigo-400';

  return (
    <div className="space-y-5">
      {message && (
        <div className="fixed top-20 left-1/2 z-[10000] -translate-x-1/2 rounded-xl bg-slate-900 px-5 py-3 text-xs font-semibold text-white shadow-2xl">
          {message}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-white/50 bg-white/40 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700"><Settings className="h-6 w-6" /></div>
          <div>
            <h2 className="font-bold text-slate-800">冰岛路线维护</h2>
            <p className="text-xs text-slate-500">所有修改会保存到服务器，同行者刷新页面即可看到。</p>
          </div>
        </div>
        <button
          onClick={async () => { await autoConnectEdges(); toast('已按同日时间顺序重建路线连线'); }}
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> 重建同日路线连线
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-white/50 bg-white/45 p-5 shadow-xl lg:col-span-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-800">{editingId ? '编辑行程节点' : '添加行程节点'}</h3>
            {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm()); }} className="text-xs font-semibold text-red-600">取消编辑</button>}
          </div>

          <div className="rounded-xl bg-indigo-50/60 p-3">
            <div className="mb-2 flex items-center gap-1 text-xs font-bold text-indigo-800"><Sparkles className="h-3.5 w-3.5" /> 冰岛常用坐标</div>
            <div className="flex flex-wrap gap-1.5">
              {ICELAND_PRESETS.map((preset) => (
                <button key={preset.name} type="button" onClick={() => setForm({ ...form, ...preset })} className="rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 shadow-sm">
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          <label className="block text-xs font-semibold text-slate-700">名称
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-slate-700">日期
              <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputClass} />
            </label>
            <label className="text-xs font-semibold text-slate-700">时间
              <input required type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={inputClass} />
            </label>
            <label className="text-xs font-semibold text-slate-700">Day
              <input required min="1" type="number" value={form.day} onChange={(e) => setForm({ ...form, day: Number(e.target.value) })} className={inputClass} />
            </label>
            <label className="text-xs font-semibold text-slate-700">城市 / 区域
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputClass} />
            </label>
            <label className="text-xs font-semibold text-slate-700">类型
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ItineraryType })} className={inputClass}>
                <option value="sightseeing">景点</option><option value="hotel">住宿</option><option value="restaurant">餐饮</option>
                <option value="leisure">休闲</option><option value="shopping">采购</option><option value="transport">交通</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-700">状态
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ItineraryNode['status'] })} className={inputClass}>
                <option value="planned">计划中</option><option value="ongoing">进行中</option><option value="completed">已完成</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-700">纬度
              <input required type="number" step="any" value={form.lat} onChange={(e) => setForm({ ...form, lat: Number(e.target.value) })} className={inputClass} />
            </label>
            <label className="text-xs font-semibold text-slate-700">经度
              <input required type="number" step="any" value={form.lng} onChange={(e) => setForm({ ...form, lng: Number(e.target.value) })} className={inputClass} />
            </label>
          </div>
          <label className="block text-xs font-semibold text-slate-700">图片 URL
            <div className="relative"><Image className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={form.image_url || ''} onChange={(e) => setForm({ ...form, image_url: e.target.value })} className={`${inputClass} pl-9`} /></div>
          </label>
          {form.image_url && <img src={form.image_url} alt="" className="h-32 w-full rounded-xl object-cover" />}
          <label className="block text-xs font-semibold text-slate-700">说明
            <textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
          </label>
          <button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-semibold text-white disabled:opacity-50">
            <Save className="h-4 w-4" /> {editingId ? '保存修改' : '新增节点'}
          </button>
        </form>

        <div className="max-h-[calc(100vh-210px)] space-y-2.5 overflow-y-auto rounded-2xl border border-white/50 bg-white/35 p-4 shadow-lg lg:col-span-7">
          {sortedNodes.map((node) => (
            <div key={node.id} className="flex gap-3 rounded-xl border border-white/60 bg-white/70 p-3">
              {node.image_url ? <img src={node.image_url} alt="" className="h-20 w-24 shrink-0 rounded-lg object-cover" /> : <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-lg bg-slate-100"><MapPin className="h-5 w-5 text-slate-400" /></div>}
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold text-indigo-600">D{node.day} · {node.date} · {node.time} · {node.city}</div>
                <div className="mt-1 font-bold text-slate-800">{node.title}</div>
                <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{node.description}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => edit(node)} className="h-8 rounded-lg p-2 text-indigo-600 hover:bg-indigo-50"><Edit3 className="h-4 w-4" /></button>
                <button onClick={async () => { if (window.confirm(`删除“${node.title}”？`)) await deleteNode(node.id); }} className="h-8 rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
