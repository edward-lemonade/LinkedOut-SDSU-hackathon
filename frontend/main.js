// Single clean frontend script: adds 'Use' and 'Directions' buttons in resource popups
document.addEventListener('DOMContentLoaded', () => {
  // Check authentication
  const user = JSON.parse(localStorage.getItem('linkedoutUser') || 'null');
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  // Display username
  const userDisplay = document.getElementById('userDisplay');
  if (userDisplay) {
    userDisplay.textContent = `Welcome, ${user.username}!`;
  }

  // Sign out handler
  const signOutBtn = document.getElementById('signOutBtn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', () => {
      localStorage.removeItem('linkedoutUser');
      window.location.href = 'login.html';
    });
  }

  const postsList = document.getElementById('postsList');
  const postForm = document.getElementById('postForm');
  const postInput = document.getElementById('postInput');

  const resourceForm = document.getElementById('resourceForm');
  const resName = document.getElementById('resName');
  const resType = document.getElementById('resType');
  const resNotes = document.getElementById('resNotes');
  const resLat = document.getElementById('resLat');
  const resLon = document.getElementById('resLon');
  const resourceMsg = document.getElementById('resourceMsg');
  const centerMe = document.getElementById('centerMe');

  // Search UI
  const searchForm = document.getElementById('searchForm');
  const searchQuery = document.getElementById('searchQuery');
  const searchResults = document.getElementById('searchResults');

  if (typeof L === 'undefined') {
    const mapEl = document.getElementById('map');
    if (mapEl) mapEl.innerHTML = '<p style="color: red; padding: 16px;">Map failed to load. Check network or CDN.</p>';
    console.error('Leaflet (L) is not available.');
    return;
  }

  const map = L.map('map').setView([32.7157, -117.1611], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
  const resourcesLayer = L.layerGroup().addTo(map);

  function escapeHtml(str){
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  const resourceIcons = {
    water: L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png', shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41]}),
    food: L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png', shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41]}),
    shelter: L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png', shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41]}),
    job: L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-purple.png', shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41]})
  };

  function getResourceIcon(type){
    const k = (type||'').toLowerCase().trim();
    return resourceIcons[k] || L.Icon.Default.prototype;
  }

  function renderPosts(items){
    postsList.innerHTML = '';
    if (!items || items.length === 0){ 
      postsList.innerHTML = '<div class="post-card">No posts yet — be the first to share.</div>'; 
      return; 
    }
    items.slice().reverse().forEach(p=>{
      const card = document.createElement('div'); 
      card.className='post-card';
      
      const meta = document.createElement('div'); 
      meta.className='meta'; 
      // Display username and timestamp
      const username = p.username || 'Anonymous';
      const timestamp = p.created_at || '';
      meta.textContent = `${username} • ${timestamp}`;
      
      const content = document.createElement('div'); 
      content.textContent = p.content || '';
      
      card.appendChild(meta); 
      card.appendChild(content); 
      postsList.appendChild(card);
    });
  }

  function fetchPosts(){ 
    fetch('http://127.0.0.1:3000/posts')
      .then(r=>r.json())
      .then(renderPosts)
      .catch(e=>console.error('posts fetch',e)); 
  }

  function fetchResources(){
    fetch('http://127.0.0.1:3000/resources').then(r=>r.json()).then(data=>{
      resourcesLayer.clearLayers();
      data.forEach(r=>{
        const icon = getResourceIcon(r.type);
        const m = L.marker([r.lat, r.lon], {icon}).addTo(resourcesLayer);
        const clicks = r.clicks_remaining != null ? r.clicks_remaining : 0;
        const popupHtml = `
          <div class="resource-popup">
            <b>${escapeHtml(r.name)}</b>
            <div>${escapeHtml(r.type||'')}</div>
            <div>${escapeHtml(r.notes||'')}</div>
            <div><small>${clicks} clicks remaining</small></div>
            <div class="popup-actions">
              <a class="btn directions" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lon}">Directions</a>
              <button class="btn print-btn">Print Directions</button>
            </div>
          </div>
        `;
        m.bindPopup(popupHtml);
        
        // Decrement clicks when marker is clicked
        m.on('click', function(){
          if (r.id) {
            fetch(`http://127.0.0.1:3000/resources/${r.id}/click`, {method:'POST'})
              .then(res=>res.json())
              .then(resp=>{ 
                if (!resp.exists){ 
                  resourcesLayer.removeLayer(m); 
                } else { 
                  fetchResources(); 
                } 
              })
              .catch(err=>console.error('click error',err));
          }
        });
        
        m.on('popupopen', function(e){
          const popupNode = e.popup.getElement(); 
          if (!popupNode) return;
          
          const printBtn = popupNode.querySelector('.print-btn');
          if (printBtn){
            printBtn.addEventListener('click', function(){
              // Create printable directions content
              const printContent = `
                <html>
                <head>
                  <title>Directions to ${escapeHtml(r.name)}</title>
                  <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    h1 { color: #333; }
                    .info { margin: 10px 0; }
                    .coordinates { background: #f5f5f5; padding: 10px; border-radius: 5px; }
                  </style>
                </head>
                <body>
                  <h1>Directions to ${escapeHtml(r.name)}</h1>
                  <div class="info"><strong>Type:</strong> ${escapeHtml(r.type||'')}</div>
                  <div class="info"><strong>Notes:</strong> ${escapeHtml(r.notes||'N/A')}</div>
                  <div class="coordinates">
                    <strong>Coordinates:</strong><br>
                    Latitude: ${r.lat}<br>
                    Longitude: ${r.lon}
                  </div>
                  <div class="info">
                    <strong>Google Maps Link:</strong><br>
                    <a href="https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lon}">
                      Open in Google Maps
                    </a>
                  </div>
                </body>
                </html>
              `;
              
              const printWindow = window.open('', '_blank');
              printWindow.document.write(printContent);
              printWindow.document.close();
              printWindow.focus();
              setTimeout(() => {
                printWindow.print();
              }, 250);
            });
          }
        });
      });
    }).catch(e=>console.error('resources fetch', e));
  }

  // initial load and polling
  fetchResources(); fetchPosts(); setInterval(fetchResources,7000); setInterval(fetchPosts,6000);

  // post submit - now includes username
  postForm.addEventListener('submit', e=>{ 
    e.preventDefault(); 
    const content = postInput.value && postInput.value.trim(); 
    if (!content) return; 
    
    // Get fresh user data from localStorage
    const currentUser = JSON.parse(localStorage.getItem('linkedoutUser') || 'null');
    const username = currentUser?.username || 'Anonymous';
    
    console.log('Submitting post with username:', username); // Debug log
    
    // Include username from localStorage
    const payload = {
      content: content,
      username: username
    };
    
    fetch('http://127.0.0.1:3000/posts',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    })
    .then(r=>r.json())
    .then((data)=>{ 
      console.log('Post created:', data); // Debug log
      postInput.value=''; 
      fetchPosts(); 
    })
    .catch(e=>console.error('post create',e)); 
  });

  // resource submit
  resourceForm.addEventListener('submit', e=>{
    e.preventDefault(); const payload = { name:(resName.value||'').trim(), type:(resType.value||'').trim(), notes:(resNotes.value||'').trim(), lat:parseFloat(resLat.value), lon:parseFloat(resLon.value) };
    if (!payload.name || !isFinite(payload.lat) || !isFinite(payload.lon)){ resourceMsg.textContent='Name, latitude and longitude are required and must be valid numbers.'; resourceMsg.style.color='var(--danger)'; return; }
    fetch('http://127.0.0.1:3000/resources',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(r=>r.json()).then(()=>{ resourceMsg.textContent='Resource marked — thanks!'; resourceMsg.style.color='inherit'; resName.value=''; resType.value=''; resNotes.value=''; resLat.value=''; resLon.value=''; fetchResources(); }).catch(e=>{ resourceMsg.textContent='Failed to mark resource'; resourceMsg.style.color='var(--danger)'; console.error(e); });
  });

  // Natural language search
  searchForm && searchForm.addEventListener('submit', e=>{
    e.preventDefault();
    if (!navigator.geolocation){ alert('Please enable location to use search'); return; }
    navigator.geolocation.getCurrentPosition(pos=>{
      const {latitude, longitude} = pos.coords;
      const query = searchQuery.value.trim();
      if (!query) return;
      fetch('http://127.0.0.1:3000/search', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({query, lat:latitude, lon:longitude})})
        .then(r=>r.json())
        .then(data=>{
          searchResults.innerHTML='';
          if (data.error || data.message){ searchResults.innerHTML=`<div class="search-result-card"><div class="result-detail">${data.message || data.error}</div></div>`; return; }
          const res = data.resource;
          const html=`
            <div class="search-result-card">
              <div class="result-title">${escapeHtml(res.name)}</div>
              <div class="result-detail"><strong>Type:</strong> ${escapeHtml(res.type||'')}</div>
              <div class="result-detail"><strong>Distance:</strong> ${data.distance_miles} miles away</div>
              <div class="result-detail"><strong>Address:</strong> ${escapeHtml(data.address)}</div>
              <div class="result-detail">${escapeHtml(res.notes||'')}</div>
              <div class="result-actions">
                <a href="${data.directions_url}" target="_blank" rel="noopener">Get Directions</a>
              </div>
            </div>
          `;
          searchResults.innerHTML=html;
          // Center map on result
          map.setView([res.lat, res.lon], 15);
        })
        .catch(err=>{ searchResults.innerHTML='<div class="search-result-card"><div class="result-detail" style="color:var(--danger);">Search failed. Try again.</div></div>'; console.error(err); });
    }, ()=>{ alert('Location access denied. Please enable location to use search.'); });
  });


  // map click fills coords
  map.on('click', function(e){ const lat = e.latlng.lat.toFixed(6); const lon = e.latlng.lng.toFixed(6); if (resLat) resLat.value = lat; if (resLon) resLon.value = lon; });

  centerMe && centerMe.addEventListener('click', ()=>{ if (!navigator.geolocation){ alert('Geolocation not supported'); return; } navigator.geolocation.getCurrentPosition(pos=>{ map.setView([pos.coords.latitude, pos.coords.longitude], 15); }, ()=>{ alert('Unable to get your location'); }); });

  setTimeout(()=>{ try{ map.invalidateSize(); }catch(e){} },500);
});