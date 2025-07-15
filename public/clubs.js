// --- API endpoints ---
const CLUBS_API = '/clubs';
const CLUB_DETAIL_API = id => `/clubs/${id}`;
const CLUB_TICKETS_API = id => `/tickets/club/${id}`;
const CLUB_MENU_API = id => `/menu/items/club/${id}/public`;

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
    card.innerHTML = `
      <div class="club-id">ID: ${club.id}</div>
      <div class="club-name">${club.name}</div>
      <div class="club-address">${club.address}</div>
    `;
    card.onclick = () => showClubDetail(club.id);
    clubListEl.appendChild(card);
  });
  startPolling();
}

// --- Club detail view ---
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
    const [clubRes, ticketsRes, menuRes] = await Promise.all([
      fetch(clubDetailUrl),
      fetch(ticketsUrl),
      fetch(menuUrl),
    ]);
    const club = await clubRes.json();
    const tickets = await ticketsRes.json();
    const menu = await menuRes.json();
    renderClubDetail(club, tickets, menu);
  } catch (err) {
    loadingEl.textContent = 'Failed to load club details.';
  }
}

function renderClubDetail(club, tickets, menu) {
  loadingEl.style.display = 'none';
  clubListEl.style.display = 'none';
  clubDetailEl.style.display = '';
  clubDetailEl.innerHTML = `
    <button class="back-btn" id="back-to-clubs-btn">← Back to Clubs</button>
    <div class="section">
      <h2>${club.name} <span style="font-size:0.7em;color:#a78bfa;">(ID: ${club.id})</span></h2>
      <div class="info-row"><span class="info-label">Address:</span> ${club.address}</div>
      <div class="info-row"><span class="info-label">Description:</span> ${club.description || ''}</div>
      <div class="info-row"><span class="info-label">Open Hours:</span> ${club.openHours || ''}</div>
      <div class="info-row"><span class="info-label">Open Days:</span> ${club.openDays || ''}</div>
    </div>
    <div class="section">
      <h2>Tickets</h2>
      <ul class="ticket-list">
        ${tickets.map(ticket => `
          <li class="ticket-item">
            <span class="ticket-id">ID: ${ticket.id}</span>
            <div><b>${ticket.name}</b> - $${ticket.price}</div>
            <div>${ticket.description || ''}</div>
          </li>
        `).join('')}
      </ul>
    </div>
    <div class="section">
      <h2>Menu Items</h2>
      ${menu.map(category => `
        <div class="category-title">${category.name} <span class="category-id">(ID: ${category.id || 'N/A'})</span></div>
        <ul class="category-list">
          ${category.items.map(item => `
            <li class="menu-item">
              <span class="menu-id">ID: ${item.id || 'N/A'}</span>
              <div><b>${item.name}</b> - $${item.price ?? ''}</div>
              <div>${item.description || ''}</div>
              ${item.variants && item.variants.length ? `
                <div style="margin-top:6px;">
                  <b>Variants:</b>
                  <ul style="margin:0;padding-left:18px;">
                    ${item.variants.map(variant => `
                      <li class="variant-item">
                        <span class="variant-id">ID: ${variant.id || 'N/A'}</span>
                        <div><b>${variant.name}</b> - $${variant.price}</div>
                      </li>
                    `).join('')}
                  </ul>
                </div>
              ` : ''}
            </li>
          `).join('')}
        </ul>
      `).join('')}
    </div>
  `;
  document.getElementById('back-to-clubs-btn').onclick = renderClubList;
}

// --- Initial load ---
fetchClubs();
startPolling();