/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useItineraryStore } from './store/useItineraryStore';
import ExploreView from './views/ExploreView';
import AdminView from './views/AdminView';
import DetailView from './views/DetailView';
import { Compass, Settings, ClipboardList, RotateCcw, Compass as NavigationIcon, Cloud, Users } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

type TabType = 'explore' | 'admin' | 'detail';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('explore');
  const { trip, loading, saving, error, loadTrip, resetTrip } = useItineraryStore();

  useEffect(() => {
    loadTrip();
  }, [loadTrip]);

  const handleResetToDefault = async () => {
    if (window.confirm('确定将当前路线恢复为 Notion 中的冰岛初始方案吗？这会覆盖已做的节点修改。')) {
      await resetTrip();
    }
  };

  return (
    <div className={`min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-50/50 via-slate-50 to-slate-100/90 text-slate-800 antialiased font-sans print:bg-white print:p-0 flex flex-col ${activeTab === 'explore' ? 'sm:h-screen sm:overflow-hidden' : ''}`}>
      
      {/* Absolute faint background ornaments (hides during print logs) */}
      <div className="absolute top-0 left-0 right-0 h-[450px] bg-gradient-to-b from-indigo-100/20 to-transparent pointer-events-none z-0 print:hidden" />
      
      {/* Header shell */}
      <header className="relative max-w-7xl w-full mx-auto pt-4 px-4 sm:px-6 lg:px-8 z-10 print:hidden shrink-0">
        <div className="bg-white/35 backdrop-blur-xl border border-white/50 px-5 py-3 rounded-2xl shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Brand/Logo name */}
          <div className="flex items-center space-x-3.5">
            <div className="relative flex items-center justify-center w-11 h-11 bg-slate-900 rounded-xl text-white shadow-lg shadow-indigo-900/10">
              <NavigationIcon className="w-5.5 h-5.5 animate-spin-slow text-indigo-400" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full border border-white shadow-sm" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-black text-slate-900 tracking-tight">{trip?.title || '旅行计划'}</h1>
                <span className="text-[9.5px] font-bold text-indigo-700 bg-indigo-50/80 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  首发路线
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {trip ? `${trip.start_date} → ${trip.end_date} · ${trip.subtitle}` : '正在连接行程服务...'}
              </p>
            </div>
          </div>

          {/* Navigation Control Tabs (Muted glass capsule container) */}
          <nav className="flex items-center space-x-1.5 bg-slate-100/75 border border-slate-200/50 p-1.5 rounded-2xl shrink-0">
            {/* View A - Explore */}
            <button
              onClick={() => setActiveTab('explore')}
              className={`flex items-center space-x-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl transition ${
                activeTab === 'explore'
                  ? 'bg-white shadow text-indigo-950 font-bold border-b-2 border-indigo-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
              }`}
            >
              <Compass className="w-4 h-4 text-indigo-500" />
              <span>探索行程</span>
            </button>

            {/* View B - Admin */}
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex items-center space-x-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl transition ${
                activeTab === 'admin'
                  ? 'bg-white shadow text-indigo-950 font-bold border-b-2 border-indigo-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
              }`}
            >
              <Settings className="w-4 h-4 text-violet-500" />
              <span>后台维护</span>
            </button>

            {/* View C - Detail Table */}
            <button
              onClick={() => setActiveTab('detail')}
              className={`flex items-center space-x-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl transition ${
                activeTab === 'detail'
                  ? 'bg-white shadow text-indigo-950 font-bold border-b-2 border-indigo-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
              }`}
            >
              <ClipboardList className="w-4 h-4 text-emerald-500" />
              <span>详情打印</span>
            </button>
          </nav>

          {/* Preset trigger utility list */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleResetToDefault}
              className="text-[11px] font-bold text-slate-500 hover:text-indigo-600 bg-slate-50 border border-slate-200/60 px-3.5 py-2 rounded-xl transition flex items-center space-x-1.5 cursor-pointer shadow-sm hover:bg-indigo-50/50"
              title="Click to reset travel spots of Beijing"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">恢复 Notion 冰岛方案</span>
            </button>
          </div>

        </div>
      </header>

      {(loading || saving || error) && (
        <div className="relative max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 mt-2 z-20 print:hidden">
          <div className={`rounded-xl px-4 py-2 text-xs font-semibold flex items-center gap-2 shadow-sm ${
            error ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-white/70 text-slate-600 border border-white'
          }`}>
            <Cloud className={`w-3.5 h-3.5 ${loading || saving ? 'animate-pulse' : ''}`} />
            {error || (loading ? '正在加载冰岛行程...' : '正在同步到服务器...')}
          </div>
        </div>
      )}

      {/* Main View Shell Container */}
      <main className={`relative max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 z-10 print:px-0 print:py-0 ${activeTab === 'explore' ? 'flex-1 min-h-0 py-3 sm:py-4 flex flex-col' : 'py-5'}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className={`w-full ${activeTab === 'explore' ? 'flex-1 min-h-0 flex flex-col' : ''}`}
          >
            {activeTab === 'explore' && <ExploreView />}
            {activeTab === 'admin' && <AdminView />}
            {activeTab === 'detail' && <DetailView />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Delicate Page footer */}
      {activeTab !== 'explore' && (
        <footer className="max-w-7xl mx-auto text-center py-6 border-t border-slate-200/50 text-slate-400 text-[11px] mt-10 print:hidden shrink-0">
          <div className="flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 lg:px-8 gap-3">
            <p className="font-medium">
              {trip?.summary || '冰岛自驾行程协作查看与维护'}
            </p>
            <div className="flex items-center space-x-3.5 font-semibold text-slate-400">
              <span>地图引擎: React-Leaflet</span>
              <span>·</span>
              <span>数据同步: Flask + SQLite</span>
              <span>·</span>
              <span>无缝前端 SPA</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
