console.log('🚀 Script starting...');

// Add global error handler
window.addEventListener('error', (e) => {
  console.error('🚨 Global error caught:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('🚨 Unhandled promise rejection:', e.reason);
});

document.addEventListener("DOMContentLoaded", () => {
  console.log('📄 DOM Content Loaded event fired');
  // DOM Elements
  const emailInput = document.getElementById("email");
  const emailSection = document.getElementById("emailSection");
  const emailStatus = document.getElementById("emailStatus");
  const checkoutStatus = document.getElementById("checkoutStatus");
  
  const output = document.getElementById("output");
  const cartItemsContainer = document.getElementById("cartItemsContainer");
  const cartItemCount = document.getElementById("cartItemCount");
  const cartTotal = document.getElementById("cartTotal");

  // State
  let isLoggedIn = false;
  let currentUser = null;
  let cartItems = [];
  let clubs = [];
  
  // Initialize cart summaries
  window.cartSummaries = { ticket: null, menu: null };

  // Additional DOM elements for club functionality
  const clubSelector = document.getElementById('clubSelector');
  const loadClubBtn = document.getElementById('loadClubBtn');
  const clubContent = document.getElementById('clubContent');
  const clubName = document.getElementById('clubName');
  const clubAddress = document.getElementById('clubAddress');
  const ticketsList = document.getElementById('ticketsList');
  const menuItemsList = document.getElementById('menuItemsList');
  const eventsList = document.getElementById('eventsList');
  const viewBtn = document.getElementById('viewBtn');
  const clearBtn = document.getElementById('clearBtn');
  const ticketCheckoutBtn = document.getElementById('ticketCheckoutBtn');
  const menuCheckoutBtn = document.getElementById('menuCheckoutBtn');
  const returnToLoginBtn = document.getElementById('returnToLoginBtn');

  // Utility Functions
  function getCartType() {
    // Since we no longer have radio buttons, we'll determine cart type from cart items
    const hasTickets = cartItems.some(item => item.type === 'ticket');
    const hasMenuItems = cartItems.some(item => item.type === 'menu');
    
    if (hasTickets && hasMenuItems) {
      return 'mixed';
    } else if (hasTickets) {
      return 'ticket';
    } else if (hasMenuItems) {
      return 'menu';
    } else {
      return 'empty';
    }
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

  function formatPrice(price) {
    return `$${Number(price).toFixed(2)}`;
  }

  // Gateway fees calculation (matching backend logic exactly)
  function calculateGatewayFees(basePrice) {
    const fixed = 700; // Fixed fee in COP
    const variable = basePrice * 0.0265; // Variable fee 2.65% of the base price
    const subtotal = fixed + variable;
    const iva = subtotal * 0.19; // IVA 19% on the subtotal

    return {
      totalGatewayFee: Math.round(subtotal * 100) / 100,
      iva: Math.round(iva * 100) / 100,
    };
  }



  function renderPrice(basePrice, dynamicPrice) {
    if (dynamicPrice !== undefined && dynamicPrice !== null && Number(dynamicPrice) !== Number(basePrice)) {
      return `
        <div class="price-display">
          <div class="base-price">${formatPrice(basePrice)}</div>
          <div class="dynamic-price">${formatPrice(dynamicPrice)}</div>
        </div>
      `;
    } else {
      return `<div class="no-discount">${formatPrice(basePrice)}</div>`;
    }
  }

  function renderTotalPrice(basePrice, dynamicPrice, quantity) {
    const baseTotal = basePrice * quantity;
    const dynamicTotal = dynamicPrice * quantity;
    
    if (dynamicPrice !== undefined && dynamicPrice !== null && Number(dynamicPrice) !== Number(basePrice)) {
      return `
        <div class="price-display">
          <div class="base-price">${formatPrice(baseTotal)}</div>
          <div class="dynamic-price">${formatPrice(dynamicTotal)}</div>
        </div>
      `;
    } else {
      return `<div class="no-discount">${formatPrice(baseTotal)}</div>`;
    }
  }

  function updateCartDisplay() {
    if (cartItems.length === 0) {
      cartItemsContainer.innerHTML = '<div class="empty-cart">Your cart is empty. Add some items to get started!</div>';
      cartItemCount.textContent = '0 items';
      cartTotal.textContent = 'Total: $0.00';
      return;
    }

    let totalAmount = 0;
    let totalItems = 0;

    const header = `
      <div class="cart-item-header">
        <div>Item</div>
        <div>Type/Variant</div>
        <div>Qty</div>
        <div>Price</div>
        <div>Actions</div>
      </div>
    `;

    const items = cartItems.map(item => {
      // Use dynamic price if available, otherwise use base price
      // For menu items with variants, override basePrice with variant price
      const basePrice = item.type === 'menu' && item.variant?.price !== undefined
        ? item.variant.price
        : item.price;

      // Use dynamic price if available
      const itemPrice = item.dynamicPrice !== undefined && item.dynamicPrice !== null
        ? item.dynamicPrice
        : basePrice;
      const itemTotal = itemPrice * item.quantity;
      totalAmount += itemTotal;
      totalItems += item.quantity;

      let linkedItemsHtml = '';
      
      // Display linked menu items if this is a ticket with includesMenuItem
      if (item.type === 'ticket' && item.menuItems && item.menuItems.length > 0) {
        linkedItemsHtml = `
          <div class="linked-items">
            <div class="linked-items-header">🍽️ Included Items:</div>
            ${item.menuItems.map(menuItem => `
              <div class="linked-item">
                <span class="linked-item-name">${menuItem.menuItemName}</span>
                ${menuItem.variantName ? `<span class="linked-item-variant">(${menuItem.variantName})</span>` : ''}
                <span class="linked-item-quantity">x${menuItem.quantity}</span>
              </div>
            `).join('')}
          </div>
        `;
      }

      // Determine item type display
      let typeDisplay = item.type === 'ticket' ? '🎫' : '🍽️';
      let typeText = item.type === 'ticket' ? 'Ticket' : 'Menu';
      
      // For menu items with variants, show variant information
      if (item.type === 'menu' && item.variant) {
        typeDisplay = '🍾'; // Bottle icon for variants
        typeText = `Variant: ${item.variant.name} (ID: ${item.variantId})`;
      } else if (item.type === 'menu' && item.hasVariants && !item.variant) {
        typeDisplay = '🍽️';
        typeText = 'Menu (No Variant)';
      }

      // Generate price breakdown HTML if available
      let priceBreakdownHtml = '';
      if (item.priceBreakdown) {
        const breakdown = item.priceBreakdown;
        priceBreakdownHtml = `
          <div class="price-breakdown" style="display: none;">
            <div class="breakdown-header">
              <h4>💰 Price Breakdown</h4>
              <button class="toggle-breakdown" data-item-id="${item.id}">📊 Show Details</button>
            </div>
            <div class="breakdown-content">
              <div class="breakdown-row">
                <span>Item Price:</span>
                <span>${formatPrice(breakdown.itemPrice)}</span>
              </div>
              <div class="breakdown-row">
                <span>Quantity:</span>
                <span>${item.quantity}</span>
              </div>
              <div class="breakdown-row">
                <span>Item Total:</span>
                <span>${formatPrice(breakdown.itemTotal)}</span>
              </div>
              <div class="breakdown-row breakdown-fee">
                <span>Platform Fee (${(breakdown.platformFeeRate * 100).toFixed(1)}%):</span>
                <span>${formatPrice(breakdown.platformFee)}</span>
              </div>
              <div class="breakdown-row breakdown-total">
                <span><strong>Operation Cost:</strong></span>
                <span><strong>${formatPrice(breakdown.operationCost)}</strong></span>
              </div>
            </div>
          </div>
        `;
      }

      return `
        <div class="cart-item" data-item-id="${item.id}" data-item-type="${item.type}">
          <div class="item-name">${item.name || item.id}</div>
          <div class="item-type ${item.type}" title="${typeText}">
            ${typeDisplay}
            ${item.type === 'menu' && item.variant ? `<br><small>${item.variant.name}</small>` : ''}
          </div>
          <div class="item-quantity">
            <div class="quantity-controls">
              <button class="quantity-btn minus-btn" data-action="decrease" data-item-id="${item.id}" data-current-qty="${item.quantity}" ${item.quantity <= 1 ? 'disabled' : ''}>-</button>
              <span class="quantity-display">${item.quantity}</span>
              <button class="quantity-btn plus-btn" data-action="increase" data-item-id="${item.id}" data-current-qty="${item.quantity}">+</button>
            </div> 
          </div>
          <div class="item-price">${renderTotalPrice(item.variant?.price ?? item.price, itemPrice, item.quantity)}</div>
          <div class="item-controls">
            <button class="delete-btn" data-action="delete" data-item-id="${item.id}" title="Remove item">🗑️</button>
          </div>
        </div>
        ${linkedItemsHtml}
        ${priceBreakdownHtml}
      `;
    }).join('');

    // Use cart summaries from backend if available
    let totalProductCost = 0;
    let totalOperationCost = 0;
    let finalTotal = 0;

    if (window.cartSummaries && (window.cartSummaries.ticket || window.cartSummaries.menu)) {
      // Use whichever summary has items (only one can have items due to exclusivity)
      if (window.cartSummaries.ticket && window.cartSummaries.ticket.total > 0) {
        totalProductCost += window.cartSummaries.ticket.total;
        totalOperationCost += window.cartSummaries.ticket.operationalCosts;
        finalTotal += window.cartSummaries.ticket.actualTotal;
      } else if (window.cartSummaries.menu && window.cartSummaries.menu.total > 0) {
        totalProductCost += window.cartSummaries.menu.total;
        totalOperationCost += window.cartSummaries.menu.operationalCosts;
        finalTotal += window.cartSummaries.menu.actualTotal;
      } else {
        // Both summaries are empty, use whichever exists for proper structure
        if (window.cartSummaries.ticket) {
          totalProductCost += window.cartSummaries.ticket.total;
          totalOperationCost += window.cartSummaries.ticket.operationalCosts;
          finalTotal += window.cartSummaries.ticket.actualTotal;
        } else if (window.cartSummaries.menu) {
          totalProductCost += window.cartSummaries.menu.total;
          totalOperationCost += window.cartSummaries.menu.operationalCosts;
          finalTotal += window.cartSummaries.menu.actualTotal;
        }
      }
    } else {
      // Fallback to frontend calculation
      cartItems.forEach(item => {
        if (item.priceBreakdown) {
          totalProductCost += item.priceBreakdown.itemTotal;
          totalOperationCost += item.priceBreakdown.operationCost;
        } else {
          const itemTotal = (item.dynamicPrice || item.price) * item.quantity;
          totalProductCost += itemTotal;
        }
      });
      finalTotal = totalProductCost + totalOperationCost;
      console.log('⚠️ Using frontend calculation (no backend summaries available)');
    }
    
    console.log(`🛒 [FRONTEND-CART] TOTALS:`);
    console.log(`   Total Product Cost: ${totalProductCost}`);
    console.log(`   Total Operation Cost: ${totalOperationCost}`);
    console.log(`   Final Total: ${finalTotal}`);
    console.log(`   ========================================`);

    const total = `
      <div class="price-breakdown-total">
        <h3>Total cost</h3>
        <div class="breakdown-table">
          <div class="breakdown-row">
            <span>Product costs:</span>
            <span>${formatPrice(totalProductCost)}</span>
          </div>
          <div class="breakdown-row">
            <span>Service fee:</span>
            <span>${formatPrice(totalOperationCost)}</span>
          </div>
          <div class="breakdown-row breakdown-total">
            <span>Total:</span>
            <span>${formatPrice(finalTotal)}</span>
          </div>
        </div>
      </div>
    `;

    cartItemsContainer.innerHTML = header + items + total;
    cartItemCount.textContent = `${totalItems} items`;
    cartTotal.textContent = ``;
    
    // Add event listeners for cart item controls
    addCartItemEventListeners();
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

  // These functions are no longer needed with the new club-based approach
  // Items are added directly via addTicketToCart and addMenuItemToCart functions

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
    
    if (type === 'empty') {
      showStatus(checkoutStatus, "ℹ️ Add items to cart to enable checkout", "info");
      ticketCheckoutBtn.disabled = true;
      menuCheckoutBtn.disabled = true;
      return;
    }
    
    if (type === 'mixed') {
      showStatus(checkoutStatus, "⚠️ Mixed cart: You have both tickets and menu items. Use Ticket Checkout for tickets.", "error");
      ticketCheckoutBtn.disabled = false;
      menuCheckoutBtn.disabled = true;
      return;
    }
    
    if (!isLoggedIn) {
      const hasEmail = emailInput.value.trim() !== "";
      if (!hasEmail) {
        showStatus(checkoutStatus, "❌ Email is required for checkout when not logged in", "error");
        ticketCheckoutBtn.disabled = true;
        menuCheckoutBtn.disabled = true;
        return;
      }
      }

      if (type === "ticket") {
        showStatus(checkoutStatus, "✅ Ready for ticket checkout", "success");
      ticketCheckoutBtn.disabled = false;
      menuCheckoutBtn.disabled = true;
    } else if (type === "menu") {
        showStatus(checkoutStatus, "✅ Ready for menu checkout", "success");
      ticketCheckoutBtn.disabled = true;
      menuCheckoutBtn.disabled = false;
    }
  }

  // Event Handlers
  // handleAddToCart is no longer needed - items are added via addTicketToCart and addMenuItemToCart

  async function handleViewCart() {
    try {
      showStatus(checkoutStatus, "⏳ Loading cart...", "info");
      
      // Check both ticket and menu carts (items and summaries)
      const [ticketRes, menuRes, ticketSummaryRes, menuSummaryRes] = await Promise.all([
        fetch('/cart', { credentials: "include" }),
        fetch('/menu/cart', { credentials: "include" }),
        fetch('/cart/summary', { credentials: "include" }),
        fetch('/menu/cart/summary', { credentials: "include" })
      ]);
      
      let ticketData = [];
      let menuData = [];
      let ticketSummary = null;
      let menuSummary = null;
      
      if (ticketRes.ok) {
        const ticketResponse = await ticketRes.json();
        ticketData = Array.isArray(ticketResponse) ? ticketResponse : [];
      }
      
      if (menuRes.ok) {
        const menuResponse = await menuRes.json();
        menuData = Array.isArray(menuResponse) ? menuResponse : [];
      }
      
      if (ticketSummaryRes.ok) {
        ticketSummary = await ticketSummaryRes.json();
      }
      
      if (menuSummaryRes.ok) {
        menuSummary = await menuSummaryRes.json();
      }
      
      // Combine both cart types
      const allCartItems = [];
      
      // Process ticket items
      ticketData.forEach(item => {
            if (item.ticket) {
          allCartItems.push({
            id: item.id,
            ticketId: item.ticketId || item.ticket.id,
                name: item.ticket.name || `Ticket ${item.ticketId || item.ticket.id}`,
                type: 'ticket',
                quantity: item.quantity || 1,
                price: item.ticket.price || 0,
                dynamicPrice: item.ticket.dynamicPrice,
            date: item.date,
            menuItems: item.menuItems || [],
            priceBreakdown: item.priceBreakdown || null
          });
        } else {
          // Handle flat ticket structure
          allCartItems.push({
            id: item.id,
            ticketId: item.ticketId,
            name: item.name || item.ticketName || `Ticket ${item.id}`,
            type: 'ticket',
            quantity: item.quantity || 1,
            price: item.price || 0,
            dynamicPrice: item.dynamicPrice,
                date: item.date,
                priceBreakdown: item.priceBreakdown || null
          });
        }
      });
      
      // Process menu items
      menuData.forEach(item => {
        if (item.menuItem) {
          allCartItems.push({
            id: item.id,
            menuItemId: item.menuItemId || item.menuItem.id,
            name: item.menuItem.name || `Menu Item ${item.menuItemId || item.menuItem.id}`,
            type: 'menu',
            quantity: item.quantity || 1,
            price: item.menuItem.price || 0,
            dynamicPrice: item.menuItem.dynamicPrice,
            // Add variant information
            variantId: item.variantId,
            variant: item.variant,
            hasVariants: item.menuItem.hasVariants,
            priceBreakdown: item.priceBreakdown || null
          });
        } else {
          // Handle flat menu structure
          allCartItems.push({
            id: item.id,
            menuItemId: item.menuItemId,
            name: item.name || item.menuItemName || `Menu Item ${item.id}`,
            type: 'menu',
            quantity: item.quantity || 1,
            price: item.price || 0,
            dynamicPrice: item.dynamicPrice,
            // Add variant information if available
            variantId: item.variantId,
            variant: item.variant,
            hasVariants: item.hasVariants,
            priceBreakdown: item.priceBreakdown || null
          });
        }
      });
      
      cartItems = allCartItems;
      
      // Store cart summaries for use in display
      window.cartSummaries = {
        ticket: ticketSummary,
        menu: menuSummary
      };
      
      logResult({ ticketItems: ticketData.length, menuItems: menuData.length, totalItems: cartItems.length });
      showStatus(checkoutStatus, "✅ Cart loaded successfully", "success");
        
        // Force update the cart display
        updateCartDisplay();
    } catch (err) {
      logResult({ error: 'Failed to load cart', details: err.message }, true);
      showStatus(checkoutStatus, `❌ Failed to load cart: ${err.message}`, "error");
      // Clear cart display on error
      cartItems = [];
      window.cartSummaries = { ticket: null, menu: null };
      updateCartDisplay();
    }
  }

  // handleUpdateItem and handleRemoveItem are no longer needed - cart operations are handled via event delegation

  async function handleClearCart() {
    try {
      showStatus(checkoutStatus, "⏳ Clearing cart...", "info");
      
      // Clear both ticket and menu carts
      const ticketRes = await fetch('/cart/clear', {
        method: "DELETE",
        credentials: "include"
      });
      
      const menuRes = await fetch('/menu/cart/clear', {
        method: "DELETE",
        credentials: "include"
      });
      
      // Check if either cart was cleared successfully
      if (ticketRes.ok || menuRes.ok) {
        logResult({ message: "Cart cleared successfully" });
        showStatus(checkoutStatus, "✅ Cart cleared successfully", "success");
        // Clear cart display and summaries
        cartItems = [];
        window.cartSummaries = { ticket: null, menu: null };
        updateCartDisplay();
        updateCheckoutStatus();
      } else {
        logResult({ error: "Failed to clear cart" }, true);
        showStatus(checkoutStatus, "❌ Failed to clear cart", "error");
      }
    } catch (err) {
      logResult({ error: err.message }, true);
      showStatus(checkoutStatus, "❌ Network error occurred", "error");
    }
  }

  async function handleTicketCheckout() {
    console.log('🎫 Ticket checkout button clicked!');
    
    // If logged in, don't send email in body
    const requestBody = isLoggedIn ? {} : { email: emailInput.value.trim() };
    
    if (!isLoggedIn && !requestBody.email) {
      showStatus(checkoutStatus, "❌ Email is required for checkout", "error");
      return;
    }

    try {
      showStatus(checkoutStatus, "⏳ Processing ticket checkout...", "info");
      
      // Step 1: Initiate checkout
      const res = await fetch("/checkout/initiate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        if (data.transactionId) {
          // Paid checkout - proceed with confirmation
          logResult({ message: 'Ticket checkout initiated', data });
          showStatus(checkoutStatus, "⏳ Confirming ticket transaction...", "info");
          
          // Step 2: Confirm checkout
          const confirmRes = await fetch("/checkout/confirm", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...requestBody,
              transactionId: data.transactionId
            }),
          });
          
          const confirmData = await confirmRes.json();
          
          if (confirmRes.ok) {
            logResult(confirmData);
            showStatus(checkoutStatus, "✅ Ticket checkout completed successfully", "success");
          } else {
            logResult(confirmData, true);
            showStatus(checkoutStatus, `❌ Ticket checkout confirmation failed: ${confirmData.error || 'Unknown error'}`, "error");
          }
        } else {
          // Free checkout - already completed
          logResult(data);
          showStatus(checkoutStatus, "✅ Free ticket checkout completed successfully", "success");
        }
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
    console.log('🍽️ Menu checkout button clicked!');
    
    // If logged in, don't send email in body
    const requestBody = isLoggedIn ? {} : { email: emailInput.value.trim() };
    
    if (!isLoggedIn && !requestBody.email) {
      showStatus(checkoutStatus, "❌ Email is required for checkout", "error");
      return;
    }

    try {
      showStatus(checkoutStatus, "⏳ Processing menu checkout...", "info");
      
      // Step 1: Initiate checkout
      const res = await fetch("/menu/checkout/initiate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        if (data.transactionId) {
          // Paid checkout - proceed with confirmation
          logResult({ message: 'Menu checkout initiated', data });
          showStatus(checkoutStatus, "⏳ Confirming menu transaction...", "info");
          
          // Step 2: Confirm checkout
          const confirmRes = await fetch("/menu/checkout/confirm", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...requestBody,
              transactionId: data.transactionId
            }),
          });
          
          const confirmData = await confirmRes.json();
          
          if (confirmRes.ok) {
            logResult(confirmData);
            showStatus(checkoutStatus, "✅ Menu checkout completed successfully", "success");
          } else {
            logResult(confirmData, true);
            showStatus(checkoutStatus, `❌ Menu checkout confirmation failed: ${confirmData.error || 'Unknown error'}`, "error");
          }
        } else {
          // Free checkout - already completed
          logResult(data);
          showStatus(checkoutStatus, "✅ Free menu checkout completed successfully", "success");
        }
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
  // handleCartTypeChange is no longer needed - cart type is determined from cart contents

  // Add event listeners for cart item controls
  function addCartItemEventListeners() {
    // Remove existing listeners to prevent duplicates
    cartItemsContainer.removeEventListener('click', handleCartItemClick);
    
    // Add event listener for all cart item controls
    cartItemsContainer.addEventListener('click', handleCartItemClick);
  }

  // Handle cart item button clicks
  function handleCartItemClick(event) {
    const button = event.target.closest('button');
    if (!button) return;

    const action = button.dataset.action;
    
    if (!action) return;

    console.log('Button clicked:', action, button.dataset);

    switch (action) {
      case 'increase':
        const itemId = button.dataset.itemId;
        const currentQty = parseInt(button.dataset.currentQty);
        updateItemQuantity(itemId, currentQty + 1);
        break;
      case 'decrease':
        const itemIdDec = button.dataset.itemId;
        const currentQtyDec = parseInt(button.dataset.currentQty);
        updateItemQuantity(itemIdDec, currentQtyDec - 1);
        break;
      case 'delete':
        const itemIdDel = button.dataset.itemId;
        removeCartItem(itemIdDel);
        break;
      case 'add-ticket':
        const ticketId = button.dataset.ticketId;
        const ticketName = button.dataset.ticketName;
        const ticketPrice = parseFloat(button.dataset.ticketPrice);
        const ticketDynamicPrice = parseFloat(button.dataset.ticketDynamicPrice);
        const ticketCategory = button.dataset.ticketCategory;
        const eventDate = button.dataset.eventDate;
        const availableDate = button.dataset.availableDate;
        
        // For free tickets, use their availableDate. For event tickets, use the event's available date. For normal tickets, show date picker
        if (ticketCategory === 'free' && availableDate) {
          addTicketToCart(ticketId, ticketName, ticketPrice, ticketDynamicPrice, availableDate);
        } else if (ticketCategory === 'event') {
          addTicketToCart(ticketId, ticketName, ticketPrice, ticketDynamicPrice, eventDate);
        } else {
          showDatePickerForTicket(ticketId, ticketName, ticketPrice, ticketDynamicPrice);
        }
        break;
      case 'add-menu-item':
        const menuItemId = button.dataset.menuItemId;
        const menuItemName = button.dataset.menuItemName;
        const menuItemPrice = parseFloat(button.dataset.menuItemPrice);
        const menuItemDynamicPrice = parseFloat(button.dataset.menuItemDynamicPrice);
        addMenuItemToCart(menuItemId, null, menuItemName, menuItemPrice, menuItemDynamicPrice);
        break;
      case 'add-menu-item-variant':
        const menuItemIdVar = button.dataset.menuItemId;
        const variantId = button.dataset.variantId;
        const menuItemNameVar = button.dataset.menuItemName;
        const variantPrice = parseFloat(button.dataset.variantPrice);
        const variantDynamicPrice = parseFloat(button.dataset.variantDynamicPrice);
        addMenuItemToCart(menuItemIdVar, variantId, menuItemNameVar, variantPrice, variantDynamicPrice);
        break;
      case 'toggle-breakdown':
        const breakdownItemId = button.dataset.itemId;
        togglePriceBreakdown(breakdownItemId, button);
        break;
    }
  }

  // Toggle price breakdown visibility
  function togglePriceBreakdown(itemId, button) {
    const cartItem = document.querySelector(`[data-item-id="${itemId}"]`);
    if (!cartItem) return;
    
    const breakdown = cartItem.nextElementSibling;
    if (!breakdown || !breakdown.classList.contains('price-breakdown')) return;
    
    const content = breakdown.querySelector('.breakdown-content');
    const isVisible = content.style.display !== 'none';
    
    if (isVisible) {
      content.style.display = 'none';
      button.textContent = '📊 Show Details';
    } else {
      content.style.display = 'block';
      button.textContent = '📊 Hide Details';
    }
  }

  // Cart item control functions
  async function updateItemQuantity(itemId, newQuantity) {
    console.log('updateItemQuantity called with:', itemId, newQuantity);
    
    if (newQuantity <= 0) {
      await window.removeCartItem(itemId);
      return;
    }

    // Find the item in cartItems to determine its type
    const item = cartItems.find(item => item.id === itemId);
    if (!item) {
      console.error('Item not found:', itemId, 'Available items:', cartItems);
      showStatus(checkoutStatus, "❌ Item not found in cart", "error");
      return;
    }

    const itemType = item.type;
    console.log('Item type:', itemType, 'Item:', item);
    
    try {
      showStatus(checkoutStatus, "⏳ Updating quantity...", "info");
      
      let url, payload;
      if (itemType === "ticket") {
        // Ticket cart: id goes in request body
        url = "/cart/update";
        payload = {
          id: itemId,
          quantity: newQuantity
        };
      } else {
        // Menu cart: id goes in request body (same as ticket cart)
        url = `/menu/cart/update`;
        payload = {
          id: itemId,
          quantity: newQuantity
        };
      }
      
      console.log('Making request to:', url, 'with payload:', payload);
      
      const res = await fetch(url, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        logResult(data);
        showStatus(checkoutStatus, "✅ Quantity updated successfully", "success");
        
        // Refresh the entire cart to get updated price breakdown
        setTimeout(() => handleViewCart(), 100);
      } else {
        logResult(data, true);
        showStatus(checkoutStatus, `❌ Failed to update quantity: ${data.error || 'Unknown error'}`, "error");
      }
    } catch (err) {
      console.error('Error in updateItemQuantity:', err);
      logResult({ error: err.message }, true);
      showStatus(checkoutStatus, "❌ Network error occurred", "error");
    }
  };

  async function removeCartItem(itemId) {
    console.log('removeCartItem called with:', itemId);
    
    // Find the item in cartItems to determine its type
    const item = cartItems.find(item => item.id === itemId);
    if (!item) {
      console.error('Item not found for removal:', itemId, 'Available items:', cartItems);
      showStatus(checkoutStatus, "❌ Item not found in cart", "error");
      return;
    }

    const itemType = item.type;
    console.log('Removing item type:', itemType, 'Item:', item);
    
    try {
      showStatus(checkoutStatus, "⏳ Removing item...", "info");
      
      let url;
      if (itemType === "ticket") {
        url = `/cart/item/${itemId}`;
      } else {
        url = `/menu/cart/item/${itemId}`;
      }
      
      console.log('Making DELETE request to:', url);
      
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include"
      });
      
      if (res.ok) {
        logResult({ message: "Item removed successfully" });
        showStatus(checkoutStatus, "✅ Item removed successfully", "success");
        // Refresh cart display
        setTimeout(() => handleViewCart(), 100);
      } else {
        let data = {};
        try {
          data = await res.json();
        } catch (e) {
          data = { error: "Failed to parse response" };
        }
        logResult(data, true);
        showStatus(checkoutStatus, `❌ Failed to remove item: ${data.error || 'Unknown error'}`, "error");
      }
    } catch (err) {
      console.error('Error in removeCartItem:', err);
      logResult({ error: err.message }, true);
      showStatus(checkoutStatus, "❌ Network error occurred", "error");
    }
  };

  // Load clubs for the dropdown
  async function loadClubs() {
    try {
      const res = await fetch('/clubs');
      if (res.ok) {
        clubs = await res.json();
        
        // Populate club selector
        clubSelector.innerHTML = '<option value="">Select a club...</option>';
        clubs.forEach(club => {
          const option = document.createElement('option');
          option.value = club.id;
          option.textContent = club.name;
          clubSelector.appendChild(option);
        });
        
        logResult({ message: 'Clubs loaded successfully', count: clubs.length });
      } else {
        throw new Error(`Failed to load clubs: ${res.status}`);
      }
    } catch (err) {
      logResult({ error: 'Failed to load clubs', details: err.message }, true);
    }
  }

  // Load club details and display tickets, menu items, and events
  async function loadClubDetails() {
    const clubId = clubSelector.value;
    if (!clubId) {
      showStatus(checkoutStatus, "❌ Please select a club first", "error");
      return;
    }

    try {
      // Show loading state
      clubContent.classList.remove('hidden');
      ticketsList.innerHTML = '<div class="loading">Loading tickets...</div>';
      menuItemsList.innerHTML = '<div class="loading">Loading menu items...</div>';
      eventsList.innerHTML = '<div class="loading">Loading events...</div>';

      // Load club details
      const club = clubs.find(c => c.id === clubId);
      if (club) {
        clubName.textContent = club.name;
        clubAddress.textContent = club.address;
      }

      // Load tickets
      const ticketsRes = await fetch(`/tickets/club/${clubId}`);
      if (ticketsRes.ok) {
        const ticketsData = await ticketsRes.json();
        renderTickets(ticketsData.tickets || ticketsData);
      } else {
        ticketsList.innerHTML = '<div class="no-items">Failed to load tickets</div>';
      }

      // Load menu items
      const menuRes = await fetch(`/menu/items/club/${clubId}/public`);
      
      if (menuRes.ok) {
        const menuData = await menuRes.json();
        renderMenuItems(menuData);
      } else {
        // Try alternative endpoint
        const menuRes2 = await fetch(`/menu/items/club/${clubId}`);
        
        if (menuRes2.ok) {
          const menuData = await menuRes2.json();
          renderMenuItems(menuData);
        } else {
          menuItemsList.innerHTML = '<div class="no-items">Failed to load menu items</div>';
        }
      }

      // Load events
      const eventsRes = await fetch(`/events/club/${clubId}`);
      if (eventsRes.ok) {
        const events = await eventsRes.json();
        renderEvents(events);
      } else {
        eventsList.innerHTML = '<div class="no-items">Failed to load events</div>';
      }

      logResult({ message: 'Club details loaded successfully', clubId });
    } catch (err) {
      logResult({ error: 'Failed to load club details', details: err.message }, true);
      showStatus(checkoutStatus, "❌ Failed to load club details", "error");
    }
  }

  // Render tickets with "Add to Cart" buttons
  function renderTickets(tickets) {
    if (!tickets || tickets.length === 0) {
      ticketsList.innerHTML = '<div class="no-items">No tickets available</div>';
      return;
    }

    // Filter out event tickets (they will be shown in events section)
    const normalTickets = tickets.filter(ticket => ticket.category !== 'event');
    
    if (normalTickets.length === 0) {
      ticketsList.innerHTML = '<div class="no-items">No regular tickets available</div>';
      return;
    }

    const ticketsHtml = normalTickets.map(ticket => {
      const priceDisplay = renderPrice(ticket.price, ticket.dynamicPrice);
      const soldOut = ticket.soldOut ? 'disabled' : '';
      const soldOutText = ticket.soldOut ? ' (Sold Out)' : '';
      
      // Show available date for free tickets
      let dateInfo = '';
      if (ticket.category === 'free' && ticket.availableDate) {
        const date = new Date(ticket.availableDate);
        const formattedDate = date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
        dateInfo = `<div style="color: #28a745; font-size: 0.8rem; margin-top: 4px;">📅 Available Date: ${formattedDate}</div>`;
      }
      
      let includedItemsHtml = '';
      if (ticket.includesMenuItem && ticket.includedMenuItems && ticket.includedMenuItems.length > 0) {
        includedItemsHtml = `
          <div class="linked-items" style="margin-top: 6px; padding: 6px; background: #f0f8ff; border-radius: 3px;">
            <div style="font-size: 0.7rem; color: #0066cc; margin-bottom: 3px;">🍽️ Includes:</div>
            ${ticket.includedMenuItems.map(item => `
              <div style="font-size: 0.65rem; margin-left: 6px;">
                • ${item.menuItemName}
                ${item.variantName ? ` (${item.variantName})` : ''}
                ${item.variantId ? `<br><span style="color: #667eea; font-size: 0.6rem;">Variant ID: ${item.variantId}</span>` : ''}
                <span style="color: #28a745;">x${item.quantity}</span>
              </div>
            `).join('')}
          </div>
        `;
      }

      return `
        <div class="item-card small">
          <div class="item-id">ID: ${ticket.id}</div>
          <div class="item-name">${ticket.name}${soldOutText}</div>
          <div class="item-description">${ticket.description || 'No description'}</div>
          <div class="item-price">${priceDisplay}</div>
          <div class="item-details">
            Category: ${ticket.category} | Max per person: ${ticket.maxPerPerson}
            ${ticket.quantity !== null ? ` | Available: ${ticket.quantity}` : ''}
          </div>
          ${dateInfo}
          ${includedItemsHtml}
          <button class="add-to-cart-btn" data-action="add-ticket" data-ticket-id="${ticket.id}" data-ticket-name="${ticket.name}" data-ticket-price="${ticket.price}" data-ticket-dynamic-price="${ticket.dynamicPrice || ticket.price}" data-ticket-category="${ticket.category}" data-available-date="${ticket.availableDate || ''}" ${soldOut}>
            🎫 Add to Cart
          </button>
        </div>
      `;
    }).join('');

    ticketsList.innerHTML = ticketsHtml;
  }

  // Render menu items with "Add to Cart" buttons
  function renderMenuItems(menuData) {
    if (!menuData || menuData.length === 0) {
      menuItemsList.innerHTML = '<div class="no-items">No menu items available</div>';
      return;
    }

    let menuItemsHtml = '';
    
    menuData.forEach(category => {
      if (category.items && category.items.length > 0) {
        menuItemsHtml += `<h4 style="color: #667eea; margin: 15px 0 10px 0; font-size: 1rem;">${category.name}</h4>`;
        
        category.items.forEach(item => {
          const priceDisplay = renderPrice(item.price, item.dynamicPrice);
          
          let variantsHtml = '';
          if (item.variants && item.variants.length > 0) {
            variantsHtml = `
              <div style="margin-top: 6px;">
                <div style="font-size: 0.7rem; color: #666; margin-bottom: 3px;">Variants:</div>
                ${item.variants.map(variant => {
                  const variantPriceDisplay = renderPrice(variant.price, variant.dynamicPrice);
                  return `
                    <div style="margin-left: 8px; margin-bottom: 6px; padding: 6px; background: #f8f9fa; border-radius: 3px;">
                      <div style="font-size: 0.75rem; font-weight: 600;">${variant.name}</div>
                      <div style="font-size: 0.6rem; color: #667eea; margin-bottom: 2px;">ID: ${variant.id}</div>
                      <div style="font-size: 0.7rem; color: #28a745;">${variantPriceDisplay}</div>
                      <button class="add-to-cart-btn btn-small" style="font-size: 0.7rem; padding: 3px 6px;" data-action="add-menu-item-variant" data-menu-item-id="${item.id}" data-variant-id="${variant.id}" data-menu-item-name="${item.name} - ${variant.name}" data-variant-price="${variant.price}" data-variant-dynamic-price="${variant.dynamicPrice || variant.price}">
                        🍽️ Add Variant
                      </button>
                    </div>
                  `;
                }).join('')}
              </div>
            `;
          }

          menuItemsHtml += `
            <div class="item-card small">
              <div class="item-id">ID: ${item.id}</div>
              <div class="item-name">${item.name}</div>
              <div class="item-description">${item.description || 'No description'}</div>
              <div class="item-price">${priceDisplay}</div>
              ${variantsHtml}
              ${item.variants && item.variants.length === 0 ? `
                <button class="add-to-cart-btn" data-action="add-menu-item" data-menu-item-id="${item.id}" data-menu-item-name="${item.name}" data-menu-item-price="${item.price}" data-menu-item-dynamic-price="${item.dynamicPrice || item.price}">
                  🍽️ Add to Cart
                </button>
              ` : ''}
            </div>
          `;
        });
      }
    });

    menuItemsList.innerHTML = menuItemsHtml || '<div class="no-items">No menu items available</div>';
  }

  // Render events
  function renderEvents(events) {
    if (!events || events.length === 0) {
      eventsList.innerHTML = '<div class="no-items">No events available</div>';
      return;
    }

    const eventsHtml = events.map(event => {
      let eventTicketsHtml = '';
      
      if (event.tickets && event.tickets.length > 0) {
        eventTicketsHtml = `
          <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e1e5e9;">
            <h5 style="color: #667eea; margin-bottom: 10px; font-size: 0.9rem;">🎫 Event Tickets:</h5>
            ${event.tickets.map(ticket => {
              const priceDisplay = renderPrice(ticket.price, ticket.dynamicPrice);
              const soldOut = ticket.soldOut ? 'disabled' : '';
              const soldOutText = ticket.soldOut ? ' (Sold Out)' : '';
              
              // Show available date for free tickets in events
              let dateInfo = '';
              if (ticket.category === 'free' && ticket.availableDate) {
                const date = new Date(ticket.availableDate);
                const formattedDate = date.toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                });
                dateInfo = `<div style="color: #28a745; font-size: 0.7rem; margin-bottom: 4px;">📅 Available Date: ${formattedDate}</div>`;
              }
              
              let includedItemsHtml = '';
              if (ticket.includesMenuItem && ticket.includedMenuItems && ticket.includedMenuItems.length > 0) {
                includedItemsHtml = `
                  <div class="linked-items" style="margin-top: 4px; padding: 4px; background: #f0f8ff; border-radius: 3px;">
                    <div style="font-size: 0.65rem; color: #0066cc; margin-bottom: 2px;">🍽️ Includes:</div>
                    ${ticket.includedMenuItems.map(item => `
                      <div style="font-size: 0.6rem; margin-left: 4px;">
                        • ${item.menuItemName}
                        ${item.variantName ? ` (${item.variantName})` : ''}
                        ${item.variantId ? `<br><span style="color: #667eea; font-size: 0.55rem;">Variant ID: ${item.variantId}</span>` : ''}
                        <span style="color: #28a745;">x${item.quantity}</span>
                      </div>
                    `).join('')}
                  </div>
                `;
              }

              return `
                <div style="background: #f8f9fa; border: 1px solid #e1e5e9; border-radius: 4px; padding: 8px; margin-bottom: 6px;">
                  <div style="font-size: 0.7rem; color: #667eea; margin-bottom: 2px;">ID: ${ticket.id}</div>
                  <div style="font-weight: 600; color: #333; margin-bottom: 2px; font-size: 0.9rem;">${ticket.name}${soldOutText}</div>
                  <div style="color: #666; font-size: 0.8rem; margin-bottom: 2px;">${ticket.description || 'No description'}</div>
                  <div style="font-weight: bold; color: #28a745; margin-bottom: 2px; font-size: 0.85rem;">${priceDisplay}</div>
                  <div style="font-size: 0.75rem; color: #666; margin-bottom: 4px;">
                    Max per person: ${ticket.maxPerPerson}
                    ${ticket.quantity !== null ? ` | Available: ${ticket.quantity}` : ''}
                  </div>
                  ${dateInfo}
                  ${includedItemsHtml}
                  <button class="add-to-cart-btn" style="font-size: 0.8rem; padding: 4px 8px;" data-action="add-ticket" data-ticket-id="${ticket.id}" data-ticket-name="${ticket.name}" data-ticket-price="${ticket.price}" data-ticket-dynamic-price="${ticket.dynamicPrice || ticket.price}" data-ticket-category="${ticket.category}" data-event-date="${event.availableDate}" data-available-date="${ticket.availableDate || ''}" ${soldOut}>
                    🎫 Add to Cart
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      return `
        <div class="item-card">
          <div class="item-id">ID: ${event.id}</div>
          <div class="item-name">${event.name}</div>
          <div class="item-description">${event.description || 'No description'}</div>
          <div class="item-details">
            Date: ${event.availableDate} | Tickets: ${event.tickets ? event.tickets.length : 0}
          </div>
          ${eventTicketsHtml}
        </div>
      `;
    }).join('');

    eventsList.innerHTML = eventsHtml;
  }

  // Add ticket to cart
  async function addTicketToCart(ticketId, ticketName, basePrice, dynamicPrice, eventDate = null) {
    try {
      // Use event date if provided, otherwise use today's date
      let dateStr;
      if (eventDate) {
        // If eventDate is provided, use it directly
        dateStr = eventDate;
      } else {
        // Get today's date for regular tickets
        const today = new Date();
        dateStr = today.toISOString().split('T')[0];
      }

      const payload = {
        ticketId: ticketId,
        date: dateStr,
        quantity: 1
      };

      const res = await fetch('/cart/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        logResult({ message: 'Ticket added to cart', ticketName, data });
        showStatus(checkoutStatus, `✅ Added "${ticketName}" to cart`, "success");
        
        // Refresh cart display
        await handleViewCart();
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to add ticket to cart');
      }
    } catch (err) {
      logResult({ error: 'Failed to add ticket to cart', details: err.message }, true);
      showStatus(checkoutStatus, `❌ Failed to add ticket: ${err.message}`, "error");
    }
  }

  // Date picker functionality
  let currentTicketData = null;
  
  function showDatePickerForTicket(ticketId, ticketName, basePrice, dynamicPrice) {
    currentTicketData = { ticketId, ticketName, basePrice, dynamicPrice };
    
    // Set minimum date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('ticketDate').min = today;
    document.getElementById('ticketDate').value = today;
    
    // Update modal title with ticket name
    document.querySelector('.date-picker-title').textContent = `Select Date for: ${ticketName}`;
    
    // Show modal
    document.getElementById('datePickerModal').style.display = 'block';
  }
  
  function hideDatePicker() {
    document.getElementById('datePickerModal').style.display = 'none';
    currentTicketData = null;
  }
  
  function addTicketToCartWithDate(date) {
    if (!currentTicketData) return;
    
    const { ticketId, ticketName, basePrice, dynamicPrice } = currentTicketData;
    
    const payload = {
      ticketId: ticketId,
      date: date,
      quantity: 1
    };

    fetch('/cart/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      if (data.success || data.id) {
        logResult({ message: 'Ticket added to cart', ticketName, data });
        showStatus(checkoutStatus, `✅ Added "${ticketName}" to cart for ${date}`, "success");
        hideDatePicker();
        handleViewCart();
      } else {
        throw new Error(data.error || 'Failed to add ticket to cart');
      }
    })
    .catch(err => {
      logResult({ error: 'Failed to add ticket to cart', details: err.message }, true);
      showStatus(checkoutStatus, `❌ Failed to add ticket: ${err.message}`, "error");
    });
  }

  // Add menu item to cart
  async function addMenuItemToCart(menuItemId, variantId, itemName, basePrice, dynamicPrice) {
    try {
      const payload = {
        menuItemId: menuItemId,
        quantity: 1
      };

      if (variantId) {
        payload.variantId = variantId;
      }

      const res = await fetch('/menu/cart/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        logResult({ message: 'Menu item added to cart', itemName, data });
        showStatus(checkoutStatus, `✅ Added "${itemName}" to cart`, "success");
        
        // Refresh cart display
        await handleViewCart();
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to add menu item to cart');
      }
    } catch (err) {
      logResult({ error: 'Failed to add menu item to cart', details: err.message }, true);
      showStatus(checkoutStatus, `❌ Failed to add menu item: ${err.message}`, "error");
    }
  }

  // Initialize
  async function initialize() {
    console.log('🔧 Initializing test cart...');
    
    // Wait for DOM to be fully loaded
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Re-select DOM elements to ensure they're available
    const loadClubBtn = document.getElementById('loadClubBtn');
    const viewBtn = document.getElementById('viewBtn');
    const clearBtn = document.getElementById('clearBtn');
    const ticketCheckoutBtn = document.getElementById('ticketCheckoutBtn');
    const menuCheckoutBtn = document.getElementById('menuCheckoutBtn');
    const returnToLoginBtn = document.getElementById('returnToLoginBtn');
    const emailInput = document.getElementById('emailInput');
    const clubContent = document.getElementById('clubContent');
    
    console.log('🔍 DOM element search results:', {
      loadClubBtn: !!loadClubBtn,
      viewBtn: !!viewBtn,
      clearBtn: !!clearBtn,
      ticketCheckoutBtn: !!ticketCheckoutBtn,
      menuCheckoutBtn: !!menuCheckoutBtn,
      returnToLoginBtn: !!returnToLoginBtn,
      emailInput: !!emailInput,
      clubContent: !!clubContent
    });
    
    // Debug button visibility and positioning
    if (ticketCheckoutBtn) {
      const rect = ticketCheckoutBtn.getBoundingClientRect();
      const styles = window.getComputedStyle(ticketCheckoutBtn);
      console.log('🎯 ticketCheckoutBtn debug:', {
        visible: styles.display !== 'none' && styles.visibility !== 'hidden',
        display: styles.display,
        visibility: styles.visibility,
        position: styles.position,
        zIndex: styles.zIndex,
        rect: rect,
        text: ticketCheckoutBtn.textContent,
        disabled: ticketCheckoutBtn.disabled
      });
    }
    
    if (menuCheckoutBtn) {
      const rect = menuCheckoutBtn.getBoundingClientRect();
      const styles = window.getComputedStyle(menuCheckoutBtn);
      console.log('🎯 menuCheckoutBtn debug:', {
        visible: styles.display !== 'none' && styles.visibility !== 'hidden',
        display: styles.display,
        visibility: styles.visibility,
        position: styles.position,
        zIndex: styles.zIndex,
        rect: rect,
        text: menuCheckoutBtn.textContent,
        disabled: menuCheckoutBtn.disabled
      });
    }
    
    console.log('DOM elements found:', {
      ticketCheckoutBtn: !!ticketCheckoutBtn,
      menuCheckoutBtn: !!menuCheckoutBtn,
      returnToLoginBtn: !!returnToLoginBtn,
      emailInput: !!emailInput,
      clubContent: !!clubContent
    });
    
    // Attach event listeners
    console.log('🎯 Attaching event listeners...');
    if (loadClubBtn) {
      loadClubBtn.addEventListener("click", loadClubDetails);
      console.log('✅ loadClubBtn listener attached');
    }
    if (viewBtn) {
      viewBtn.addEventListener("click", handleViewCart);
      console.log('✅ viewBtn listener attached');
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", handleClearCart);
      console.log('✅ clearBtn listener attached');
    }
    if (ticketCheckoutBtn) {
      // Remove any existing listeners first
      ticketCheckoutBtn.replaceWith(ticketCheckoutBtn.cloneNode(true));
      const newTicketCheckoutBtn = document.getElementById('ticketCheckoutBtn');
      
      newTicketCheckoutBtn.addEventListener("click", handleTicketCheckout, true);
      console.log('✅ ticketCheckoutBtn listener attached');
      
      // Add immediate click test with capture
      newTicketCheckoutBtn.addEventListener("click", (e) => {
        console.log('🎯 Raw click detected on ticketCheckoutBtn!', e);
        newTicketCheckoutBtn.style.backgroundColor = 'red';
        setTimeout(() => {
          newTicketCheckoutBtn.style.backgroundColor = '';
        }, 500);
      }, true);
      
      // Also try mousedown event
      newTicketCheckoutBtn.addEventListener("mousedown", (e) => {
        console.log('🎯 Mouse down detected on ticketCheckoutBtn!', e);
      });
    }
    if (menuCheckoutBtn) {
      // Remove any existing listeners first
      menuCheckoutBtn.replaceWith(menuCheckoutBtn.cloneNode(true));
      const newMenuCheckoutBtn = document.getElementById('menuCheckoutBtn');
      
      newMenuCheckoutBtn.addEventListener("click", handleMenuCheckout, true);
      console.log('✅ menuCheckoutBtn listener attached');
      
      // Add immediate click test with capture
      newMenuCheckoutBtn.addEventListener("click", (e) => {
        console.log('🎯 Raw click detected on menuCheckoutBtn!', e);
        newMenuCheckoutBtn.style.backgroundColor = 'red';
        setTimeout(() => {
          newMenuCheckoutBtn.style.backgroundColor = '';
        }, 500);
      }, true);
      
      // Also try mousedown event
      newMenuCheckoutBtn.addEventListener("mousedown", (e) => {
        console.log('🎯 Mouse down detected on menuCheckoutBtn!', e);
      });
    }
    if (returnToLoginBtn) {
      // Remove any existing listeners first
      returnToLoginBtn.replaceWith(returnToLoginBtn.cloneNode(true));
      const newReturnToLoginBtn = document.getElementById('returnToLoginBtn');
      
      newReturnToLoginBtn.addEventListener("click", () => window.location.href = "/test-auth.html", true);
      console.log('✅ returnToLoginBtn listener attached');
      
      // Add immediate click test with capture
      newReturnToLoginBtn.addEventListener("click", (e) => {
        console.log('🎯 Raw click detected on returnToLoginBtn!', e);
        newReturnToLoginBtn.style.backgroundColor = 'red';
        setTimeout(() => {
          newReturnToLoginBtn.style.backgroundColor = '';
        }, 500);
      }, true);
    }

    // Email input change
    if (emailInput) emailInput.addEventListener("input", () => {
      updateEmailSection();
      updateCheckoutStatus();
    });
    
    // Add event delegation for club content (tickets, menu items, events)
    if (clubContent) clubContent.addEventListener("click", handleCartItemClick);
    
    // Date picker modal event listeners
    const datePickerClose = document.getElementById('datePickerClose');
    const datePickerCancel = document.getElementById('datePickerCancel');
    const datePickerForm = document.getElementById('datePickerForm');
    const datePickerModal = document.getElementById('datePickerModal');
    
    if (datePickerClose) datePickerClose.addEventListener('click', hideDatePicker);
    if (datePickerCancel) datePickerCancel.addEventListener('click', hideDatePicker);
    if (datePickerForm) datePickerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const date = document.getElementById('ticketDate').value;
      if (date) {
        addTicketToCartWithDate(date);
      }
    });
    
    // Close modal when clicking outside
    if (datePickerModal) datePickerModal.addEventListener('click', (e) => {
      if (e.target.id === 'datePickerModal') {
        hideDatePicker();
      }
    });
    
    await checkAuthStatus();
    updateEmailSection();
    updateCheckoutStatus();
    await loadClubs();
    await handleViewCart();
    console.log('Test cart initialization complete');
    
    // Test programmatic click after 2 seconds
    setTimeout(() => {
      console.log('🧪 Testing programmatic click...');
      if (ticketCheckoutBtn) {
        console.log('🧪 Programmatically clicking ticketCheckoutBtn...');
        ticketCheckoutBtn.click();
      }
    }, 2000);
  }

  initialize();
});
