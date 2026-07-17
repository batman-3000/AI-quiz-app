const OpenAI = require('openai');
require('dotenv').config();

console.log("Using API Key:", process.env.AI_API_KEY ? "Loaded (starts with " + process.env.AI_API_KEY.substring(0, 8) + ")" : "Not found");
console.log("Using Base URL:", process.env.AI_BASE_URL);
console.log("Using Model:", process.env.AI_MODEL);

const openai = new OpenAI({
    apiKey: process.env.AI_API_KEY,
    baseURL: process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1',
});

async function test() {
    try {
        const prompt = 'You are an expert AI quiz generator.\n' +
            'Generate a 1-question Multiple Choice Quiz about gravity.\n' +
            'Output ONLY valid JSON in the exact following format:\n' +
            '[{"question":"What is...?","options":["A","B","C","D"],"correct_index":1,"explanation":"Because..."}]\n';

        const response = await openai.chat.completions.create({
            model: process.env.AI_MODEL || 'llama3-8b-8192',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
        });

        console.log("RESPONSE SUCCESS!");
        console.log("Raw output:", response.choices[0].message.content);
    } catch (err) {
        console.error("API call failed:", err);
    }
}

test();
