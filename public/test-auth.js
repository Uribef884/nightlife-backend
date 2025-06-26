document.addEventListener("DOMContentLoaded", () => {
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const loginBtn = document.getElementById("loginBtn");
  const authBtn = document.getElementById("authBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const output = document.getElementById("output");

  function logResult(res) {
    output.textContent = JSON.stringify(res, null, 2);
  }

  loginBtn.addEventListener("click", async () => {
    const email = emailInput.value;
    const password = passwordInput.value;

    const res = await fetch("/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    logResult(data);
  });

  authBtn.addEventListener("click", async () => {
    const res = await fetch("/auth/protected", {
      credentials: "include",
    });
    const data = await res.json();
    logResult(data);
  });

  logoutBtn.addEventListener("click", async () => {
    const res = await fetch("/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    const data = await res.json();
    logResult(data);
  });
});
