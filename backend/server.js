const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
// Removed local uploads directory handling as files are processed in memory

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/classes', require('./routes/classes'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/quizzes', require('./routes/quizzes'));
app.use('/api/play', require('./routes/play'));

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'API is running' });
});

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

module.exports = app;
