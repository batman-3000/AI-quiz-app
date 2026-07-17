const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/create', requireAuth, requireRole('faculty'), (req, res) => {
    res.status(400).json({ error: 'Local backups disabled. Database is managed via Supabase.' });
});

router.get('/list', requireAuth, requireRole('faculty'), (req, res) => {
    res.json({ backups: [] });
});

module.exports = router;
