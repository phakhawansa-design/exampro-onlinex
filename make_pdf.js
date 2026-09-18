const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const htmlPath = path.resolve(__dirname, 'project_defense_deep_dive.html');
const pdfPath = path.resolve(__dirname, 'Project_Deep_Dive_Guide_Final.pdf');
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

console.log('Generating PDF from:', htmlPath);
execSync(`"${edgePath}" --headless --disable-gpu --print-to-pdf="${pdfPath}" --no-pdf-header-footer "${htmlPath}"`);

if (fs.existsSync(pdfPath)) {
    console.log('✔ SUCCESS! PDF generated successfully:', pdfPath);
    console.log('✔ File Size:', (fs.statSync(pdfPath).size / 1024).toFixed(2), 'KB');
} else {
    console.error('❌ Failed to generate PDF');
}
