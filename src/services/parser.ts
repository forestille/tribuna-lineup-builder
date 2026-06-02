import { Player } from '../types';

export function parseUEFAHtml(html: string): Player[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const players: Player[] = [];

  // Find all role sections
  const roleHeaders = doc.querySelectorAll('.squadlist--role');
  
  roleHeaders.forEach(header => {
    const roleText = header.textContent?.toLowerCase() || '';
    const isGK = roleText.includes('goalkeeper');
    
    // The table is usually the next sibling or close to it
    const table = header.nextElementSibling;
    if (!table || table.tagName !== 'PK-TABLE') return;

    const rows = table.querySelectorAll('pk-table-row.row--squadlist');
    rows.forEach(row => {
      const identifier = row.querySelector('pk-identifier');
      if (!identifier) return;

      const fullName = identifier.querySelector('[slot="primary"]')?.textContent?.trim() || '';
      // Remove the * if present (List B players)
      const cleanName = fullName.replace(/\*/g, '').trim();
      
      const avatar = identifier.querySelector('pk-avatar');
      const imageUrl = avatar?.getAttribute('src') || '';
      
      // Display name is the last word
      const nameParts = cleanName.split(' ');
      const displayName = nameParts[nameParts.length - 1];

      if (cleanName) {
        players.push({
          name: cleanName,
          displayName,
          imageUrl,
          role: isGK ? 'goalkeeper' : 'outfield'
        });
      }
    });
  });

  return players;
}

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const collapseRepeatedText = (value: string) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return '';

  if (normalized.length % 2 === 0) {
    const half = normalized.length / 2;
    const firstHalf = normalized.slice(0, half);
    const secondHalf = normalized.slice(half);
    if (firstHalf === secondHalf) return firstHalf;
  }

  const words = normalized.split(' ');
  if (words.length % 2 === 0) {
    const half = words.length / 2;
    const firstHalf = words.slice(0, half).join(' ');
    const secondHalf = words.slice(half).join(' ');
    if (firstHalf === secondHalf) return firstHalf;
  }

  return normalized;
};

const inferRole = (label: string): Player['role'] => {
  const normalized = normalizeWhitespace(label).toLowerCase();
  return normalized.includes('goalkeeper') || normalized === 'gk' ? 'goalkeeper' : 'outfield';
};

const toDisplayName = (fullName: string) => {
  const parts = normalizeWhitespace(fullName).split(' ');
  return parts[parts.length - 1] || fullName;
};

const getLargestSrcFromSrcset = (srcset: string) => {
  const candidates = Array.from(srcset.matchAll(/(\S.*?)\s+(\d+)w(?=,|$)/g)).map(match => ({
    url: match[1]?.trim() || '',
    width: Number(match[2] || 0),
  }));
  candidates.sort((a, b) => b.width - a.width);
  return candidates[0]?.url || '';
};

const extractAbsoluteUrl = (value: string) => {
  const normalized = value.trim();
  const match = normalized.match(/https?:\/\/\S+/);
  return match?.[0] || normalized;
};

const getImageUrl = (image: Element | null) => {
  if (!image) return '';
  const srcset = image.getAttribute('srcset') || '';
  const imageUrl = getLargestSrcFromSrcset(srcset) || image.getAttribute('src') || '';
  return extractAbsoluteUrl(imageUrl);
};

const getCardName = (card: Element, selector: string) => {
  const preferredNode =
    card.querySelector(`${selector} .d-md-none span`) ||
    card.querySelector(`${selector} .d-none.d-md-block span`) ||
    card.querySelector(`${selector} span`) ||
    card.querySelector(selector);
  return collapseRepeatedText(preferredNode?.textContent || '');
};

export function parseFifaHtml(html: string): Player[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const players: Player[] = [];
  const seen = new Set<string>();

  const addPlayer = (name: string, imageUrl: string, roleLabel: string) => {
    const cleanName = normalizeWhitespace(name);
    if (!cleanName) return;
    const key = `${cleanName.toLowerCase()}::${inferRole(roleLabel)}`;
    if (seen.has(key)) return;
    seen.add(key);
    players.push({
      name: cleanName,
      displayName: toDisplayName(cleanName),
      imageUrl: imageUrl.trim(),
      role: inferRole(roleLabel),
    });
  };

  const squadSections = Array.from(doc.querySelectorAll('[class*="entire-squad_container"]'));
  for (const section of squadSections) {
    const roleLabel = normalizeWhitespace(
      section.querySelector('[class*="entire-squad_title"]')?.textContent || ''
    );
    if (!/goalkeepers?|defenders?|midfielders?|forwards?/i.test(roleLabel)) continue;

    const cards = Array.from(section.querySelectorAll('[class*="player-badge-card_badgeCard"]'));
    for (const card of cards) {
      const name = getCardName(card, '[class*="player-badge-card_playerName"]');
      const image = card.querySelector('[class*="player-badge-card_playerImage"] img, [class*="player-badge-card_playerImageContainer"] img');
      const imageUrl = getImageUrl(image);
      const positionLabel = normalizeWhitespace(
        card.querySelector('[class*="player-badge-card_playerPosition"]')?.textContent || roleLabel
      );
      addPlayer(name, imageUrl, positionLabel);
    }
  }

  if (players.length > 0) return players;

  const squadTitleNodes = Array.from(doc.querySelectorAll('[class*="entire-squad_title"]'));
  for (const titleNode of squadTitleNodes) {
    const roleLabel = normalizeWhitespace(titleNode.textContent || '');
    if (!/goalkeepers?|defenders?|midfielders?|forwards?/i.test(roleLabel)) continue;

    const section = titleNode.closest('[class*="entire-squad_container"]');
    if (!section) continue;

    const cardContainer = section.querySelector('[class*="entire-squad_cardContainer"]') || section;
    const cards = Array.from(cardContainer.children).filter(child =>
      child.className.includes('player-badge-card_badgeCard')
    );

    for (const card of cards) {
      const name = getCardName(card, '[class*="player-badge-card_playerName"]');
      const image = card.querySelector('img[alt][srcset], img[alt][src]');
      const imageUrl = getImageUrl(image);
      const positionLabel = normalizeWhitespace(
        card.querySelector('[class*="player-badge-card_playerPosition"]')?.textContent || roleLabel
      );
      addPlayer(name, imageUrl, positionLabel);
    }
  }

  if (players.length > 0) return players;

  const sectionNodes = Array.from(doc.querySelectorAll('section, div, article'));
  for (const section of sectionNodes) {
    const heading = section.querySelector('h1, h2, h3, h4, [role="heading"]');
    const roleLabel = normalizeWhitespace(heading?.textContent || '');
    if (!/goalkeepers?|defenders?|midfielders?|forwards?/i.test(roleLabel)) continue;

    const cards = Array.from(section.querySelectorAll('a, article, li, div')).filter(node => {
      const img = node.querySelector('img');
      const text = normalizeWhitespace(node.textContent || '');
      return Boolean(img && text && text.length < 120);
    });

    for (const card of cards) {
      const img = card.querySelector('img');
      const rawName = normalizeWhitespace(
        card.querySelector('h3, h4, strong, span, p')?.textContent ||
        img?.getAttribute('alt') ||
        ''
      );
      const imageUrl = img?.getAttribute('src') || img?.getAttribute('data-src') || '';
      addPlayer(rawName, imageUrl, roleLabel);
    }
  }

  if (players.length > 0) return players;

  const playerLinks = Array.from(doc.querySelectorAll('a[href*="/players/"], a[href*="/player/"]'));
  for (const link of playerLinks) {
    const text = normalizeWhitespace(link.textContent || '');
    const img = link.querySelector('img');
    const imageUrl = img?.getAttribute('src') || img?.getAttribute('data-src') || '';
    const containerText = normalizeWhitespace(link.parentElement?.textContent || '');
    addPlayer(text, imageUrl, containerText);
  }

  return players;
}
