const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Add constant
content = content.replace(
  "const COPY_FEEDBACK_DURATION_MS = 2000;",
  "const COPY_FEEDBACK_DURATION_MS = 2000;\nconst MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;"
);

// Replace in handleImageSelected
content = content.replace(
  "if (file.size > 10 * 1024 * 1024) {",
  "if (file.size > MAX_FILE_SIZE_BYTES) {"
);

content = content.replace(
  `  const handleHandwritingSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setHandwritingFile(files[0]);
    }
  };`,
  `  const handleHandwritingSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setErrorMsg("Image is too large. Try a cropped screenshot.");
        setAppState('ERROR');
        return;
      }
      setHandwritingFile(file);
    }
  };`
);

fs.writeFileSync('src/App.tsx', content);
