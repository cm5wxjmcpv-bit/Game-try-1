import { rollDrops } from './drops.js';
import { GAME_STATES } from './stateManager.js';

function cloneEncounterEnemies(encounter, enemiesById) {
  const battleEnemies = [];
  for (const enemyId of encounter.enemies || []) {
    const template = enemiesById[enemyId];
    if (!template) {
      console.warn(`[BattleSystem] Encounter "${encounter.id}" references missing enemy "${enemyId}".`);
      continue;
    }
    battleEnemies.push({
      id: `${template.id}_battle_${crypto.randomUUID().slice(0, 6)}`,
      template,
      hp: template.stats.maxHp,
      dead: false,
    });
  }
  return battleEnemies;
}

export class BattleSystem {
  constructor(game) {
    this.game = game;
    this.activeBattle = null;
  }

  startFromTrigger(trigger) {
    return this.startEncounter(trigger.encounterId, {
      triggerId: trigger.id,
      triggerOnce: Boolean(trigger.once),
      mapId: this.game.currentMap.id,
      sourceType: 'manual',
    });
  }

  startRandomEncounter(encounterId) {
    return this.startEncounter(encounterId, {
      triggerId: null,
      triggerOnce: false,
      mapId: this.game.currentMap.id,
      sourceType: 'random',
    });
  }

  startEncounter(encounterId, context) {
    const encounter = this.game.db.encountersById[encounterId];
    if (!encounter) {
      this.game.ui.flash(`Encounter not found: ${encounterId}`);
      return false;
    }

    const enemies = cloneEncounterEnemies(encounter, this.game.db.enemiesById);
    if (!enemies.length) {
      this.game.ui.flash(`Encounter has no valid enemies: ${encounter.id}`);
      return false;
    }

    this.activeBattle = {
      encounterId: encounter.id,
      triggerId: context.triggerId,
      triggerOnce: context.triggerOnce,
      mapId: context.mapId,
      sourceType: context.sourceType,
      background: encounter.background || 'default',
      state: 'player_turn',
      turnMessage: 'Your turn. Press E to Attack.',
      enemies,
      selectedEnemyIndex: 0,
      rewardGold: 0,
      rewardDrops: [],
    };

    return true;
  }

  update() {
    const battle = this.activeBattle;
    if (!battle) return;

    if (battle.state !== 'player_turn') return;
    if (!this.game.input.wasActionPressed('interact')) return;

    const target = battle.enemies.find((enemy) => !enemy.dead);
    if (!target) {
      this.finishBattle('victory');
      return;
    }

    const playerAttack = this.game.player.stats.attack;
    const damage = Math.max(1, playerAttack - target.template.stats.defense);
    target.hp -= damage;
    battle.turnMessage = `You hit ${target.template.name} for ${damage}.`;

    if (target.hp <= 0) {
      target.dead = true;
      const reward = rollDrops(target.template, this.game.player, this.game.db.itemsById);
      battle.rewardGold += reward.gold;
      if (reward.drops.length) battle.rewardDrops.push(...reward.drops);
      battle.turnMessage = `${target.template.name} is defeated!`;
    }

    if (battle.enemies.every((enemy) => enemy.dead)) {
      this.finishBattle('victory');
      return;
    }

    this.runEnemyTurn();
  }

  runEnemyTurn() {
    const battle = this.activeBattle;
    if (!battle) return;

    let totalDamage = 0;
    for (const enemy of battle.enemies) {
      if (enemy.dead) continue;
      const damage = Math.max(1, enemy.template.combat.attack - this.game.player.stats.defense);
      this.game.player.stats.hp -= damage;
      totalDamage += damage;
      if (this.game.player.stats.hp <= 0) {
        this.game.player.stats.hp = 0;
        this.finishBattle('defeat');
        return;
      }
    }

    battle.state = 'player_turn';
    battle.turnMessage = totalDamage > 0
      ? `Enemies hit you for ${totalDamage}. Press E to Attack.`
      : 'Enemies did no damage. Press E to Attack.';
  }

  finishBattle(result) {
    const battle = this.activeBattle;
    if (!battle) return;

    if (result === 'victory') {
      if (battle.triggerOnce && battle.triggerId) {
        const key = `${battle.mapId}:${battle.triggerId}`;
        if (!this.game.player.completedBattleTriggers.includes(key)) {
          this.game.player.completedBattleTriggers.push(key);
        }
      }

      const dropsText = battle.rewardDrops.length ? `, Drops: ${battle.rewardDrops.join(', ')}` : '';
      this.game.ui.flash(`Battle won! +${battle.rewardGold} gold${dropsText}`);
      this.game.saveCheckpoint();
      this.game.state.set(GAME_STATES.LEVEL);
    } else {
      this.game.onPlayerDefeated();
    }

    this.game.onBattleEnded(result, battle.sourceType);
    this.activeBattle = null;
  }
}
