// --- API endpoints ---
const CLUBS_API = '/clubs';
const CLUB_DETAIL_API = id => `/clubs/${id}`;
const CLUB_TICKETS_API = id => `/tickets/club/${id}`;
const CLUB_MENU_API = id => `/menu/items/club/${id}/public`;
const CLUB_EVENTS_API = id => `/events/club/${id}`;

// --- DOM elements ---
const clubListEl = document.getElementById('club-list');
const clubDetailEl = document.getElementById('club-detail');
const loadingEl = document.getElementById('loading');

// --- State ---
let clubs = [];
let clubDetail = null;
let pollInterval = null;

// --- Fetch and render clubs ---
async function fetchClubs() {
  loadingEl.style.display = '';
  clubListEl.style.display = 'none';
  clubDetailEl.style.display = 'none';
  try {
    const res = await fetch(CLUBS_API);
    clubs = await res.json();
    renderClubList();
  } catch (err) {
    loadingEl.textContent = 'Failed to load clubs.';
  }
}

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(fetchClubs, 10000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function renderClubList() {
  clubListEl.innerHTML = '';
  if (!clubs.length) {
    loadingEl.textContent = 'No clubs found.';
    return;
  }
  loadingEl.style.display = 'none';
  clubListEl.style.display = '';
  clubDetailEl.style.display = 'none';
  clubs.forEach(club => {
    const card = document.createElement('div');
    card.className = 'club-card';
    
    // Create unique IDs for this club's elements
    const canvasId = `blurhash-${club.id}`;
    const imageId = `image-${club.id}`;
    
    card.innerHTML = `
      <div class="club-image-container">
        <canvas id="${canvasId}" class="club-blurhash"></canvas>
        <img id="${imageId}" class="club-image loading" alt="${club.name}" style="display: none;" />
      </div>
      <div class="club-content">
        <div class="club-id">ID: ${club.id}</div>
        <div class="club-name">${club.name}</div>
        <div class="club-address">${club.address}</div>
      </div>
    `;
    
    card.onclick = () => showClubDetail(club.id);
    clubListEl.appendChild(card);
    
    // Load BlurHash and image for this club
    loadClubImage(club, canvasId, imageId);
  });
  startPolling();
}

// --- BlurHash and Image Loading ---
function loadClubImage(club, canvasId, imageId) {
  const canvas = document.getElementById(canvasId);
  const image = document.getElementById(imageId);
  
  if (!canvas || !image) return;
  
  // Set canvas size for BlurHash
  const containerWidth = 280; // Match card width
  const containerHeight = 160; // Match container height
  canvas.width = containerWidth;
  canvas.height = containerHeight;
  
  // Render BlurHash if available
  if (club.profileImageBlurhash && typeof BlurHash !== 'undefined') {
    try {
      const pixels = BlurHash.decode(club.profileImageBlurhash, containerWidth, containerHeight);
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(containerWidth, containerHeight);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);
    } catch (error) {
      console.warn('Failed to decode BlurHash for club', club.id, error);
      // Fallback: solid color background
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#333';
      ctx.fillRect(0, 0, containerWidth, containerHeight);
    }
  } else {
    // Fallback: solid color background
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, containerWidth, containerHeight);
  }
  
  // Load actual image if available
  if (club.profileImageUrl) {
    image.onload = function() {
      // Show the image
      image.style.display = 'block';
      image.classList.remove('loading');
      // Hide the BlurHash after a brief delay for smooth transition
      setTimeout(() => {
        canvas.classList.add('hidden');
      }, 100);
    };
    
    image.onerror = function() {
      console.warn('Failed to load image for club', club.id, club.profileImageUrl);
      // Keep BlurHash visible if image fails to load
    };
    
    image.src = club.profileImageUrl;
  } else {
    // No image URL, keep BlurHash visible
    console.log('No profile image URL for club', club.id);
  }
}

function loadEventBanner(event, canvasId, imageId) {
  const canvas = document.getElementById(canvasId);
  const image = document.getElementById(imageId);
  
  if (!canvas || !image) return;
  
  // Set canvas size for BlurHash
  const containerWidth = 400; // Match container width
  const containerHeight = 120; // Match container height
  canvas.width = containerWidth;
  canvas.height = containerHeight;
  
  // Render BlurHash if available
  if (event.BannerURLBlurHash && typeof BlurHash !== 'undefined') {
    try {
      const pixels = BlurHash.decode(event.BannerURLBlurHash, containerWidth, containerHeight);
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(containerWidth, containerHeight);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);
    } catch (error) {
      console.warn('Failed to decode BlurHash for event banner', event.id, error);
      // Fallback: solid color background
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#333';
      ctx.fillRect(0, 0, containerWidth, containerHeight);
    }
  } else {
    // Fallback: solid color background
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, containerWidth, containerHeight);
  }
  
  // Load actual image if available
  if (event.bannerUrl) {
    image.onload = function() {
      // Show the image
      image.style.display = 'block';
      image.classList.remove('loading');
      // Hide the BlurHash after a brief delay for smooth transition
      setTimeout(() => {
        canvas.classList.add('hidden');
      }, 100);
    };
    
    image.onerror = function() {
      console.warn('Failed to load banner image for event', event.id, event.bannerUrl);
      // Keep BlurHash visible if image fails to load
    };
    
    image.src = event.bannerUrl;
  } else {
    // No image URL, keep BlurHash visible
    console.log('No banner image URL for event', event.id);
  }
}

function loadMenuItemImage(item, canvasId, imageId) {
  const canvas = document.getElementById(canvasId);
  const image = document.getElementById(imageId);
  
  if (!canvas || !image) return;
  
  // Set canvas size for BlurHash
  const containerWidth = 60; // Match container width
  const containerHeight = 60; // Match container height
  canvas.width = containerWidth;
  canvas.height = containerHeight;
  
  // Render BlurHash if available
  if (item.imageBlurhash && typeof BlurHash !== 'undefined') {
    try {
      const pixels = BlurHash.decode(item.imageBlurhash, containerWidth, containerHeight);
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(containerWidth, containerHeight);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);
    } catch (error) {
      console.warn('Failed to decode BlurHash for menu item', item.id, error);
      // Fallback: solid color background
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#333';
      ctx.fillRect(0, 0, containerWidth, containerHeight);
    }
  } else {
    // Fallback: solid color background
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, containerWidth, containerHeight);
  }
  
  // Load actual image if available
  if (item.imageUrl) {
    image.onload = function() {
      // Show the image
      image.style.display = 'block';
      image.classList.remove('loading');
      // Hide the BlurHash after a brief delay for smooth transition
      setTimeout(() => {
        canvas.classList.add('hidden');
      }, 100);
    };
    
    image.onerror = function() {
      console.warn('Failed to load image for menu item', item.id, item.imageUrl);
      // Keep BlurHash visible if image fails to load
    };
    
    image.src = item.imageUrl;
  } else {
    // No image URL, keep BlurHash visible
    console.log('No image URL for menu item', item.id);
  }
}

// --- Club detail view ---

function formatLocalDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
  // JS months are 0-based
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString();
}

// Helper to render price with dynamic price
function renderPrice(oldPrice, dynamicPrice) {
  if (dynamicPrice !== undefined && dynamicPrice !== null && Number(dynamicPrice) !== Number(oldPrice)) {
    return `<span style="text-decoration:line-through;color:#aaa;">$${Number(oldPrice).toFixed(2)}</span> <span style="color:#a78bfa;font-weight:bold;">$${Number(dynamicPrice).toFixed(2)}</span>`;
  } else if (oldPrice !== undefined && oldPrice !== null) {
    return `$${Number(oldPrice).toFixed(2)}`;
  } else {
    return '';
  }
}

async function showClubDetail(clubId) {
  stopPolling();
  loadingEl.style.display = '';
  clubListEl.style.display = 'none';
  clubDetailEl.style.display = 'none';
  clubDetailEl.innerHTML = '';
  try {
    const clubDetailUrl = CLUB_DETAIL_API(clubId);
    const ticketsUrl = CLUB_TICKETS_API(clubId);
    const menuUrl = CLUB_MENU_API(clubId);
    const eventsUrl = CLUB_EVENTS_API(clubId);
    const [clubRes, ticketsRes, menuRes, eventsRes] = await Promise.all([
      fetch(clubDetailUrl),
      fetch(ticketsUrl),
      fetch(menuUrl),
      fetch(eventsUrl),
    ]);
    const club = await clubRes.json();
    const ticketsData = await ticketsRes.json();
    const menu = await menuRes.json();
    const events = await eventsRes.json();
    renderClubDetail(club, ticketsData.tickets || ticketsData, menu, events);
  } catch (err) {
    loadingEl.textContent = 'Failed to load club details.';
  }
}

function renderClubDetail(club, tickets, menu, events) {
  loadingEl.style.display = 'none';
  clubListEl.style.display = 'none';
  clubDetailEl.style.display = '';
  const detailCanvasId = `detail-blurhash-${club.id}`;
  const detailImageId = `detail-image-${club.id}`;
  
  // Get all event ticket IDs to filter them out from general tickets
  const eventTicketIds = new Set();
  events.forEach(event => {
    if (event.tickets && event.tickets.length) {
      event.tickets.forEach(ticket => {
        eventTicketIds.add(ticket.id);
      });
    }
  });
  
  // Filter out event tickets from general tickets
  const generalTickets = tickets.filter(ticket => !eventTicketIds.has(ticket.id));
  
  clubDetailEl.innerHTML = `
    <button class="back-btn" id="back-to-clubs-btn">← Back to Clubs</button>
    <div class="section">
      <div class="club-image-container" style="margin-bottom: 20px;">
        <canvas id="${detailCanvasId}" class="club-blurhash"></canvas>
        <img id="${detailImageId}" class="club-image loading" alt="${club.name}" style="display: none;" />
      </div>
      <h2>${club.name} <span style="font-size:0.7em;color:#a78bfa;">(ID: ${club.id})</span></h2>
      <div class="info-row"><span class="info-label">Address:</span> ${club.address}</div>
      <div class="info-row"><span class="info-label">Description:</span> ${club.description || ''}</div>
      <div class="info-row"><span class="info-label">Open Hours:</span> ${club.openHours || ''}</div>
      <div class="info-row"><span class="info-label">Open Days:</span> ${club.openDays || ''}</div>
    </div>
    <div class="section">
      <h2>Events</h2>
      <ul class="event-list">
        ${events.map(event => {
          const bannerCanvasId = `event-banner-blurhash-${event.id}`;
          const bannerImageId = `event-banner-image-${event.id}`;
          return `
            <li class="event-item">
              <span class="event-id">ID: ${event.id}</span>
              <div class="event-title">${event.name}</div>
              <div>${event.description || ''}</div>
              <div class="info-row"><span class="info-label">Date:</span> ${event.availableDate ? formatLocalDate(event.availableDate) : ''}</div>
              ${event.bannerUrl ? `
                <div class="event-banner-container">
                  <canvas id="${bannerCanvasId}" class="event-banner-blurhash"></canvas>
                  <img id="${bannerImageId}" class="event-banner loading" alt="${event.name}" style="display: none;" />
                </div>
              ` : ''}
              ${event.tickets && event.tickets.length ? `
                <div style="margin-top:10px;">
                  <b>Event Tickets:</b>
                  <ul style="margin:0;padding-left:18px;">
                    ${event.tickets.map(ticket => `
                      <li class="ticket-item">
                        <span class="ticket-id">ID: ${ticket.id}</span>
                        <div><b>${ticket.name}</b> - ${renderPrice(ticket.price, ticket.dynamicPrice)}</div>
                        <div>${ticket.description || ''}</div>
                        <div style="margin-top:4px;font-size:0.9em;color:#a78bfa;">
                          ${ticket.quantity !== null ? 
                            `Tickets left: ${ticket.quantity}` : 
                            'Unlimited tickets'
                          }
                        </div>
                        ${ticket.includesMenuItem ? `
                          <div style="margin-top:8px;padding:8px;background:#1a1b2e;border-radius:4px;border-left:3px solid #a78bfa;">
                            <div style="font-size:0.9em;color:#a78bfa;margin-bottom:4px;">🍽️ Includes Menu Items:</div>
                            ${ticket.includedMenuItems ? ticket.includedMenuItems.map(menuItem => `
                              <div style="font-size:0.85em;margin-left:8px;margin-bottom:2px;">
                                • ${menuItem.menuItemName}
                                ${menuItem.variantName ? ` (${menuItem.variantName})` : ''}
                                <span style="color:#28a745;margin-left:8px;">x${menuItem.quantity}</span>
                              </div>
                            `).join('') : '<div style="font-size:0.85em;margin-left:8px;color:#666;">Loading included items...</div>'}
                          </div>
                        ` : ''}
                      </li>
                    `).join('')}
                  </ul>
                </div>
              ` : ''}
            </li>
          `;
        }).join('')}
      </ul>
    </div>
    <div class="section">
      <h2>General Tickets</h2>
      <ul class="ticket-list">
        ${generalTickets.map(ticket => `
          <li class="ticket-item">
            <span class="ticket-id">ID: ${ticket.id}</span>
            <div><b>${ticket.name}</b> - ${renderPrice(ticket.price, ticket.dynamicPrice)}</div>
            <div>${ticket.description || ''}</div>
            <div style="margin-top:4px;font-size:0.9em;color:#a78bfa;">
              ${ticket.quantity !== null ? 
                `Tickets left: ${ticket.quantity}` : 
                'Unlimited tickets'
              }
            </div>
            ${ticket.includesMenuItem ? `
              <div style="margin-top:8px;padding:8px;background:#1a1b2e;border-radius:4px;border-left:3px solid #a78bfa;">
                <div style="font-size:0.9em;color:#a78bfa;margin-bottom:4px;">🍽️ Includes Menu Items:</div>
                ${ticket.includedMenuItems ? ticket.includedMenuItems.map(menuItem => `
                  <div style="font-size:0.85em;margin-left:8px;margin-bottom:2px;">
                    • ${menuItem.menuItemName}
                    ${menuItem.variantName ? ` (${menuItem.variantName})` : ''}
                    <span style="color:#28a745;margin-left:8px;">x${menuItem.quantity}</span>
                  </div>
                `).join('') : '<div style="font-size:0.85em;margin-left:8px;color:#666;">Loading included items...</div>'}
              </div>
            ` : ''}
          </li>
        `).join('')}
      </ul>
    </div>
    <div class="section">
      <h2>Menu Items</h2>
      ${menu.map(category => `
        <div class="category-title">${category.name} <span class="category-id">(ID: ${category.id || 'N/A'})</span></div>
        <ul class="category-list">
          ${category.items.map(item => {
            const itemCanvasId = `menu-item-blurhash-${item.id}`;
            const itemImageId = `menu-item-image-${item.id}`;
            return `
            <li class="menu-item">
                ${item.imageUrl ? `
                  <div class="menu-item-with-image">
                    <div class="menu-item-image-container">
                      <canvas id="${itemCanvasId}" class="menu-item-image-blurhash"></canvas>
                      <img id="${itemImageId}" class="menu-item-image loading" alt="${item.name}" style="display: none;" />
                    </div>
                    <div class="menu-item-content">
              <span class="menu-id">ID: ${item.id || 'N/A'}</span>
              <div><b>${item.name}</b> - ${renderPrice(item.price, item.dynamicPrice)}</div>
              <div>${item.description || ''}</div>
              ${item.variants && item.variants.length ? `
                <div style="margin-top:6px;">
                  <b>Variants:</b>
                  <ul style="margin:0;padding-left:18px;">
                    ${item.variants.map(variant => `
                      <li class="variant-item">
                        <span class="variant-id">ID: ${variant.id || 'N/A'}</span>
                        <div><b>${variant.name}</b> - ${renderPrice(variant.price, variant.dynamicPrice)}</div>
                      </li>
                    `).join('')}
                  </ul>
                </div>
              ` : ''}
                    </div>
                  </div>
                ` : `
                  <span class="menu-id">ID: ${item.id || 'N/A'}</span>
                  <div><b>${item.name}</b> - ${renderPrice(item.price, item.dynamicPrice)}</div>
                  <div>${item.description || ''}</div>
                  ${item.variants && item.variants.length ? `
                    <div style="margin-top:6px;">
                      <b>Variants:</b>
                      <ul style="margin:0;padding-left:18px;">
                        ${item.variants.map(variant => `
                          <li class="variant-item">
                            <span class="variant-id">ID: ${variant.id || 'N/A'}</span>
                            <div><b>${variant.name}</b> - ${renderPrice(variant.price, variant.dynamicPrice)}</div>
            </li>
          `).join('')}
                      </ul>
                    </div>
                  ` : ''}
                `}
              </li>
            `;
          }).join('')}
        </ul>
      `).join('')}
    </div>
  `;
  document.getElementById('back-to-clubs-btn').onclick = renderClubList;
  
  // Load BlurHash and image for detail view
  loadClubImage(club, detailCanvasId, detailImageId);
  
  // Load event banners
  events.forEach(event => {
    if (event.bannerUrl) {
      const bannerCanvasId = `event-banner-blurhash-${event.id}`;
      const bannerImageId = `event-banner-image-${event.id}`;
      loadEventBanner(event, bannerCanvasId, bannerImageId);
    }
  });
  
  // Load menu item images
  menu.forEach(category => {
    category.items.forEach(item => {
      if (item.imageUrl) {
        const itemCanvasId = `menu-item-blurhash-${item.id}`;
        const itemImageId = `menu-item-image-${item.id}`;
        loadMenuItemImage(item, itemCanvasId, itemImageId);
      }
    });
  });
}

// --- Initial load ---
fetchClubs();
startPolling();