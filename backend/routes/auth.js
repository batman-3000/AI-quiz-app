const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../database');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
    const { name, email, username, password, role } = req.body;
    
    if (!name || !email || !username || !password || !role) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (!['faculty', 'student'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be faculty or student' });
    }

    try {
        const password_hash = await bcrypt.hash(password, 10);
        const id = crypto.randomUUID();
        const status = role === 'faculty' ? 'pending' : 'approved';

        const insert = db.prepare('INSERT INTO users (id, name, email, username, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
        await insert.run(id, name, email, username, password_hash, role, status);

        const token = jwt.sign({ id, email, role }, JWT_SECRET, { expiresIn: '24h' });
        
        res.status(201).json({ message: 'User registered successfully', token, user: { id, name, email, role } });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === '23505') {
            if (err.detail && err.detail.includes('username') || (err.message && err.message.includes('username'))) {
                return res.status(400).json({ error: 'Username already exists' });
            }
            return res.status(400).json({ error: 'Email already exists' });
        }
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body; // email could be username or email

    if (!email || !password) {
        return res.status(400).json({ error: 'Username/Email and password are required' });
    }

    try {
        const query = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?');
        const user = await query.get(email, email);

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (user.status === 'pending') {
            return res.status(403).json({ error: 'Your account is pending admin approval' });
        }

        const token = jwt.sign({ id: user.id, email: user.email, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        
        res.json({ message: 'Login successful', token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
