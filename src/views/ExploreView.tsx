/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import Timeline from '../components/Timeline/Timeline';

export default function ExploreView() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[900]">
      <motion.div
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="pointer-events-auto absolute inset-x-3 bottom-3 max-h-[48vh] rounded-[26px] border border-white/45 bg-white/55 p-3 shadow-2xl backdrop-blur-2xl sm:inset-y-24 sm:left-5 sm:right-auto sm:max-h-none sm:w-[34%] sm:max-w-[430px] lg:left-7"
      >
        <Timeline />
      </motion.div>
    </div>
  );
}
