import { default as SmilesDrawer } from 'smiles-drawer';

// The import might be an object containing SmiDrawer
const drawerClass = SmilesDrawer.SmiDrawer || SmilesDrawer;

const start = performance.now();
for (let i = 0; i < 10000; i++) {
  const drawer = new drawerClass();
}
const end = performance.now();
console.log(`Instantiating 10000 SmilesDrawers took ${end - start}ms`);
