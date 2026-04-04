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
