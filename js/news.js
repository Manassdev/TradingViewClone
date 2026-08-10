/* News aggregation rendering and category keyword filters */

window.renderNews = function() {
  filterNews('all');
};

window.filterNews = function(cat) {
  document.querySelectorAll('.news-categories button').forEach((btn, i) => {
    const cats = ['all', 'crypto', 'macro'];
    btn.classList.toggle('active', cats[i] === cat);
  });

  const searchInput = document.getElementById('news-search-input');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  
  let list = NEWS_DATA;
  if (cat !== 'all') {
    list = list.filter(n => n.category === cat);
  }
  if (query) {
    list = list.filter(n => n.title.toLowerCase().includes(query) || n.desc.toLowerCase().includes(query));
  }

  const container = document.getElementById('news-feed-list');
  if (container) {
    container.innerHTML = list.map(n => `
      <div class="news-card">
        <span class="news-source">${n.source}</span>
        <h4 class="news-title">${n.title}</h4>
        <p style="font-size:10px; color:var(--text-secondary); margin-top:2px;">${n.desc}</p>
        <span class="news-time">${n.time}</span>
      </div>
    `).join('');
  }
};

window.handleNewsSearch = function(val) {
  const activeChip = document.querySelector('.news-categories button.active');
  const chipText = activeChip ? activeChip.innerText.toLowerCase() : 'all';
  filterNews(chipText.includes('starred') ? 'crypto' : chipText);
};
