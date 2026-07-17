const express = require('express');
const crypto = require('crypto');
const db = require('../database');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Generate a random 6-character alphanumeric join code
function generateJoinCode() {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// Create a new class (Faculty only)
router.post('/', requireAuth, requireRole('faculty'), async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Class name is required' });

    try {
        const id = crypto.randomUUID();
        const join_code = generateJoinCode();
        
        const insert = db.prepare('INSERT INTO classes (id, name, join_code, faculty_id) VALUES (?, ?, ?, ?)');
        await insert.run(id, name, join_code, req.user.id);
        
        res.status(201).json({ id, name, join_code, faculty_id: req.user.id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create class' });
    }
});

// List classes for the logged in user
router.get('/', requireAuth, async (req, res) => {
    try {
        if (req.user.role === 'admin') {
            const classes = await db.prepare('SELECT * FROM classes').all();
            res.json(classes);
        } else if (req.user.role === 'faculty') {
            const query = db.prepare(`
                SELECT c.* FROM classes c WHERE c.faculty_id = ?
                UNION
                SELECT c.* FROM classes c JOIN class_hosts ch ON c.id = ch.class_id WHERE ch.faculty_id = ?
            `);
            const classes = await query.all(req.user.id, req.user.id);
            res.json(classes);
        } else if (req.user.role === 'student') {
            const query = db.prepare('SELECT c.* FROM classes c JOIN class_students cs ON c.id = cs.class_id WHERE cs.student_id = ?');
            const classes = await query.all(req.user.id);
            res.json(classes);
        } else {
            res.json([]);
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch classes' });
    }
});

// Student joins a class via join code
router.post('/join', requireAuth, requireRole('student'), async (req, res) => {
    const { join_code } = req.body;
    if (!join_code) return res.status(400).json({ error: 'Join code is required' });

    try {
        const query = db.prepare('SELECT id FROM classes WHERE join_code = ?');
        const classObj = await query.get(join_code.toUpperCase());

        if (!classObj) {
            return res.status(404).json({ error: 'Class not found or invalid join code' });
        }

        const insert = db.prepare('INSERT INTO class_students (class_id, student_id) VALUES (?, ?)');
        await insert.run(classObj.id, req.user.id);

        res.json({ message: 'Successfully joined the class', class_id: classObj.id });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || err.code === '23505') {
            return res.status(400).json({ error: 'You have already joined this class' });
        }
        console.error(err);
        res.status(500).json({ error: 'Failed to join class' });
    }
});

// Faculty/Admin joins a class via join code as Host
router.post('/join_host', requireAuth, requireRole('faculty', 'admin'), async (req, res) => {
    const { join_code } = req.body;
    if (!join_code) return res.status(400).json({ error: 'Join code is required' });

    try {
        const query = db.prepare('SELECT id, faculty_id FROM classes WHERE join_code = ?');
        let classObj = await query.get(join_code.toUpperCase());

        if (!classObj) {
            // Check if it's a quiz code
            const quizQuery = db.prepare(`
                SELECT c.id, c.faculty_id
                FROM quizzes q
                JOIN subjects s ON q.subject_id = s.id
                JOIN classes c ON s.class_id = c.id
                WHERE q.join_code = ?
            `);
            classObj = await quizQuery.get(join_code.toUpperCase());
        }

        if (!classObj) {
            return res.status(404).json({ error: 'Class or Quiz not found with that join code' });
        }

        if (classObj.faculty_id === req.user.id) {
            return res.status(400).json({ error: 'You are already the owner of this class' });
        }

        const insert = db.prepare('INSERT INTO class_hosts (class_id, faculty_id) VALUES (?, ?)');
        await insert.run(classObj.id, req.user.id);

        res.json({ message: 'Successfully joined the class as Host', class_id: classObj.id });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || err.code === '23505') {
            return res.status(400).json({ error: 'You are already a host of this class' });
        }
        console.error(err);
        res.status(500).json({ error: 'Failed to join class' });
    }
});

// Add a subject to a class (Faculty only)
router.post('/:class_id/subjects', requireAuth, requireRole('faculty'), async (req, res) => {
    const { name } = req.body;
    const { class_id } = req.params;

    if (!name) return res.status(400).json({ error: 'Subject name is required' });

    try {
        const verifyQuery = db.prepare(`
            SELECT c.id FROM classes c WHERE c.id = ? AND c.faculty_id = ?
            UNION
            SELECT ch.class_id as id FROM class_hosts ch WHERE ch.class_id = ? AND ch.faculty_id = ?
        `);
        const classObj = await verifyQuery.get(class_id, req.user.id, class_id, req.user.id);

        if (!classObj && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden: You do not own this class' });
        }

        const id = crypto.randomUUID();
        const insert = db.prepare('INSERT INTO subjects (id, name, class_id) VALUES (?, ?, ?)');
        await insert.run(id, name, class_id);

        res.status(201).json({ id, name, class_id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add subject' });
    }
});

// List subjects in a class
router.get('/:class_id/subjects', requireAuth, async (req, res) => {
    const { class_id } = req.params;
    try {
        const query = db.prepare('SELECT * FROM subjects WHERE class_id = ?');
        const subjects = await query.all(class_id);
        res.json(subjects);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch subjects' });
    }
});

module.exports = router;
