const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const crypto = require('crypto');
const OpenAI = require('openai');
const db = require('../database');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Multer storage setup - use Memory Storage for Vercel Serverless
const storage = multer.memoryStorage();

const upload = multer({ 
    storage,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
            'application/pdf',
            'text/plain',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF, TXT, and DOCX files are allowed!'), false);
        }
    }
});

// Setup OpenAI-compatible client
const openai = new OpenAI({
    apiKey: process.env.AI_API_KEY || 'dummy_key_if_local',
    baseURL: process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1',
});

// Upload endpoint
router.post('/upload', requireAuth, requireRole('faculty'), upload.array('documents', 10), async (req, res) => {
    try {
        const { subject_id, timer_minutes, title, description, style, question_count } = req.body;
        
        if (!req.files || req.files.length === 0 || !subject_id) {
            return res.status(400).json({ error: 'Files and subject_id are required' });
        }

        const documentId = crypto.randomUUID();
        const fileNames = req.files.map(f => f.originalname).join(', ');

        const insertDoc = db.prepare(
            'INSERT INTO documents (id, subject_id, uploaded_by, file_name, file_path, status) VALUES (?, ?, ?, ?, ?, ?)'
        );
        await insertDoc.run(documentId, subject_id, req.user.id, fileNames, 'in-memory', 'processing');

        // Wait for processing to finish before responding so Vercel doesn't freeze the lambda!
        await processDocument(documentId, req.files, {
            subject_id, 
            timer_minutes: timer_minutes || 30, 
            title: title || 'Generated Quiz', 
            description: description || '', 
            created_by: req.user.id,
            style: style || 'mcq',
            question_count: parseInt(question_count) || 10
        });

        res.status(202).json({ 
            message: 'Documents uploaded successfully, AI has processed it.',
            document_id: documentId
        });

    } catch (err) {
        console.error('Upload Error:', err);
        res.status(500).json({ error: 'Failed to upload document' });
    }
});

// Async processing function
async function processDocument(documentId, files, quizConfig) {
    try {
        let combinedText = '';
        for (const file of files) {
            const ext = path.extname(file.originalname).toLowerCase();
            try {
                if (ext === '.pdf') {
                    const data = await pdf(file.buffer);
                    combinedText += data.text + '\n\n';
                } else if (ext === '.txt') {
                    combinedText += file.buffer.toString('utf8') + '\n\n';
                } else if (ext === '.docx' || ext === '.doc') {
                    const result = await mammoth.extractRawText({ buffer: file.buffer });
                    combinedText += result.value + '\n\n';
                }
            } catch (e) {
                console.warn(`Failed to extract text from ${file.originalname}: ${e.message}`);
            }
        }

        if (!combinedText || combinedText.trim().length === 0) {
            throw new Error("No extractable text found in documents");
        }

        const truncatedText = combinedText.substring(0, 50000);

        const totalCount = parseInt(quizConfig.question_count);
        let prompt = `You are an expert AI quiz generator.
CRITICAL INSTRUCTION: You MUST extract facts EXACTLY from the provided text below.
DO NOT use any external knowledge. DO NOT hallucinate. If the text does not contain enough information, use what is there. Every fact MUST be directly traceable to the text provided.
You MUST output a valid JSON object containing a "questions" array.
`;
        
        if (quizConfig.style === 'fill_blanks') {
            prompt += `Generate EXACTLY ${totalCount} Fill-in-the-Blanks questions.\nFormat: {"questions": [{"question":"The capital of France is _______.","options":["Paris"],"correct_index":0,"explanation":"..."}]}\n\n`;
        } else if (quizConfig.style === 'hybrid') {
            const mcqCount = Math.max(1, Math.round(totalCount * 0.4));
            const fillCount = totalCount - mcqCount;
            prompt += `Generate EXACTLY ${totalCount} questions total: EXACTLY ${mcqCount} Multiple Choice questions (4 options each) AND EXACTLY ${fillCount} Fill-in-the-Blanks questions (1 option containing the exact answer).\nFormat: {"questions": [{"question":"What is...?","options":["A","B","C","D"],"correct_index":1,"explanation":"Because..."}, {"question":"The capital of France is _______.","options":["Paris"],"correct_index":0,"explanation":"..."}]}\n\n`;
        } else {
            prompt += `Generate EXACTLY ${totalCount} Multiple Choice questions (4 options each).\nFormat: {"questions": [{"question":"What is...?","options":["A","B","C","D"],"correct_index":1,"explanation":"Because..."}]}\n\n`;
        }
        prompt += 'Text to extract from:\n' + truncatedText;

        const response = await openai.chat.completions.create({
            model: process.env.AI_MODEL || 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            response_format: { type: "json_object" }
        });

        let rawOutput = response.choices[0].message.content.trim();
        
        let generatedQuestions;
        try {
            const parsed = JSON.parse(rawOutput);
            generatedQuestions = parsed.questions || parsed.quiz || [];
        } catch (parseError) {
            // Fallback for markdown-wrapped JSON
            rawOutput = rawOutput.replace(/```json/g, '').replace(/```/g, '').trim();
            const firstBrace = rawOutput.indexOf('{');
            const lastBrace = rawOutput.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                const parsed = JSON.parse(rawOutput.substring(firstBrace, lastBrace + 1));
                generatedQuestions = parsed.questions || parsed.quiz || [];
            } else {
                throw new Error("Could not parse JSON from AI response: " + parseError.message);
            }
        }

        if (!Array.isArray(generatedQuestions)) {
            throw new Error("AI response did not parse into a list of questions");
        }

        const joinCode = crypto.randomBytes(3).toString('hex').toUpperCase();

        const transaction = db.transaction(async (txDb) => {
            const quizId = crypto.randomUUID();
            await txDb.prepare(
                'INSERT INTO quizzes (id, subject_id, document_id, created_by, title, description, timer_minutes, quiz_style, question_count, status, join_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).run(quizId, quizConfig.subject_id, documentId, quizConfig.created_by, quizConfig.title, quizConfig.description || '', parseInt(quizConfig.timer_minutes), quizConfig.style, quizConfig.question_count, 'published', joinCode);

            for (let qIndex = 0; qIndex < generatedQuestions.length; qIndex++) {
                const q = generatedQuestions[qIndex];
                const qId = crypto.randomUUID();
                await txDb.prepare(
                    'INSERT INTO questions (id, quiz_id, text, explanation, order_index) VALUES (?, ?, ?, ?, ?)'
                ).run(qId, quizId, q.question, q.explanation || '', qIndex);

                for (let oIndex = 0; oIndex < q.options.length; oIndex++) {
                    const optText = q.options[oIndex];
                    const optId = crypto.randomUUID();
                    const isCorrect = oIndex === q.correct_index ? 1 : 0;
                    await txDb.prepare(
                        'INSERT INTO options (id, question_id, text, is_correct, order_index) VALUES (?, ?, ?, ?, ?)'
                    ).run(optId, qId, optText, isCorrect, oIndex);
                }
            }

            await txDb.prepare('UPDATE documents SET status = ? WHERE id = ?').run('processed', documentId);
        });

        await transaction();
        console.log('Successfully processed document ' + documentId + ' and created quiz.');

    } catch (err) {
        console.error('Failed to process document ' + documentId + ':', err);
        await db.prepare('UPDATE documents SET status = ? WHERE id = ?').run('failed', documentId);
    }
}

// Endpoint to check document status
router.get('/status/:id', requireAuth, async (req, res) => {
    try {
        const query = db.prepare('SELECT status FROM documents WHERE id = ?');
        const doc = await query.get(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Document not found' });
        
        res.json({ status: doc.status });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// List all quizzes for a subject
router.get('/quizzes/:subject_id', requireAuth, async (req, res) => {
    try {
        const query = db.prepare(`
            SELECT q.*, u.username as host_name 
            FROM quizzes q 
            JOIN users u ON q.created_by = u.id 
            WHERE q.subject_id = ?
        `);
        const quizzes = await query.all(req.params.subject_id);
        res.json(quizzes);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get full quiz details (Questions + Options)
router.get('/quiz/:id', requireAuth, async (req, res) => {
    try {
        const quizQuery = db.prepare('SELECT * FROM quizzes WHERE id = ?');
        const quiz = await quizQuery.get(req.params.id);
        
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

        const qQuery = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index');
        const questions = await qQuery.all(quiz.id);

        const optionsQuery = db.prepare('SELECT * FROM options WHERE question_id IN (SELECT id FROM questions WHERE quiz_id = ?)');
        const allOptions = await optionsQuery.all(quiz.id);

        const fullQuestions = questions.map(q => {
            const qOptions = allOptions.filter(o => o.question_id === q.id).map(o => {
                if (req.user.role === 'student') {
                    return { id: o.id, text: o.text, order_index: o.order_index };
                }
                return o;
            });
            return Object.assign({}, q, { options: qOptions });
        });

        res.json(Object.assign({}, quiz, { questions: fullQuestions }));
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
