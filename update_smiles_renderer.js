const fs = require('fs');
const filePath = 'src/components/SolutionDisplay.tsx';

let content = fs.readFileSync(filePath, 'utf8');

// Replace the inside of SmilesRenderer
const searchStr = `  useEffect(() => {
    if (canvasRef.current && smiles) {
      try {
        const drawer = new SmilesDrawer();
        drawer.draw(smiles.trim(), canvasRef.current, 'light');
      } catch (error) {
        console.error("Failed to render SMILES:", error);
      }
    }
  }, [smiles]);`;

const replacementStr = `  useEffect(() => {
    if (canvasRef.current && smiles) {
      try {
        // Use the globally shared instance instead of creating a new one
        sharedSmilesDrawer.draw(smiles.trim(), canvasRef.current, 'light');
      } catch (error) {
        console.error("Failed to render SMILES:", error);
      }
    }
  }, [smiles]);`;

// Add shared instance right above SmilesRenderer
const searchComponent = `const SmilesRenderer = ({ smiles }: { smiles: string }) => {`;
const insertShared = `// Shared instance to avoid repeated instantiation overhead
const sharedSmilesDrawer = new SmilesDrawer();

const SmilesRenderer = ({ smiles }: { smiles: string }) => {`;

if (content.includes(searchStr) && content.includes(searchComponent)) {
    content = content.replace(searchStr, replacementStr);
    content = content.replace(searchComponent, insertShared);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("Successfully updated SolutionDisplay.tsx");
} else {
    console.error("Could not find the target strings in SolutionDisplay.tsx");
}
