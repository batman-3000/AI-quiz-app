const { PDFParse } = require('pdf-parse');
const fs = require('fs');
const path = require('path');

async function main() {
    // Just find any PDF file in backend directory if any, or create a mock PDF buffer or read a file.
    // Let's check if there are files in uploads directory
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const files = fs.readdirSync(uploadsDir);
    if (files.length === 0) {
        console.log("No files in uploads to test with, but we can verify imports.");
        console.log("PDFParse class type:", typeof PDFParse);
        return;
    }
    const testFile = path.join(uploadsDir, files[0]);
    console.log("Testing with file:", testFile);
    try {
        const dataBuffer = fs.readFileSync(testFile);
        const parser = new PDFParse({ data: dataBuffer });
        const result = await parser.getText();
        console.log("Parsed text snippet:", result.text.substring(0, 100));
    } catch(e) {
        console.error("Failed to parse:", e);
    }
}

main();
