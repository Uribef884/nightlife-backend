document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const ticketIdInput = document.getElementById("ticketId");
  const dateInput = document.getElementById("ticketDate");
  const quantityInput = document.getElementById("quantity");
  const menuItemIdInput = document.getElementById("menuItemId");
  const variantIdInput = document.getElementById("variantId");
  const emailInput = document.getElementById("email");
  
  const ticketFields = document.getElementById("ticketFields");
  const menuFields = document.getElementById("menuFields");
  const emailSection = document.getElementById("emailSection");
  const emailStatus = document.getElementById("emailStatus");
  const checkoutStatus = document.getElementById("checkoutStatus");
  
  const output = document.getElementById("output");

  // State
  let currentCartType = "ticket";
  let isLoggedIn = false;
  let currentUser = null;

  // Utility Functions
  function getCartType() {
    return document.querySelector('input[name="cartType"]:checked').value;
  }

  function showStatus(element, message, type = "info") {
    element.textContent = message;
    element.className = `status ${type}`;
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

  async function checkAuthStatus() {
    try {
      const res = await fetch("/auth/me", {
        credentials: "include"
      });
      
      if (res.ok) {
        const userData = await res.json();
        isLoggedIn = true;
        currentUser = userData;
        return true;
      } else {
        isLoggedIn = false;
        currentUser = null;
        return false;
      }
    } catch (err) {
      isLoggedIn = false;
      currentUser = null;
      return false;
    }
  }

  function validateInputs() {
    const type = getCartType();
    const quantity = parseInt(quantityInput.value);
    
    if (!quantity || quantity < 1) {
      showStatus(checkoutStatus, "❌ Quantity must be at least 1", "error");
      return false;
    }

    if (type === "ticket") {
      if (!ticketIdInput.value.trim()) {
        showStatus(checkoutStatus, "❌ Ticket ID is required", "error");
        return false;
      }
      if (!dateInput.value) {
        showStatus(checkoutStatus, "❌ Date is required for tickets", "error");
        return false;
      }
    } else {
      if (!menuItemIdInput.value.trim()) {
        showStatus(checkoutStatus, "❌ Menu Item ID is required", "error");
        return false;
      }
    }

    return true;
  }

  function getPayload() {
    const type = getCartType();
    const quantity = parseInt(quantityInput.value);
    
    if (type === "ticket") {
      return {
        url: "/cart",
        add: { 
          ticketId: ticketIdInput.value.trim(), 
          date: dateInput.value, 
          quantity 
        },
        update: { 
          ticketId: ticketIdInput.value.trim(), 
          date: dateInput.value, 
          quantity 
        },
        remove: { 
          ticketId: ticketIdInput.value.trim(), 
          date: dateInput.value 
        }
      };
    } else {
      return {
        url: "/menu/cart",
        add: {
          menuItemId: menuItemIdInput.value.trim(),
          variantId: variantIdInput.value.trim() || null,
          quantity
        },
        update: {
          menuItemId: menuItemIdInput.value.trim(),
          variantId: variantIdInput.value.trim() || null,
          quantity
        },
        remove: {
          menuItemId: menuItemIdInput.value.trim(),
          variantId: variantIdInput.value.trim() || null
        }
      };
    }
  }

  function updateEmailSection() {
    if (isLoggedIn && currentUser) {
      showStatus(emailStatus, `✅ Logged in as ${currentUser.email}`, "success");
      emailInput.disabled = true;
      emailInput.value = currentUser.email;
    } else {
      showStatus(emailStatus, "ℹ️ Email is required for checkout when not logged in", "info");
      emailInput.disabled = false;
      if (!emailInput.value.trim()) {
        emailInput.value = "";
      }
    }
  }

  function updateCheckoutStatus() {
    const type = getCartType();
    
    if (isLoggedIn) {
      if (type === "ticket") {
        showStatus(checkoutStatus, "✅ Ready for ticket checkout (logged in)", "success");
      } else {
        showStatus(checkoutStatus, "✅ Ready for menu checkout (logged in)", "success");
      }
    } else {
      const hasEmail = emailInput.value.trim() !== "";
      if (!hasEmail) {
        showStatus(checkoutStatus, "❌ Email is required for checkout", "error");
        return;
      }

      if (type === "ticket") {
        showStatus(checkoutStatus, "✅ Ready for ticket checkout", "success");
      } else {
        showStatus(checkoutStatus, "✅ Ready for menu checkout", "success");
      }
    }
  }

  // Event Handlers
  async function handleAddToCart() {
    if (!validateInputs()) return;

    const { url, add } = getPayload();
    
    try {
      showStatus(checkoutStatus, "⏳ Adding to cart...", "info");
      
      const res = await fetch(`${url}/add`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(add),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        logResult(data);
        showStatus(checkoutStatus, "✅ Item added to cart successfully", "success");
      } else {
        logResult(data, true);
        showStatus(checkoutStatus, `❌ Failed to add item: ${data.error || 'Unknown error'}`, "error");
      }
    } catch (err) {
      logResult({ error: err.message }, true);
      showStatus(checkoutStatus, "❌ Network error occurred", "error");
    }
  }

  async function handleViewCart() {
    const { url } = getPayload();
    
    try {
      showStatus(checkoutStatus, "⏳ Loading cart...", "info");
      
      const res = await fetch(url, { 
        credentials: "include" 
      });
      
      const data = await res.json();
      
      if (res.ok) {
        logResult(data);
        showStatus(checkoutStatus, "✅ Cart loaded successfully", "success");
      } else {
        logResult(data, true);
        showStatus(checkoutStatus, `❌ Failed to load cart: ${data.error || 'Unknown error'}`, "error");
      }
    } catch (err) {
      logResult({ error: err.message }, true);
      showStatus(checkoutStatus, "❌ Network error occurred", "error");
    }
  }

  async function handleUpdateItem() {
    if (!validateInputs()) return;

    const { url, update } = getPayload();
    
    try {
      showStatus(checkoutStatus, "⏳ Updating item...", "info");
      
      const res = await fetch(`${url}/update`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        logResult(data);
        showStatus(checkoutStatus, "✅ Item updated successfully", "success");
      } else {
        logResult(data, true);
        showStatus(checkoutStatus, `❌ Failed to update item: ${data.error || 'Unknown error'}`, "error");
      }
    } catch (err) {
      logResult({ error: err.message }, true);
      showStatus(checkoutStatus, "❌ Network error occurred", "error");
    }
  }

  async function handleRemoveItem() {
    const { url, remove } = getPayload();
    
    try {
      showStatus(checkoutStatus, "⏳ Removing item...", "info");
      
      const res = await fetch(`${url}/remove`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(remove),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        logResult(data);
        showStatus(checkoutStatus, "✅ Item removed successfully", "success");
      } else {
        logResult(data, true);
        showStatus(checkoutStatus, `❌ Failed to remove item: ${data.error || 'Unknown error'}`, "error");
      }
    } catch (err) {
      logResult({ error: err.message }, true);
      showStatus(checkoutStatus, "❌ Network error occurred", "error");
    }
  }

  async function handleTicketCheckout() {
    // If logged in, don't send email in body
    const requestBody = isLoggedIn ? {} : { email: emailInput.value.trim() };
    
    if (!isLoggedIn && !requestBody.email) {
      showStatus(checkoutStatus, "❌ Email is required for checkout", "error");
      return;
    }

    try {
      showStatus(checkoutStatus, "⏳ Processing ticket checkout...", "info");
      
      const res = await fetch("/checkout/initiate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        logResult(data);
        showStatus(checkoutStatus, "✅ Ticket checkout completed successfully", "success");
      } else {
        logResult(data, true);
        showStatus(checkoutStatus, `❌ Ticket checkout failed: ${data.error || 'Unknown error'}`, "error");
      }
    } catch (err) {
      logResult({ error: err.message }, true);
      showStatus(checkoutStatus, "❌ Network error occurred", "error");
    }
  }

  async function handleMenuCheckout() {
    // If logged in, don't send email in body
    const requestBody = isLoggedIn ? {} : { email: emailInput.value.trim() };
    
    if (!isLoggedIn && !requestBody.email) {
      showStatus(checkoutStatus, "❌ Email is required for checkout", "error");
      return;
    }

    try {
      showStatus(checkoutStatus, "⏳ Processing menu checkout...", "info");
      
      const res = await fetch("/menu/checkout/initiate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        logResult(data);
        showStatus(checkoutStatus, "✅ Menu checkout completed successfully", "success");
      } else {
        logResult(data, true);
        showStatus(checkoutStatus, `❌ Menu checkout failed: ${data.error || 'Unknown error'}`, "error");
      }
    } catch (err) {
      logResult({ error: err.message }, true);
      showStatus(checkoutStatus, "❌ Network error occurred", "error");
    }
  }

  // Toggle visible input fields based on cart type
  function handleCartTypeChange() {
    const type = getCartType();
    currentCartType = type;
    
    if (type === "ticket") {
      ticketFields.classList.remove("hidden");
      menuFields.classList.add("hidden");
    } else {
      ticketFields.classList.add("hidden");
      menuFields.classList.remove("hidden");
    }
    
    updateCheckoutStatus();
  }

  // Event Listeners
  document.getElementById("addBtn").addEventListener("click", handleAddToCart);
  document.getElementById("viewBtn").addEventListener("click", handleViewCart);
  document.getElementById("updateBtn").addEventListener("click", handleUpdateItem);
  document.getElementById("removeBtn").addEventListener("click", handleRemoveItem);
  document.getElementById("ticketCheckoutBtn").addEventListener("click", handleTicketCheckout);
  document.getElementById("menuCheckoutBtn").addEventListener("click", handleMenuCheckout);

  // Add event listener for return to login
  const returnToLoginBtn = document.getElementById("returnToLoginBtn");
  if (returnToLoginBtn) {
    returnToLoginBtn.addEventListener("click", () => {
      window.location.href = "/test-auth.html";
    });
  }

  // Cart type toggle
  document.querySelectorAll('input[name="cartType"]').forEach(radio => {
    radio.addEventListener("change", handleCartTypeChange);
  });

  // Email input change
  emailInput.addEventListener("input", () => {
    updateEmailSection();
    updateCheckoutStatus();
  });

  // Initialize
  async function initialize() {
    await checkAuthStatus();
    handleCartTypeChange();
    updateEmailSection();
    updateCheckoutStatus();
  }

  initialize();
});
