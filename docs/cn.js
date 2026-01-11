const API = "https://api.github.com";
const token = "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";
const owner = "authorization-tech";
const currentUser = localStorage.getItem("authUser");
const currentUserRepo = localStorage.getItem("authRepo");

if (!currentUser || !currentUserRepo) window.location.href = "csearch.html";

let notifications = [], friendRequests = [], messages = [], currentTab = 'all';

async function api(path, method = "GET", body) {
    const headers = { Authorization: "token " + token, Accept: "application/vnd.github+json" };
    if (body && method !== "GET") headers["Content-Type"] = "application/json";
    
    const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : null });
    if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`API Error: ${res.status}`);
    }
    return res.json();
}

function showToast(message, type = "success") {
    const toast = document.getElementById("notificationToast");
    toast.textContent = message;
    toast.className = `notification-toast ${type}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function formatTime(timestamp) {
    const diff = Date.now() - new Date(timestamp);
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
}

async function loadAvatar(username, container) {
    // Show fallback
    const fallback = document.createElement("div");
    fallback.className = "notification-avatar-default";
    fallback.textContent = username[0].toUpperCase();
    container.innerHTML = '';
    container.appendChild(fallback);
    
    const repo = `${username}-repo`;
    
    // Try common image files
    const images = ['profile.jpg', 'profile.png', 'avatar.jpg', 'avatar.png'];
    
    for (const file of images) {
        try {
            const imgData = await api(`/repos/${owner}/${repo}/contents/${file}`);
            if (imgData?.content) {
                const ext = file.split('.').pop();
                const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
                const img = document.createElement("img");
                img.className = "notification-avatar-img";
                img.src = `data:${mime};base64,${imgData.content}`;
                img.onload = () => {
                    container.innerHTML = '';
                    container.appendChild(img);
                };
                return;
            }
        } catch (e) {}
    }
    
    // Fallback to profile.json
    try {
        const profile = await api(`/repos/${owner}/${repo}/contents/profile.json`);
        if (profile?.content) {
            const data = JSON.parse(atob(profile.content));
            if (data.avatarData) {
                const img = document.createElement("img");
                img.className = "notification-avatar-img";
                img.src = `data:image/jpeg;base64,${data.avatarData}`;
                img.onload = () => {
                    container.innerHTML = '';
                    container.appendChild(img);
                };
                return;
            }
        }
    } catch (e) {}
}

async function loadFriendRequests() {
    try {
        const res = await api(`/repos/${owner}/${currentUserRepo}/contents/requests.txt`);
        friendRequests = res ? atob(res.content).split(',').filter(r => r.trim()) : [];
        const badge = document.getElementById('requestsBadge');
        badge.style.display = friendRequests.length ? 'flex' : 'none';
        if (friendRequests.length) badge.textContent = friendRequests.length;
    } catch (e) { friendRequests = []; }
}

async function loadMessages() {
    try {
        const res = await api(`/repos/${owner}/${currentUserRepo}/contents/messages.json`);
        messages = res ? JSON.parse(atob(res.content)) : [];
        const unread = messages.filter(m => !m.read).length;
        const badge = document.getElementById('messagesBadge');
        badge.style.display = unread ? 'flex' : 'none';
        if (unread) badge.textContent = unread;
    } catch (e) { messages = []; }
}

async function loadNotificationsData() {
    try {
        const res = await api(`/repos/${owner}/${currentUserRepo}/contents/notifications.json`);
        notifications = res ? JSON.parse(atob(res.content)) : [];
    } catch (e) { notifications = []; }
}

async function acceptFriendRequest(username) {
    // Stop event from bubbling
    event.stopPropagation();
    
    if (!confirm(`Accept friend request from ${username}?`)) return;
    
    try {
        // Add to friends.txt
        let friends = [], friendsSha = '';
        try {
            const friendsRes = await api(`/repos/${owner}/${currentUserRepo}/contents/friends.txt`);
            if (friendsRes) {
                friends = atob(friendsRes.content).split(',').filter(f => f.trim());
                friendsSha = friendsRes.sha;
            }
        } catch (e) {}
        
        if (!friends.includes(username)) {
            friends.push(username);
            await fetch(`${API}/repos/${owner}/${currentUserRepo}/contents/friends.txt`, {
                method: 'PUT',
                headers: { 
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Added ${username} as friend`,
                    content: btoa(friends.join(',')),
                    sha: friendsSha || undefined
                })
            });
        }
        
        // Remove from requests.txt
        const requestsRes = await api(`/repos/${owner}/${currentUserRepo}/contents/requests.txt`);
        if (requestsRes) {
            let requests = atob(requestsRes.content).split(',').filter(r => r.trim());
            requests = requests.filter(r => r !== username);
            await fetch(`${API}/repos/${owner}/${currentUserRepo}/contents/requests.txt`, {
                method: 'PUT',
                headers: { 
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Removed ${username} from requests`,
                    content: btoa(requests.join(',')),
                    sha: requestsRes.sha
                })
            });
        }
        
        // Add current user to requester's friends.txt
        try {
            const requesterRepo = `${username}-repo`;
            let requesterFriends = [], requesterSha = '';
            try {
                const requesterFriendsRes = await api(`/repos/${owner}/${requesterRepo}/contents/friends.txt`);
                if (requesterFriendsRes) {
                    requesterFriends = atob(requesterFriendsRes.content).split(',').filter(f => f.trim());
                    requesterSha = requesterFriendsRes.sha;
                }
            } catch (e) {}
            
            if (!requesterFriends.includes(currentUser)) {
                requesterFriends.push(currentUser);
                await fetch(`${API}/repos/${owner}/${requesterRepo}/contents/friends.txt`, {
                    method: 'PUT',
                    headers: { 
                        'Authorization': `token ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: `Added ${currentUser} to friends`,
                        content: btoa(requesterFriends.join(',')),
                        sha: requesterSha || undefined
                    })
                });
            }
        } catch (e) { console.log("Couldn't add to requester's friends:", e); }
        
        // Send acceptance notification
        const notificationData = {
            message: `${currentUser} accepted your friend request`,
            from: currentUser,
            timestamp: new Date().toISOString(),
            read: false,
            type: 'alert'
        };
        
        try {
            const requesterRepo = `${username}-repo`;
            let requesterNotifications = [], requesterSha = null;
            try {
                const notifRes = await api(`/repos/${owner}/${requesterRepo}/contents/notifications.json`);
                if (notifRes) {
                    requesterNotifications = JSON.parse(atob(notifRes.content));
                    requesterSha = notifRes.sha;
                }
            } catch (e) {}
            
            requesterNotifications.push(notificationData);
            await fetch(`${API}/repos/${owner}/${requesterRepo}/contents/notifications.json`, {
                method: 'PUT',
                headers: { 
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Notification from ${currentUser}`,
                    content: btoa(JSON.stringify(requesterNotifications, null, 2)),
                    sha: requesterSha
                })
            });
        } catch (e) { console.log("Couldn't send acceptance notification:", e); }
        
        showToast(`You are now trustees with ${username}!`);
        // Force reload all data from GitHub
        await loadFriendRequests();
        await loadNotificationsData();
        displayNotifications();
        
    } catch (e) {
        console.error("Error accepting request:", e);
        showToast("Error accepting request", "error");
    }
}

async function declineFriendRequest(username) {
    // Stop event from bubbling
    event.stopPropagation();
    
    if (!confirm(`Decline friend request from ${username}?`)) return;
    
    try {
        // Remove from requests.txt
        const requestsRes = await api(`/repos/${owner}/${currentUserRepo}/contents/requests.txt`);
        if (!requestsRes) return;
        
        let requests = atob(requestsRes.content).split(',').filter(r => r.trim());
        requests = requests.filter(r => r !== username);
        
        await fetch(`${API}/repos/${owner}/${currentUserRepo}/contents/requests.txt`, {
            method: 'PUT',
            headers: { 
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Declined request from ${username}`,
                content: btoa(requests.join(',')),
                sha: requestsRes.sha
            })
        });
        
        showToast(`Declined request from ${username}`);
        // Force reload all data from GitHub
        await loadFriendRequests();
        displayNotifications();
        
    } catch (e) {
        console.error("Error declining request:", e);
        showToast("Error declining request", "error");
    }
}

async function markNotificationAsRead(index) {
    // Stop event from bubbling
    event.stopPropagation();
    
    try {
        // Get current notifications
        const notifRes = await api(`/repos/${owner}/${currentUserRepo}/contents/notifications.json`);
        if (!notifRes || index < 0 || index >= notifications.length) return;
        
        // Update local array
        notifications[index].read = true;
        
        // Save to GitHub
        const content = btoa(JSON.stringify(notifications, null, 2));
        await fetch(`${API}/repos/${owner}/${currentUserRepo}/contents/notifications.json`, {
            method: 'PUT',
            headers: { 
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Marked notification as read`,
                content: content,
                sha: notifRes.sha
            })
        });
        
        showToast("Marked as read");
        // Update display
        displayNotifications();
        
    } catch (e) {
        console.error("Error:", e);
        showToast("Error marking as read", "error");
    }
}

async function deleteNotification(index) {
    // Stop event from bubbling
    event.stopPropagation();
    
    if (!confirm("Delete this notification?")) return;
    
    try {
        // Get current notifications
        const notifRes = await api(`/repos/${owner}/${currentUserRepo}/contents/notifications.json`);
        if (!notifRes || index < 0 || index >= notifications.length) return;
        
        // Remove from local array
        notifications.splice(index, 1);
        
        // Save to GitHub
        const content = btoa(JSON.stringify(notifications, null, 2));
        await fetch(`${API}/repos/${owner}/${currentUserRepo}/contents/notifications.json`, {
            method: 'PUT',
            headers: { 
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Deleted notification`,
                content: content,
                sha: notifRes.sha
            })
        });
        
        showToast("Notification deleted");
        // Update display
        displayNotifications();
        
    } catch (e) {
        console.error("Error:", e);
        showToast("Error deleting notification", "error");
    }
}

async function markMessageAsRead(index) {
    // Stop event from bubbling
    event.stopPropagation();
    
    try {
        // Get current messages
        const messagesRes = await api(`/repos/${owner}/${currentUserRepo}/contents/messages.json`);
        if (!messagesRes || index < 0 || index >= messages.length) return;
        
        // Update local array
        messages[index].read = true;
        
        // Save to GitHub
        const content = btoa(JSON.stringify(messages, null, 2));
        await fetch(`${API}/repos/${owner}/${currentUserRepo}/contents/messages.json`, {
            method: 'PUT',
            headers: { 
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Marked message as read`,
                content: content,
                sha: messagesRes.sha
            })
        });
        
        showToast("Message marked as read");
        // Update display
        displayNotifications();
        
    } catch (e) {
        console.error("Error:", e);
        showToast("Error marking message", "error");
    }
}

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');
    displayNotifications();
}

function displayNotifications() {
    const container = document.getElementById('notificationsContainer');
    
    let items = [];
    if (currentTab === 'all') {
        items = [
            ...friendRequests.map((u, i) => ({
                type: 'request', 
                username: u, 
                index: i,
                timestamp: new Date().toISOString(), 
                unread: true
            })),
            ...messages.map((m, i) => ({
                type: 'message', 
                from: m.from, 
                index: i, 
                message: m.message, 
                timestamp: m.timestamp,
                unread: !m.read
            })),
            ...notifications.map((n, i) => ({
                type: n.type || 'alert', 
                from: n.from, 
                index: i, 
                message: n.message, 
                timestamp: n.timestamp,
                unread: !n.read
            }))
        ];
    } else if (currentTab === 'requests') {
        items = friendRequests.map((u, i) => ({
            type: 'request', 
            username: u, 
            index: i,
            timestamp: new Date().toISOString(), 
            unread: true
        }));
    } else if (currentTab === 'messages') {
        items = messages.map((m, i) => ({
            type: 'message', 
            from: m.from, 
            index: i, 
            message: m.message, 
            timestamp: m.timestamp,
            unread: !m.read
        }));
    }
    
    // Sort by timestamp (newest first)
    items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (!items.length) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔔</div>
                <h3>No notifications</h3>
                <p>You're all caught up!</p>
            </div>`;
        return;
    }
    
    container.innerHTML = items.map((item, i) => {
        const username = item.from || item.username;
        const timeAgo = formatTime(item.timestamp);
        
        let actionsHTML = '';
        if (item.type === 'request') {
            actionsHTML = `
                <div class="notification-actions">
                    <button class="action-btn accept-btn" onclick="acceptFriendRequest('${item.username}')">Accept</button>
                    <button class="action-btn decline-btn" onclick="declineFriendRequest('${item.username}')">Decline</button>
                </div>`;
        } else if (item.type === 'message') {
            actionsHTML = `
                <div class="notification-actions">
                    <button class="action-btn read-btn" onclick="markMessageAsRead(${item.index})">Mark Read</button>
                    <button class="action-btn" onclick="viewProfile('${item.from}')">View Profile</button>
                </div>`;
        } else {
            actionsHTML = `
                <div class="notification-actions">
                    <button class="action-btn read-btn" onclick="markNotificationAsRead(${item.index})">Mark Read</button>
                    <button class="action-btn delete-btn" onclick="deleteNotification(${item.index})">Delete</button>
                </div>`;
        }
        
        return `
            <div class="notification-item ${item.unread ? 'unread' : ''}" onclick="viewMobile('${username}')" style="cursor: pointer;">
                <div class="notification-avatar" id="avatar-${i}"></div>
                <div class="notification-content">
                    <div class="notification-message">
                        ${item.type === 'request' ? `${item.username} wants to be your trustee` : item.message}
                    </div>
                    <div class="notification-time">${timeAgo}</div>
                    ${actionsHTML}
                </div>
            </div>
        `;
    }).join('');
    
    // Load avatars
    setTimeout(() => {
        items.forEach((item, i) => {
            const container = document.getElementById(`avatar-${i}`);
            const username = item.from || item.username;
            if (container && username) loadAvatar(username, container);
        });
    }, 100);
}

async function loadNotifications() {
    const container = document.getElementById('notificationsContainer');
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Loading...</div>';
    
    try {
        await Promise.all([loadFriendRequests(), loadMessages(), loadNotificationsData()]);
        
        // Update all badge
        const allBadge = document.getElementById('allBadge');
        const total = friendRequests.length + messages.filter(m => !m.read).length + notifications.filter(n => !n.read).length;
        allBadge.style.display = total ? 'flex' : 'none';
        if (total) allBadge.textContent = total;
        
        displayNotifications();
    } catch (e) {
        console.error("Error:", e);
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚠️</div>
                <h3>Error Loading</h3>
                <p>Please try again</p>
                <button class="action-btn" onclick="loadNotifications()" style="margin-top:20px">Retry</button>
            </div>`;
    }
}

function viewMobile(username) {
    localStorage.setItem("viewMobileUser", username);
    localStorage.setItem("viewMobileRepo", `${username}-repo`);
    window.location.href = "look.html";
}

function viewProfile(username) {
    // Stop event from bubbling
    event.stopPropagation();
    
    localStorage.setItem("viewUser", username);
    localStorage.setItem("viewRepo", `${username}-repo`);
    window.location.href = "look.html";
}

function clearAllNotifications() {
    if (!confirm("Clear all notifications?")) return;
    
    // Clear local arrays
    friendRequests = [];
    messages.forEach(m => m.read = true);
    notifications.forEach(n => n.read = true);
    
    // Save changes to GitHub
    saveClearedNotifications();
    
    showToast("All notifications cleared");
    displayNotifications();
}

async function saveClearedNotifications() {
    try {
        // Clear requests.txt
        const requestsRes = await api(`/repos/${owner}/${currentUserRepo}/contents/requests.txt`);
        if (requestsRes) {
            await fetch(`${API}/repos/${owner}/${currentUserRepo}/contents/requests.txt`, {
                method: 'PUT',
                headers: { 
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: "Cleared all friend requests",
                    content: btoa(""),
                    sha: requestsRes.sha
                })
            });
        }
        
        // Mark all messages as read
        const messagesRes = await api(`/repos/${owner}/${currentUserRepo}/contents/messages.json`);
        if (messagesRes) {
            messages.forEach(m => m.read = true);
            await fetch(`${API}/repos/${owner}/${currentUserRepo}/contents/messages.json`, {
                method: 'PUT',
                headers: { 
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: "Marked all messages as read",
                    content: btoa(JSON.stringify(messages, null, 2)),
                    sha: messagesRes.sha
                })
            });
        }
        
        // Mark all notifications as read
        const notifRes = await api(`/repos/${owner}/${currentUserRepo}/contents/notifications.json`);
        if (notifRes) {
            notifications.forEach(n => n.read = true);
            await fetch(`${API}/repos/${owner}/${currentUserRepo}/contents/notifications.json`, {
                method: 'PUT',
                headers: { 
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: "Marked all notifications as read",
                    content: btoa(JSON.stringify(notifications, null, 2)),
                    sha: notifRes.sha
                })
            });
        }
    } catch (e) {
        console.error("Error saving cleared notifications:", e);
    }
}

function goBack() {
    window.location.href = "chat.html";
}

// Auto-refresh & load
setInterval(loadNotifications, 30000);
document.addEventListener('DOMContentLoaded', loadNotifications);