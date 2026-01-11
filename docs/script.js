/* ========================= NAVBAR SCROLL =========================*/
let lastScrollTop = 0;
const navbar = document.getElementById("navbar");

window.addEventListener("scroll", () => {
  const st = window.pageYOffset || document.documentElement.scrollTop;
  st > lastScrollTop ? navbar.classList.add("hidden") : navbar.classList.remove("hidden");
  lastScrollTop = st <= 0 ? 0 : st;
});

/* ========================= CONFIG =========================*/
const HOME_USERNAME = "postapp06";
const SUPER_USERNAME = "authentication490";
const feed = document.getElementById("feed");
const postsPerSuper = 5; // Show super post after every 5 regular posts
let isLoading = false;
let loadedPosts = new Set(); // Track loaded posts to prevent duplicates

/* ========================= GLOBAL VIDEO STOP =========================*/
function stopAllVideos(except) {
  document.querySelectorAll("video").forEach(v => {
    if (v === except) return;

    v.pause();
    v.currentTime = 0;

    if (v._overlay) v._overlay.style.display = "flex";
  });
}

/* ========================= VIDEO CLICK HANDLER =========================*/
function handleVideoClick(video) {
  video.addEventListener("click", (e) => {
    e.stopPropagation();

    if (video.paused) {
      stopAllVideos(video); // stop all others
      video.play();
      if (video._overlay) video._overlay.style.display = "none";
    } else {
      video.pause();
      video.currentTime = 0;
      if (video._overlay) video._overlay.style.display = "flex";
    }
  });

  video.addEventListener("ended", () => {
    video.currentTime = 0;
    if (video._overlay) video._overlay.style.display = "flex";
  });
}

/* ========================= FETCH HELPERS =========================*/
async function getAllRepos(username) {
  try {
    const res = await fetch(`https://api.github.com/users/${username}/repos`);
    return res.ok ? await res.json() : [];
  } catch (error) {
    console.error("Error fetching repos:", error);
    return [];
  }
}

async function getRepoFiles(username, repo) {
  try {
    const res = await fetch(`https://api.github.com/repos/${username}/${repo}/contents/`);
    return res.ok ? await res.json() : [];
  } catch (error) {
    console.error("Error fetching repo files:", error);
    return [];
  }
}

/* ========================= GROUP HOME POSTS =========================*/
function groupPosts(files) {
  const posts = {};

  files.forEach(file => {
    if (!file.download_url) return;

    const ext = file.name.split(".").pop().toLowerCase();
    const raw = file.name.replace("." + ext, "");
    
    // Extract base name (remove numbers at the end)
    const base = raw.replace(/\d+$/, '');
    
    if (!base) return; // Skip if no base name

    if (!posts[base]) {
      posts[base] = { videos: [], images: {}, text: null };
    }

    if (["mp4", "webm", "mov", "avi"].includes(ext)) {
      posts[base].videos.push(file.download_url);
    } else if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
      posts[base].images[ext] = file.download_url;
    } else if (ext === "txt") {
      posts[base].text = file.download_url;
    }
  });

  return posts;
}

/* ========================= RENDER HOME POSTS =========================*/
function renderHomePost(post, postName) {
  // Check if this post was already loaded
  if (loadedPosts.has(postName)) {
    console.log("Skipping duplicate post:", postName);
    return false; // Don't render duplicate
  }
  
  const hasThumb = post.images.jpg || post.images.png || post.images.jpeg || post.images.webp || post.images.gif;

  // Don't return early - we want to show posts even without thumbnails
  if (!post.videos.length && !post.text && !hasThumb) return false;

  const card = document.createElement("div");
  card.className = "post";
  card.dataset.postName = postName;

  // Render text
  if (post.text) {
    fetch(post.text)
      .then(r => r.text())
      .then(text => {
        const t = document.createElement("div");
        t.className = "post-text";
        t.textContent = text;
        card.appendChild(t);
      })
      .catch(err => console.error("Error fetching text:", err));
  } else {
    // Add default text if no text file
    const t = document.createElement("div");
    t.className = "post-text";
    t.textContent = "Post";
    card.appendChild(t);
  }

  // Render videos (sequence supported)
  if (post.videos.length > 0) {
    const wrap = document.createElement("div");
    wrap.className = "video-wrap";

    let currentIndex = 0;
    const video = document.createElement("video");
    video.controls = true;
    video.poster = hasThumb || "";
    video.src = post.videos[currentIndex];
    video.preload = "metadata";
    video.muted = true; // Start muted for better UX

    const overlay = document.createElement("div");
    overlay.className = "play-overlay";
    overlay.innerHTML = "~";
    overlay.style.display = "flex";

    video._overlay = overlay;

    // Overlay click
    overlay.addEventListener("click", (e) => {
      e.stopPropagation();
      stopAllVideos(video);
      overlay.style.display = "none";
      video.play().catch(e => console.log("Autoplay prevented:", e));
    });

    // Sequence handling
    video.addEventListener("ended", () => {
      currentIndex++;
      if (currentIndex < post.videos.length) {
        video.src = post.videos[currentIndex];
        video.play().catch(e => console.log("Sequence play prevented:", e));
      } else {
        currentIndex = 0;
        video.src = post.videos[currentIndex];
        overlay.style.display = "flex";
      }
    });

    // Attach global click handler
    handleVideoClick(video);

    wrap.appendChild(video);
    wrap.appendChild(overlay);
    card.appendChild(wrap);

  } else if (hasThumb) {
    const img = document.createElement("img");
    img.src = hasThumb;
    img.alt = "Post image";
    img.loading = "lazy";
    card.appendChild(img);
  }

  // MARK: LIKE AND COMMENT BUTTONS REMOVED HERE
  
  feed.appendChild(card);
  loadedPosts.add(postName); // Add to tracking set
  console.log("Rendered post:", postName, post);
  return true;
}

/* ========================= SUPER POST SEQUENCES =========================*/
async function getSuperPosts() {
  try {
    const repos = await getAllRepos(SUPER_USERNAME);
    const map = {};
    const rows = [];

    for (const repo of repos) {
      const files = await getRepoFiles(SUPER_USERNAME, repo.name);
      console.log(`Repo ${repo.name} has ${files.length} files`);

      files.forEach(f => {
        const m = f.name.match(/^([a-zA-Z]+)(\d+)\.(png|jpg|jpeg|gif|mp4|webm)$/i);
        if (!m) return;

        const base = m[1];
        const idx = +m[2];

        if (!map[base]) map[base] = {};
        map[base][idx] = f.download_url;
      });
    }

    for (const base in map) {
      const nums = Object.keys(map[base]).map(Number).sort((a, b) => a - b);
      let temp = [];

      nums.forEach((n, i) => {
        if (i === 0 || n === nums[i - 1] + 1) {
          temp.push(map[base][n]);
        } else {
          if (temp.length >= 2) rows.push([...temp]);
          temp = [map[base][n]];
        }
      });

      if (temp.length >= 2) rows.push([...temp]);
    }

    console.log("Super posts found:", rows.length);
    return rows;
  } catch (error) {
    console.error("Error getting super posts:", error);
    return [];
  }
}

/* ========================= RENDER SUPER ROW =========================*/
function renderSuperRow(seq) {
  const top = document.createElement("div");
  top.className = "super-separator";

  const title = document.createElement("div");
  title.className = "super-title";
  title.textContent = "Super Post";

  const row = document.createElement("div");
  row.className = "super-row";

  seq.forEach(url => {
    const item = document.createElement("div");
    item.className = "super-item";

    const ext = url.split(".").pop().toLowerCase();
    if (ext === "mp4" || ext === "webm" || ext === "mov" || ext === "avi") {
      const v = document.createElement("video");
      v.src = url;
      v.controls = true;
      v.muted = true;
      v.preload = "metadata";

      // Attach global click handler to stop others
      handleVideoClick(v);

      item.appendChild(v);
    } else {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "Featured post";
      img.loading = "lazy";
      item.appendChild(img);
    }

    row.appendChild(item);
  });

  const bottom = document.createElement("div");
  bottom.className = "super-separator";

  feed.appendChild(top);
  feed.appendChild(title);
  feed.appendChild(row);
  feed.appendChild(bottom);
}

/* ========================= LOAD MORE POSTS =========================*/
let currentPage = 1;
const postsPerPage = 10;

async function loadMorePosts() {
  if (isLoading) return;
  isLoading = true;

  const loadingIndicator = document.createElement("div");
  loadingIndicator.className = "loading-indicator";
  loadingIndicator.textContent = "Loading more posts...";
  feed.appendChild(loadingIndicator);

  try {
    const repos = await getAllRepos(HOME_USERNAME);
    const sortedRepos = repos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    const startIndex = (currentPage - 1) * postsPerPage;
    const endIndex = startIndex + postsPerPage;
    const reposToLoad = sortedRepos.slice(startIndex, endIndex);

    for (const repo of reposToLoad) {
      const files = await getRepoFiles(HOME_USERNAME, repo.name);
      const posts = groupPosts(files);

      for (const [postName, post] of Object.entries(posts)) {
        renderHomePost(post, postName);
      }
    }

    currentPage++;
    loadingIndicator.remove();
  } catch (error) {
    console.error("Error loading more posts:", error);
    loadingIndicator.textContent = "Error loading posts";
  } finally {
    isLoading = false;
  }
}

/* ========================= INFINITE SCROLL =========================*/
function setupInfiniteScroll() {
  window.addEventListener("scroll", () => {
    if (isLoading) return;

    const scrollPosition = window.innerHeight + window.scrollY;
    const threshold = document.body.offsetHeight - 500;

    if (scrollPosition >= threshold) {
      loadMorePosts();
    }
  });
}

/* ========================= LOAD INITIAL FEED =========================*/
async function loadHomeFeed() {
  try {
    console.log("Starting to load feed...");
    
    // Reset loaded posts tracking
    loadedPosts.clear();
    
    // Clear loading if exists
    const loading = document.querySelector(".see");
    if (loading) loading.style.display = "none";

    // Show initial loading
    feed.innerHTML = '<div class="post"><div class="post-text">Loading posts...</div></div>';

    // Load super posts
    const superRows = await getSuperPosts();
    let superIndex = 0;
    let postCount = 0;

    // Clear feed
    feed.innerHTML = '';

    // Show first super post if available
    if (superRows.length > 0 && superRows[superIndex]) {
      renderSuperRow(superRows[superIndex++]);
    }

    // Load first page of regular posts
    const repos = await getAllRepos(HOME_USERNAME);
    console.log(`Found ${repos.length} repos for ${HOME_USERNAME}`);

    if (repos.length === 0) {
      feed.innerHTML = '<div class="post"><div class="post-text">No posts found</div></div>';
      return;
    }

    // Sort repos by creation date (newest first)
    const sortedRepos = repos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const initialRepos = sortedRepos.slice(0, postsPerPage);

    for (const repo of initialRepos) {
      console.log(`Checking repo: ${repo.name}`);
      const files = await getRepoFiles(HOME_USERNAME, repo.name);
      console.log(`Repo ${repo.name} has ${files.length} files`);
      
      const posts = groupPosts(files);
      console.log(`Grouped into ${Object.keys(posts).length} posts`);

      for (const [postName, post] of Object.entries(posts)) {
        const rendered = renderHomePost(post, postName);
        if (rendered) {
          postCount++;
        }

        // Insert super post after every 5 regular posts
        if (postCount % postsPerSuper === 0 && superRows[superIndex]) {
          renderSuperRow(superRows[superIndex++]);
        }
      }
    }

    // Add remaining super posts at the end
    while (superRows[superIndex]) {
      renderSuperRow(superRows[superIndex++]);
    }

    // Setup infinite scroll
    setupInfiniteScroll();

    // If no posts were rendered
    if (feed.children.length === 0) {
      feed.innerHTML = '<div class="post"><div class="post-text">No posts available yet</div></div>';
    } else {
      console.log(`Total posts rendered: ${feed.children.length}`);
      console.log("Loaded posts:", Array.from(loadedPosts));
    }
  } catch (error) {
    console.error("Error loading feed:", error);
    feed.innerHTML = '<div class="post"><div class="post-text">Error loading posts</div></div>';
  }
}

/* ========================= PULL TO REFRESH =========================*/
let touchStartY = 0;
let touchEndY = 0;

document.addEventListener('touchstart', e => {
  touchStartY = e.touches[0].clientY;
});

document.addEventListener('touchmove', e => {
  touchEndY = e.touches[0].clientY;
});

document.addEventListener('touchend', () => {
  if (touchStartY - touchEndY > 100 && window.scrollY === 0) {
    // Pull down to refresh
    loadedPosts.clear(); // Clear tracking set
    location.reload();
  }
});

/* ========================= NAVIGATION =========================*/
document.addEventListener('DOMContentLoaded', function() {
  console.log("Setting up navigation...");
  
  // Load feed
  loadHomeFeed();
  
  // Notification badge
  const notificationBadge = document.getElementById("badge");
  if (notificationBadge) {
    notificationBadge.addEventListener("click", () => location.href = "notification.html");
    console.log("Notification badge found");
  }

  // Friends icon
  const friendsIcon = document.querySelector(".friends-icon");
  if (friendsIcon) {
    friendsIcon.addEventListener("click", () => {
      console.log("Friends icon clicked");
      if (localStorage.getItem("authUser") && localStorage.getItem("authRepo")) {
        location.href = "cauth.html";
      } else {
        location.href = "index.html";
      }
    });
    friendsIcon.style.cursor = "pointer";
    console.log("Friends icon found");
  }

  // Add button
  const addButton = document.getElementById("add");
  if (addButton) {
    addButton.addEventListener("click", () => {
      console.log("Add button clicked");
      location.href = "option.html";
    });
    console.log("Add button found");
  }

  // Profile icon
  const profileIcon = document.getElementById("profile");
  if (profileIcon) {
    profileIcon.addEventListener("click", () => {
      console.log("Profile icon clicked");
      if (localStorage.getItem("authUser") && localStorage.getItem("authRepo")) {
        location.href = "profile.html";
      } else {
        location.href = "index.html";
      }
    });
    console.log("Profile icon found");
  }

  // Search button
  const searchButton = document.getElementById("search");
  if (searchButton) {
    searchButton.addEventListener("click", () => {
      console.log("Search button clicked");
      location.href = "search.html";
    });
    console.log("Search button found");
  }

  // Reels/Video icon
  const reelsIcon = document.getElementById("reels");
  if (reelsIcon) {
    reelsIcon.addEventListener("click", () => {
      console.log("Reels icon clicked");
      location.href = "cauth.html";
    });
    console.log("Reels icon found");
  }

  // Home button refresh
  const homeButton = document.getElementById("home");
  if (homeButton) {
    homeButton.addEventListener("click", (e) => {
      if (window.location.href.includes("home.html")) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        loadedPosts.clear(); // Clear tracking set
        loadHomeFeed();
      }
    });
  }

  console.log("Navigation setup complete");
});

/* ========================= ERROR HANDLING =========================*/
window.addEventListener('error', function(e) {
  console.error('Global error:', e.error);
});

window.addEventListener('unhandledrejection', function(e) {
  console.error('Unhandled promise rejection:', e.reason);
});

/* ========================= OFFLINE SUPPORT =========================*/
window.addEventListener('online', () => {
  console.log('App is online');
  const offlineMsg = document.querySelector('.offline-message');
  if (offlineMsg) offlineMsg.remove();
});

window.addEventListener('offline', () => {
  console.log('App is offline');
  const offlineMsg = document.createElement('div');
  offlineMsg.className = 'offline-message';
  offlineMsg.textContent = 'You are offline. Some features may not work.';
  document.body.prepend(offlineMsg);
});