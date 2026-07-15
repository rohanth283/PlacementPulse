document.addEventListener('DOMContentLoaded', () => {
    // Application State
    const state = {
        activeTab: 'chat', // Chat active on load
        token: localStorage.getItem('token') || null,
        username: localStorage.getItem('username') || null,
        activeConversationId: null,
        conversations: [],
        experiences: [],
        companies: [],
        charts: {}
    };

    // DOM Elements
    const appLoadingScreen = document.getElementById('app-loading-screen');
    const appContainer = document.getElementById('app-container');
    const appSidebar = document.getElementById('app-sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    
    // Auth Panel Elements
    const authOverlay = document.getElementById('auth-overlay');
    const authForm = document.getElementById('auth-form');
    const authUsernameInput = document.getElementById('auth-username');
    const authPasswordInput = document.getElementById('auth-password');
    const authErrorMsg = document.getElementById('auth-error');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authSubtitle = document.getElementById('auth-subtitle');
    const btnToggleLogin = document.getElementById('btn-toggle-login');
    const btnToggleSignup = document.getElementById('btn-toggle-signup');
    let isSignupMode = false;

    // Sidebar & Navigation Elements
    const btnSidebarCollapse = document.getElementById('btn-sidebar-collapse');
    const btnNewChat = document.getElementById('btn-new-chat');
    const sidebarChatHistory = document.getElementById('sidebar-chat-history');
    const userInitials = document.getElementById('user-initials');
    const userDisplayName = document.getElementById('user-display-name');
    const btnLogout = document.getElementById('btn-logout');
    const navItems = document.querySelectorAll('.nav-item');
    const tabPanels = document.querySelectorAll('.tab-panel');
    const tabTitle = document.getElementById('tab-title');
    const tabDesc = document.getElementById('tab-desc');
    
    // Chat Elements
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');
    const chatCompanyFilter = document.getElementById('chat-company-filter');
    const suggestionChips = document.querySelectorAll('.suggestion-chip');
    
    // Explorer Elements
    const searchInput = document.getElementById('search-input');
    const filterCompany = document.getElementById('filter-company');
    const filterYear = document.getElementById('filter-year');
    const filterRoleType = document.getElementById('filter-role-type');
    const filterDifficulty = document.getElementById('filter-difficulty');
    const experiencesGrid = document.getElementById('experiences-grid');
    
    // Slide Drawer Elements
    const detailPanel = document.getElementById('detail-panel');
    const panelOverlay = document.getElementById('panel-overlay');
    const closePanelBtn = document.getElementById('close-panel-btn');
    const panelCandidateName = document.getElementById('panel-candidate-name');
    const panelCompanyBadge = document.getElementById('panel-company-badge');
    const panelRoleInfo = document.getElementById('panel-role-info');
    const panelPackageInfo = document.getElementById('panel-package-info');
    const panelDifficultyBadge = document.getElementById('panel-difficulty-badge');
    const panelYearBadge = document.getElementById('panel-year-badge');
    const panelTypeBadge = document.getElementById('panel-type-badge');
    const panelFilename = document.getElementById('panel-filename');
    const panelExperienceText = document.getElementById('panel-experience-text');

    // Data Verification Pane
    const verifiedSourcesContainer = document.getElementById('verified-sources-container');

    // Initialize marked option for safety
    marked.setOptions({
        breaks: true,
        highlight: function(code, lang) {
            return hljs.highlightAuto(code).value;
        }
    });

    // ----------------------------------------------------
    // Authentication Flow (Prevents Login Page Flash)
    // ----------------------------------------------------
    async function checkAuthentication() {
        if (!state.token) {
            hideAppLoadingScreen();
            showAuthOverlay();
            return;
        }

        try {
            const res = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${state.token}` }
            });

            if (!res.ok) throw new Error("Session invalid");
            
            const data = await res.json();
            state.username = data.username;
            localStorage.setItem('username', data.username);
            
            hideAuthOverlay();
            setupUserProfile();
            await loadInitialData();
            await loadConversations();
            
            // Restore Collapsed Sidebar Preference
            const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
            if (isCollapsed) {
                appSidebar.classList.add('collapsed');
                appContainer.classList.add('collapsed');
                const icon = btnSidebarCollapse.querySelector('i');
                if (icon) icon.setAttribute('data-lucide', 'chevron-right');
            }
            
            showAppContent();
            activateTab('chat'); // Default landing
        } catch (error) {
            console.error("Auth check failed:", error);
            logoutUserLocal();
        } finally {
            hideAppLoadingScreen();
        }
    }

    function hideAppLoadingScreen() {
        if (appLoadingScreen) appLoadingScreen.classList.add('hidden');
    }

    function showAppContent() {
        if (appContainer) appContainer.classList.remove('hidden');
    }

    function showAuthOverlay() {
        if (authOverlay) authOverlay.classList.remove('hidden');
        if (appContainer) appContainer.classList.add('hidden');
    }

    function hideAuthOverlay() {
        if (authOverlay) authOverlay.classList.add('hidden');
    }

    function setupUserProfile() {
        if (!state.username) return;
        userDisplayName.textContent = state.username;
        userInitials.textContent = state.username.substring(0, 2).toUpperCase();
    }

    function logoutUserLocal() {
        state.token = null;
        state.username = null;
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        if (appContainer) appContainer.classList.add('hidden');
        showAuthOverlay();
    }

    // Toggle Login vs Signup inside Card
    btnToggleLogin.addEventListener('click', () => {
        isSignupMode = false;
        btnToggleLogin.classList.add('active');
        btnToggleSignup.classList.remove('active');
        authSubtitle.textContent = "Log in to access candidate experiences & placement chat";
        authSubmitBtn.textContent = "Log In";
        authErrorMsg.style.display = "none";
    });

    btnToggleSignup.addEventListener('click', () => {
        isSignupMode = true;
        btnToggleSignup.classList.add('active');
        btnToggleLogin.classList.remove('active');
        authSubtitle.textContent = "Create an account to start saving chat sessions";
        authSubmitBtn.textContent = "Sign Up";
        authErrorMsg.style.display = "none";
    });

    // Form submission
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = authUsernameInput.value.trim();
        const password = authPasswordInput.value.trim();

        if (!username || !password) return;
        const endpoint = isSignupMode ? '/api/auth/signup' : '/api/auth/login';
        
        try {
            authErrorMsg.style.display = "none";
            authSubmitBtn.textContent = "Processing...";
            authSubmitBtn.disabled = true;

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Request failed");

            if (isSignupMode) {
                isSignupMode = false;
                btnToggleLogin.classList.add('active');
                btnToggleSignup.classList.remove('active');
                authSubtitle.textContent = "Signup success! Please log in now.";
                authSubmitBtn.textContent = "Log In";
                authPasswordInput.value = '';
            } else {
                state.token = data.token;
                state.username = data.username;
                localStorage.setItem('token', data.token);
                localStorage.setItem('username', data.username);
                
                hideAuthOverlay();
                setupUserProfile();
                await loadInitialData();
                await loadConversations();
                showAppContent();
                activateTab('chat');
            }
        } catch (error) {
            authErrorMsg.textContent = error.message;
            authErrorMsg.style.display = "block";
            authSubmitBtn.textContent = isSignupMode ? "Sign Up" : "Log In";
        } finally {
            authSubmitBtn.disabled = false;
        }
    });

    btnLogout.addEventListener('click', async () => {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${state.token}` }
            });
        } catch (e) {
            console.error("Logout request failed:", e);
        }
        logoutUserLocal();
        window.location.reload();
    });

    // ----------------------------------------------------
    // Tab Navigation Logic
    // ----------------------------------------------------
    const tabMetadata = {
        chat: { title: "PlacementPulse", desc: "Interactive placement preparation and RAG transcript chatbot." },
        explorer: { title: "Experiences Explorer", desc: "Search and filter placement experiences from 250+ candidates." },
        insights: { title: "PlacementPulse", desc: "Insights, Trends, and Placement Analytics." }
    };

    function activateTab(tabName) {
        navItems.forEach(nav => {
            if (nav.dataset.tab === tabName) {
                nav.classList.add('active');
            } else {
                nav.classList.remove('active');
            }
        });
        
        tabPanels.forEach(panel => {
            if (panel.id === `panel-${tabName}`) {
                panel.classList.add('active');
            } else {
                panel.classList.remove('active');
            }
        });
        
        tabTitle.textContent = tabMetadata[tabName].title;
        tabDesc.textContent = tabMetadata[tabName].desc;
        state.activeTab = tabName;
        
        // Close mobile drawer when changing tabs
        appSidebar.classList.remove('active');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');

        if (tabName === 'insights') {
            renderCharts();
        }
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            activateTab(item.dataset.tab);
        });
    });

    // ----------------------------------------------------
    // API Data Loaders (Placement database)
    // ----------------------------------------------------
    async function loadInitialData() {
        try {
            const headers = { 'Authorization': `Bearer ${state.token}` };
            
            // Load companies
            const companiesRes = await fetch('/api/companies', { headers });
            const companiesData = await companiesRes.json();
            state.companies = companiesData.companies;
            populateCompanyDropdowns();

            // Load experiences metadata
            const experiencesRes = await fetch('/api/experiences', { headers });
            const experiencesData = await experiencesRes.json();
            state.experiences = experiencesData.experiences;
            
            renderExplorerGrid(state.experiences);
            updateDashboardCounters();
            populateVerifiedSources();
        } catch (error) {
            console.error("Failed to load initial data:", error);
        }
    }

    function populateCompanyDropdowns() {
        const selects = [chatCompanyFilter, filterCompany];
        selects.forEach(select => {
            if (!select) return;
            while (select.options.length > 1) {
                select.remove(1);
            }
            state.companies.forEach(company => {
                const opt = document.createElement('option');
                opt.value = company.toLowerCase();
                opt.textContent = company;
                select.appendChild(opt);
            });
        });
    }

    function populateVerifiedSources() {
        if (!verifiedSourcesContainer) return;
        verifiedSourcesContainer.innerHTML = '';
        state.experiences.forEach(exp => {
            const badge = document.createElement('span');
            badge.classList.add('verified-badge');
            badge.innerHTML = `<i data-lucide="file-text"></i> ${exp.source_file}`;
            verifiedSourcesContainer.appendChild(badge);
        });
        lucide.createIcons();
    }

    // ----------------------------------------------------
    // Chat Sessions Management (Rename, Create, Delete)
    // ----------------------------------------------------
    async function loadConversations() {
        try {
            const res = await fetch('/api/conversations', {
                headers: { 'Authorization': `Bearer ${state.token}` }
            });
            const data = await res.json();
            state.conversations = data.conversations;
            renderSidebarHistory();
            
            if (state.conversations.length > 0) {
                selectConversation(state.conversations[0].id);
            } else {
                createNewChatSession();
            }
        } catch (error) {
            console.error("Failed to load conversations:", error);
        }
    }

    function renderSidebarHistory() {
        sidebarChatHistory.innerHTML = '';
        if (state.conversations.length === 0) {
            sidebarChatHistory.innerHTML = `
                <div style="font-size: 0.75rem; color: var(--text-muted); padding: 0.5rem; text-align: center;">
                    No recent chats.
                </div>
            `;
            return;
        }

        state.conversations.forEach(conv => {
            const item = document.createElement('div');
            item.classList.add('history-item');
            if (conv.id === state.activeConversationId) {
                item.classList.add('active');
            }
            item.dataset.id = conv.id;
            
            item.innerHTML = `
                <div class="history-item-content">
                    <i data-lucide="message-square"></i>
                    <span class="history-item-title">${conv.title}</span>
                </div>
                <div class="history-item-actions">
                    <button class="history-item-rename" title="Rename Chat">
                        <i data-lucide="edit-3"></i>
                    </button>
                    <button class="history-item-delete" title="Delete Chat">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            `;
            
            item.addEventListener('click', () => selectConversation(conv.id));
            
            const renameBtn = item.querySelector('.history-item-rename');
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                renameConversationSession(conv.id, conv.title);
            });
            
            const delBtn = item.querySelector('.history-item-delete');
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteConversationSession(conv.id);
            });
            
            sidebarChatHistory.appendChild(item);
        });
        lucide.createIcons();
    }

    async function renameConversationSession(convId, currentTitle) {
        const newTitle = prompt("Enter a new title for this chat:", currentTitle);
        if (newTitle === null) return;
        const trimmed = newTitle.trim();
        if (!trimmed) {
            alert("Title cannot be empty.");
            return;
        }

        try {
            const res = await fetch(`/api/conversations/${convId}/title`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.token}`
                },
                body: JSON.stringify({ title: trimmed })
            });

            if (!res.ok) throw new Error("Rename failed");
            
            const data = await res.json();
            const conv = state.conversations.find(c => c.id === convId);
            if (conv) {
                conv.title = data.title;
                renderSidebarHistory();
            }
        } catch (error) {
            console.error("Failed to rename conversation:", error);
            alert("Failed to rename conversation.");
        }
    }

    async function createNewChatSession() {
        try {
            const companyFilter = chatCompanyFilter.value || null;
            const res = await fetch('/api/conversations', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.token}`
                },
                body: JSON.stringify({ title: "New Chat", company_filter: companyFilter })
            });
            
            const newConv = await res.json();
            state.conversations.unshift(newConv);
            state.activeConversationId = newConv.id;
            renderSidebarHistory();
            
            chatMessages.innerHTML = '';
            appendMessage('system', 'Hi there! I am **PlacementPulse**. I have indexed 250+ candidate placement experiences across top tech companies. Ask me anything about their selection processes or question types.');
            chatMessages.scrollTop = chatMessages.scrollHeight;
            activateTab('chat');
        } catch (error) {
            console.error("Failed to create new chat session:", error);
        }
    }

    async function selectConversation(convId) {
        state.activeConversationId = convId;
        activateTab('chat');

        const items = sidebarChatHistory.querySelectorAll('.history-item');
        items.forEach(it => {
            if (it.dataset.id === convId) {
                it.classList.add('active');
            } else {
                it.classList.remove('active');
            }
        });

        try {
            chatMessages.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 2rem;">Loading chat history...</div>';
            
            const res = await fetch(`/api/conversations/${convId}/messages`, {
                headers: { 'Authorization': `Bearer ${state.token}` }
            });
            const data = await res.json();
            chatMessages.innerHTML = '';
            
            if (data.messages.length === 0) {
                appendMessage('system', 'This conversation has no messages yet. Send a prompt to get started!');
            } else {
                data.messages.forEach(msg => {
                    const uiRole = msg.role === 'model' ? 'system' : 'user';
                    appendMessage(uiRole, msg.text, msg.citations);
                });
            }
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } catch (error) {
            console.error("Failed to load conversation history:", error);
            chatMessages.innerHTML = `<div style="font-size: 0.85rem; color: var(--danger); text-align: center; padding: 2rem;">Failed to load chat history: ${error.message}</div>`;
        }
    }

    async function deleteConversationSession(convId) {
        if (!confirm("Are you sure you want to delete this chat session?")) return;
        
        try {
            const res = await fetch(`/api/conversations/${convId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${state.token}` }
            });
            if (!res.ok) throw new Error("Delete failed");
            
            state.conversations = state.conversations.filter(c => c.id !== convId);
            if (state.activeConversationId === convId) {
                state.activeConversationId = null;
                if (state.conversations.length > 0) {
                    selectConversation(state.conversations[0].id);
                } else {
                    await createNewChatSession();
                }
            } else {
                renderSidebarHistory();
            }
        } catch (error) {
            console.error("Failed to delete chat:", error);
        }
    }

    btnNewChat.addEventListener('click', createNewChatSession);

    // ----------------------------------------------------
    // Chat Submissions & Input Validations
    // ----------------------------------------------------
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;
        
        chatInput.value = '';
        await submitChatMessage(text);
    });

    suggestionChips.forEach(chip => {
        chip.addEventListener('click', () => {
            submitChatMessage(chip.textContent);
        });
    });

    async function submitChatMessage(text) {
        // Alphanumeric verification locally
        if (!/[a-zA-Z0-9]/.test(text)) {
            alert("Invalid Input: Emojis and special characters alone are not supported. Please write a query containing letters or numbers.");
            return;
        }

        if (!state.activeConversationId) {
            await createNewChatSession();
        }

        appendMessage('user', text);
        const loadingId = appendLoadingIndicator();
        chatMessages.scrollTop = chatMessages.scrollHeight;

        try {
            const companyFilter = chatCompanyFilter.value || "";
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.token}`
                },
                body: JSON.stringify({
                    message: text,
                    conversation_id: state.activeConversationId,
                    company_filter: companyFilter
                })
            });

            removeLoadingIndicator(loadingId);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || "Server error");
            }

            appendMessage('system', data.response, data.citations);
            
            if (data.title) {
                const conv = state.conversations.find(c => c.id === state.activeConversationId);
                if (conv) {
                    conv.title = data.title;
                    renderSidebarHistory();
                }
            }
        } catch (error) {
            removeLoadingIndicator(loadingId);
            appendMessage('system', `⚠️ **AI Service Notice:** ${error.message}`);
        }
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function appendMessage(role, rawText, citations = []) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', role);
        
        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('avatar');
        avatarDiv.innerHTML = role === 'user' ? '<i data-lucide="user"></i>' : '<i data-lucide="bot"></i>';
        
        const wrapperDiv = document.createElement('div');
        wrapperDiv.classList.add('message-wrapper');
        
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');
        
        if (role === 'system') {
            contentDiv.classList.add('markdown-body');
            contentDiv.innerHTML = marked.parse(rawText);
        } else {
            contentDiv.textContent = rawText;
        }

        // Citations cards
        if (role === 'system' && citations && citations.length > 0) {
            const citationsDiv = document.createElement('div');
            citationsDiv.classList.add('citations-container');
            
            const citationTitle = document.createElement('div');
            citationTitle.classList.add('citation-title');
            citationTitle.textContent = "Cited Experiences:";
            citationsDiv.appendChild(citationTitle);

            citations.forEach(cit => {
                const card = document.createElement('div');
                card.classList.add('citation-card');
                card.innerHTML = `<i data-lucide="file-text"></i> ${cit.candidate_name} (${cit.company})`;
                card.addEventListener('click', () => openExperienceDetails(cit.id));
                citationsDiv.appendChild(card);
            });
            contentDiv.appendChild(citationsDiv);
        }
        
        const metaDiv = document.createElement('div');
        metaDiv.classList.add('message-meta');
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        // Standardized brand name to PlacementPulse
        metaDiv.textContent = `${role === 'user' ? 'You' : 'PlacementPulse'} • ${timeStr}`;
        
        wrapperDiv.appendChild(contentDiv);
        wrapperDiv.appendChild(metaDiv);
        messageDiv.appendChild(avatarDiv);
        messageDiv.appendChild(wrapperDiv);
        chatMessages.appendChild(messageDiv);
        lucide.createIcons();
    }

    function appendLoadingIndicator() {
        const id = 'loader-' + Date.now();
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', 'system', 'loading');
        messageDiv.id = id;
        
        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('avatar');
        avatarDiv.innerHTML = '<i data-lucide="bot"></i>';
        
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');
        contentDiv.innerHTML = `
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        
        messageDiv.appendChild(avatarDiv);
        messageDiv.appendChild(contentDiv);
        chatMessages.appendChild(messageDiv);
        lucide.createIcons();
        return id;
    }

    function removeLoadingIndicator(id) {
        const element = document.getElementById(id);
        if (element) element.remove();
    }

    // ----------------------------------------------------
    // Experience Explorer (Filters)
    // ----------------------------------------------------
    function renderExplorerGrid(data) {
        experiencesGrid.innerHTML = '';
        if (data.length === 0) {
            experiencesGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-secondary);">
                    <i data-lucide="file-warning" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 1rem;"></i>
                    <p>No experiences match your filters. Try adjusting them.</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        data.forEach(exp => {
            const card = document.createElement('div');
            card.classList.add('exp-card');
            card.innerHTML = `
                <div class="exp-header">
                    <span class="exp-company">${exp.company}</span>
                    <span class="exp-difficulty ${exp.difficulty}">${exp.difficulty}</span>
                </div>
                <h4>${exp.candidate_name}</h4>
                <div class="exp-details">
                    <div class="exp-detail-item">
                        <i data-lucide="briefcase"></i>
                        <span>${exp.role || 'Software Engineer'}</span>
                    </div>
                    <div class="exp-detail-item">
                        <i data-lucide="banknote"></i>
                        <span>${exp.package || 'Not Specified'}</span>
                    </div>
                </div>
            `;
            card.addEventListener('click', () => openExperienceDetails(exp.id));
            experiencesGrid.appendChild(card);
        });
        lucide.createIcons();
    }

    function filterExperiences() {
        const query = searchInput.value.toLowerCase().trim();
        const selectedCompany = filterCompany.value.toLowerCase();
        const selectedDifficulty = filterDifficulty.value;
        const selectedYear = filterYear.value;
        const selectedRoleType = filterRoleType.value.toLowerCase();
        
        const filtered = state.experiences.filter(exp => {
            const matchesQuery = !query || 
                exp.candidate_name.toLowerCase().includes(query) || 
                exp.company.toLowerCase().includes(query) ||
                (exp.role && exp.role.toLowerCase().includes(query));
                
            const matchesCompany = !selectedCompany || exp.company.toLowerCase() === selectedCompany;
            const matchesDifficulty = !selectedDifficulty || exp.difficulty === selectedDifficulty;
            const matchesYear = !selectedYear || String(exp.year) === String(selectedYear);
            const matchesRoleType = !selectedRoleType || String(exp.role_type).toLowerCase() === selectedRoleType;
            
            return matchesQuery && matchesCompany && matchesDifficulty && matchesYear && matchesRoleType;
        });
        renderExplorerGrid(filtered);
    }

    searchInput.addEventListener('input', filterExperiences);
    filterCompany.addEventListener('change', filterExperiences);
    filterDifficulty.addEventListener('change', filterExperiences);
    filterYear.addEventListener('change', filterExperiences);
    filterRoleType.addEventListener('change', filterExperiences);

    // ----------------------------------------------------
    // Experience Detail Slide-Over Drawer
    // ----------------------------------------------------
    async function openExperienceDetails(docId) {
        try {
            panelCandidateName.textContent = "Loading...";
            panelCompanyBadge.textContent = "---";
            panelRoleInfo.innerHTML = '<i data-lucide="briefcase"></i> Loading...';
            panelPackageInfo.innerHTML = '<i data-lucide="banknote"></i> Loading...';
            panelDifficultyBadge.textContent = "---";
            panelYearBadge.textContent = "---";
            panelTypeBadge.textContent = "---";
            panelFilename.textContent = "---";
            panelExperienceText.textContent = "Fetching complete interview transcript from RAG database...";
            
            detailPanel.classList.add('active');
            panelOverlay.classList.add('active');
            lucide.createIcons();

            const res = await fetch(`/api/experience/${docId}`, {
                headers: { 'Authorization': `Bearer ${state.token}` }
            });
            if (!res.ok) throw new Error("Could not retrieve experience text.");
            
            const doc = await res.json();
            panelCandidateName.textContent = doc.candidate_name;
            panelCompanyBadge.textContent = doc.company;
            panelRoleInfo.innerHTML = `<i data-lucide="briefcase"></i> ${doc.role || 'Software Engineer'}`;
            panelPackageInfo.innerHTML = `<i data-lucide="banknote"></i> ${doc.package || 'Not Specified'}`;
            
            panelDifficultyBadge.className = 'badge';
            panelDifficultyBadge.classList.add(doc.difficulty);
            panelDifficultyBadge.textContent = doc.difficulty;
            
            panelYearBadge.textContent = doc.year || "2025";
            panelTypeBadge.textContent = doc.role_type || "Placement";
            panelFilename.textContent = doc.source_file;
            panelExperienceText.innerHTML = marked.parse(doc.text);
            
            panelExperienceText.querySelectorAll('pre code').forEach((el) => {
                hljs.highlightElement(el);
            });
            lucide.createIcons();
        } catch (error) {
            console.error(error);
            panelExperienceText.textContent = `Error: Failed to load candidate placement experience. ${error.message}`;
        }
    }

    function closeExperienceDetails() {
        detailPanel.classList.remove('active');
        panelOverlay.classList.remove('active');
    }

    closePanelBtn.addEventListener('click', closeExperienceDetails);
    panelOverlay.addEventListener('click', closeExperienceDetails);

    // ----------------------------------------------------
    // Insights & Dashboard (Analytics)
    // ----------------------------------------------------
    function updateDashboardCounters() {
        document.getElementById('stat-total-experiences').textContent = state.experiences.length;
        document.getElementById('stat-total-companies').textContent = state.companies.length;
        
        let maxLpa = 0;
        let maxPackageStr = "Not Specified";
        state.experiences.forEach(exp => {
            if (exp.package) {
                const clean = exp.package.toLowerCase();
                const match = clean.match(/(\d+(?:\.\d+)?)\s*(lpa|lakhs|lakh)/);
                if (match) {
                    const lpaVal = parseFloat(match[1]);
                    if (lpaVal > maxLpa) {
                        maxLpa = lpaVal;
                        maxPackageStr = exp.package;
                    }
                }
            }
        });
        document.getElementById('stat-top-package').textContent = maxPackageStr;
    }

    function renderCharts() {
        if (!state.experiences.length) return;
        
        const companyCounts = {};
        state.experiences.forEach(exp => {
            companyCounts[exp.company] = (companyCounts[exp.company] || 0) + 1;
        });
        
        const sortedCompanies = Object.entries(companyCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);
            
        const companyLabels = sortedCompanies.map(item => item[0]);
        const companyData = sortedCompanies.map(item => item[1]);

        const diffCounts = { Easy: 0, Medium: 0, Hard: 0 };
        state.experiences.forEach(exp => {
            if (diffCounts[exp.difficulty] !== undefined) {
                diffCounts[exp.difficulty]++;
            }
        });

        if (state.charts.company) state.charts.company.destroy();
        if (state.charts.difficulty) state.charts.difficulty.destroy();

        Chart.defaults.color = '#94a3b8';
        Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";

        const ctxCompany = document.getElementById('companyChart').getContext('2d');
        state.charts.company = new Chart(ctxCompany, {
            type: 'bar',
            data: {
                labels: companyLabels,
                datasets: [{
                    label: 'Experiences Shared',
                    data: companyData,
                    backgroundColor: 'rgba(99, 102, 241, 0.6)',
                    borderColor: '#6366f1',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }
                }
            }
        });

        const ctxDifficulty = document.getElementById('difficultyChart').getContext('2d');
        state.charts.difficulty = new Chart(ctxDifficulty, {
            type: 'doughnut',
            data: {
                labels: ['Easy', 'Medium', 'Hard'],
                datasets: [{
                    data: [diffCounts.Easy, diffCounts.Medium, diffCounts.Hard],
                    backgroundColor: [
                        'rgba(48, 209, 88, 0.6)',
                        'rgba(255, 214, 10, 0.6)',
                        'rgba(255, 69, 58, 0.6)'
                    ],
                    borderColor: [
                        '#30d158',
                        '#ffd60a',
                        '#ff453a'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { boxWidth: 12, padding: 15 }
                    }
                },
                cutout: '70%'
            }
        });
    }

    // ----------------------------------------------------
    // Help & Responsive Side Drawer Events
    // ----------------------------------------------------
    const btnHelp = document.getElementById('btn-help');
    const helpMenu = document.getElementById('help-menu');
    if (btnHelp && helpMenu) {
        btnHelp.addEventListener('click', (e) => {
            e.stopPropagation();
            helpMenu.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (!helpMenu.contains(e.target) && !btnHelp.contains(e.target)) {
                helpMenu.classList.remove('active');
            }
        });
    }

    // Sidebar Expand/Collapse Click
    if (btnSidebarCollapse) {
        btnSidebarCollapse.addEventListener('click', () => {
            const collapsed = appSidebar.classList.toggle('collapsed');
            appContainer.classList.toggle('collapsed');
            localStorage.setItem('sidebarCollapsed', collapsed);
            
            const icon = btnSidebarCollapse.querySelector('i');
            if (icon) {
                if (collapsed) {
                    icon.setAttribute('data-lucide', 'chevron-right');
                } else {
                    icon.setAttribute('data-lucide', 'chevron-left');
                }
            }
            lucide.createIcons();
        });
    }

    // Mobile Hamburger drawer toggles
    const btnMobileToggle = document.getElementById('btn-mobile-toggle');
    if (btnMobileToggle && sidebarOverlay) {
        btnMobileToggle.addEventListener('click', () => {
            appSidebar.classList.toggle('active');
            sidebarOverlay.classList.toggle('active');
        });
        sidebarOverlay.addEventListener('click', () => {
            appSidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        });
    }

    // Run Auth Verification
    checkAuthentication();
});
