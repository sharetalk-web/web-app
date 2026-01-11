function logOut(){
    localStorage.removeItem("authUser");
    localStorage.removeItem("authRepo");
    localStorage.removeItem("chatFriend");
    localStorage.removeItem("chatDate");
    localStorage.removeItem("chatRepo");
    document.getElementById("log").textContent="Logged out!";
    document.getElementById("liUsername").value="";
    document.getElementById("liPassword").value="";
    window.location.href = "cauth.html";
}

// Configuration
const API = "https://api.github.com";
const TOKEN = "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";
const OWNER = "authorization-tech";
const CHAT_OWNER = "chat-creator"; // GitHub username for chat repos

// Get current user
const currentUser = localStorage.getItem("authUser");
const currentUserRepo = localStorage.getItem("authRepo");

// Check authentication
if (!currentUser || !currentUserRepo) {
    window.location.href = "cauth.html";
}

// Global variables
let trustees = [];
let activeFilter = 'all';
let isLoading = false;

// DOM Elements
const clearButton = document.querySelector('.clear');
const filterInput = document.getElementById('filter');
const moreButton = document.getElementById('tal');
const sidebar = document.querySelector('.sidebar');
const closeSidebar = document.querySelector('.close-sidebar');
const tabs = document.querySelectorAll('.tab');
const friendsContainer = document.getElementById('friendsContainer');
const loadingElement = document.getElementById('loading');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Initializing chat page...");
    console.log("Current user:", currentUser);
    console.log("Current repo:", currentUserRepo);
    
    await loadTrustees();
    setupEventListeners();
});

// API wrapper
async function api(path, method = "GET", body, useChatToken = false) {
    const tokenToUse = useChatToken ? TOKEN : TOKEN;
    const headers = {
        Authorization: "token " + tokenToUse,
        Accept: "application/vnd.github+json"
    };
    
    if (body && method !== "GET") {
        headers["Content-Type"] = "application/json";
    }

    console.log(`API ${method}: ${path}`);
    
    try {
        const res = await fetch(API + path, {
            method,
            headers,
            body: body ? JSON.stringify(body) : null
        });

        if (!res.ok) {
            if (res.status === 404) {
                console.log(`API 404: ${path}`);
                return null;
            }
            console.error(`API Error ${res.status}: ${path}`);
            throw new Error(`API Error: ${res.status}`);
        }
        return res.json();
    } catch (error) {
        console.error(`API fetch error: ${path}`, error);
        throw error;
    }
}

// Load trustees from friends.txt
async function loadTrustees() {
    if (isLoading) {
        console.log("Already loading trustees, skipping...");
        return;
    }
    
    isLoading = true;
    try {
        console.log("Loading trustees...");
        loadingElement.style.display = 'block';
        
        // Clear current trustees
        trustees = [];
        
        // Step 1: Load friends list from friends.txt
        try {
            console.log(`Loading friends.txt from: ${OWNER}/${currentUserRepo}`);
            const friendsRes = await api(`/repos/${OWNER}/${currentUserRepo}/contents/friends.txt`);
            
            if (friendsRes && friendsRes.content) {
                const friendsContent = atob(friendsRes.content);
                console.log("Raw friends.txt content:", friendsContent);
                
                // Parse friends list
                let friendUsernames = [];
                if (friendsContent.trim()) {
                    friendUsernames = friendsContent.split(',')
                        .map(f => f.trim())
                        .filter(f => f && f !== 'undefined' && f !== 'null' && f !== '');
                }
                
                console.log("Parsed friend usernames:", friendUsernames);
                
                if (friendUsernames.length === 0) {
                    console.log("No friends found in friends.txt");
                    showNoTrustees();
                    return;
                }

                // Step 2: Load details for each friend
                console.log("Loading details for", friendUsernames.length, "friends...");
                
                for (const username of friendUsernames) {
                    try {
                        console.log(`Loading friend: ${username}`);
                        
                        const userRepo = `${username}-repo`;
                        let displayName = username;
                        let isOnline = false;
                        
                        // Get display name from username.txt
                        try {
                            const userRes = await api(`/repos/${OWNER}/${userRepo}/contents/username.txt`);
                            if (userRes && userRes.content) {
                                displayName = atob(userRes.content).trim();
                                console.log(`Display name for ${username}: ${displayName}`);
                            }
                        } catch (e) {
                            console.log(`Could not get display name for ${username}:`, e.message);
                        }
                        
                        // Check online status
                        try {
                            const statusRes = await api(`/repos/${OWNER}/${userRepo}/contents/status.json`);
                            if (statusRes && statusRes.content) {
                                const statusData = JSON.parse(atob(statusRes.content));
                                const lastSeen = new Date(statusData.lastSeen);
                                const now = new Date();
                                const diffMinutes = (now - lastSeen) / (1000 * 60);
                                isOnline = diffMinutes < 5;
                                console.log(`${username} is ${isOnline ? 'online' : 'offline'}`);
                            }
                        } catch (e) {
                            console.log(`No status for ${username}:`, e.message);
                        }
                        
                        // Get last message and unread count
                        const { lastMessage, unreadCount } = await getLastMessageAndUnread(username);
                        
                        // Add to trustees array
                        trustees.push({
                            username: username,
                            displayName: displayName,
                            isOnline: isOnline,
                            lastMessage: lastMessage,
                            unreadCount: unreadCount,
                            repo: userRepo,
                            lastActive: lastMessage ? new Date(lastMessage.timestamp) : new Date(0),
                            hasUnread: unreadCount > 0
                        });
                        
                        console.log(`Added ${username} to trustees list with ${unreadCount} unread messages`);
                        
                    } catch (e) {
                        console.error(`Error loading friend ${username}:`, e);
                    }
                }
                
                console.log("Total trustees loaded:", trustees.length);
                console.log("Trustees:", trustees);

                if (trustees.length === 0) {
                    console.log("No trustees loaded successfully");
                    showNoTrustees();
                    return;
                }

                // Sort by unread first, then by last message time
                trustees.sort((a, b) => {
                    // First sort by unread messages (unread first)
                    if (a.hasUnread && !b.hasUnread) return -1;
                    if (!a.hasUnread && b.hasUnread) return 1;
                    
                    // Both have unread or both don't, sort by unread count
                    if (a.hasUnread && b.hasUnread) {
                        if (a.unreadCount > b.unreadCount) return -1;
                        if (a.unreadCount < b.unreadCount) return 1;
                    }
                    
                    // Then sort by last message time (most recent first)
                    if (a.lastMessage && b.lastMessage) {
                        return new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp);
                    }
                    if (a.lastMessage) return -1;
                    if (b.lastMessage) return 1;
                    return b.lastActive - a.lastActive;
                });

                displayTrustees();
                
            } else {
                console.log("No friends.txt found or empty content");
                
                // Try to see if file exists but is empty
                try {
                    // Try to read the file again to check if it exists
                    await api(`/repos/${OWNER}/${currentUserRepo}/contents/friends.txt`);
                    console.log("friends.txt exists but is empty");
                } catch (e) {
                    console.log("friends.txt does not exist");
                    
                    // Create friends.txt if it doesn't exist
                    try {
                        await api(`/repos/${OWNER}/${currentUserRepo}/contents/friends.txt`, "PUT", {
                            message: "Create friends.txt",
                            content: btoa(""),
                            sha: null // Create new file
                        });
                        console.log("Created friends.txt file");
                    } catch (createError) {
                        console.error("Error creating friends.txt:", createError);
                    }
                }
                
                showNoTrustees();
            }
        } catch (error) {
            console.error("Error loading friends.txt:", error);
            showError();
        }
        
    } catch (error) {
        console.error("Critical error loading trustees:", error);
        showError();
    } finally {
        isLoading = false;
        loadingElement.style.display = 'none';
        console.log("Finished loading trustees");
    }
}

// Get last message and unread count with a user - UPDATED
async function getLastMessageAndUnread(friendUsername) {
    try {
        // Get today's chat repo name
        const today = new Date().toISOString().split('T')[0];
        const chatId = getChatId(currentUser, friendUsername);
        const chatRepoName = `chat-${chatId}-${today}`;
        
        console.log(`Checking for messages with ${friendUsername} in ${chatRepoName}`);
        
        let lastMessage = null;
        let unreadCount = 0;
        let allMessages = [];
        
        // Check if repo exists
        try {
            // First check today's repo
            const repoInfo = await api(`/repos/${CHAT_OWNER}/${chatRepoName}`, "GET", null, true);
            if (repoInfo) {
                // Get messages file
                const messagesRes = await api(`/repos/${CHAT_OWNER}/${chatRepoName}/contents/messages.json`, "GET", null, true);
                if (messagesRes && messagesRes.content) {
                    allMessages = JSON.parse(atob(messagesRes.content));
                    if (allMessages && allMessages.length > 0) {
                        console.log(`Found ${allMessages.length} messages in today's repo`);
                        
                        // Get the last message
                        lastMessage = allMessages[allMessages.length - 1];
                        
                        // Count unread messages (sent by friend and not read)
                        unreadCount = allMessages.filter(msg => 
                            msg.from === friendUsername && 
                            msg.read === false
                        ).length;
                        
                        console.log(`Found ${unreadCount} unread messages from ${friendUsername}`);
                    }
                }
            }
        } catch (e) {
            console.log(`No today's chat repo for ${friendUsername}:`, e.message);
            
            // Check for any existing chat repo
            try {
                // Get all repos
                const reposRes = await api(`/users/${CHAT_OWNER}/repos?per_page=100`, "GET", null, true);
                if (reposRes) {
                    const chatPrefix = `chat-${chatId}-`;
                    const chatRepos = reposRes.filter(repo => repo.name.startsWith(chatPrefix));
                    
                    console.log(`Found ${chatRepos.length} existing chat repos for ${friendUsername}`);
                    
                    if (chatRepos.length > 0) {
                        // Sort by creation date (newest first)
                        chatRepos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                        
                        // Check the most recent repo
                        const recentRepo = chatRepos[0];
                        console.log(`Checking most recent repo: ${recentRepo.name}`);
                        
                        const messagesRes = await api(`/repos/${CHAT_OWNER}/${recentRepo.name}/contents/messages.json`, "GET", null, true);
                        
                        if (messagesRes && messagesRes.content) {
                            allMessages = JSON.parse(atob(messagesRes.content));
                            if (allMessages && allMessages.length > 0) {
                                console.log(`Found ${allMessages.length} messages in existing repo`);
                                
                                // Get the last message
                                lastMessage = allMessages[allMessages.length - 1];
                                
                                // Count unread messages
                                unreadCount = allMessages.filter(msg => 
                                    msg.from === friendUsername && 
                                    msg.read === false
                                ).length;
                                
                                console.log(`Found ${unreadCount} unread messages from ${friendUsername} in old repo`);
                            }
                        }
                    }
                }
            } catch (oldRepoError) {
                console.log(`No chat history found for ${friendUsername}:`, oldRepoError.message);
            }
        }
        
        console.log(`Results for ${friendUsername}: Last message=${lastMessage ? 'yes' : 'no'}, Unread=${unreadCount}`);
        return { lastMessage, unreadCount };
        
    } catch (e) {
        console.error(`Error getting messages for ${friendUsername}:`, e);
        return { lastMessage: null, unreadCount: 0 };
    }
}

// Get unique chat ID for two users
function getChatId(user1, user2) {
    const sorted = [user1.toLowerCase(), user2.toLowerCase()].sort();
    const chatId = `${sorted[0]}-${sorted[1]}`.replace(/[^a-zA-Z0-9-]/g, '');
    console.log(`Chat ID for ${user1} and ${user2}: ${chatId}`);
    return chatId;
}

// Display trustees
function displayTrustees() {
    console.log("Displaying trustees...");
    console.log("Total trustees:", trustees.length);
    
    if (!trustees || trustees.length === 0) {
        console.log("No trustees to display");
        showNoTrustees();
        return;
    }

    let filteredTrustees = [...trustees];
    
    // Apply filter
    if (activeFilter === 'online') {
        filteredTrustees = trustees.filter(t => t.isOnline);
        console.log(`Filtered to ${filteredTrustees.length} online trustees`);
    } else if (activeFilter === 'recent') {
        filteredTrustees = trustees.filter(t => t.lastMessage);
        console.log(`Filtered to ${filteredTrustees.length} recent trustees`);
        
        filteredTrustees.sort((a, b) => {
            // Keep unread messages at top even in recent filter
            if (a.hasUnread && !b.hasUnread) return -1;
            if (!a.hasUnread && b.hasUnread) return 1;
            
            if (!a.lastMessage && !b.lastMessage) return 0;
            if (!a.lastMessage) return 1;
            if (!b.lastMessage) return -1;
            return new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp);
        });
    }
    
    // Apply search filter
    const searchTerm = filterInput.value.toLowerCase();
    if (searchTerm) {
        const beforeSearch = filteredTrustees.length;
        filteredTrustees = filteredTrustees.filter(t => 
            (t.displayName && t.displayName.toLowerCase().includes(searchTerm)) ||
            (t.username && t.username.toLowerCase().includes(searchTerm))
        );
        console.log(`Search "${searchTerm}" filtered from ${beforeSearch} to ${filteredTrustees.length} trustees`);
    }

    if (filteredTrustees.length === 0) {
        console.log("No trustees match the current filters");
        friendsContainer.innerHTML = `
            <div class="no-trustees">
                <div class="no-trustees-icon">🔍</div>
                <h3>No trustees found</h3>
                <p>Try a different search term or filter</p>
                <button class="add-friends-btn" onclick="window.location.href='csearch.html'">
                    <i class="fas fa-user-plus"></i> Add More Friends
                </button>
            </div>
        `;
        return;
    }

    console.log(`Displaying ${filteredTrustees.length} trustees`);
    
    friendsContainer.innerHTML = filteredTrustees.map(trustee => {
        let lastMessageText = 'No messages yet';
        let messageTime = 'Never';
        
        if (trustee.lastMessage) {
            const isSentByMe = trustee.lastMessage.from === currentUser;
            const prefix = isSentByMe ? 'You: ' : '';
            const message = trustee.lastMessage.message || '';
            lastMessageText = prefix + (message.length > 30 ? message.substring(0, 30) + '...' : message);
            messageTime = formatTime(trustee.lastMessage.timestamp);
        }
        
        // Highlight the entire chat item if there are unread messages
        const chatItemClass = trustee.hasUnread ? 'friend-item unread-chat' : 'friend-item';
        
        return `
            <div class="${chatItemClass}" data-username="${trustee.username}">
                <div class="friend-avatar" id="avatar-${trustee.username}">
                    <div class="friend-avatar-default">${trustee.displayName ? trustee.displayName[0].toUpperCase() : '?'}</div>
                </div>
                <div class="friend-info">
                    <div class="friend-name-row">
                        <span class="friend-name">${trustee.displayName || trustee.username}</span>
                        ${trustee.hasUnread ? '<span class="unread-badge">NEW</span>' : ''}
                    </div>
                    <div class="friend-last-message ${trustee.hasUnread ? 'unread-message' : ''}">${lastMessageText}</div>
                    <div class="friend-time">
                        <i class="far fa-clock"></i>
                        ${messageTime}
                    </div>
                </div>
                <div class="friend-status">
                    ${trustee.isOnline ? '<div class="online-dot" title="Online"></div>' : ''}
                    ${trustee.hasUnread ? `<div class="unread-indicator">${trustee.unreadCount}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');

    // Load avatars
    filteredTrustees.forEach(trustee => {
        if (trustee.repo) {
            loadAvatar(trustee.repo, trustee.username);
        }
    });

    // Add click event listeners
    document.querySelectorAll('.friend-item').forEach(item => {
        item.addEventListener('click', function() {
            const username = this.getAttribute('data-username');
            console.log(`Opening chat with ${username}`);
            openChat(username);
        });
    });
    
    console.log("Trustees displayed successfully");
}

// Load avatar for a user
async function loadAvatar(repo, username) {
    try {
        console.log(`Loading avatar for ${username} from ${repo}`);
        const imageNames = ["profile.jpg", "profile.png", "avatar.jpg", "avatar.png", "user.jpg", "profile.jpeg"];
        
        for (const file of imageNames) {
            try {
                const imgData = await api(`/repos/${OWNER}/${repo}/contents/${file}`);
                if (imgData && imgData.content) {
                    const ext = file.split('.').pop().toLowerCase();
                    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
                    
                    const container = document.getElementById(`avatar-${username}`);
                    if (!container) {
                        console.log(`Avatar container not found for ${username}`);
                        return;
                    }
                    
                    const img = document.createElement('img');
                    img.className = 'friend-avatar-img';
                    img.src = `data:${mime};base64,${imgData.content}`;
                    img.onload = () => {
                        console.log(`Avatar loaded successfully for ${username}`);
                        container.innerHTML = '';
                        container.appendChild(img);
                    };
                    img.onerror = () => {
                        console.log(`Failed to load image ${file} for ${username}`);
                    };
                    return;
                }
            } catch (e) {
                continue;
            }
        }
        
        console.log(`No image found for ${username}, trying profile.json...`);
        
        // Try to load from profile.json
        try {
            const profileData = await api(`/repos/${OWNER}/${repo}/contents/profile.json`);
            if (profileData && profileData.content) {
                const profile = JSON.parse(atob(profileData.content));
                if (profile.avatarData) {
                    const container = document.getElementById(`avatar-${username}`);
                    if (!container) return;
                    
                    const img = document.createElement('img');
                    img.className = 'friend-avatar-img';
                    img.src = `data:image/jpeg;base64,${profile.avatarData}`;
                    img.onload = () => {
                        console.log(`Avatar loaded from profile.json for ${username}`);
                        container.innerHTML = '';
                        container.appendChild(img);
                    };
                    return;
                }
            }
        } catch (e) {
            console.log(`No profile.json for ${username}:`, e.message);
        }
        
        console.log(`Using default avatar for ${username}`);
        
    } catch (e) {
        console.error(`Error loading avatar for ${username}:`, e);
    }
}

// Open chat with user
async function openChat(username) {
    if (!username) {
        alert("Error: Invalid user");
        return;
    }
    
    try {
        console.log(`Opening chat with ${username}...`);
        
        // Store chat info in localStorage
        localStorage.setItem('chatFriend', username);
        localStorage.setItem('chatWithUser', username);
        
        // Mark all messages as read before opening chat
        await markMessagesAsRead(username);
        
        // Create or get chat repo
        const repoName = await createChatRepo(username);
        if (repoName) {
            console.log(`Redirecting to chat room with ${username}`);
            // Redirect to chat room
            window.location.href = "room.html";
        } else {
            alert("Error creating chat. Please try again.");
        }
    } catch (error) {
        console.error("Error opening chat:", error);
        alert("Error opening chat. Please try again.");
    }
}

// Mark all messages from a user as read - FIXED VERSION
async function markMessagesAsRead(friendUsername) {
    try {
        const chatId = getChatId(currentUser, friendUsername);
        const today = new Date().toISOString().split('T')[0];
        let chatRepoName = `chat-${chatId}-${today}`;
        
        console.log(`Marking messages as read from ${friendUsername} in ${chatRepoName}`);
        
        let markedRead = false;
        let updatedMessages = null;
        let repoToUpdate = null;
        let shaToUpdate = null;
        
        // First try today's repo
        try {
            const repoInfo = await api(`/repos/${CHAT_OWNER}/${chatRepoName}`, "GET", null, true);
            if (repoInfo) {
                const messagesRes = await api(`/repos/${CHAT_OWNER}/${chatRepoName}/contents/messages.json`, "GET", null, true);
                if (messagesRes && messagesRes.content) {
                    let messages = JSON.parse(atob(messagesRes.content));
                    let unreadCountBefore = messages.filter(msg => 
                        msg.from === friendUsername && msg.read === false
                    ).length;
                    
                    if (unreadCountBefore > 0) {
                        // Mark all messages from friend as read
                        messages = messages.map(msg => {
                            if (msg.from === friendUsername && msg.read === false) {
                                msg.read = true;
                                markedRead = true;
                            }
                            return msg;
                        });
                        
                        updatedMessages = messages;
                        repoToUpdate = chatRepoName;
                        shaToUpdate = messagesRes.sha;
                        
                        console.log(`Marked ${unreadCountBefore} messages as read from ${friendUsername}`);
                    }
                }
            }
        } catch (e) {
            console.log(`Could not mark messages as read in today's repo:`, e.message);
        }
        
        // If no unread in today's repo, check other repos
        if (!markedRead) {
            try {
                // Get all repos
                const reposRes = await api(`/users/${CHAT_OWNER}/repos?per_page=100`, "GET", null, true);
                if (reposRes) {
                    const chatPrefix = `chat-${chatId}-`;
                    const chatRepos = reposRes.filter(repo => repo.name.startsWith(chatPrefix));
                    
                    for (const repo of chatRepos) {
                        try {
                            const messagesRes = await api(`/repos/${CHAT_OWNER}/${repo.name}/contents/messages.json`, "GET", null, true);
                            if (messagesRes && messagesRes.content) {
                                let messages = JSON.parse(atob(messagesRes.content));
                                let unreadCountBefore = messages.filter(msg => 
                                    msg.from === friendUsername && msg.read === false
                                ).length;
                                
                                if (unreadCountBefore > 0) {
                                    // Mark all messages from friend as read
                                    messages = messages.map(msg => {
                                        if (msg.from === friendUsername && msg.read === false) {
                                            msg.read = true;
                                            markedRead = true;
                                        }
                                        return msg;
                                    });
                                    
                                    updatedMessages = messages;
                                    repoToUpdate = repo.name;
                                    shaToUpdate = messagesRes.sha;
                                    
                                    console.log(`Marked ${unreadCountBefore} messages as read from ${friendUsername} in ${repo.name}`);
                                    break;
                                }
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                }
            } catch (e) {
                console.log(`Could not check other repos:`, e.message);
            }
        }
        
        // Update the messages file if we marked any as read
        if (markedRead && updatedMessages && repoToUpdate && shaToUpdate) {
            try {
                await api(`/repos/${CHAT_OWNER}/${repoToUpdate}/contents/messages.json`, "PUT", {
                    message: `Mark messages as read from ${friendUsername}`,
                    content: btoa(JSON.stringify(updatedMessages, null, 2)),
                    sha: shaToUpdate
                }, true);
                
                console.log(`Updated messages file for ${friendUsername}`);
            } catch (updateError) {
                console.error(`Failed to update messages file:`, updateError);
            }
        }
        
        // If we marked messages as read, immediately refresh the trustee list
        if (markedRead) {
            console.log(`Refreshing trustees list after marking messages as read`);
            
            // Find and update the trustee in the current array
            const trusteeIndex = trustees.findIndex(t => t.username === friendUsername);
            if (trusteeIndex !== -1) {
                trustees[trusteeIndex].hasUnread = false;
                trustees[trusteeIndex].unreadCount = 0;
                
                // Re-sort the list (unread should no longer be at top)
                trustees.sort((a, b) => {
                    // First sort by unread messages (unread first)
                    if (a.hasUnread && !b.hasUnread) return -1;
                    if (!a.hasUnread && b.hasUnread) return 1;
                    
                    // Both have unread or both don't, sort by unread count
                    if (a.hasUnread && b.hasUnread) {
                        if (a.unreadCount > b.unreadCount) return -1;
                        if (a.unreadCount < b.unreadCount) return 1;
                    }
                    
                    // Then sort by last message time (most recent first)
                    if (a.lastMessage && b.lastMessage) {
                        return new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp);
                    }
                    if (a.lastMessage) return -1;
                    if (b.lastMessage) return 1;
                    return b.lastActive - a.lastActive;
                });
                
                // Update the display immediately
                displayTrustees();
            }
        }
        
    } catch (error) {
        console.error(`Error marking messages as read for ${friendUsername}:`, error);
    }
}

// Create or get today's chat repo
async function createChatRepo(friendUsername) {
    try {
        // Get today's date for repo naming
        const today = new Date().toISOString().split('T')[0];
        const chatId = getChatId(currentUser, friendUsername);
        let repoName = `chat-${chatId}-${today}`;
        
        console.log(`Creating/checking chat repo: ${repoName}`);
        
        // Check if repo exists
        try {
            await api(`/repos/${CHAT_OWNER}/${repoName}`, "GET", null, true);
            console.log(`Chat repo ${repoName} already exists`);
        } catch (e) {
            // Create new repo
            console.log(`Creating new chat repo: ${repoName}`);
            try {
                await api(`/user/repos`, "POST", {
                    name: repoName,
                    private: false, // CHANGED TO PUBLIC so room.js can access it
                    description: `Chat between ${currentUser} and ${friendUsername} - ${today}`,
                    auto_init: true
                }, true);
                
                // Create messages.json file
                await api(`/repos/${CHAT_OWNER}/${repoName}/contents/messages.json`, "PUT", {
                    message: `Initialize chat between ${currentUser} and ${friendUsername}`,
                    content: btoa(JSON.stringify([], null, 2))
                }, true);
                
                console.log(`Created new chat repo: ${repoName}`);
            } catch (createError) {
                console.error("Error creating repo:", createError);
                
                // If repo creation fails, try to use any existing repo for this chat pair
                try {
                    const reposRes = await api(`/users/${CHAT_OWNER}/repos?per_page=100`, "GET", null, true);
                    if (reposRes) {
                        const chatPrefix = `chat-${chatId}-`;
                        const chatRepos = reposRes.filter(repo => repo.name.startsWith(chatPrefix));
                        
                        if (chatRepos.length > 0) {
                            // Use the most recent repo
                            chatRepos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                            const existingRepo = chatRepos[0].name;
                            console.log(`Using existing repo: ${existingRepo}`);
                            repoName = existingRepo;
                        } else {
                            throw new Error("No existing chat repos found");
                        }
                    }
                } catch (findError) {
                    console.error("Failed to find existing repo:", findError);
                    throw new Error("Failed to create or find chat repo");
                }
            }
        }
        
        // Store chat info in localStorage
        localStorage.setItem('chatRepo', repoName);
        localStorage.setItem('chatDate', today);
        
        return repoName;
    } catch (error) {
        console.error("Error in createChatRepo:", error);
        throw error;
    }
}

// Show no trustees message
function showNoTrustees() {
    console.log("Showing 'no trustees' message");
    friendsContainer.innerHTML = `
        <div class="no-trustees">
            <div class="no-trustees-icon">👥</div>
            <h3>No Trustees Yet</h3>
            <p>You haven't added any trustees yet. Add friends to start chatting!</p>
            <p><small>Go to Search page to find and add friends.</small></p>
            <button class="add-friends-btn" onclick="window.location.href='csearch.html'">
                <i class="fas fa-user-plus"></i> Add Friends
            </button>
        </div>
    `;
}

// Show error message
function showError() {
    console.log("Showing error message");
    friendsContainer.innerHTML = `
        <div class="no-trustees">
            <div class="no-trustees-icon">⚠️</div>
            <h3>Error Loading Trustees</h3>
            <p>Could not load your trustees. Please try again.</p>
            <button class="add-friends-btn" onclick="loadTrustees()">
                <i class="fas fa-redo"></i> Retry
            </button>
        </div>
    `;
}

// Format time
function formatTime(timestamp) {
    if (!timestamp) return "Never";
    
    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return "Invalid date";
        
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return "Just now";
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch (e) {
        return "Invalid time";
    }
}

// Setup event listeners
function setupEventListeners() {
    console.log("Setting up event listeners...");
    
    // Clear button
    clearButton.addEventListener('click', function() {
        filterInput.value = '';
        filterInput.focus();
        displayTrustees();
    });

    // Search filter
    filterInput.addEventListener('input', function() {
        displayTrustees();
    });

    // Search on Enter key
    filterInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            displayTrustees();
        }
    });

    // Sidebar functionality
    moreButton.addEventListener('click', function() {
        sidebar.classList.add('active');
        document.querySelector('.overlay').classList.add('active');
    });

    closeSidebar.addEventListener('click', function() {
        sidebar.classList.remove('active');
        document.querySelector('.overlay').classList.remove('active');
    });

    // Close sidebar when clicking outside
    document.querySelector('.overlay').addEventListener('click', function() {
        sidebar.classList.remove('active');
        this.classList.remove('active');
    });

    // Tab functionality
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            activeFilter = this.getAttribute('data-filter');
            console.log(`Changed filter to: ${activeFilter}`);
            displayTrustees();
        });
    });

    // Home button
    document.getElementById('home').addEventListener('click', function() {
        window.location.href = 'chat.html';
    });

    // Sign out button
    document.getElementById("signOutBtn").addEventListener('click', () => {
        if (confirm("Are you sure you want to logout?")) {
            localStorage.removeItem("authUser");
            localStorage.removeItem("authRepo");
            localStorage.removeItem("chatWithUser");
            localStorage.removeItem("chatRepo");
            localStorage.removeItem("chatFriend");
            localStorage.removeItem("chatDate");
            window.location.href = "cauth.html";
        }
    });

    // New group button
    const newGroupBtn = document.querySelector('.new-group');
    if (newGroupBtn) {
        newGroupBtn.addEventListener('click', function() {
            alert("New group feature coming soon!");
        });
    }

    // Refresh on focus (when user returns to tab)
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            console.log("Page became visible, refreshing trustees...");
            loadTrustees();
        }
    });

    // Add manual refresh button to sidebar
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'sidebar-btn';
    refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
    refreshBtn.addEventListener('click', function() {
        console.log("Manual refresh requested");
        loadTrustees();
    });
    
    const sidebarContent = document.querySelector('.sidebar-content');
    if (sidebarContent) {
        sidebarContent.insertBefore(refreshBtn, sidebarContent.firstChild);
    }

    // Auto-refresh trustees every 30 seconds
    setInterval(() => {
        console.log("Auto-refreshing trustees...");
        loadTrustees();
    }, 30000);
    
    console.log("Event listeners setup complete");
}

// Update user's online status
async function updateUserStatus() {
    try {
        const statusData = {
            lastSeen: new Date().toISOString(),
            status: "online"
        };
        
        await api(`/repos/${OWNER}/${currentUserRepo}/contents/status.json`, "PUT", {
            message: "Update status",
            content: btoa(JSON.stringify(statusData, null, 2))
        });
        console.log("Updated user status");
    } catch (e) {
        console.error("Error updating status:", e.message);
    }
}

// Add debug button to page (for testing)
function addDebugButton() {
    const debugBtn = document.createElement('button');
    debugBtn.textContent = 'Debug';
    debugBtn.style.position = 'fixed';
    debugBtn.style.bottom = '10px';
    debugBtn.style.left = '10px';
    debugBtn.style.zIndex = '9999';
    debugBtn.style.padding = '10px';
    debugBtn.style.background = '#ff4444';
    debugBtn.style.color = 'white';
    debugBtn.style.border = 'none';
    debugBtn.style.borderRadius = '5px';
    debugBtn.addEventListener('click', debugFriends);
    document.body.appendChild(debugBtn);
}

// Debug function to check friends.txt
async function debugFriends() {
    console.log("=== DEBUG FRIENDS ===");
    try {
        const friendsRes = await api(`/repos/${OWNER}/${currentUserRepo}/contents/friends.txt`);
        if (friendsRes && friendsRes.content) {
            const content = atob(friendsRes.content);
            console.log("friends.txt content:", content);
            const friends = content.split(',').map(f => f.trim()).filter(f => f);
            console.log("Parsed friends:", friends);
            console.log("Number of friends:", friends.length);
        } else {
            console.log("friends.txt not found or empty");
        }
    } catch (error) {
        console.error("Debug error:", error);
    }
    console.log("=== END DEBUG ===");
}

// Make functions available globally
window.loadTrustees = loadTrustees;
window.debugFriends = debugFriends;
window.getChatId = getChatId;
window.createChatRepo = createChatRepo;
window.openChat = openChat;

// Initialize
console.log("Chat.js initialization complete");

// Update status on page load and periodically
updateUserStatus();
setInterval(updateUserStatus, 60000); // Update every minute

// Also update status when user interacts with page
document.addEventListener('click', updateUserStatus);
document.addEventListener('keypress', updateUserStatus);

// Add debug button for testing
addDebugButton();

// Add CSS styles for unread messages
const style = document.createElement('style');
style.textContent = `
  
`;
document.head.appendChild(style);