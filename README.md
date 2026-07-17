# AI Quiz Generator 🚀

A lightning-fast, highly scalable, and completely free side-project stack for generating and taking AI-powered quizzes.

## Features
- **Faculty Dashboard**: Create classes, manage subjects, and upload study material (PDFs).
- **AI Quiz Generation**: Automatically extracts text from PDFs and generates multiple-choice quizzes using any OpenAI-compatible AI API.
- **Student Portal**: Join classes via a unique 6-character code and take timed quizzes.
- **Auto-Grading**: Submits answers and provides instant estimated scores.
- **Database Backups**: Faculty can generate SQLite database backups with a single click.

## Tech Stack (Free & Simple)
- **Frontend**: Vite + HTML + Tailwind CSS + Alpine.js (Extremely lightweight, zero build-step overhead).
- **Backend**: Node.js + Express.
- **Database**: SQLite (No manual setup required, handles 100+ concurrent users effortlessly).
- **AI Integration**: Model-agnostic. Defaults to an OpenAI-compatible interface (supports Groq, OpenRouter, Ollama, etc.).

## How to Run Locally

### 1. Configure the Backend
Navigate to the `backend` folder and create a `.env` file with your API keys:
```env
PORT=3000
JWT_SECRET=your_super_secret_key
# Use Groq for free, lightning fast models!
AI_API_KEY=your_api_key_here
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=llama3-8b-8192
```

Start the backend:
```bash
cd backend
npm install
node server.js
```

### 2. Start the Frontend
In a new terminal window, navigate to the `frontend` folder:
```bash
cd frontend
npm install
npm run dev
```

Open the provided Vite URL (usually `http://localhost:5173`) in your browser to start using the app!
