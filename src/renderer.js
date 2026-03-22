import { drawMiniMap } from './miniMap.js';
import { debugText } from './debug.js';
import { TILE_SIZE } from './camera.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.textureImageCache = new Map();
    this.textureImageFailures = new Set();
  }

  render(game) {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!game.currentMap) return;

    game.camera.setViewport(this.canvas.width, this.canvas.height);
    game.camera.update(game.player.x, game.player.y, game.currentMap.width, game.currentMap.height);

    this.drawMap(game);
    this.drawObjects(game);
    this.drawEntities(game);
    this.drawFx(game);
    if (game.showMiniMap) drawMiniMap(ctx, game, this.canvas.width - 210, 10, 200, 140);
    if (game.debug.enabled) this.drawDebug(game);
  }

  drawMap(game) {
    const { ctx } = this;
    const pack = game.db.texturePack;
    const map = game.currentMap;

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!game.camera.isVisible(x, y)) continue;
        const tileId = map.tiles[y][x];
        const tileDef = game.db.tileDefs[tileId];
        if (!tileDef) continue;
        const style = pack[tileDef.texture] || { color: '#ff00ff' };
        const pos = game.camera.worldToScreen(x, y);
        const textureImage = this.getTextureImage(style.image);
        if (textureImage) {
          ctx.drawImage(textureImage, pos.x, pos.y, TILE_SIZE, TILE_SIZE);
        } else {
          ctx.fillStyle = style.color;
          ctx.fillRect(pos.x, pos.y, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  getTextureImage(imagePath) {
    if (!imagePath || this.textureImageFailures.has(imagePath)) return null;
    const cached = this.textureImageCache.get(imagePath);
    if (cached) {
      return cached.loaded ? cached.image : null;
    }

    const image = new Image();
    const entry = { image, loaded: false };
    image.onload = () => {
      entry.loaded = true;
    };
    image.onerror = () => {
      this.textureImageFailures.add(imagePath);
      this.textureImageCache.delete(imagePath);
    };
    image.src = imagePath;
    this.textureImageCache.set(imagePath, entry);
    return null;
  }

  drawObjects(game) {
    const { ctx } = this;
    for (const portal of game.currentMap.objects.portals || []) {
      const pos = game.camera.worldToScreen(portal.x, portal.y);
      ctx.fillStyle = '#8d7bff';
      ctx.fillRect(pos.x + 4, pos.y + 4, 24, 24);
    }
    for (const shop of game.currentMap.objects.shops || []) {
      const pos = game.camera.worldToScreen(shop.x, shop.y);
      ctx.fillStyle = '#f4bd5a';
      ctx.fillRect(pos.x + 6, pos.y + 6, 20, 20);
    }
    for (const fountain of game.currentMap.objects.fountains || []) {
      const pos = game.camera.worldToScreen(fountain.x, fountain.y);
      ctx.fillStyle = '#45d7f5';
      ctx.fillRect(pos.x + 8, pos.y + 8, 16, 16);
    }
  }

  drawEntities(game) {
    const { ctx } = this;
    const playerPos = game.camera.worldToScreen(game.player.x, game.player.y);
    if (!this.drawPlayerSprite(game, playerPos.x, playerPos.y)) {
      ctx.fillStyle = '#7af0a0';
      ctx.fillRect(playerPos.x + 6, playerPos.y + 6, 20, 20);
    }

    for (const enemy of game.currentEnemies) {
      if (enemy.dead) continue;
      const pos = game.camera.worldToScreen(enemy.x, enemy.y);
      ctx.fillStyle = '#f06464';
      ctx.fillRect(pos.x + 6, pos.y + 6, 20, 20);
    }
  }

  drawPlayerSprite(game, screenX, screenY) {
    const { ctx } = this;
    
    const { player } = game;
    const anim = player.animation;
    if (!anim?.sprite?.imagePath) return false;

    const image = this.getTextureImage(anim.sprite.imagePath);
    if (!image) return false;

    const facingRows = anim.sprite.rowByFacing?.[anim.facing];
    if (!facingRows) return false;

    const state = anim.state === 'walk' ? 'walk' : 'idle';
    const rowIndex = facingRows[state];
    if (!Number.isFinite(rowIndex)) return false;

    const frames = state === 'walk' ? anim.sprite.walkFrames : anim.sprite.idleFrames;
    if (!Array.isArray(frames) || !frames.length) return false;
    const frameSlot = frames[anim.frameIndex % frames.length];
    if (!Number.isFinite(frameSlot)) return false;

    const frameW = anim.sprite.frameWidth;
    const frameH = anim.sprite.frameHeight;
    ctx.drawImage(
      image,
      frameSlot * frameW,
      rowIndex * frameH,
      frameW,
      frameH,
      screenX - TILE_SIZE * 0.5,
      screenY - TILE_SIZE * 0.5,
      TILE_SIZE * 2,
      TILE_SIZE * 2,
    );
    return true;
  }

  drawFx(game) {
    const { ctx } = this;
    for (const m of game.fx.hitMarkers) {
      const pos = game.camera.worldToScreen(m.x, m.y);
      ctx.fillStyle = '#fff';
      ctx.fillText(m.text, pos.x, pos.y - 8);
      m.ttl -= game.dt;
    }
    game.fx.hitMarkers = game.fx.hitMarkers.filter((m) => m.ttl > 0);
  }

  drawDebug(game) {
    const { ctx } = this;
    ctx.strokeStyle = '#ffab4c';
    for (const enemy of game.currentEnemies) {
      if (enemy.dead) continue;
      const ai = enemy.template.ai;
      const pos = game.camera.worldToScreen(enemy.x, enemy.y);
      ctx.beginPath();
      ctx.arc(pos.x + 16, pos.y + 16, ai.aggroRange * TILE_SIZE, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = '#8d7bff';
    for (const portal of game.currentMap.objects.portals || []) {
      const pos = game.camera.worldToScreen(portal.x, portal.y);
      ctx.strokeRect(pos.x + 4, pos.y + 4, 24, 24);
      const label = portal.targetTown ? `to:${portal.targetTown}` : `levels:${(portal.levels || []).join(',')}`;
      ctx.fillStyle = '#ddd';
      ctx.fillText(label, pos.x - 8, pos.y - 4);
    }

    ctx.strokeStyle = '#6bf7b3';
    const playerPos = game.camera.worldToScreen(game.player.x, game.player.y);
    ctx.strokeRect(playerPos.x + 6, playerPos.y + 6, 20, 20);

    ctx.strokeStyle = '#ffdd66';
    ctx.strokeRect(0, 0, game.camera.viewportWidth, game.camera.viewportHeight);

    ctx.fillStyle = '#111';
    ctx.fillRect(8, 8, 430, 92);
    ctx.fillStyle = '#fff';
    debugText(game).forEach((line, i) => ctx.fillText(line, 14, 28 + i * 16));
  }
}
