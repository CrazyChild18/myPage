/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import Timeline from '../components/Timeline/Timeline';

export default function ExploreView() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[900]">
      <div className="pointer-events-auto absolute inset-x-3 bottom-3 max-h-[48vh] rounded-[26px] border border-white/45 bg-white/55 p-3 shadow-2xl backdrop-blur-2xl sm:inset-y-24 sm:left-5 sm:right-auto sm:max-h-none sm:w-[34%] sm:max-w-[430px] lg:left-7">
        <Timeline />
      </div>
    </div>
  );
}
