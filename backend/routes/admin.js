const express = require('express');
const db = require('../database');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// List all faculty
router.get('/faculties', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const query = db.prepare("SELECT id, name, email, username, status, created_at FROM users WHERE role = 'faculty' ORDER BY created_at DESC");
        const faculties = await query.all();
        res.json(faculties);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch faculties' });
    }
});

// Approve faculty
router.post('/faculties/:id/approve', requireAuth, requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    try {
        const update = db.prepare("UPDATE users SET status = 'approved' WHERE id = ? AND role = 'faculty'");
        const result = await update.run(id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Faculty not found' });
        }
        res.json({ message: 'Faculty approved successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to approve faculty' });
    }
});

// Reject faculty
router.post('/faculties/:id/reject', requireAuth, requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    try {
        const update = db.prepare("UPDATE users SET status = 'rejected' WHERE id = ? AND role = 'faculty'");
        const result = await update.run(id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Faculty not found' });
        }
        res.json({ message: 'Faculty rejected successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to reject faculty' });
    }
});

// Raw database query (DANGEROUS, ADMIN ONLY)
router.post('/query', requireAuth, requireRole('admin'), async (req, res) => {
    const { sql } = req.body;
    if (!sql) return res.status(400).json({ error: 'SQL query required' });

    try {
        const stmt = db.prepare(sql);
        let result;
        // Check if query is a SELECT
        if (sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('PRAGMA')) {
            result = await stmt.all();
        } else {
            result = await stmt.run();
        }
        res.json({ success: true, result });
    } catch (err) {
        console.error('SQL Error:', err);
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
