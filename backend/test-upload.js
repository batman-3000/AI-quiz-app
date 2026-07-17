const fs = require('fs');
const path = require('path');

async function testUpload() {
    // 1. Login to get token
    console.log("1. Logging in...");
    const loginRes = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'faculty@test.com', password: 'password123' })
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) {
        console.error("Login failed:", loginData);
        return;
    }
    const token = loginData.token;
    console.log("Token obtained successfully.");

    // 2. Fetch classes
    console.log("2. Fetching classes...");
    const classesRes = await fetch('http://localhost:3000/api/classes', {
        headers: { 'Authorization': 'Bearer ' + token }
    });
    const classes = await classesRes.json();
    
    let classId;
    if (classes.length === 0) {
        console.log("No classes found. Creating a class...");
        const createClassRes = await fetch('http://localhost:3000/api/classes', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token 
            },
            body: JSON.stringify({ name: 'CS 101 — Intro to Computer Science' })
        });
        const classData = await createClassRes.json();
        classId = classData.id;
    } else {
        classId = classes[0].id;
    }
    console.log("Using Class ID:", classId);

    // Fetch subjects
    const subjectsRes = await fetch(`http://localhost:3000/api/classes/${classId}/subjects`, {
        headers: { 'Authorization': 'Bearer ' + token }
    });
    const subjects = await subjectsRes.json();
    let subjectId;
    if (subjects.length === 0) {
        console.log("Creating a mock subject...");
        const createSubRes = await fetch(`http://localhost:3000/api/classes/${classId}/subjects`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token 
            },
            body: JSON.stringify({ name: 'Web Programming' })
        });
        const subData = await createSubRes.json();
        subjectId = subData.id;
    } else {
        subjectId = subjects[0].id;
    }
    console.log("Using Subject ID:", subjectId);

    // 3. Find test PDF
    const uploadsDir = path.join(__dirname, 'uploads');
    const files = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.pdf'));
    if (files.length === 0) {
        console.error("No test PDF found in uploads directory. Please place one there to run this test.");
        return;
    }
    const testPdfPath = path.join(uploadsDir, files[0]);
    console.log("Using PDF file for upload:", testPdfPath);

    // 4. Send multipart upload request using FormData
    console.log("3. Uploading PDF and starting AI generation...");
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(testPdfPath);
    const fileBlob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('document', fileBlob, files[0]);
    formData.append('subject_id', subjectId);
    formData.append('title', 'AI Automated Test Quiz');
    formData.append('timer_minutes', '15');
    formData.append('description', 'Test quiz generated automatically by test script');

    const uploadRes = await fetch('http://localhost:3000/api/documents/upload', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token
        },
        body: formData
    });

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
        console.error("Upload failed:", uploadData);
        return;
    }

    const documentId = uploadData.document_id;
    console.log("Upload success! Document ID:", documentId);

    // 5. Poll status until processed or failed
    console.log("4. Polling generation status...");
    const interval = setInterval(async () => {
        const statusRes = await fetch(`http://localhost:3000/api/documents/status/${documentId}`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const statusData = await statusRes.json();
        console.log("Current document status:", statusData.status);

        if (statusData.status === 'processed') {
            clearInterval(interval);
            console.log("SUCCESS! Quiz has been generated successfully.");
            
            // Fetch the generated quiz details
            console.log("5. Fetching generated quizzes list...");
            const quizzesRes = await fetch(`http://localhost:3000/api/documents/quizzes/${subjectId}`, {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const quizzes = await quizzesRes.json();
            console.log("Quizzes available under this subject:", JSON.stringify(quizzes, null, 2));

            if (quizzes.length > 0) {
                const quizId = quizzes[quizzes.length - 1].id;
                console.log("6. Fetching details for Quiz ID:", quizId);
                const quizDetailsRes = await fetch(`http://localhost:3000/api/documents/quiz/${quizId}`, {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                const quizDetails = await quizDetailsRes.json();
                console.log("Quiz details with questions:", JSON.stringify(quizDetails, null, 2));
            }
        } else if (statusData.status === 'failed') {
            clearInterval(interval);
            console.error("FAILED! AI Quiz generation failed.");
        }
    }, 2000);
}

testUpload();
