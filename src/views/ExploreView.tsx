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
      className="absolute inset-x-2 bottom-2 z-[900] max-h-[42vh] overflow-hidden rounded-[24px] border border-white/50 bg-white/48 p-2.5 shadow-2xl backdrop-blur-2xl sm:inset-y-24 sm:left-5 sm:right-auto sm:max-h-none sm:w-[36%] sm:max-w-[460px] sm:p-3 lg:left-7"
    >
      <Timeline />
    </motion.aside>
  );
}
