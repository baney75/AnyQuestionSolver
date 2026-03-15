import React, { useEffect, useRef } from 'react';
import { default as SmilesDrawer } from 'smiles-drawer';

const drawerClass = SmilesDrawer.SmiDrawer || SmilesDrawer;

const runBenchmark = () => {
  console.log("Starting benchmark...");

  const iterations = 10000;

  const startUnoptimized = performance.now();
  for (let i = 0; i < iterations; i++) {
    const drawer = new drawerClass();
  }
  const endUnoptimized = performance.now();

  const sharedDrawer = new drawerClass();
  const startOptimized = performance.now();
  for (let i = 0; i < iterations; i++) {
    const drawer = sharedDrawer;
  }
  const endOptimized = performance.now();

  console.log(`Unoptimized (10000 instantiations): ${(endUnoptimized - startUnoptimized).toFixed(2)}ms`);
  console.log(`Optimized (10000 references): ${(endOptimized - startOptimized).toFixed(2)}ms`);
  console.log(`Improvement: ${(((endUnoptimized - startUnoptimized) - (endOptimized - startOptimized)) / (endUnoptimized - startUnoptimized) * 100).toFixed(2)}%`);
};

runBenchmark();
