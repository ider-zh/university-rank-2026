interface AlumniPayload {
  release: string;
  sprite: { url: string; width: number; height: number } | null;
  people: { id: string; names: { en: string; zh: string }; description: string; rect: { x: number; y: number; width: number; height: number } }[];
}

for (const details of document.querySelectorAll<HTMLDetailsElement>('[data-alumni]')) {
  const status = details.querySelector<HTMLElement>('[data-status]')!;
  const grid = details.querySelector<HTMLElement>('[data-people]')!;
  const retry = details.querySelector<HTMLButtonElement>('[data-retry]')!;
  const zh = details.dataset.locale === 'zh';
  let state: 'idle' | 'loading' | 'loaded' = 'idle';
  async function load() {
    if (state !== 'idle') return;
    state = 'loading';
    retry.hidden = true;
    status.textContent = zh ? '正在加载人物故事…' : 'Loading people…';
    try {
      const response = await fetch(details.dataset.url!, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: AlumniPayload = await response.json();
      if (data.release !== details.dataset.release || !Array.isArray(data.people)) throw new Error('Invalid alumni release');
      let imageAvailable = false;
      if (data.sprite) {
        const image = new Image();
        image.src = data.sprite.url;
        try {
          await Promise.race([image.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error('Image timeout')), 15000))]);
          imageAvailable = true;
        } catch { /* Keep names and links usable when the image cannot load. */ }
      }
      const cards = data.people.map(person => {
        const card = document.createElement('article');
        card.className = 'alumni-card';
        const portrait = document.createElement('div');
        portrait.className = 'portrait';
        portrait.setAttribute('aria-hidden', 'true');
        if (data.sprite && imageAvailable) {
          portrait.style.backgroundImage = `url("${data.sprite.url}")`;
          portrait.style.backgroundSize = `${data.sprite.width}px ${data.sprite.height}px`;
          portrait.style.backgroundPosition = `-${person.rect.x}px -${person.rect.y}px`;
        } else {
          portrait.textContent = (zh ? person.names.zh : person.names.en).slice(0, 1);
          portrait.style.display = 'grid';
          portrait.style.placeItems = 'center';
          portrait.style.fontSize = '32px';
        }
        const name = document.createElement('a');
        name.href = `https://www.wikidata.org/wiki/${encodeURIComponent(person.id)}`;
        name.textContent = zh ? person.names.zh : person.names.en;
        name.target = '_blank';
        name.rel = 'noreferrer';
        card.append(portrait, name);
        return card;
      });
      grid.replaceChildren(...cards);
      status.textContent = data.people.length === 0 ? (zh ? '暂无可用人物样本。' : 'No people available yet.')
        : imageAvailable ? '' : (zh ? '照片暂不可用，人物信息仍可查看。' : 'Photos are unavailable. You can still explore the people below.');
      state = 'loaded';
    } catch {
      status.textContent = zh ? '加载未完成，请重试。' : 'Unable to load. Please try again.';
      retry.hidden = false;
      state = 'idle';
    }
  }
  details.addEventListener('toggle', () => { if (details.open) void load(); });
  retry.addEventListener('click', () => void load());
}
