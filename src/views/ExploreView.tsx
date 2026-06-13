/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import Timeline from '../components/Timeline/Timeline';
import MapView from '../components/Map/MapView';

export default function ExploreView() {
  return (
    <div className="w-full h-full flex flex-col">
      {/* Main split dashboard layout */}
      <div className="flex-grow flex flex-col sm:flex-row gap-3 sm:gap-4 lg:gap-5 min-h-0 pb-2">
        {/* Left Column (Timeline): Order 2 on mobile (bottom), Order 1 on desktop (left) */}
        <div className="w-full sm:w-[34%] md:w-[32%] xl:w-[28%] flex flex-col min-h-0 order-2 sm:order-1 transition-all duration-300">
          <Timeline />
        </div>

        {/* Right Column (Map): Order 1 on mobile (top half), Order 2 on desktop (right) */}
        <div className="w-full sm:flex-1 h-[40vh] sm:h-full rounded-2xl overflow-hidden relative order-1 sm:order-2 shadow-lg border border-white/30">
          <MapView />
        </div>
      </div>
    </div>
  );
}
