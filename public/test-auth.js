document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const checkAuthBtn = document.getElementById("checkAuthBtn");
  const goToCartBtn = document.getElementById("goToCartBtn");
  const output = document.getElementById("output");
  const statusMessage = document.getElementById("statusMessage");
  const userInfo = document.getElementById("userInfo");
  const userEmail = document.getElementById("userEmail");
  const userRole = document.getElementById("userRole");
  const userId = document.getElementById("userId");
  const userClubId = document.getElementById("userClubId");

  // State
  let currentUser = null;
  let isLoggedIn = false;

  // Utility Functions
  function showStatus(message, type = "info") {
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
  }

  function logResult(data, isError = false) {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = isError ? "❌ ERROR" : "✅ SUCCESS";
    const logEntry = `[${timestamp}] ${prefix}:\n${JSON.stringify(data, null, 2)}\n\n`;
    
    output.textContent = logEntry + output.textContent;
    
    // Keep only last 10 entries
    const lines = output.textContent.split('\n');
    if (lines.length > 50) {
      output.textContent = lines.slice(0, 50).join('\n');
    }
  }

  function updateUserDisplay() {
    if (isLoggedIn && currentUser) {
      userEmail.textContent = currentUser.email || "-";
      userRole.textContent = currentUser.role || "-";
      userId.textContent = currentUser.id || "-";
      userClubId.textContent = currentUser.clubId || "-";
      userInfo.classList.remove("hidden");
      showStatus("✅ Logged in successfully", "success");
    } else {
      userInfo.classList.add("hidden");
      showStatus("👤 Browsing as guest (anonymous)", "info");
    }
  }

  async function checkAuthStatus() {
    try {
      showStatus("⏳ Checking authentication status...", "info");
      
      const res = await fetch("/auth/me", {
        credentials: "include"
      });
      
      if (res.ok) {
        const userData = await res.json();
        isLoggedIn = true;
        currentUser = userData;
        updateUserDisplay();
        logResult(userData);
        return true;
      } else {
        isLoggedIn = false;
        currentUser = null;
        updateUserDisplay();
        logResult({ error: "Not authenticated" }, true);
        return false;
      }
    } catch (err) {
      isLoggedIn = false;
      currentUser = null;
      updateUserDisplay();
      logResult({ error: err.message }, true);
      showStatus("❌ Error checking auth status", "error");
      return false;
    }
  }

  // Event Handlers
  async function handleLogin() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showStatus("❌ Please enter both email and password", "error");
      return;
    }

    try {
      showStatus("⏳ Logging in...", "info");
      
      const res = await fetch("/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      
      if (res.ok) {
        isLoggedIn = true;
        currentUser = data.user;
        updateUserDisplay();
        logResult(data);
        showStatus("✅ Login successful", "success");
        
        // Clear form
        emailInput.value = "";
        passwordInput.value = "";
      } else {
        logResult(data, true);
        showStatus(`❌ Login failed: ${data.error || 'Unknown error'}`, "error");
      }
    } catch (err) {
      logResult({ error: err.message }, true);
      showStatus("❌ Network error occurred", "error");
    }
  }

  async function handleLogout() {
    try {
      showStatus("⏳ Logging out...", "info");
      
      const res = await fetch("/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      const data = await res.json();
      
      if (res.ok) {
        isLoggedIn = false;
        currentUser = null;
        updateUserDisplay();
        logResult(data);
        showStatus("✅ Logout successful", "success");
      } else {
        logResult(data, true);
        showStatus(`❌ Logout failed: ${data.error || 'Unknown error'}`, "error");
      }
    } catch (err) {
      logResult({ error: err.message }, true);
      showStatus("❌ Network error occurred", "error");
    }
  }

  function handleGoToCart() {
    // Always allow redirect to cart, even if not logged in
    window.location.href = "/test-cart.html";
  }

  // Event Listeners
  loginBtn.addEventListener("click", handleLogin);
  logoutBtn.addEventListener("click", handleLogout);
  checkAuthBtn.addEventListener("click", checkAuthStatus);
  goToCartBtn.addEventListener("click", handleGoToCart);

  // Enter key support for login
  passwordInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  });

  // Initialize
  checkAuthStatus();
});
