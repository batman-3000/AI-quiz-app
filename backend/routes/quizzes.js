const express = require('express');
const db = require('../database');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get all quizzes globally (Admin only)
router.get('/all', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const quizzes = await db.prepare(`
            SELECT q.*, s.name as subject_name, c.name as class_name, u.username as host_name 
            FROM quizzes q
            JOIN subjects s ON q.subject_id = s.id
            JOIN classes c ON s.class_id = c.id
            JOIN users u ON q.created_by = u.id
            ORDER BY q.created_at DESC
        `).all();
        res.json(quizzes);
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update a quiz (Faculty/Admin only)
router.put('/:id', requireAuth, requireRole('faculty', 'admin'), async (req, res) => {
    try {
        const { title, timer_minutes, status } = req.body;
        
        // Verify ownership or admin
        const quiz = await db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
        
        let isHost = false;
        if (quiz.created_by === req.user.id) {
            isHost = true;
        } else {
            const subject = await db.prepare('SELECT class_id FROM subjects WHERE id = ?').get(quiz.subject_id);
            if (subject) {
                const hostCheck = await db.prepare('SELECT 1 FROM class_hosts WHERE class_id = ? AND faculty_id = ?').get(subject.class_id, req.user.id);
                if (hostCheck) isHost = true;
            }
        }

        if (req.user.role !== 'admin' && !isHost) {
            return res.status(403).json({ error: 'Unauthorized to edit this quiz' });
        }

        await db.prepare(`
            UPDATE quizzes 
            SET title = COALESCE(?, title), 
                timer_minutes = COALESCE(?, timer_minutes),
                status = COALESCE(?, status)
            WHERE id = ?
        `).run(title, timer_minutes, status, req.params.id);

        res.json({ message: 'Quiz updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete a quiz (Faculty/Admin only)
router.delete('/:id', requireAuth, requireRole('faculty', 'admin'), async (req, res) => {
    try {
        // Verify ownership or admin
        const quiz = await db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
        
        let isHost = false;
        if (quiz.created_by === req.user.id) {
            isHost = true;
        } else {
            const subject = await db.prepare('SELECT class_id FROM subjects WHERE id = ?').get(quiz.subject_id);
            if (subject) {
                const hostCheck = await db.prepare('SELECT 1 FROM class_hosts WHERE class_id = ? AND faculty_id = ?').get(subject.class_id, req.user.id);
                if (hostCheck) isHost = true;
            }
        }

        if (req.user.role !== 'admin' && !isHost) {
            return res.status(403).json({ error: 'Unauthorized to delete this quiz' });
        }

        await db.prepare('DELETE FROM quizzes WHERE id = ?').run(req.params.id);
        res.json({ message: 'Quiz deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Copy a quiz to another class
router.post('/:id/copy', requireAuth, requireRole('faculty', 'admin'), async (req, res) => {
    try {
        const { target_class_id } = req.body;
        if (!target_class_id) return res.status(400).json({ error: 'Target class ID required' });

        // Verify source quiz
        const sourceQuiz = await db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
        if (!sourceQuiz) return res.status(404).json({ error: 'Source quiz not found' });

        // Verify target class existence and access
        const targetClass = await db.prepare('SELECT * FROM classes WHERE id = ?').get(target_class_id);
        if (!targetClass) return res.status(404).json({ error: 'Target class not found' });

        if (req.user.role !== 'admin' && targetClass.faculty_id !== req.user.id) {
            const hostCheck = await db.prepare('SELECT 1 FROM class_hosts WHERE class_id = ? AND faculty_id = ?').get(target_class_id, req.user.id);
            if (!hostCheck) {
                return res.status(403).json({ error: 'Unauthorized: You are not a host of the target class' });
            }
        }

        // Find or create "Copied Quizzes" subject in target class
        let targetSubject = await db.prepare('SELECT id FROM subjects WHERE class_id = ? AND name = ?').get(target_class_id, 'Copied Quizzes');
        if (!targetSubject) {
            const crypto = require('crypto');
            targetSubject = { id: crypto.randomUUID() };
            await db.prepare('INSERT INTO subjects (id, name, class_id) VALUES (?, ?, ?)').run(targetSubject.id, 'Copied Quizzes', target_class_id);
        }

        const crypto = require('crypto');
        const newQuizId = crypto.randomUUID();
        const newJoinCode = crypto.randomBytes(3).toString('hex').toUpperCase();
        
        // Begin transaction
        const copyTransaction = db.transaction(async (txDb) => {
            // Copy Quiz
            await txDb.prepare(`
                INSERT INTO quizzes (id, subject_id, document_id, created_by, title, description, join_code, timer_minutes, status, quiz_style, question_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                newQuizId, targetSubject.id, sourceQuiz.document_id, req.user.id, 
                sourceQuiz.title + ' (Copy)', sourceQuiz.description, newJoinCode,
                sourceQuiz.timer_minutes, sourceQuiz.status, sourceQuiz.quiz_style, sourceQuiz.question_count
            );

            // Copy Questions
            const sourceQuestions = await txDb.prepare('SELECT * FROM questions WHERE quiz_id = ?').all(sourceQuiz.id);
            for (const sq of sourceQuestions) {
                const newQuestionId = crypto.randomUUID();
                await txDb.prepare('INSERT INTO questions (id, quiz_id, text, type) VALUES (?, ?, ?, ?)').run(
                    newQuestionId, newQuizId, sq.text, sq.type
                );

                // Copy Options
                const sourceOptions = await txDb.prepare('SELECT * FROM options WHERE question_id = ?').all(sq.id);
                for (const so of sourceOptions) {
                    await txDb.prepare('INSERT INTO options (id, question_id, text, is_correct) VALUES (?, ?, ?, ?)').run(
                        crypto.randomUUID(), newQuestionId, so.text, so.is_correct
                    );
                }
            }
        });

        await copyTransaction();

        res.json({ message: 'Quiz copied successfully', newQuizId });
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: 'Server error during copy' });
    }
});

module.exports = router;
