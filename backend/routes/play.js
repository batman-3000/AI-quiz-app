const express = require('express');
const db = require('../database');
const crypto = require('crypto');

const router = express.Router();

// 1. Join a Quiz using class join_code
router.post('/join', async (req, res) => {
    const { joinCode, studentName } = req.body;
    if (!joinCode || !studentName) return res.status(400).json({ error: 'Join code and name required' });

    try {
        // Query class using join_code
        const classInfo = await db.prepare('SELECT id, name FROM classes WHERE join_code = ?').get(joinCode.toUpperCase());
        if (classInfo) {
            const quizzes = await db.prepare(`
                SELECT q.id, q.title, q.description, q.timer_minutes, q.quiz_style, q.question_count 
                FROM quizzes q 
                JOIN subjects s ON q.subject_id = s.id 
                WHERE s.class_id = ? AND q.status = ?
            `).all(classInfo.id, 'published');
            
            const studentToken = crypto.randomUUID();
            return res.json({ quizzes, studentToken, studentName, className: classInfo.name });
        }

        // Query quiz using join_code
        const quizInfo = await db.prepare(`
            SELECT q.id, q.title, q.description, q.timer_minutes, q.quiz_style, q.question_count, c.name as class_name
            FROM quizzes q
            JOIN subjects s ON q.subject_id = s.id
            JOIN classes c ON s.class_id = c.id
            WHERE q.join_code = ? AND q.status = ?
        `).get(joinCode.toUpperCase(), 'published');

        if (quizInfo) {
            const studentToken = crypto.randomUUID();
            // Remove class_name from quizInfo so it matches the expected quiz object structure exactly
            const className = quizInfo.class_name;
            delete quizInfo.class_name;
            return res.json({ quizzes: [quizInfo], studentToken, studentName, className, isDirectQuiz: true });
        }

        return res.status(404).json({ error: 'Invalid join code (Class or Quiz not found)' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 2. Start a Quiz
router.get('/:quizId/start', async (req, res) => {
    const { quizId } = req.params;
    
    try {
        const quiz = await db.prepare('SELECT id, title, timer_minutes, quiz_style FROM quizzes WHERE id = ?').get(quizId);
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

        const questions = await db.prepare('SELECT id, text, explanation FROM questions WHERE quiz_id = ? ORDER BY order_index').all(quizId);
        
        for (let q of questions) {
            q.options = await db.prepare('SELECT id, text FROM options WHERE question_id = ? ORDER BY order_index').all(q.id);
        }

        quiz.questions = questions;
        res.json(quiz);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 3. Submit Quiz
router.post('/:quizId/submit', async (req, res) => {
    const { quizId } = req.params;
    const { studentToken, studentName, answers } = req.body; 

    try {
        let score = 0;
        const correctAnswers = {};
        const questions = await db.prepare('SELECT id FROM questions WHERE quiz_id = ?').all(quizId);
        
        for (let q of questions) {
            const correctOpt = await db.prepare('SELECT id, text FROM options WHERE question_id = ? AND is_correct = 1').get(q.id);
            const studentAns = answers[q.id];
            
            if (correctOpt) {
                correctAnswers[q.id] = correctOpt;
                if (studentAns === correctOpt.id) {
                    score++;
                } else if (typeof studentAns === 'string' && studentAns.trim().toLowerCase() === correctOpt.text.trim().toLowerCase()) {
                    score++;
                }
            }
        }

        // Save attempt to database
        const attemptId = crypto.randomUUID();
        await db.prepare(`
            INSERT INTO quiz_attempts (id, quiz_id, student_token, student_name, score, max_score, submitted_at, status)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'submitted')
        `).run(attemptId, quizId, studentToken, studentName, score, questions.length);

        res.json({ score, maxScore: questions.length, correctAnswers });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 4. Get Correct Answers for Review
router.get('/:quizId/answers', async (req, res) => {
    const { quizId } = req.params;
    try {
        const correctAnswers = {};
        const questions = await db.prepare('SELECT id FROM questions WHERE quiz_id = ?').all(quizId);
        for (let q of questions) {
            const correctOpt = await db.prepare('SELECT id, text FROM options WHERE question_id = ? AND is_correct = 1').get(q.id);
            if (correctOpt) {
                correctAnswers[q.id] = correctOpt;
            }
        }
        res.json({ correctAnswers });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 5. Get Live Leaderboard
router.get('/:quizId/leaderboard', async (req, res) => {
    const { quizId } = req.params;
    
    try {
        const attempts = await db.prepare(`
            SELECT student_name as name, score, max_score as maxScore, submitted_at as completedAt
            FROM quiz_attempts
            WHERE quiz_id = ? AND status = 'submitted'
            ORDER BY score DESC, submitted_at ASC
        `).all(quizId);
        
        res.json({ leaderboard: attempts });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
