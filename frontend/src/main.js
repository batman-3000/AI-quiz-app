import './style.css';
import Alpine from 'alpinejs';

window.Alpine = Alpine;

var API_BASE = '/api';

document.addEventListener('alpine:init', function() {
    Alpine.data('app', function() {
        return {
            view: 'auth',
            user: null,
            token: localStorage.getItem('token') || null,
            loading: false,

            // Notifications
            notifications: [],

            // Auth
            authMode: 'select_role',
            authForm: { name: '', username: '', email: '', password: '', role: 'faculty' },
            adminForm: { username: '', password: '' },
            studentGuest: { name: '', code: '' },
            correctAnswers: {},
            isChecking: false,
            hasCheckedQuiz: false,
            expandLeaderboard: false,
            showPassword: false,
            showAdminPassword: false,

            // Modals
            openCreateClassModal: false,
            openAddSubjectModal: false,
            openJoinClassModal: false,
            openGenerateModal: false,
            openEditQuizModal: false,
            openAdminModal: false,
            openCopyQuizModal: false,

            // Faculty Data
            classes: [],
            selectedClass: null,
            
            // Admin Data
            adminQuizzes: [],
            adminTab: 'quizzes',
            adminFaculties: [],
            adminDbQuery: 'SELECT * FROM users;',
            adminDbResult: null,
            adminDbError: null,
            subjects: [],
            selectedSubject: null,
            newClassName: '',
            joinCode: '',
            newSubjectName: '',
            
            // Quizzes & Generation
            quizzes: [],
            generateForm: { title: '', timer_minutes: 30, style: 'mcq', question_count: 10 },
            generateFiles: [],
            isGenerating: false,
            generationStatus: null, // null, 'uploading', 'processing', 'completed', 'failed'
            generationProgressText: '',
            generationError: null,
            editQuizForm: { id: '', title: '', timer_minutes: 30, status: 'draft' },

            // Student Data
            activeQuiz: null,
            answers: {},
            currentQuestionIndex: 0,
            quizScore: null,
            studentQuizzes: [],
            quizTimer: 0,

            // Copy Quiz State
            quizToCopy: null,
            copyTargetClassId: '',
            timerInterval: null,
            leaderboardData: [],
            leaderboardInterval: null,

            darkMode: localStorage.getItem('theme') === 'dark',
            toggleDarkMode: function() {
                this.darkMode = !this.darkMode;
                localStorage.setItem('theme', this.darkMode ? 'dark' : 'light');
                if (this.darkMode) {
                    document.documentElement.classList.add('dark');
                } else {
                    document.documentElement.classList.remove('dark');
                }
            },

            initApp: function() {
                if (this.darkMode) {
                    document.documentElement.classList.add('dark');
                } else {
                    document.documentElement.classList.remove('dark');
                }
                if (this.token) {
                    try {
                        var payload = JSON.parse(atob(this.token.split('.')[1]));
                        this.user = payload;
                        if (payload.exp * 1000 < Date.now()) {
                            this.logout();
                            return;
                        }
                        this.loadDashboard();
                    } catch(e) {
                        this.logout();
                    }
                }
            },

            notify: function(message, type = 'info') {
                const id = Date.now();
                this.notifications.push({ id, message, type });
                setTimeout(() => {
                    this.notifications = this.notifications.filter(n => n.id !== id);
                }, 3000);
            },

            apiCall: async function(endpoint, options) {
                options = options || {};
                var headers = Object.assign({}, options.headers || {});
                if (this.token) {
                    headers['Authorization'] = 'Bearer ' + this.token;
                }
                if (!options.body || typeof options.body === 'string') {
                    headers['Content-Type'] = 'application/json';
                }

                let response;
                try {
                    response = await fetch(API_BASE + endpoint, Object.assign({}, options, { headers: headers }));
                } catch (err) {
                    throw new Error('Network error: Unable to reach the server.');
                }
                
                if (response.status === 401) {
                    this.logout();
                    throw new Error('Unauthorized');
                }
                
                let data;
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    data = await response.json();
                } else {
                    data = { error: await response.text() || 'An unexpected error occurred' };
                }

                if (!response.ok) throw new Error(data.error || 'API Error');
                return data;
            },

            submitAuth: async function() {
                this.loading = true;
                try {
                    var endpoint = this.authMode === 'login' ? '/auth/login' : '/auth/register';
                    var body = JSON.stringify(this.authForm);
                    var data = await this.apiCall(endpoint, { method: 'POST', body: body });
                    
                    this.token = data.token;
                    localStorage.setItem('token', this.token);
                    this.user = data.user;
                    this.loadDashboard();
                } catch (err) {
                    if (err.message.includes('pending admin approval')) {
                        this.notify(err.message, 'warning');
                    } else {
                        this.notify(err.message, 'error');
                    }
                } finally {
                    this.loading = false;
                }
            },

            handleFileUpload: function(e) {
                if (e.target.files.length > 0) {
                    this.generateFiles = Array.from(e.target.files);
                }
            },

            adminLogin: async function() {
                try {
                    var body = JSON.stringify({ email: this.adminForm.username, password: this.adminForm.password });
                    var data = await this.apiCall('/auth/login', { method: 'POST', body: body });
                    
                    if (data.user.role !== 'admin') {
                        throw new Error('Unauthorized: Admin access required');
                    }
                    
                    this.token = data.token;
                    localStorage.setItem('token', this.token);
                    this.user = data.user;
                    this.openAdminModal = false;
                    this.adminForm.password = '';
                    this.loadDashboard();
                } catch (err) {
                    this.notify(err.message);
                }
            },

            logout: function() {
                this.token = null;
                this.user = null;
                localStorage.removeItem('token');
                this.view = 'auth';
            },

            loadDashboard: async function() {
                try {
                    this.classes = await this.apiCall('/classes');
                    if (this.user.role === 'admin') {
                        this.adminQuizzes = await this.apiCall('/quizzes/all');
                        this.loadFaculties();
                        this.view = 'admin_dashboard';
                    } else if (this.user.role === 'faculty') {
                        this.view = 'faculty_dashboard';
                    } else {
                        this.view = 'student_dashboard';
                    }
                } catch(e) {
                    this.notify(e.message);
                }
            },

            // Faculty Methods
            createClass: async function() {
                try {
                    await this.apiCall('/classes', { method: 'POST', body: JSON.stringify({ name: this.newClassName }) });
                    this.newClassName = '';
                    this.openCreateClassModal = false;
                    this.loadDashboard();
                } catch(e) { this.notify(e.message); }
            },

            joinClassFaculty: async function() {
                try {
                    await this.apiCall('/classes/join_host', { 
                        method: 'POST', 
                        body: JSON.stringify({ join_code: this.joinCode }) 
                    });
                    this.joinCode = '';
                    this.openJoinClassModal = false;
                    this.loadDashboard();
                } catch(e) { this.notify(e.message); }
            },

            selectClass: async function(cls) {
                this.selectedClass = cls;
                this.selectedSubject = null;
                this.quizzes = [];
                try {
                    this.subjects = await this.apiCall('/classes/' + cls.id + '/subjects');
                    this.view = 'faculty_class';
                } catch(e) { this.notify(e.message); }
            },

            loadSubjects: async function() {
                try {
                    this.subjects = await this.apiCall('/classes/' + this.selectedClass.id + '/subjects');
                } catch (e) { this.notify(e.message); }
            },

            loadFaculties: async function() {
                try {
                    this.adminFaculties = await this.apiCall('/admin/faculties');
                } catch (e) { this.notify(e.message); }
            },

            approveFaculty: async function(id) {
                try {
                    await this.apiCall('/admin/faculties/' + id + '/approve', { method: 'POST' });
                    this.notify('Faculty approved successfully');
                    this.loadFaculties();
                } catch (e) { this.notify(e.message); }
            },

            rejectFaculty: async function(id) {
                try {
                    await this.apiCall('/admin/faculties/' + id + '/reject', { method: 'POST' });
                    this.notify('Faculty rejected successfully');
                    this.loadFaculties();
                } catch (e) { this.notify(e.message); }
            },

            runAdminQuery: async function() {
                this.adminDbError = null;
                this.adminDbResult = null;
                try {
                    const data = await this.apiCall('/admin/query', { 
                        method: 'POST', 
                        body: JSON.stringify({ sql: this.adminDbQuery }) 
                    });
                    this.adminDbResult = data.result;
                } catch (e) {
                    this.adminDbError = e.message;
                }
            },

            createSubject: async function() {
                try {
                    await this.apiCall('/classes/' + this.selectedClass.id + '/subjects', { 
                        method: 'POST', 
                        body: JSON.stringify({ name: this.newSubjectName }) 
                    });
                    this.newSubjectName = '';
                    this.openAddSubjectModal = false;
                    this.selectClass(this.selectedClass);
                } catch(e) { this.notify(e.message); }
            },

            selectSubject: async function(sub) {
                this.selectedSubject = sub;
                try {
                    this.quizzes = await this.apiCall('/documents/quizzes/' + sub.id);
                } catch(e) { this.notify(e.message); }
            },

            generateQuiz: async function() {
                if (this.generateFiles.length === 0) {
                    this.notify('Please select at least one document');
                    return;
                }
                
                // Smart constraint for question count vs timer
                if (this.generateForm.timer_minutes < 10 && this.generateForm.question_count > 20) {
                    this.generateForm.question_count = 20; // Auto fallback
                }

                this.isGenerating = true;
                this.generationStatus = 'uploading';
                this.generationProgressText = 'Uploading study material...';
                this.generationError = null;
                
                try {
                    var formData = new FormData();
                    this.generateFiles.forEach(file => {
                        formData.append('documents', file);
                    });
                    formData.append('subject_id', this.selectedSubject.id);
                    formData.append('title', this.generateForm.title);
                    formData.append('timer_minutes', this.generateForm.timer_minutes);
                    formData.append('style', this.generateForm.style);
                    formData.append('question_count', this.generateForm.question_count);

                    var headers = { 'Authorization': 'Bearer ' + this.token };
                    
                    var response = await fetch(API_BASE + '/documents/upload', {
                        method: 'POST',
                        headers: headers,
                        body: formData
                    });
                    
                    var data = await response.json();
                    if (!response.ok) throw new Error(data.error);
                    
                    this.generationStatus = 'processing';
                    this.generationProgressText = 'AI is reading document & generating quiz...';
                    
                    this.pollGenerationStatus(data.document_id);
                    
                } catch(e) {
                    this.generationStatus = 'failed';
                    this.generationError = e.message;
                    this.isGenerating = false;
                }
            },

            pollGenerationStatus: function(docId) {
                var self = this;
                var interval = setInterval(async function() {
                    try {
                        var data = await self.apiCall('/documents/status/' + docId);
                        if (data.status === 'processed') {
                            clearInterval(interval);
                            self.generationStatus = 'completed';
                            self.generationProgressText = 'Quiz generated successfully!';
                            self.isGenerating = false;
                            
                            // Auto reload quizzes
                            if (self.selectedSubject) {
                                self.selectSubject(self.selectedSubject);
                            }
                            
                            // Auto close after 2 seconds
                            setTimeout(function() {
                                if (self.generationStatus === 'completed') {
                                    self.openGenerateModal = false;
                                    self.generationStatus = null;
                                    self.generateFile = null;
                                    self.generateForm.title = '';
                                }
                            }, 2000);
                        } else if (data.status === 'failed') {
                            clearInterval(interval);
                            self.generationStatus = 'failed';
                            self.generationError = 'AI failed to process this document. Try a different PDF.';
                            self.isGenerating = false;
                        }
                    } catch(e) {
                        clearInterval(interval);
                        self.generationStatus = 'failed';
                        self.generationError = e.message;
                        self.isGenerating = false;
                    }
                }, 2000);
            },

            openEditQuiz: function(quiz) {
                this.editQuizForm = {
                    id: quiz.id,
                    title: quiz.title,
                    timer_minutes: quiz.timer_minutes,
                    status: quiz.status
                };
                this.openEditQuizModal = true;
            },

            updateQuiz: async function() {
                try {
                    await this.apiCall('/quizzes/' + this.editQuizForm.id, {
                        method: 'PUT',
                        body: JSON.stringify(this.editQuizForm)
                    });
                    this.openEditQuizModal = false;
                    this.notify('Quiz updated successfully', 'success');
                    if (this.user.role === 'admin') {
                        this.loadDashboard();
                    } else if (this.selectedSubject) {
                        this.selectSubject(this.selectedSubject);
                    }
                } catch(e) { this.notify(e.message, 'error'); }
            },

            deleteQuiz: async function(quizId) {
                if (!confirm('Are you sure you want to delete this quiz?')) return;
                try {
                    await this.apiCall('/quizzes/' + quizId, { method: 'DELETE' });
                    if (this.user.role === 'admin') {
                        this.loadDashboard();
                    } else if (this.selectedSubject) {
                        this.selectSubject(this.selectedSubject);
                    }
                } catch(e) { this.notify(e.message, 'error'); }
            },

            openCopyModal: function(quiz) {
                this.quizToCopy = quiz;
                this.copyTargetClassId = '';
                this.openCopyQuizModal = true;
            },

            copyQuiz: async function() {
                if (!this.copyTargetClassId) {
                    this.notify('Please select a target class', 'error');
                    return;
                }
                try {
                    await this.apiCall('/quizzes/' + this.quizToCopy.id + '/copy', {
                        method: 'POST',
                        body: JSON.stringify({ target_class_id: this.copyTargetClassId })
                    });
                    this.openCopyQuizModal = false;
                    this.notify('Quiz copied successfully!', 'success');
                    if (this.user.role === 'admin') {
                        this.loadDashboard();
                    } else if (this.selectedSubject) {
                        this.selectSubject(this.selectedSubject);
                    }
                } catch(e) {
                    this.notify(e.message, 'error');
                }
            },

            triggerBackup: async function() {
                try {
                    var data = await this.apiCall('/backup/create', { method: 'POST' });
                    this.notify('Database backup created successfully: ' + data.backupFile);
                } catch(e) {
                    this.notify('Backup failed: ' + e.message);
                }
            },

            joinClassGuest: async function() {
                this.studentJoinError = null;
                try {
                    const res = await fetch(API_BASE + '/play/join', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ joinCode: this.studentGuest.code, studentName: this.studentGuest.name })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);

                    this.studentQuizzes = data.quizzes;
                    this.token = data.studentToken; // using token field for studentToken
                    this.user = { name: data.studentName, role: 'guest' };
                    this.selectedClass = { name: data.className };
                    
                    if (data.isDirectQuiz && data.quizzes.length > 0) {
                        this.startQuiz(data.quizzes[0].id);
                    } else {
                        this.view = 'student_class';
                    }
                } catch (e) {
                    this.studentJoinError = e.message;
                }
            },

            startQuiz: async function(quizId) {
                try {
                    const res = await fetch(API_BASE + '/play/' + quizId + '/start');
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);

                    this.activeQuiz = data;
                    this.currentQuestionIndex = 0;
                    this.answers = {};
                    this.correctAnswers = {};
                    this.isChecking = false;
                    this.hasCheckedQuiz = false;
                    this.quizTimer = this.activeQuiz.timer_minutes * 60;
                    this.view = 'quiz_attempt';
                    
                    var self = this;
                    if (this.timerInterval) clearInterval(this.timerInterval);
                    this.timerInterval = setInterval(function() {
                        self.quizTimer--;
                        if (self.quizTimer <= 0) {
                            self.submitQuiz();
                        }
                    }, 1000);
                } catch(e) { this.notify(e.message); }
            },

            formatTime: function(seconds) {
                var m = Math.floor(seconds / 60).toString().padStart(2, '0');
                var s = (seconds % 60).toString().padStart(2, '0');
                return m + ':' + s;
            },

            submitQuiz: async function() {
                if (this.timerInterval) clearInterval(this.timerInterval);
                
                try {
                    const res = await fetch(API_BASE + '/play/' + this.activeQuiz.id + '/submit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            studentToken: this.token,
                            studentName: this.user.name,
                            answers: this.answers
                        })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);

                    this.correctAnswers = data.correctAnswers || {};
                    this.notify('Quiz Submitted! Your score: ' + data.score + ' / ' + data.maxScore);
                    this.startLeaderboard(this.activeQuiz.id);
                } catch (e) {
                    this.notify(e.message);
                }
            },

            startLeaderboard: async function(quizId) {
                this.view = 'leaderboard';
                this.leaderboardData = await this.fetchLeaderboard(quizId);
                
                if (!this.activeQuiz || this.activeQuiz.id !== quizId) {
                    try {
                        const res = await fetch(API_BASE + '/play/' + quizId + '/start');
                        if (res.ok) this.activeQuiz = await res.json();
                    } catch(e) { console.error(e); }
                }

                var self = this;
                if (this.leaderboardInterval) clearInterval(this.leaderboardInterval);
                this.leaderboardInterval = setInterval(async function() {
                    if (self.view === 'leaderboard') {
                        self.leaderboardData = await self.fetchLeaderboard(quizId);
                    } else {
                        clearInterval(self.leaderboardInterval);
                    }
                }, 3000); // poll every 3 seconds
            },

            checkQuiz: async function() {
                try {
                    const res = await fetch(API_BASE + '/play/' + this.activeQuiz.id + '/answers');
                    const data = await res.json();
                    if(res.ok) {
                        this.correctAnswers = data.correctAnswers;
                    }
                } catch(e) { console.error("Failed to fetch answers:", e); }
                
                this.isChecking = true;
                this.hasCheckedQuiz = true;
                this.currentQuestionIndex = 0;
                this.view = 'quiz_attempt';
                if (this.leaderboardInterval) {
                    clearInterval(this.leaderboardInterval);
                }
            },

            fetchLeaderboard: async function(quizId) {
                try {
                    const res = await fetch(API_BASE + '/play/' + quizId + '/leaderboard');
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);
                    return data.leaderboard;
                } catch(e) { 
                    console.error(e);
                    return [];
                }
            },
            
            downloadLeaderboard: function() {
                var container = document.getElementById('leaderboard-container');
                var btn = document.getElementById('download-btn');
                
                if (btn) btn.style.display = 'none'; // hide button from capture
                
                html2canvas(container, {
                    backgroundColor: this.darkMode ? '#222120' : '#FEFDFB',
                    scale: 2
                }).then(function(canvas) {
                    if (btn) btn.style.display = 'flex';
                    var link = document.createElement('a');
                    link.download = 'leaderboard.png';
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                }).catch(function(err) {
                    if (btn) btn.style.display = 'flex';
                    console.error('Error generating image', err);
                    this.notify('Could not generate image');
                });
            }

        };
    });
});

Alpine.start();
