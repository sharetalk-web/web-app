// Configuration
const API = "https://api.github.com";
const TOKEN = "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";
let GITHUB_USERNAME = "chat-creator";

// Get chat info from localStorage
const currentUser = localStorage.getItem("authUser") || "default-user";
const friendUsername = localStorage.getItem("chatFriend");
const chatDate = localStorage.getItem("chatDate") || getCurrentDate();

// Debug info
console.log("Room initialization:", {
    currentUser,
    friendUsername,
    chatDate,
    localStorage: {
        authUser: localStorage.getItem("authUser"),
        chatFriend: localStorage.getItem("chatFriend"),
        chatRepo: localStorage.getItem("chatRepo"),
        chatDate: localStorage.getItem("chatDate")
    }
});

// Check if chat info exists
if (!friendUsername) {
    console.error("No friend selected, redirecting to chat.html");
    window.location.href = "chat.html";
}

// DOM Elements
const messagesContainer = document.getElementById("messagesContainer");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const scrollBottomBtn = document.getElementById("scrollBottom");
const friendNameElement = document.getElementById("friendName");
const friendStatusElement = document.getElementById("friendStatus");

// State
let messages = [];
let messagesSha = null;
let autoScroll = true;
let pollInterval;
let isInitialized = false;
let dailyChatRepo = null;
let repoOwner = GITHUB_USERNAME;

// Helper function to get current date in YYYY-MM-DD format
function getCurrentDate() {
    const now = new Date();
    return now.toISOString().split('T')[0];
}

// Get chat ID (MUST MATCH chat.js EXACTLY)
function getChatId() {
    const sorted = [currentUser.toLowerCase(), friendUsername.toLowerCase()].sort();
    const chatId = `${sorted[0]}-${sorted[1]}`.replace(/[^a-z0-9-]/g, '-');
    console.log("Generated Chat ID:", chatId);
    return chatId;
}

// Get repo name for specific date (MUST MATCH chat.js EXACTLY)
function getRepoNameForDate(targetDate) {
    const chatId = getChatId();
    const repoName = `chat-${chatId}-${targetDate}`;
    console.log("Generated Repo Name:", repoName);
    return repoName;
}

// Get ALL possible chat repos between these users
async function getAllChatRepos() {
    const chatId = getChatId();
    console.log(`Searching for all repos with pattern: chat-${chatId}-*`);
    
    try {
        // Get all repos
        const repos = await api(`/users/${GITHUB_USERNAME}/repos?per_page=100`);
        const chatRepos = repos.filter(repo => 
            repo.name.includes(chatId) && 
            repo.name.startsWith('chat-') &&
            !repo.private
        );
        
        console.log(`Found ${chatRepos.length} chat repos:`, chatRepos.map(r => r.name));
        
        // Extract dates from repo names
        const reposWithDates = chatRepos.map(repo => {
            const dateMatch = repo.name.match(/(\d{4}-\d{2}-\d{2})$/);
            return {
                repoName: repo.name,
                date: dateMatch ? dateMatch[1] : null,
                created: repo.created_at,
                updated: repo.updated_at
            };
        }).filter(repo => repo.date);
        
        // Sort by date (newest first)
        reposWithDates.sort((a, b) => b.date.localeCompare(a.date));
        
        return reposWithDates;
    } catch (error) {
        console.error("Error getting all chat repos:", error);
        return [];
    }
}

// Find the BEST repo to use
async function findBestRepo() {
    console.log("Finding best repo for chat...");
    
    // Option 1: Use repo from localStorage if available
    const cachedRepo = localStorage.getItem("chatRepo");
    if (cachedRepo) {
        console.log(`Trying cached repo: ${cachedRepo}`);
        try {
            const repo = await api(`/repos/${GITHUB_USERNAME}/${cachedRepo}`);
            if (!repo.private) {
                try {
                    await api(`/repos/${GITHUB_USERNAME}/${cachedRepo}/contents/messages.json`);
                    console.log(`✓ Using cached repo: ${cachedRepo}`);
                    
                    // Extract date from repo name
                    const dateMatch = cachedRepo.match(/(\d{4}-\d{2}-\d{2})$/);
                    return {
                        repoName: cachedRepo,
                        owner: GITHUB_USERNAME,
                        dateStr: dateMatch ? dateMatch[1] : chatDate
                    };
                } catch (e) {
                    console.log(`Cached repo has no messages file`);
                }
            }
        } catch (error) {
            console.log(`Cached repo not found: ${cachedRepo}`);
        }
    }
    
    // Option 2: Try target date repo
    const targetRepoName = getRepoNameForDate(chatDate);
    console.log(`Trying target date repo: ${targetRepoName}`);
    
    try {
        const repo = await api(`/repos/${GITHUB_USERNAME}/${targetRepoName}`);
        if (!repo.private) {
            try {
                await api(`/repos/${GITHUB_USERNAME}/${targetRepoName}/contents/messages.json`);
                console.log(`✓ Using target date repo: ${targetRepoName}`);
                return {
                    repoName: targetRepoName,
                    owner: GITHUB_USERNAME,
                    dateStr: chatDate
                };
            } catch (e) {
                console.log(`Target repo exists but no messages file`);
            }
        }
    } catch (error) {
        console.log(`Target repo not found: ${targetRepoName}`);
    }
    
    // Option 3: Get all chat repos and use the most recent one
    console.log("Searching for any existing chat repo...");
    const allRepos = await getAllChatRepos();
    
    if (allRepos.length > 0) {
        // Try each repo until we find one with messages
        for (const repoInfo of allRepos) {
            try {
                await api(`/repos/${GITHUB_USERNAME}/${repoInfo.repoName}/contents/messages.json`);
                console.log(`✓ Using existing repo: ${repoInfo.repoName} (${repoInfo.date})`);
                return {
                    repoName: repoInfo.repoName,
                    owner: GITHUB_USERNAME,
                    dateStr: repoInfo.date
                };
            } catch (e) {
                continue; // Try next repo
            }
        }
    }
    
    console.log("No suitable repo found, will create new one");
    return null;
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM loaded, initializing chat...");
    
    try {
        // Set friend name immediately
        friendNameElement.textContent = friendUsername;
        
        // Get GitHub username from token
        await getGitHubUsername();
        repoOwner = GITHUB_USERNAME;
        
        // Enable input immediately
        messageInput.disabled = false;
        messageInput.focus();
        updateSendButton();
        
        await ensureDailyRepo();
        await loadFriendInfo();
        await loadMessages();
        setupEventListeners();
        startPolling();
        isInitialized = true;
        
        console.log("Chat initialized successfully");
    } catch (error) {
        console.error("Initialization error:", error);
        showError("Failed to initialize chat. Please refresh the page.");
    }
});

// FAST LOGOUT FUNCTION
function logOut() {
    localStorage.clear();
    const usernameField = document.getElementById("liUsername");
    const passwordField = document.getElementById("liPassword");
    if (usernameField) usernameField.value = "";
    if (passwordField) passwordField.value = "";
    
    const logElement = document.getElementById("log");
    if (logElement) {
        logElement.textContent = "Logged out successfully!";
    }
    
    window.location.href = "login.html";
}

// Get GitHub username from the token
async function getGitHubUsername() {
    try {
        const userData = await api('/user');
        GITHUB_USERNAME = userData.login;
        repoOwner = GITHUB_USERNAME;
        console.log("GitHub username from token:", GITHUB_USERNAME);
    } catch (error) {
        console.error("Failed to get GitHub username:", error);
        throw new Error("Invalid GitHub token. Please check your token.");
    }
}

// Ensure daily repository exists
async function ensureDailyRepo() {
    console.log("Ensuring chat repository exists for date:", chatDate);
    
    if (!GITHUB_USERNAME) {
        throw new Error("GitHub username not available");
    }
    
    // Find the best existing repo
    const existingRepo = await findBestRepo();
    
    if (existingRepo) {
        console.log(`Using existing repo: ${existingRepo.repoName}`);
        dailyChatRepo = existingRepo.repoName;
        repoOwner = existingRepo.owner;
        
        // Update localStorage with the actual repo being used
        localStorage.setItem("chatRepo", existingRepo.repoName);
        localStorage.setItem("chatDate", existingRepo.dateStr);
        
        return true;
    }
    
    // Create new repo
    console.log("Creating new PUBLIC repo...");
    const newRepoName = getRepoNameForDate(chatDate);
    console.log(`Creating: ${newRepoName}`);
    
    try {
        const repoData = {
            name: newRepoName,
            description: `Chat between ${currentUser} and ${friendUsername}`,
            private: false,
            auto_init: true
        };
        
        await api('/user/repos', "POST", repoData);
        console.log(`PUBLIC repo created: ${newRepoName}`);
        
        dailyChatRepo = newRepoName;
        repoOwner = GITHUB_USERNAME;
        localStorage.setItem("chatRepo", newRepoName);
        
        // Wait for repo to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        await initializeChatFiles();
        
        return true;
        
    } catch (createError) {
        console.error(`Error creating repo:`, createError);
        
        if (createError.message && createError.message.includes("already exists")) {
            dailyChatRepo = newRepoName;
            repoOwner = GITHUB_USERNAME;
            localStorage.setItem("chatRepo", newRepoName);
            console.log(`Repo ${newRepoName} already exists, using it`);
            return true;
        }
        
        throw createError;
    }
}

// Initialize chat files
async function initializeChatFiles() {
    console.log("Initializing chat files...");
    
    try {
        // Try to get existing messages file
        try {
            const existing = await api(`/repos/${repoOwner}/${dailyChatRepo}/contents/messages.json`);
            console.log("messages.json already exists");
            return;
        } catch (error) {
            // File doesn't exist, create it
        }
        
        // Create empty messages array
        const initialMessages = [];
        const messagesContent = btoa(JSON.stringify(initialMessages, null, 2));
        
        await api(`/repos/${repoOwner}/${dailyChatRepo}/contents/messages.json`, "PUT", {
            message: "Initialize chat messages",
            content: messagesContent
        });
        
        console.log("Chat files initialized successfully");
        
    } catch (error) {
        console.error("Error initializing chat files:", error);
    }
}

// API wrapper
async function api(path, method = "GET", body) {
    const headers = {
        "Authorization": `token ${TOKEN}`,
        "Accept": "application/vnd.github.v3+json"
    };
    
    if (body && method !== "GET") {
        headers["Content-Type"] = "application/json";
    }
    
    const url = API + path;
    
    try {
        const options = {
            method: method,
            headers: headers
        };
        
        if (body && method !== "GET") {
            options.body = JSON.stringify(body);
        }
        
        const response = await fetch(url, options);
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.message || errorMessage;
            } catch (e) {}
            
            const error = new Error(errorMessage);
            error.status = response.status;
            throw error;
        }
        
        if (response.status === 204 || response.status === 202) {
            return null;
        }
        
        return await response.json();
    } catch (error) {
        console.error(`API Error (${method} ${path}):`, error.message);
        throw error;
    }
}

// Load friend information
async function loadFriendInfo() {
    try {
        friendNameElement.textContent = friendUsername;
        friendStatusElement.innerHTML = `<span class="online-dot"></span><span>Online</span>`;
        
        updateOnlineStatus();
        setInterval(updateOnlineStatus, 30000);
        
    } catch (error) {
        console.error("Error loading friend info:", error);
    }
}

// Update online status
async function updateOnlineStatus() {
    try {
        const isOnline = true;
        const statusText = isOnline ? "Online" : "Offline";
        
        friendStatusElement.innerHTML = `
            ${isOnline ? '<span class="online-dot"></span>' : ''}
            <span>${statusText}</span>
        `;
    } catch (e) {
        friendStatusElement.innerHTML = `<span>Offline</span>`;
    }
}

// Load messages from chat file
async function loadMessages() {
    try {
        console.log("Loading messages...");
        
        if (!dailyChatRepo || !repoOwner) {
            console.log("No repo configured, showing empty chat");
            messages = [];
            showEmptyChat();
            return;
        }
        
        console.log(`Loading from repo: ${dailyChatRepo} owned by ${repoOwner}`);
        
        try {
            const messagesRes = await api(`/repos/${repoOwner}/${dailyChatRepo}/contents/messages.json`);
            
            if (messagesRes && messagesRes.content) {
                messages = JSON.parse(atob(messagesRes.content));
                messagesSha = messagesRes.sha;
                console.log(`✓ Loaded ${messages.length} messages`);
                
                if (messages.length === 0) {
                    showEmptyChat();
                } else {
                    displayMessages();
                }
            } else {
                console.log("No messages content found");
                showEmptyChat();
            }
            
        } catch (error) {
            if (error.status === 404) {
                console.log("Messages file not found, starting empty chat");
                messages = [];
                showEmptyChat();
            } else {
                throw error;
            }
        }
        
    } catch (error) {
        console.error("Error loading messages:", error);
        showError(`Failed to load messages: ${error.message}`);
    }
}

// Display messages
function displayMessages() {
    messagesContainer.innerHTML = '';
    
    if (messages.length === 0) {
        showEmptyChat();
        return;
    }
    
    console.log(`Displaying ${messages.length} messages`);
    
    // Sort messages by timestamp
    messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    const messagesByDate = {};
    messages.forEach(msg => {
        const date = new Date(msg.timestamp).toDateString();
        if (!messagesByDate[date]) {
            messagesByDate[date] = [];
        }
        messagesByDate[date].push(msg);
    });
    
    Object.entries(messagesByDate).forEach(([date, dateMessages]) => {
        const dateSeparator = document.createElement('div');
        dateSeparator.className = 'date-separator';
        dateSeparator.innerHTML = `<span>${formatDate(date)}</span>`;
        messagesContainer.appendChild(dateSeparator);
        
        dateMessages.forEach(msg => {
            const isSent = msg.from === currentUser;
            const time = formatMessageTime(msg.timestamp);
            
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
            messageDiv.innerHTML = `
                <div class="message-content">${escapeHtml(msg.message)}</div>
                <span class="message-time">${time}</span>
            `;
            messagesContainer.appendChild(messageDiv);
        });
    });
    
    if (autoScroll) {
        scrollToBottom();
    }
}

// Show empty chat
function showEmptyChat() {
    messagesContainer.innerHTML = `
        <div class="empty-chat">
            <div class="empty-chat-icon">💬</div>
            <h3>No messages yet</h3>
            <p>Say hello to start the conversation!</p>
        </div>
    `;
    autoScroll = true;
}

// Show error
function showError(message) {
    messagesContainer.innerHTML = `
        <div class="empty-chat">
            <div class="empty-chat-icon">⚠️</div>
            <h3>Error</h3>
            <p>${message}</p>
            <button onclick="retryLoading()" style="
                background: #25d366;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 20px;
                cursor: pointer;
                font-weight: bold;
                margin-top: 10px;
            ">
                Retry
            </button>
        </div>
    `;
}

// Send message
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;
    
    if (!isInitialized) {
        alert("Chat is still setting up. Please wait...");
        return;
    }
    
    try {
        messageInput.disabled = true;
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        const newMessage = {
            from: currentUser,
            to: friendUsername,
            message: message,
            timestamp: new Date().toISOString(),
            read: false
        };
        
        console.log(`Sending message: "${message}"`);
        
        messages.push(newMessage);
        
        if (messagesContainer.querySelector('.empty-chat')) {
            messagesContainer.innerHTML = '';
        }
        
        const time = formatMessageTime(newMessage.timestamp);
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message sent';
        messageDiv.innerHTML = `
            <div class="message-content">${escapeHtml(newMessage.message)}</div>
            <span class="message-time">${time}</span>
        `;
        messagesContainer.appendChild(messageDiv);
        
        scrollToBottom();
        
        messageInput.value = '';
        updateSendButton();
        
        await saveMessageToRepo(newMessage);
        
        console.log("✓ Message sent successfully!");
        
    } catch (error) {
        console.error("Error sending message:", error);
        
        messages.pop();
        
        const lastMessage = messagesContainer.lastElementChild;
        if (lastMessage && lastMessage.classList.contains('sent')) {
            lastMessage.remove();
        }
        
        let errorMessage = "Failed to send message.";
        if (error.message.includes("rate limit")) {
            errorMessage = "GitHub API rate limit exceeded. Please wait a minute.";
        } else if (error.message.includes("401") || error.message.includes("403")) {
            errorMessage = "Authentication error. Please check your token.";
        } else if (error.message.includes("404")) {
            errorMessage = "Chat repo not found. Please refresh.";
        }
        
        alert(errorMessage);
        
    } finally {
        messageInput.disabled = false;
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        messageInput.focus();
    }
}

// Save message to repository
async function saveMessageToRepo(newMessage) {
    if (!dailyChatRepo || !repoOwner) {
        throw new Error("Repository not configured");
    }
    
    console.log(`Saving to ${repoOwner}/${dailyChatRepo}`);
    
    let existingMessages = [];
    let sha = null;
    
    try {
        const messagesRes = await api(`/repos/${repoOwner}/${dailyChatRepo}/contents/messages.json`);
        if (messagesRes) {
            existingMessages = JSON.parse(atob(messagesRes.content));
            sha = messagesRes.sha;
        }
    } catch (error) {
        if (error.status !== 404) {
            throw error;
        }
    }
    
    existingMessages.push(newMessage);
    
    const content = btoa(JSON.stringify(existingMessages, null, 2));
    
    const result = await api(`/repos/${repoOwner}/${dailyChatRepo}/contents/messages.json`, "PUT", {
        message: `Message from ${newMessage.from}`,
        content: content,
        sha: sha
    });
    
    if (result && result.content) {
        messagesSha = result.content.sha;
    }
    
    console.log("✓ Message saved to repo");
}

// Retry loading
async function retryLoading() {
    console.log("Retrying load...");
    messagesContainer.innerHTML = `
        <div class="loading">
            <div class="loading-spinner"></div>
            <p>Loading messages...</p>
        </div>
    `;
    
    // Clear cache and reload
    dailyChatRepo = null;
    localStorage.removeItem("chatRepo");
    
    await ensureDailyRepo();
    await loadMessages();
}

// Setup event listeners
function setupEventListeners() {
    console.log("Setting up event listeners...");
    
    sendBtn.addEventListener('click', sendMessage);
    
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    messageInput.addEventListener('input', updateSendButton);
    
    messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });
    
    messagesContainer.addEventListener('scroll', () => {
        const scrollTop = messagesContainer.scrollTop;
        const scrollHeight = messagesContainer.scrollHeight;
        const clientHeight = messagesContainer.clientHeight;
        
        if (scrollHeight - scrollTop - clientHeight > 100) {
            scrollBottomBtn.classList.add('visible');
            autoScroll = false;
        } else {
            scrollBottomBtn.classList.remove('visible');
            autoScroll = true;
        }
    });
}

// Update send button state
function updateSendButton() {
    const hasText = messageInput.value.trim() !== '';
    sendBtn.disabled = !hasText;
}

// Scroll to bottom
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    scrollBottomBtn.classList.remove('visible');
    autoScroll = true;
}

// Start polling for new messages
function startPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
    }
    
    pollInterval = setInterval(async () => {
        if (!repoOwner || !dailyChatRepo) return;
        
        try {
            const messagesRes = await api(`/repos/${repoOwner}/${dailyChatRepo}/contents/messages.json`);
            if (messagesRes && messagesRes.sha !== messagesSha) {
                const newMessages = JSON.parse(atob(messagesRes.content));
                
                if (newMessages.length > messages.length) {
                    console.log(`New messages detected: ${newMessages.length - messages.length}`);
                    messages = newMessages;
                    messagesSha = messagesRes.sha;
                    
                    if (messages.length === 0) {
                        showEmptyChat();
                    } else {
                        displayMessages();
                    }
                }
            }
        } catch (e) {
            // Silent error for polling
        }
    }, 3000);
}

// Go back to chat list
function goBack() {
    if (pollInterval) {
        clearInterval(pollInterval);
    }
    window.location.href = "chat.html";
}

// Toggle info panel
function toggleInfo() {
    const info = dailyChatRepo ? `
Chat with: ${friendUsername}
Repository: ${dailyChatRepo}
Owner: ${repoOwner}
Total Messages: ${messages.length}
Date: ${chatDate}
Status: ${dailyChatRepo ? 'Connected' : 'Disconnected'}
` : 'No chat repository found';
    alert(info);
}

// Clear chat
async function clearChat() {
    if (!confirm("Clear ALL messages in this chat?")) {
        return;
    }
    
    try {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        messages = [];
        
        await clearChatFromRepo();
        
        showEmptyChat();
        
        alert("Chat cleared!");
        
    } catch (error) {
        console.error("Error clearing chat:", error);
        alert("Failed to clear chat: " + error.message);
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
    }
}

// Clear chat from repo
async function clearChatFromRepo() {
    try {
        if (!repoOwner || !dailyChatRepo) return;
        
        const messagesRes = await api(`/repos/${repoOwner}/${dailyChatRepo}/contents/messages.json`);
        if (messagesRes) {
            const content = btoa(JSON.stringify([], null, 2));
            await api(`/repos/${repoOwner}/${dailyChatRepo}/contents/messages.json`, "PUT", {
                message: `Cleared by ${currentUser}`,
                content: content,
                sha: messagesRes.sha
            });
            
            messagesSha = null;
        }
    } catch (error) {
        console.log("No messages to clear:", error.message);
    }
}

// Utility functions
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

function formatMessageTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
        return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
        return "Yesterday";
    } else {
        return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Clean up
window.addEventListener('beforeunload', () => {
    if (pollInterval) {
        clearInterval(pollInterval);
    }
});

// Export functions
window.sendMessage = sendMessage;
window.retryLoading = retryLoading;
window.scrollToBottom = scrollToBottom;
window.goBack = goBack;
window.toggleInfo = toggleInfo;
window.clearChat = clearChat;
window.logOut = logOut;