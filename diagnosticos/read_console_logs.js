const fs = require('fs');

const logPath = 'C:\\Users\\Emmanuel\\.gemini\\antigravity-ide\\brain\\85d2994d-750e-4d6d-9b00-73c3a6b12106\\.system_generated\\logs\\transcript_full.jsonl';

if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf8');
    const regex = /"name":"capture_browser_console_logs"[\s\S]*?"output":"([\s\S]*?)"/g;
    let match;
    console.log("Searching logs...");
    while ((match = regex.exec(content)) !== null) {
        console.log("\n--- CONSOLE LOGS ---");
        console.log(match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'));
    }
} else {
    console.log("Log file not found!");
}
