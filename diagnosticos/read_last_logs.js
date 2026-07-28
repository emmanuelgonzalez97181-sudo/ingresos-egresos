const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\Emmanuel\\.gemini\\antigravity-ide\\brain\\85d2994d-750e-4d6d-9b00-73c3a6b12106\\.system_generated\\logs\\transcript.jsonl';

if (fs.existsSync(logPath)) {
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    console.log(`Total lines: ${lines.length}`);
    // Print the last 40 lines
    const lastLines = lines.slice(-40);
    lastLines.forEach((line, index) => {
        try {
            const parsed = JSON.parse(line);
            console.log(`\n--- Line ${lines.length - 40 + index} [Source: ${parsed.source}, Type: ${parsed.type}] ---`);
            if (parsed.content) {
                console.log("Content:", parsed.content.substring(0, 300));
            }
            if (parsed.tool_calls) {
                console.log("Tool Calls:", JSON.stringify(parsed.tool_calls, null, 2));
            }
        } catch (e) {
            console.log(`[Error parsing line ${index}]:`, e.message);
        }
    });
} else {
    console.log("Log file not found!");
}
