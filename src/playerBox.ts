export const PLAYER_TARGET_HEIGHT = 190;
export const PLAYER_Y_OFFSET = -10;
export const PLAYER_TAG_WIDTH = 223;
export const PLAYER_TAG_HEIGHT = 37;
export const PLAYER_TAG_BOTTOM_OFFSET = 83;

export const getPlayerNameFontSize = (name: string) =>
  name.length >= 12 ? 24.5 : name.length >= 10 ? 26 : 29.25;

export const drawPlayerTag = (
  ctx: CanvasRenderingContext2D,
  tagImage: CanvasImageSource,
  x: number,
  y: number,
  displayName: string,
) => {
  const tagX = x - PLAYER_TAG_WIDTH / 2;
  const tagY = y - PLAYER_TAG_HEIGHT + PLAYER_TAG_BOTTOM_OFFSET;

  ctx.drawImage(tagImage, tagX, tagY, PLAYER_TAG_WIDTH, PLAYER_TAG_HEIGHT);
  if (!displayName) return;

  const name = displayName.toUpperCase();
  ctx.fillStyle = 'black';
  ctx.font = `bold ${getPlayerNameFontSize(name)}px "Kelson Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x - 3, tagY + PLAYER_TAG_HEIGHT / 2 + 5);
};
