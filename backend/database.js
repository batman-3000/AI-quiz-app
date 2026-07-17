const { Pool } = require('pg');

const dbConfig = {
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/aiquiz'
};

if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    dbConfig.ssl = { rejectUnauthorized: false };
}

const db = new Pool(dbConfig);

// Helper to provide similar syntax to better-sqlite3 for easier refactoring, but async
db.prepare = function(text) {
    // Replace all ? with $1, $2, etc. (basic replacement, assumes no ? inside strings)
    let index = 1;
    const pgText = text.replace(/\?/g, () => `$${index++}`);
    
    return {
        get: async (...args) => {
            const result = await db.query(pgText, args);
            return result.rows[0] || null;
        },
        all: async (...args) => {
            const result = await db.query(pgText, args);
            return result.rows;
        },
        run: async (...args) => {
            const result = await db.query(pgText, args);
            return { changes: result.rowCount, lastInsertRowid: null };
        }
    };
};

async function initDB() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT CHECK(role IN ('faculty', 'student', 'admin')) NOT NULL,
                status TEXT DEFAULT 'approved',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS classes (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                join_code TEXT UNIQUE NOT NULL,
                faculty_id TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(faculty_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS class_students (
                class_id TEXT NOT NULL,
                student_id TEXT NOT NULL,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (class_id, student_id),
                FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,
                FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS class_hosts (
                class_id TEXT NOT NULL,
                faculty_id TEXT NOT NULL,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (class_id, faculty_id),
                FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,
                FOREIGN KEY(faculty_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS subjects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                class_id TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                subject_id TEXT NOT NULL,
                uploaded_by TEXT NOT NULL,
                file_name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                status TEXT CHECK(status IN ('uploaded', 'processing', 'processed', 'failed')) DEFAULT 'uploaded',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
                FOREIGN KEY(uploaded_by) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS quizzes (
                id TEXT PRIMARY KEY,
                subject_id TEXT NOT NULL,
                document_id TEXT NOT NULL,
                created_by TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                join_code TEXT,
                timer_minutes INTEGER NOT NULL,
                quiz_style TEXT DEFAULT 'mcq',
                question_count INTEGER DEFAULT 10,
                status TEXT CHECK(status IN ('draft', 'published', 'closed')) DEFAULT 'draft',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
                FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
                FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS questions (
                id TEXT PRIMARY KEY,
                quiz_id TEXT NOT NULL,
                text TEXT NOT NULL,
                explanation TEXT,
                type TEXT DEFAULT 'mcq',
                order_index INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS options (
                id TEXT PRIMARY KEY,
                question_id TEXT NOT NULL,
                text TEXT NOT NULL,
                is_correct INTEGER NOT NULL CHECK(is_correct IN (0, 1)),
                order_index INTEGER,
                FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS quiz_attempts (
                id TEXT PRIMARY KEY,
                quiz_id TEXT NOT NULL,
                student_id TEXT NOT NULL,
                student_name TEXT NOT NULL,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                submitted_at TIMESTAMP,
                status TEXT CHECK(status IN ('in_progress', 'submitted')) DEFAULT 'in_progress',
                score INTEGER,
                max_score INTEGER,
                FOREIGN KEY(quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
            );
        `);

        // Seed admin user
        const { rows } = await db.query('SELECT id FROM users WHERE role = $1', ['admin']);
        if (rows.length === 0) {
            const bcrypt = require('bcryptjs');
            const crypto = require('crypto');
            const hash = bcrypt.hashSync('admin123', 10);
            await db.query(
                'INSERT INTO users (id, name, email, username, password_hash, role, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [crypto.randomUUID(), 'System Administrator', 'admin', 'admin', hash, 'admin', 'approved']
            );
            console.log("Admin user created (Username: admin, Password: admin123)");
        }
        
        console.log("Database initialized automatically.");
    } catch (err) {
        console.error("Database initialization failed:", err);
    }
}

initDB();

// We export the pool directly but decorated with the async prepare helper
db.transaction = function(callback) {
    return async function() {
        const client = await db.connect();
        let transactionError = null;
        try {
            await client.query('BEGIN');
            // Mock the transaction helper
            const txDb = {
                prepare: function(text) {
                    let index = 1;
                    const pgText = text.replace(/\?/g, () => `$${index++}`);
                    return {
                        get: async (...args) => { const result = await client.query(pgText, args); return result.rows[0] || null; },
                        all: async (...args) => { const result = await client.query(pgText, args); return result.rows; },
                        run: async (...args) => { const result = await client.query(pgText, args); return { changes: result.rowCount }; }
                    };
                }
            };
            
            await callback(txDb);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            transactionError = e;
        } finally {
            client.release();
            if (transactionError) throw transactionError;
        }
    };
};

module.exports = db;
