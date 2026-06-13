/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import Timeline from '../components/Timeline/Timeline';

export default function ExploreView() {
  return (
    <motion.aside
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="absolute inset-x-3 bottom-3 z-[900] max-h-[48vh] rounded-[26px] border border-white/45 bg-white/55 p-3 shadow-2xl backdrop-blur-2xl sm:inset-y-24 sm:left-5 sm:right-auto sm:max-h-none sm:w-[34%] sm:max-w-[430px] lg:left-7"
    >
      <Timeline />
    </motion.aside>
  );
}
