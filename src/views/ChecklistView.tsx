import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClipboardEvent, RefObject } from 'react';
import {
  CalendarDays, Check, ChevronDown, CircleAlert, ExternalLink, FileCheck2,
  ImagePlus, Link2, LoaderCircle, Minus, PackageCheck, Pencil, Plus, Search,
  Settings2, Trash2, Upload, UserRoundPlus, Users, X,
} from 'lucide-react';
import { useItineraryStore } from '../store/useItineraryStore';
import { ChecklistCategory, ChecklistItem, ChecklistMember, ChecklistResponse } from '../types';

const text = {
  title: '\u884c\u524d\u786e\u8ba4\u77e9\u9635',
  subtitle: '\u591a\u4eba\u5206\u5de5\u786e\u8ba4\u884c\u524d\u4e8b\u9879\uff0c\u6bcf\u4e2a\u4eba\u7684\u72b6\u6001\u90fd\u6e05\u695a\u53ef\u89c1\u3002',
  addItem: '\u65b0\u589e\u4e8b\u9879',
  manageMembers: '\u7ba1\u7406\u6210\u5458',
  all: '\u5168\u90e8',
  pending: '\u672a\u5b8c\u6210',
  soon: '\u5373\u5c06\u5230\u671f',
  done: '\u5df2\u5b8c\u6210',
  search: '\u641c\u7d22\u786e\u8ba4\u4e8b\u9879',
  loading: '\u6b63\u5728\u52a0\u8f7d\u786e\u8ba4\u6e05\u5355...',
};
const categories: Array<{ id: ChecklistCategory; label: string; icon: typeof FileCheck2 }> = [
  { id: 'documents', label: '\u8bc1\u4ef6\u4e0e\u6587\u4ef6', icon: FileCheck2 },
  { id: 'bookings', label: '\u8ba2\u5355\u4e0e\u9884\u8ba2', icon: CalendarDays },
  { id: 'personal', label: '\u4e2a\u4eba\u884c\u674e', icon: PackageCheck },
  { id: 'shared', label: '\u516c\u5171\u88c5\u5907', icon: Users },
  { id: 'other', label: '\u5176\u4ed6\u786e\u8ba4', icon: Check },
];
const presetColors = ['#4f46e5', '#0891b2', '#059669', '#ea580c', '#db2777', '#7c3aed', '#0284c7', '#65a30d'];
type Filter = 'all' | 'pending' | 'soon' | 'done';
type ItemDraft = {
  id?: string; title: string; category: ChecklistCategory; notes: string;
  link_url: string; due_date: string; member_ids: string[];
};
type MemberDraft = {
  id?: string; name: string; avatar_url: string; avatar_color: string; sort_order: number;
};
const emptyItem = (): ItemDraft => ({
  title: '', category: 'documents', notes: '', link_url: '', due_date: '', member_ids: [],
});
const requestJson = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...options,
    headers: options?.body instanceof FormData
      ? options.headers
      : { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({ error: '\u8bf7\u6c42\u5931\u8d25' }));
    throw new Error(detail.error || '\u8bf7\u6c42\u5931\u8d25');
  }
  if (response.status === 204) return undefined as T;
  return response.json();
};
const initial = (name: string) => name.trim().slice(0, 1).toUpperCase() || '?';
function Avatar({ member, size = 'md', confirmed }: {
  member: ChecklistMember; size?: 'sm' | 'md'; confirmed?: boolean;
}) {
  const sizing = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs';
  return (
    <span
      className={'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 font-black text-white ' + sizing + ' ' + (confirmed === true ? 'border-emerald-500 ring-2 ring-emerald-100' : confirmed === false ? 'border-amber-300' : 'border-white ring-1 ring-slate-200')}
      style={{ backgroundColor: member.avatar_color }}
    >
      {member.avatar_url ? <img src={member.avatar_url} alt="" className="h-full w-full object-cover" /> : initial(member.name)}
      {confirmed && <span className="absolute -bottom-px -right-px grid h-3.5 w-3.5 place-items-center rounded-full bg-emerald-500 text-white ring-1 ring-white"><Check className="h-2.5 w-2.5" strokeWidth={3} /></span>}
    </span>
  );
}
const isComplete = (item: ChecklistItem) => item.members.length > 0 && item.members.every((entry) => entry.confirmed_at);
const isSoon = (item: ChecklistItem) => {
  if (!item.due_date || isComplete(item)) return false;
  const days = Math.ceil((new Date(item.due_date + 'T23:59:59').getTime() - Date.now()) / 86400000);
  return days >= 0 && days <= 7;
};
const formatDate = (value: string) => {
  if (!value) return '\u672a\u8bbe\u7f6e';
  const date = new Date(value + 'T00:00:00');
  return (date.getMonth() + 1) + '\u6708' + date.getDate() + '\u65e5';
};

export default function ChecklistView() {
  const slug = useItineraryStore((state) => state.selectedTripSlug);
  const [data, setData] = useState<ChecklistResponse>({ members: [], items: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [itemDraft, setItemDraft] = useState<ItemDraft | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [memberDraft, setMemberDraft] = useState<MemberDraft | null>(null);
  const [cropSource, setCropSource] = useState('');
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError('');
    try {
      setData(await requestJson<ChecklistResponse>('/api/trips/' + slug + '/checklist'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '\u52a0\u8f7d\u5931\u8d25');
    } finally {
      setLoading(false);
    }
  }, [slug]);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    all: data.items.length,
    done: data.items.filter(isComplete).length,
    pending: data.items.filter((item) => !isComplete(item)).length,
    soon: data.items.filter(isSoon).length,
  }), [data.items]);
  const visibleItems = useMemo(() => data.items.filter((item) => {
    const matchesQuery = !query.trim() || (item.title + ' ' + item.notes).toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (
      filter === 'all'
      || (filter === 'done' && isComplete(item))
      || (filter === 'pending' && !isComplete(item))
      || (filter === 'soon' && isSoon(item))
    );
  }), [data.items, filter, query]);
  const grouped = useMemo(() => categories.map((category) => ({
    ...category,
    items: visibleItems.filter((item) => item.category === category.id),
  })).filter((group) => group.items.length), [visibleItems]);

  const saveItem = async () => {
    if (!slug || !itemDraft) return;
    setSaving(true);
    setError('');
    try {
      const url = '/api/trips/' + slug + '/checklist/items' + (itemDraft.id ? '/' + itemDraft.id : '');
      setData(await requestJson<ChecklistResponse>(url, {
        method: itemDraft.id ? 'PUT' : 'POST', body: JSON.stringify(itemDraft),
      }));
      setItemDraft(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '\u4fdd\u5b58\u5931\u8d25');
    } finally {
      setSaving(false);
    }
  };
  const editItem = (item: ChecklistItem) => setItemDraft({
    id: item.id, title: item.title, category: item.category, notes: item.notes,
    link_url: item.link_url, due_date: item.due_date,
    member_ids: item.members.map((entry) => entry.member_id),
  });
  const deleteItem = async (item: ChecklistItem) => {
    if (!slug || !window.confirm('\u5220\u9664\u201c' + item.title + '\u201d\uff1f')) return;
    setData((current) => ({ ...current, items: current.items.filter((entry) => entry.id !== item.id) }));
    try {
      await requestJson<void>('/api/trips/' + slug + '/checklist/items/' + item.id, { method: 'DELETE' });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '\u5220\u9664\u5931\u8d25');
      void load();
    }
  };
  const toggle = async (itemId: string, memberId: string, confirmed: boolean) => {
    if (!slug) return;
    setData((current) => ({
      ...current,
      items: current.items.map((item) => item.id !== itemId ? item : {
        ...item,
        members: item.members.map((entry) => entry.member_id === memberId
          ? { ...entry, confirmed_at: confirmed ? new Date().toISOString() : null } : entry),
      }),
    }));
    try {
      await requestJson('/api/trips/' + slug + '/checklist/items/' + itemId + '/members/' + memberId, {
        method: 'PUT', body: JSON.stringify({ confirmed }),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '\u786e\u8ba4\u72b6\u6001\u4fdd\u5b58\u5931\u8d25');
      void load();
    }
  };
  const chooseImage = (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (cropSource.startsWith('blob:')) URL.revokeObjectURL(cropSource);
    setCropSource(URL.createObjectURL(file));
    setZoom(1); setOffsetX(0); setOffsetY(0);
  };
  const pasteImage = (event: ClipboardEvent) => {
    const file = event.clipboardData.files.item(0);
    if (file) { event.preventDefault(); chooseImage(file); }
  };
  const cropBlob = async () => {
    const image = new Image();
    image.src = cropSource;
    await image.decode();
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('\u5934\u50cf\u88c1\u5207\u5931\u8d25');
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * zoom;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const travelX = Math.max(0, (width - size) / 2);
    const travelY = Math.max(0, (height - size) / 2);
    context.drawImage(
      image,
      (size - width) / 2 + (offsetX / 50) * travelX,
      (size - height) / 2 + (offsetY / 50) * travelY,
      width,
      height,
    );
    return new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('\u5934\u50cf\u751f\u6210\u5931\u8d25')),
      'image/webp',
      0.86,
    ));
  };
  const uploadAvatar = async () => {
    if (!slug || !cropSource) return memberDraft?.avatar_url || '';
    const form = new FormData();
    form.append('image', await cropBlob(), 'avatar.webp');
    return (await requestJson<{ url: string }>('/api/trips/' + slug + '/images', {
      method: 'POST', body: form,
    })).url;
  };
  const openMember = (member?: ChecklistMember) => {
    setMemberDraft(member ? { ...member } : {
      name: '', avatar_url: '',
      avatar_color: presetColors[data.members.length % presetColors.length],
      sort_order: data.members.length,
    });
    setCropSource(''); setZoom(1); setOffsetX(0); setOffsetY(0);
  };
  const saveMember = async () => {
    if (!slug || !memberDraft) return;
    setSaving(true);
    setError('');
    try {
      const payload = { ...memberDraft, avatar_url: await uploadAvatar() };
      const saved = await requestJson<ChecklistMember>(
        '/api/trips/' + slug + '/checklist/members' + (memberDraft.id ? '/' + memberDraft.id : ''),
        { method: memberDraft.id ? 'PUT' : 'POST', body: JSON.stringify(payload) },
      );
      setData((current) => ({
        ...current,
        members: memberDraft.id
          ? current.members.map((member) => member.id === saved.id ? saved : member)
          : [...current.members, saved],
      }));
      setMemberDraft(null);
      if (cropSource.startsWith('blob:')) URL.revokeObjectURL(cropSource);
      setCropSource('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '\u6210\u5458\u4fdd\u5b58\u5931\u8d25');
    } finally {
      setSaving(false);
    }
  };
  const deleteMember = async (member: ChecklistMember) => {
    if (!slug || !window.confirm('\u5220\u9664\u6210\u5458\u201c' + member.name + '\u201d\uff1f\u76f8\u5173\u786e\u8ba4\u8bb0\u5f55\u4e5f\u4f1a\u5220\u9664\u3002')) return;
    try {
      await requestJson<void>('/api/trips/' + slug + '/checklist/members/' + member.id, { method: 'DELETE' });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '\u5220\u9664\u6210\u5458\u5931\u8d25');
    }
  };

  if (loading) {
    return <div className="grid min-h-[55vh] place-items-center text-sm font-bold text-slate-500"><span><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />{text.loading}</span></div>;
  }
  const filters: Array<[Filter, string, number]> = [
    ['all', text.all, counts.all], ['pending', text.pending, counts.pending],
    ['soon', text.soon, counts.soon], ['done', text.done, counts.done],
  ];

  return (
    <div className="mx-auto w-full max-w-[1600px] pb-8">
      <section className="mb-4 flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end">
        <div>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-600 text-white shadow-sm"><FileCheck2 className="h-5 w-5" /></div>
            <div>
              <h2 className="text-xl font-black text-slate-950 sm:text-2xl">{text.title}</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">{text.subtitle}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-5">
            <Stat value={counts.all} label={'\u5168\u90e8\u4e8b\u9879'} tone="indigo" />
            <Stat value={counts.done} label={'\u5df2\u5b8c\u6210'} tone="emerald" />
            <Stat value={counts.soon} label={'\u4e34\u671f'} tone="orange" />
            <div className="min-w-36">
              <div className="mb-1.5 flex justify-between text-[10px] font-bold text-slate-500"><span>{'\u6574\u4f53\u8fdb\u5ea6'}</span><span>{counts.all ? Math.round(counts.done / counts.all * 100) : 0}%</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-indigo-600 transition-all" style={{ width: (counts.all ? counts.done / counts.all * 100 : 0) + '%' }} /></div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setItemDraft({ ...emptyItem(), member_ids: data.members.map((member) => member.id) })} className="flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-xs font-black text-white shadow-sm hover:bg-indigo-700"><Plus className="h-4 w-4" />{text.addItem}</button>
          <button onClick={() => setMembersOpen(true)} className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 hover:border-indigo-200 hover:text-indigo-700"><Users className="h-4 w-4" />{text.manageMembers}</button>
        </div>
      </section>
      {error && <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700"><span>{error}</span><button onClick={() => setError('')} aria-label="close"><X className="h-4 w-4" /></button></div>}
      <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row">
        <div className="flex overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
          {filters.map(([id, label, count]) => <button key={id} onClick={() => setFilter(id)} className={'whitespace-nowrap rounded-md px-3 py-2 text-[11px] font-black ' + (filter === id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50')}>{label}<span className="ml-1.5 text-[10px] opacity-70">{count}</span></button>)}
        </div>
        <label className="relative block min-w-0 sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.search} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {grouped.length ? <div className="overflow-x-auto"><table className="w-full min-w-[860px] table-fixed text-left">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-black text-slate-500"><tr>
              <th className="w-[36%] px-4 py-3">{'\u4e8b\u9879'}</th><th className="w-24 px-3 py-3">{'\u622a\u6b62\u65e5\u671f'}</th>
              {data.members.map((member) => <th key={member.id} className="w-20 px-1 py-2 text-center"><Avatar member={member} size="sm" /><div className="mt-1 truncate">{member.name}</div></th>)}
              <th className="w-28 px-3 py-3">{'\u603b\u4f53\u72b6\u6001'}</th><th className="w-16" />
            </tr></thead>
            <tbody>
              {grouped.flatMap((group) => {
                const Icon = group.icon;
                return [
                  <tr key={'group-' + group.id} className="border-y border-slate-200 bg-slate-50/80"><td colSpan={data.members.length + 4} className="px-4 py-2.5 text-xs font-black text-slate-800"><Icon className="mr-2 inline h-4 w-4 text-indigo-500" />{group.label}<span className="ml-2 text-[10px] text-slate-400">{group.items.length}</span><ChevronDown className="ml-2 inline h-3.5 w-3.5 text-slate-400" /></td></tr>,
                  ...group.items.map((item) => <ChecklistRow key={item.id} item={item} members={data.members} onToggle={toggle} onEdit={editItem} onDelete={deleteItem} />),
                ];
              })}
            </tbody>
          </table></div> : <EmptyState onAdd={() => setItemDraft({ ...emptyItem(), member_ids: data.members.map((member) => member.id) })} />}
        </div>
        <MemberSummary members={data.members} items={data.items} onManage={() => setMembersOpen(true)} onAdd={() => { setMembersOpen(true); openMember(); }} />
      </div>
      {itemDraft && <ItemDrawer draft={itemDraft} setDraft={setItemDraft} members={data.members} saving={saving} onClose={() => setItemDraft(null)} onSave={() => void saveItem()} onNewMember={() => { setMembersOpen(true); openMember(); }} />}
      {membersOpen && <MembersModal members={data.members} draft={memberDraft} setDraft={setMemberDraft} saving={saving} cropSource={cropSource} zoom={zoom} offsetX={offsetX} offsetY={offsetY} fileInput={fileInput} onClose={() => { setMembersOpen(false); setMemberDraft(null); }} onEdit={openMember} onDelete={(member) => void deleteMember(member)} onChooseImage={chooseImage} onPaste={pasteImage} setZoom={setZoom} setOffsetX={setOffsetX} setOffsetY={setOffsetY} onSave={() => void saveMember()} />}
    </div>
  );
}
function ChecklistRow({ item, members, onToggle, onEdit, onDelete }: {
  item: ChecklistItem; members: ChecklistMember[];
  key?: string;
  onToggle: (itemId: string, memberId: string, confirmed: boolean) => Promise<void>;
  onEdit: (item: ChecklistItem) => void; onDelete: (item: ChecklistItem) => Promise<void>;
}) {
  const complete = isComplete(item);
  const confirmedCount = item.members.filter((entry) => entry.confirmed_at).length;
  return <tr className={'border-b border-slate-100 hover:bg-indigo-50/30 ' + (complete ? 'bg-emerald-50/20' : '')}>
    <td className="px-4 py-3"><div className="flex items-start gap-3">
      <span className={'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ' + (complete ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white')}>{complete && <Check className="h-3 w-3" strokeWidth={3} />}</span>
      <div className="min-w-0"><div className={'truncate text-xs font-black ' + (complete ? 'text-slate-500' : 'text-slate-900')}>{item.title}</div>
        <div className="mt-1 flex min-w-0 items-center gap-2 text-[10px] font-medium text-slate-400">{item.notes && <span className="truncate">{item.notes}</span>}{item.link_url && <a href={item.link_url} target="_blank" rel="noreferrer" className="shrink-0 text-indigo-600 hover:underline"><ExternalLink className="inline h-3 w-3" /> {'\u94fe\u63a5'}</a>}</div>
      </div>
    </div></td>
    <td className={'px-3 py-3 text-[11px] font-bold ' + (isSoon(item) ? 'text-orange-600' : 'text-slate-500')}>{formatDate(item.due_date)}</td>
    {members.map((member) => {
      const assignment = item.members.find((entry) => entry.member_id === member.id);
      return <td key={member.id} className="px-1 py-3 text-center">{assignment
        ? <button onClick={() => void onToggle(item.id, member.id, !assignment.confirmed_at)} title={member.name + ' - ' + (assignment.confirmed_at ? '\u5df2\u786e\u8ba4' : '\u70b9\u51fb\u786e\u8ba4')} className={'mx-auto grid h-7 w-7 place-items-center rounded-full border transition ' + (assignment.confirmed_at ? 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600' : 'border-slate-300 bg-white text-transparent hover:border-indigo-400 hover:bg-indigo-50')}><Check className="h-3.5 w-3.5" strokeWidth={3} /></button>
        : <Minus className="mx-auto h-4 w-4 text-slate-300" />}</td>;
    })}
    <td className="px-3 py-3"><span className={'text-[10px] font-black ' + (complete ? 'text-emerald-600' : 'text-orange-600')}>{confirmedCount}/{item.members.length} {complete ? '\u5df2\u786e\u8ba4' : '\u5f85\u786e\u8ba4'}</span></td>
    <td className="px-2 py-3"><div className="flex justify-end"><button onClick={() => onEdit(item)} title={'\u7f16\u8f91'} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-indigo-600"><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => void onDelete(item)} title={'\u5220\u9664'} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></div></td>
  </tr>;
}

function MemberSummary({ members, items, onManage, onAdd }: {
  members: ChecklistMember[]; items: ChecklistItem[]; onManage: () => void; onAdd: () => void;
}) {
  return <aside className="hidden self-start rounded-lg border border-slate-200 bg-white p-4 shadow-sm xl:block">
    <div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-black text-slate-900">{'\u540c\u884c\u6210\u5458'}</h3><button onClick={onManage} title={text.manageMembers} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"><Settings2 className="h-4 w-4" /></button></div>
    <div className="space-y-4">{members.map((member) => {
      const assigned = items.filter((item) => item.members.some((entry) => entry.member_id === member.id));
      const confirmed = assigned.filter((item) => item.members.find((entry) => entry.member_id === member.id)?.confirmed_at).length;
      return <div key={member.id} className="flex items-center gap-3"><Avatar member={member} /><div className="min-w-0 flex-1"><div className="flex justify-between gap-2 text-[11px] font-black text-slate-700"><span className="truncate">{member.name}</span><span className="text-slate-400">{confirmed}/{assigned.length}</span></div><div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: (assigned.length ? confirmed / assigned.length * 100 : 0) + '%' }} /></div></div></div>;
    })}</div>
    <button onClick={onAdd} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-indigo-200 py-2.5 text-[11px] font-black text-indigo-600 hover:bg-indigo-50"><UserRoundPlus className="h-4 w-4" />{'\u6dfb\u52a0\u6210\u5458'}</button>
  </aside>;
}
function Stat({ value, label, tone }: { value: number; label: string; tone: 'indigo' | 'emerald' | 'orange' }) {
  const color = tone === 'indigo' ? 'text-indigo-600' : tone === 'emerald' ? 'text-emerald-600' : 'text-orange-600';
  return <div className="border-r border-slate-200 pr-5"><span className={'text-xl font-black ' + color}>{value}</span><span className="ml-1 text-[10px] font-bold text-slate-400">{label}</span></div>;
}
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return <div className="grid min-h-80 place-items-center p-8 text-center"><div><PackageCheck className="mx-auto h-9 w-9 text-slate-300" /><div className="mt-3 text-sm font-black text-slate-700">{'\u8fd8\u6ca1\u6709\u786e\u8ba4\u4e8b\u9879'}</div><p className="mt-1 text-xs text-slate-400">{'\u65b0\u589e\u7b2c\u4e00\u9879\uff0c\u5e76\u9009\u62e9\u9700\u8981\u786e\u8ba4\u7684\u540c\u884c\u6210\u5458\u3002'}</p><button onClick={onAdd} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-black text-white">{text.addItem}</button></div></div>;
}
const inputClass = 'mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none placeholder:text-slate-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

function ItemDrawer({ draft, setDraft, members, saving, onClose, onSave, onNewMember }: {
  draft: ItemDraft; setDraft: (draft: ItemDraft) => void; members: ChecklistMember[];
  saving: boolean; onClose: () => void; onSave: () => void; onNewMember: () => void;
}) {
  return <div className="fixed inset-0 z-[1400] bg-slate-950/25 backdrop-blur-[2px]" onMouseDown={onClose}>
    <aside onMouseDown={(event) => event.stopPropagation()} className="ml-auto flex h-full w-full max-w-md flex-col bg-slate-50 shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4"><div><h3 className="text-sm font-black text-slate-950">{draft.id ? '\u7f16\u8f91\u786e\u8ba4\u4e8b\u9879' : '\u65b0\u589e\u786e\u8ba4\u4e8b\u9879'}</h3><p className="mt-1 text-[10px] text-slate-400">{'\u4e3a\u6bcf\u4e2a\u9700\u8981\u53c2\u4e0e\u7684\u6210\u5458\u8bb0\u5f55\u72ec\u7acb\u786e\u8ba4\u72b6\u6001'}</p></div><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></header>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <label className="block text-[11px] font-black text-slate-600">{'\u4e8b\u9879\u6807\u9898'}<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={'\u4f8b\u5982\uff1a\u62a4\u7167\u6709\u6548\u671f\u68c0\u67e5'} className={inputClass} /></label>
        <label className="block text-[11px] font-black text-slate-600">{'\u5206\u7c7b'}<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as ChecklistCategory })} className={inputClass}>{categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
        <label className="block text-[11px] font-black text-slate-600">{'\u622a\u6b62\u65e5\u671f'}<input type="date" value={draft.due_date} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} className={inputClass} /></label>
        <label className="block text-[11px] font-black text-slate-600">{'\u5907\u6ce8'}<textarea rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} className={inputClass + ' h-auto py-3'} /></label>
        <label className="block text-[11px] font-black text-slate-600">{'\u76f8\u5173\u94fe\u63a5'}<div className="relative"><Link2 className="absolute left-3 top-[22px] h-4 w-4 text-slate-400" /><input value={draft.link_url} onChange={(event) => setDraft({ ...draft, link_url: event.target.value })} placeholder="https://" className={inputClass + ' pl-9'} /></div></label>
        <div><div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-black text-slate-600">{'\u6240\u9700\u786e\u8ba4\u6210\u5458'}</span><button onClick={onNewMember} className="text-[10px] font-black text-indigo-600 hover:underline">+ {'\u65b0\u6210\u5458'}</button></div>
          <div className="grid grid-cols-2 gap-2">{members.map((member) => {
            const selected = draft.member_ids.includes(member.id);
            return <button key={member.id} onClick={() => setDraft({ ...draft, member_ids: selected ? draft.member_ids.filter((id) => id !== member.id) : [...draft.member_ids, member.id] })} className={'flex items-center gap-2 rounded-lg border p-2.5 text-left ' + (selected ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white')}><Avatar member={member} size="sm" /><span className="min-w-0 flex-1 truncate text-[11px] font-black text-slate-700">{member.name}</span><span className={'grid h-4 w-4 place-items-center rounded border ' + (selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300')}>{selected && <Check className="h-3 w-3" />}</span></button>;
          })}</div>
        </div>
      </div>
      <footer className="flex justify-end gap-2 border-t border-slate-200 bg-white p-4"><button onClick={onClose} className="h-10 rounded-lg border border-slate-200 px-4 text-xs font-black text-slate-600">{'\u53d6\u6d88'}</button><button disabled={saving} onClick={onSave} className="flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-5 text-xs font-black text-white disabled:opacity-50">{saving && <LoaderCircle className="h-4 w-4 animate-spin" />}{'\u4fdd\u5b58'}</button></footer>
    </aside>
  </div>;
}
function MembersModal({ members, draft, setDraft, saving, cropSource, zoom, offsetX, offsetY, fileInput, onClose, onEdit, onDelete, onChooseImage, onPaste, setZoom, setOffsetX, setOffsetY, onSave }: {
  members: ChecklistMember[];
  draft: MemberDraft | null;
  setDraft: (draft: MemberDraft | null) => void;
  saving: boolean;
  cropSource: string;
  zoom: number;
  offsetX: number;
  offsetY: number;
  fileInput: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onEdit: (member?: ChecklistMember) => void;
  onDelete: (member: ChecklistMember) => void;
  onChooseImage: (file?: File) => void;
  onPaste: (event: ClipboardEvent) => void;
  setZoom: (value: number) => void;
  setOffsetX: (value: number) => void;
  setOffsetY: (value: number) => void;
  onSave: () => void;
}) {
  return <div className="fixed inset-0 z-[1500] grid place-items-center bg-slate-950/35 p-3 backdrop-blur-[2px]" onMouseDown={onClose}>
    <section onMouseDown={(event) => event.stopPropagation()} onPaste={onPaste} className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div><h3 className="text-sm font-black text-slate-950">{'\u7ba1\u7406\u540c\u884c\u6210\u5458'}</h3><p className="mt-1 text-[10px] text-slate-400">{'\u6210\u5458\u5c5e\u4e8e\u5f53\u524d\u65c5\u884c\uff0c\u4e0d\u9700\u8981\u767b\u5f55\u8d26\u53f7'}</p></div>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </header>
      <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[300px_minmax(0,1fr)]">
        <div className="border-b border-slate-200 p-4 md:border-b-0 md:border-r">
          <div className="mb-3 flex items-center justify-between"><span className="text-[11px] font-black text-slate-600">{'\u6210\u5458\u5217\u8868'}</span><button onClick={() => onEdit()} className="flex items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-2 text-[10px] font-black text-indigo-600"><Plus className="h-3.5 w-3.5" />{'\u6dfb\u52a0'}</button></div>
          <div className="space-y-1">{members.map((member) => <div key={member.id} className={'flex items-center gap-3 rounded-lg p-2.5 ' + (draft?.id === member.id ? 'bg-indigo-50' : 'hover:bg-slate-50')}><Avatar member={member} /><span className="min-w-0 flex-1 truncate text-xs font-black text-slate-700">{member.name}</span><button onClick={() => onEdit(member)} title={'\u7f16\u8f91'} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-white hover:text-indigo-600"><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => onDelete(member)} title={'\u5220\u9664'} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>
        </div>
        <div className="bg-slate-50 p-5">
          {draft ? <div>
            <h4 className="text-xs font-black text-slate-900">{draft.id ? '\u7f16\u8f91\u6210\u5458' : '\u6dfb\u52a0\u6210\u5458'}</h4>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div className="space-y-4">
                <label className="block text-[11px] font-black text-slate-600">{'\u59d3\u540d'}<input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={'\u8f93\u5165\u6210\u5458\u59d3\u540d'} className={inputClass} /></label>
                <div><div className="text-[11px] font-black text-slate-600">{'\u9884\u5236\u5934\u50cf'}</div><div className="mt-2 flex flex-wrap gap-2">{presetColors.map((color) => <button key={color} onClick={() => setDraft({ ...draft, avatar_color: color, avatar_url: '' })} className={'grid h-10 w-10 place-items-center rounded-full border-2 text-xs font-black text-white ' + (draft.avatar_color === color && !draft.avatar_url ? 'border-slate-900 ring-2 ring-slate-200' : 'border-white')} style={{ backgroundColor: color }}>{initial(draft.name)}</button>)}</div></div>
                <div><input ref={fileInput} type="file" accept="image/*" onChange={(event) => onChooseImage(event.target.files?.[0])} className="hidden" /><button onClick={() => fileInput.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-white py-2.5 text-[11px] font-black text-indigo-600"><Upload className="h-4 w-4" />{'\u4e0a\u4f20\u5934\u50cf'}</button><div className="mt-2 text-center text-[10px] text-slate-400">{'\u4e5f\u53ef\u5728\u7a97\u53e3\u5185\u76f4\u63a5\u7c98\u8d34\u56fe\u7247'}</div></div>
              </div>
              <div>
                <div className="mb-2 text-[11px] font-black text-slate-600">{'\u5934\u50cf\u88c1\u5207'}</div>
                <div className="relative mx-auto aspect-square w-full max-w-[250px] overflow-hidden rounded-lg bg-slate-200">
                  {cropSource ? <img src={cropSource} alt="" className="absolute left-1/2 top-1/2 h-full w-full object-cover" style={{ transform: 'translate(calc(-50% + ' + offsetX + 'px), calc(-50% + ' + offsetY + 'px)) scale(' + zoom + ')' }} /> : draft.avatar_url ? <img src={draft.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-5xl font-black text-white" style={{ backgroundColor: draft.avatar_color }}>{initial(draft.name)}</div>}
                  <div className="pointer-events-none absolute inset-[12%] rounded-full border-2 border-white shadow-[0_0_0_999px_rgba(15,23,42,0.45)]" />
                </div>
                {cropSource && <div className="mt-3 space-y-2"><CropControl label={'\u7f29\u653e'} min={1} max={3} step={0.05} value={zoom} setValue={setZoom} /><CropControl label={'\u6c34\u5e73'} min={-50} max={50} step={1} value={offsetX} setValue={setOffsetX} /><CropControl label={'\u5782\u76f4'} min={-50} max={50} step={1} value={offsetY} setValue={setOffsetY} /></div>}
                <p className="mt-3 flex items-start gap-2 text-[10px] leading-5 text-slate-400"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{'\u5934\u50cf\u5c06\u4fdd\u5b58\u4e3a\u6b63\u65b9\u5f62 WebP \u56fe\u7247\uff0c\u5e76\u5728\u9875\u9762\u4e2d\u4ee5\u5706\u5f62\u5c55\u793a\u3002'}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setDraft(null)} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-xs font-black text-slate-600">{'\u53d6\u6d88'}</button><button disabled={saving} onClick={onSave} className="flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-5 text-xs font-black text-white disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{'\u4fdd\u5b58\u6210\u5458'}</button></div>
          </div> : <div className="grid min-h-80 place-items-center text-center"><div><Users className="mx-auto h-10 w-10 text-slate-300" /><div className="mt-3 text-sm font-black text-slate-700">{'\u9009\u62e9\u6216\u6dfb\u52a0\u6210\u5458'}</div><p className="mt-1 text-xs text-slate-400">{'\u53ef\u4fee\u6539\u59d3\u540d\u3001\u4e0a\u4f20\u5934\u50cf\u5e76\u81ea\u884c\u88c1\u5207'}</p><button onClick={() => onEdit()} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-black text-white">{'\u6dfb\u52a0\u6210\u5458'}</button></div></div>}
        </div>
      </div>
    </section>
  </div>;
}
function CropControl({ label, min, max, step, value, setValue }: {
  label: string; min: number; max: number; step: number; value: number; setValue: (value: number) => void;
}) {
  return <label className="grid grid-cols-[36px_1fr] items-center gap-2 text-[10px] font-bold text-slate-500"><span>{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => setValue(Number(event.target.value))} className="accent-indigo-600" /></label>;
}
