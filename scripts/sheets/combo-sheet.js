// Combo 아이템 시트
(function() {
class DX3rdComboSheet extends window.DX3rdItemSheet {
  /** @override */
  _getHeaderButtons() {
    let buttons = super._getHeaderButtons();
    
    // 확장 도구 버튼 추가
    buttons.unshift({
      label: game.i18n.localize("DX3rd.ItemExtend"),
      class: "item-extend",
      icon: "fa-solid fa-screwdriver-wrench",
      onclick: (ev) => this._onItemExtendClick(ev)
    });
    
    return buttons;
  }
  
  async _onItemExtendClick(event) {
    event.preventDefault();
    
    const actor = this.item.actor;
    
    // 확장 도구 다이얼로그 열기 (액터가 있으면 actorId 전달, 없으면 null)
    new DX3rdItemExtendDialog({
      title: game.i18n.localize("DX3rd.ItemExtend"),
      actorId: actor ? actor.id : null,
      itemId: this.item.id,
      buttons: {
        close: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("DX3rd.Close")
        }
      },
      default: "close"
    }).render(true);
  }
  
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "systems/double-cross-3rd/templates/item/combo-sheet.html",
      width: 520,
      height: 480
    });
  }

  /** @override */
  async getData(options) {
    let data = await super.getData(options);

    // Description 원문을 아이템에서 보강
    if (data.system.description === undefined) {
      data.system.description = this.item.system?.description || "";
    }

    // 콤보 시트 필드 초기화 (기존 데이터 보존)

    // 기본 필드들 초기화
    data.system.skill = this.item.system?.skill || "-";
    data.system.base = this.item.system?.base || "-";
    data.system.roll = this.item.system?.roll || "-";
    data.system.difficulty = this.item.system?.difficulty || "";
    data.system.timing = this.item.system?.timing || "-";
    data.system.range = this.item.system?.range || "";
    data.system.target = this.item.system?.target || "";
    data.system.getTarget = this.item.system?.getTarget || false;
    data.system.limit = this.item.system?.limit || "-";

    // active 객체 초기화 (기존 데이터 보존)
    if (!data.system.active) data.system.active = {};
    if (data.system.active.state === undefined) data.system.active.state = this.item.system?.active?.state || false;
    if (data.system.active.disable === undefined) data.system.active.disable = this.item.system?.active?.disable || "notCheck";
    if (data.system.active.runTiming === undefined) data.system.active.runTiming = this.item.system?.active?.runTiming || "instant";

    // effect 객체 초기화 (기존 데이터 보존)
    if (!data.system.effect) data.system.effect = {};
    if (data.system.effect.disable === undefined) data.system.effect.disable = this.item.system?.effect?.disable || "notCheck";
    if (data.system.effect.runTiming === undefined) data.system.effect.runTiming = this.item.system?.effect?.runTiming || "instant";

    // macro 초기화
    data.system.macro = this.item.system?.macro || "";

    // 이펙트 관련 데이터 초기화
    data.system.effectTmp = this.item.system?.effectTmp || "-";
    // effectIds: 콤보에 포함된 이펙트 아이디 배열 (system.effect와 설정 객체 충돌 방지)
    data.system.effectIds = this.item.system?.effectIds || this.item.system?.effect || [];
    data.system.effectItems = {};
    
    // system.roll과 system.attackRoll 확인
    const hasRoll = data.system.roll && data.system.roll !== '-';
    const hasAttackRoll = data.system.attackRoll && data.system.attackRoll !== '-';
    
    // roll이 "-"이면 다이스/크리티컬/수정치를 "-"로 표시
    if (!hasRoll) {
      data.system.dice = { value: '-' };
      data.system.critical = { value: '-', min: '-' };
      data.system.add = { value: '-' };
    } else {
      data.system.dice = this.item.system?.dice || { value: 0 };
      data.system.critical = this.item.system?.critical || { value: 0, min: 2 };
      data.system.add = this.item.system?.add || { value: 0 };
    }
    
    // attackRoll이 "-"이면 공격력을 "-"로 표시
    if (!hasAttackRoll) {
      data.system.attack = { value: '-' };
    } else {
      data.system.attack = this.item.system?.attack || { value: 0 };
    }
    
    data.system.encroach = this.item.system?.encroach || { value: 0 };

    // 액터 이펙트 아이템 목록 생성 (sort 값으로 정렬)
    data.actorEffect = {};
    if (this.actor) {
      const effectItems = this.actor.items.filter(item => item.type === 'effect')
        .sort((a, b) => (a.sort || 0) - (b.sort || 0));
      effectItems.forEach(item => {
        data.actorEffect[item.id] = item.name;
      });
    }

    // 이펙트 아이템 데이터 로드 및 침식률 자동 계산
    let totalDice = 0;
    let totalAdd = 0;
    
    if (Array.isArray(data.system.effectIds)) {
      data.system.effectIds.forEach(effectId => {
        if (effectId && effectId !== '-') {
          // 액터의 이펙트 아이템에서 찾기
          const effectItem = this.actor?.items.get(effectId);
          if (effectItem) {
            data.system.effectItems[effectId] = effectItem;
            // 침식률 합산 (필드명: encroach, not encroachment)
            const encValue = String(effectItem.system.encroach?.value || '0').trim();
            
            // 다이스 공식 파싱: "2d10+5" → dice: 2, add: 5
            const diceMatch = encValue.match(/(\d+)d10/i);
            const addMatch = encValue.match(/([+-]\d+)$/);
            
            if (diceMatch) {
              totalDice += parseInt(diceMatch[1]) || 0;
            }
            
            if (addMatch) {
              totalAdd += parseInt(addMatch[1]) || 0;
            } else if (!diceMatch && !isNaN(parseInt(encValue))) {
              // 순수 숫자만 있는 경우
              totalAdd += parseInt(encValue) || 0;
            }
          }
        }
      });
    }
    
    // 최종 침식률 공식 생성
    let totalEncroachment = '';
    if (totalDice > 0 && totalAdd > 0) {
      totalEncroachment = `${totalDice}d10+${totalAdd}`;
    } else if (totalDice > 0) {
      totalEncroachment = `${totalDice}d10`;
    } else {
      totalEncroachment = String(totalAdd);
    }
    
    // 계산된 총 침식률을 data.system.encroach에 반영
    data.system.encroach = { value: totalEncroachment };

    // roll이 설정되어 있으면 다이스/크리티컬/수정치 자동 계산
    if (hasRoll) {
      const skillKey = data.system.skill;
      const baseKey = data.system.base || '-';
      
      if (this.actor && skillKey && skillKey !== '-') {
        // 스킬이 능력치인 경우 vs 일반 스킬인 경우
        const attributes = ['body', 'sense', 'mind', 'social'];
        let skillData = null;
        let baseData = null;
        
        if (attributes.includes(skillKey)) {
          // 능력치를 직접 사용하는 경우
          skillData = this.actor.system.attributes[skillKey];
          baseData = skillData;  // base = 능력치 자체
        } else {
          // 일반 스킬인 경우
          skillData = this.actor.system.attributes.skills?.[skillKey];
          
          // base 확인: system.base가 설정되어 있으면 그것 사용, 없으면 스킬의 기본 base
          const effectiveBase = (baseKey && baseKey !== '-') ? baseKey : skillData?.base;
          
          if (effectiveBase && attributes.includes(effectiveBase)) {
            baseData = this.actor.system.attributes[effectiveBase];
          }
        }
        
        if (skillData && baseData) {
          const rollType = data.system.roll;
          
          // 스킬이 능력치인 경우와 일반 스킬인 경우 분기
          let dice = 0;
          let add = 0;
          let critical = 10;
          let criticalMin = this.actor.system.attributes.critical?.min || 2;
          
          if (attributes.includes(skillKey)) {
            // 능력치를 직접 사용하는 경우 (body, sense, mind, social)
            // base의 roll 타입별 데이터 사용
            if (rollType === 'major' && baseData.major) {
              dice = baseData.major.dice || 0;
              add = baseData.major.add || 0;
              critical = baseData.major.critical || 10;
            } else if (rollType === 'reaction' && baseData.reaction) {
              dice = baseData.reaction.dice || 0;
              add = baseData.reaction.add || 0;
              critical = baseData.reaction.critical || 10;
            } else if (rollType === 'dodge' && baseData.dodge) {
              dice = baseData.dodge.dice || 0;
              add = baseData.dodge.add || 0;
              critical = baseData.dodge.critical || 10;
            }
          } else {
            // 일반 스킬인 경우
            // 커스텀 base를 사용하는 경우, base의 roll 데이터 + 스킬 순수 보정
            const originalBase = skillData.base;
            const originalBaseData = this.actor.system.attributes[originalBase];
            
            // 스킬의 순수 보정 계산
            const skillDiceBonus = (skillData.dice || 0) - (originalBaseData?.dice || 0);
            const skillAddBonus = (skillData.add || 0) - (originalBaseData?.add || 0);
            
            // 커스텀 base의 roll 타입별 데이터
            let baseRollData = null;
            if (rollType === 'major') {
              baseRollData = baseData.major;
            } else if (rollType === 'reaction') {
              baseRollData = baseData.reaction;
            } else if (rollType === 'dodge') {
              baseRollData = baseData.dodge;
            }
            
            if (baseRollData) {
              dice = (baseRollData.dice || 0) + skillDiceBonus;
              add = (baseRollData.add || 0) + skillAddBonus;
              critical = baseRollData.critical || 10;
            }
          }
          
          // 무기 add 보너스 추가 (system.attackRoll이 '-'가 아닐 경우)
          let weaponAddBonus = 0;
          const currentAttackRoll = this.item.system.attackRoll || data.system.attackRoll;
          if (currentAttackRoll && currentAttackRoll !== '-') {
            const registeredWeapons = this.item.system.weapon || data.system.weapon || [];
            
            for (const weaponId of registeredWeapons) {
              if (weaponId && weaponId !== '-') {
                const weaponItem = this.actor?.items.get(weaponId);
                if (weaponItem) {
                  const weaponAdd = Number(weaponItem.system?.add) || 0;
                  weaponAddBonus += weaponAdd;
                }
              }
            }
            
            add += weaponAddBonus;
          }
          
          // 콤보 아이템 자체의 attributes 보너스 추가 (활성화되지 않은 경우만)
          // stat_bonus, skill_bonus는 제외 (능력치/스킬 total 값에 영향을 주므로 dice/add 계산과는 별개)
          if (rollType && rollType !== '-') {
            const comboIsActive = this.item.system?.active?.state === true;
            let comboCriticalMod = 0;
            
            if (!comboIsActive) {
              // 능력치/스킬명 확인
              // 콤보의 system.base가 설정되어 있으면 그것을 우선 사용
              const isAbility = attributes.includes(skillKey);
              const effectiveBaseKey = (baseKey && baseKey !== '-') ? baseKey : (isAbility ? skillKey : skillData?.base);
              
              // 콤보 아이템 자체의 attributes 계산
              if (this.item.system?.attributes) {
                for (const [attrKey, attrData] of Object.entries(this.item.system.attributes)) {
                  if (!attrData || !attrData.key || !attrData.value) continue;
                  
                  // 판정 타입별 보너스 계산
                  if (rollType === 'major') {
                    if (attrData.key === 'major_dice') {
                      const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                      dice += Number(bonusValue) || 0;
                    } else if (attrData.key === 'major_add') {
                      const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                      add += Number(bonusValue) || 0;
                    } else if (attrData.key === 'major_critical') {
                      const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                      comboCriticalMod += Number(bonusValue) || 0;
                    } else if (attrData.key === 'dice') {
                      const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                      dice += Number(bonusValue) || 0;
                    } else if (attrData.key === 'add') {
                      const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                      add += Number(bonusValue) || 0;
                    } else if (attrData.key === 'critical') {
                      const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                      comboCriticalMod += Number(bonusValue) || 0;
                    } else if (attrData.key === 'critical_min' && attrData.value) {
                      const minValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 10;
                      const numValue = Number(minValue) || 10;
                      if (numValue < criticalMin) {
                        criticalMin = numValue;
                      }
                    }
                  } else if (rollType === 'reaction') {
                    if (attrData.key === 'reaction_dice') {
                      const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                      dice += Number(bonusValue) || 0;
                    } else if (attrData.key === 'reaction_add') {
                      const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                      add += Number(bonusValue) || 0;
                    } else if (attrData.key === 'reaction_critical') {
                      const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                      comboCriticalMod += Number(bonusValue) || 0;
                    } else if (attrData.key === 'dice') {
                      const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                      dice += Number(bonusValue) || 0;
                    } else if (attrData.key === 'add') {
                      const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                      add += Number(bonusValue) || 0;
                    } else if (attrData.key === 'critical') {
                      const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                      comboCriticalMod += Number(bonusValue) || 0;
                    } else if (attrData.key === 'critical_min' && attrData.value) {
                      const minValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 10;
                      const numValue = Number(minValue) || 10;
                      if (numValue < criticalMin) {
                        criticalMin = numValue;
                      }
                    }
                  } else if (rollType === 'dodge') {
                    if (attrData.key === 'reaction_dice' || attrData.key === 'dodge_dice') {
                      const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                      dice += Number(bonusValue) || 0;
                    } else if (attrData.key === 'reaction_add' || attrData.key === 'dodge_add') {
                      const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                      add += Number(bonusValue) || 0;
                    } else if (attrData.key === 'reaction_critical' || attrData.key === 'dodge_critical') {
                      const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                      comboCriticalMod += Number(bonusValue) || 0;
                    } else if (attrData.key === 'dice') {
                      const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                      dice += Number(bonusValue) || 0;
                    } else if (attrData.key === 'add') {
                      const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                      add += Number(bonusValue) || 0;
                    } else if (attrData.key === 'critical') {
                      const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                      comboCriticalMod += Number(bonusValue) || 0;
                    } else if (attrData.key === 'critical_min' && attrData.value) {
                      const minValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 10;
                      const numValue = Number(minValue) || 10;
                      if (numValue < criticalMin) {
                        criticalMin = numValue;
                      }
                    }
                  }
                  
                  // 능력치/스킬 보너스는 모든 판정 타입에 적용
                  if (attrData.key === 'stat_dice' && attrData.label) {
                    if (isAbility && attrData.label === skillKey) {
                      const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                      dice += Number(bonusValue) || 0;
                    } else if (!isAbility) {
                      const matchesDirect = attrData.label === skillKey;
                      const matchesGroup = window.DX3rdSkillGroupMatcher?.isSkillInGroup(skillKey, attrData.label);
                      const matchesBase = effectiveBaseKey && attrData.label === effectiveBaseKey;
                      if (matchesDirect || matchesGroup || matchesBase) {
                        const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                        dice += Number(bonusValue) || 0;
                      }
                    }
                  } else if (attrData.key === 'stat_add' && attrData.label) {
                    if (isAbility && attrData.label === skillKey) {
                      const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                      add += Number(bonusValue) || 0;
                    } else if (!isAbility) {
                      const matchesDirect = attrData.label === skillKey;
                      const matchesGroup = window.DX3rdSkillGroupMatcher?.isSkillInGroup(skillKey, attrData.label);
                      const matchesBase = effectiveBaseKey && attrData.label === effectiveBaseKey;
                      if (matchesDirect || matchesGroup || matchesBase) {
                        const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
                        add += Number(bonusValue) || 0;
                      }
                    }
                  }
                  // stat_bonus, skill_bonus는 제외
                }
              }
              
              // 콤보 아이템 자체의 effect.attributes 계산
              if (this.item.system?.effect?.attributes) {
                for (const [attrName, attrValue] of Object.entries(this.item.system.effect.attributes)) {
                  const aKey = (typeof attrValue === 'object' && attrValue.key) ? attrValue.key : attrName;
                  const aLabel = (typeof attrValue === 'object' && attrValue.label) ? attrValue.label : 
                                (typeof attrName === 'string' && attrName.includes(':')) ? attrName.split(':')[1] : '';
                  if (!aKey) continue;
                  
                  // 판정 타입별 보너스 계산
                  if (rollType === 'major') {
                    if (aKey === 'major_dice') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 0) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                      dice += Number(evalValue) || 0;
                    } else if (aKey === 'major_add') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 0) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                      add += Number(evalValue) || 0;
                    } else if (aKey === 'major_critical') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 0) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                      comboCriticalMod += Number(evalValue) || 0;
                    } else if (aKey === 'dice') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 0) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                      dice += Number(evalValue) || 0;
                    } else if (aKey === 'add') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 0) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                      add += Number(evalValue) || 0;
                    } else if (aKey === 'critical') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 0) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                      comboCriticalMod += Number(evalValue) || 0;
                    } else if (aKey === 'critical_min') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 10) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 10);
                      const numValue = Number(evalValue) || 10;
                      if (numValue < criticalMin) {
                        criticalMin = numValue;
                      }
                    }
                  } else if (rollType === 'reaction') {
                    if (aKey === 'reaction_dice') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 0) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                      dice += Number(evalValue) || 0;
                    } else if (aKey === 'reaction_add') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 0) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                      add += Number(evalValue) || 0;
                    } else if (aKey === 'reaction_critical') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 0) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                      comboCriticalMod += Number(evalValue) || 0;
                    } else if (aKey === 'dice') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 0) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                      dice += Number(evalValue) || 0;
                    } else if (aKey === 'add') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 0) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                      add += Number(evalValue) || 0;
                    } else if (aKey === 'critical') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 0) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                      comboCriticalMod += Number(evalValue) || 0;
                    } else if (aKey === 'critical_min') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 10) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 10);
                      const numValue = Number(evalValue) || 10;
                      if (numValue < criticalMin) {
                        criticalMin = numValue;
                      }
                    }
                  } else if (rollType === 'dodge') {
                    if (aKey === 'reaction_dice' || aKey === 'dodge_dice') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 0) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                      dice += Number(evalValue) || 0;
                    } else if (aKey === 'reaction_add' || aKey === 'dodge_add') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 0) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                      add += Number(evalValue) || 0;
                    } else if (aKey === 'reaction_critical' || aKey === 'dodge_critical') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 0) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                      comboCriticalMod += Number(evalValue) || 0;
                    } else if (aKey === 'dice') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 0) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                      dice += Number(evalValue) || 0;
                    } else if (aKey === 'add') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 0) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                      add += Number(evalValue) || 0;
                    } else if (aKey === 'critical') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 0) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                      comboCriticalMod += Number(evalValue) || 0;
                    } else if (aKey === 'critical_min') {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 10) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 10);
                      const numValue = Number(evalValue) || 10;
                      if (numValue < criticalMin) {
                        criticalMin = numValue;
                      }
                    }
                  }
                  
                  // 능력치/스킬 보너스는 모든 판정 타입에 적용
                  if (aKey === 'stat_dice' && aLabel) {
                    if (isAbility && aLabel === skillKey) {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 0) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                      dice += Number(evalValue) || 0;
                    } else if (!isAbility) {
                      const matchesDirect = aLabel === skillKey;
                      const matchesGroup = window.DX3rdSkillGroupMatcher?.isSkillInGroup(skillKey, aLabel);
                      const matchesBase = effectiveBaseKey && aLabel === effectiveBaseKey;
                      if (matchesDirect || matchesGroup || matchesBase) {
                        const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                          ? (Number(attrValue.value) || 0) 
                          : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                        dice += Number(evalValue) || 0;
                      }
                    }
                  } else if (aKey === 'stat_add' && aLabel) {
                    if (isAbility && aLabel === skillKey) {
                      const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                        ? (Number(attrValue.value) || 0) 
                        : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                      add += Number(evalValue) || 0;
                    } else if (!isAbility) {
                      const matchesDirect = aLabel === skillKey;
                      const matchesGroup = window.DX3rdSkillGroupMatcher?.isSkillInGroup(skillKey, aLabel);
                      const matchesBase = effectiveBaseKey && aLabel === effectiveBaseKey;
                      if (matchesDirect || matchesGroup || matchesBase) {
                        const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                          ? (Number(attrValue.value) || 0) 
                          : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
                        add += Number(evalValue) || 0;
                      }
                    }
                  }
                  // stat_bonus, skill_bonus는 제외
                }
              }
              
              // 콤보 아이템 자체의 critical 보너스 적용
              critical = critical + comboCriticalMod;
            }
          }
          
          // 이펙트 attributes 보너스 추가 (활성화되지 않은 것만)
          // stat_bonus, skill_bonus는 제외 (능력치/스킬 total 값에 영향을 주므로 dice/add 계산과는 별개)
          if (rollType && rollType !== '-' && Array.isArray(data.system.effectIds)) {
            let effectDiceBonus = 0;
            let effectAddBonus = 0;
            let effectCriticalMod = 0;
            let effectCriticalMin = criticalMin; // 초기값은 현재 criticalMin
            
            // 능력치/스킬명 확인
            // 콤보의 system.base가 설정되어 있으면 그것을 우선 사용
            const isAbility = attributes.includes(skillKey);
            const effectiveBaseKey = (baseKey && baseKey !== '-') ? baseKey : (isAbility ? skillKey : skillData?.base);
            
            for (const effectId of data.system.effectIds) {
              if (effectId && effectId !== '-') {
                const effectItem = this.actor?.items.get(effectId);
                if (effectItem && effectItem.type === 'effect') {
                  // 활성화된 이펙트는 이미 액터의 prepareData에서 계산되었으므로 제외 (2중 계산 방지)
                  const isActive = effectItem.system?.active?.state === true;
                  if (isActive) continue;
                  
                  // 이펙트의 attributes 확인 (활성화되지 않은 것만 계산)
                  if (effectItem.system?.attributes) {
                    for (const [attrKey, attrData] of Object.entries(effectItem.system.attributes)) {
                      if (!attrData || !attrData.key || !attrData.value) continue;
                      
                      // 판정 타입별 보너스 계산
                      if (rollType === 'major') {
                        // major 판정용
                        if (attrData.key === 'major_dice') {
                          const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                          effectDiceBonus += Number(bonusValue) || 0;
                        } else if (attrData.key === 'major_add') {
                          const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                          effectAddBonus += Number(bonusValue) || 0;
                        } else if (attrData.key === 'major_critical') {
                          const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                          effectCriticalMod += Number(bonusValue) || 0;
                        } else if (attrData.key === 'dice') {
                          // 일반 dice 보너스
                          const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                          effectDiceBonus += Number(bonusValue) || 0;
                        } else if (attrData.key === 'add') {
                          // 일반 add 보너스
                          const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                          effectAddBonus += Number(bonusValue) || 0;
                        } else if (attrData.key === 'critical') {
                          // 일반 critical 보너스
                          const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                          effectCriticalMod += Number(bonusValue) || 0;
                        }
                      } else if (rollType === 'reaction') {
                        // reaction 판정용
                        if (attrData.key === 'reaction_dice') {
                          const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                          effectDiceBonus += Number(bonusValue) || 0;
                        } else if (attrData.key === 'reaction_add') {
                          const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                          effectAddBonus += Number(bonusValue) || 0;
                        } else if (attrData.key === 'reaction_critical') {
                          const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                          effectCriticalMod += Number(bonusValue) || 0;
                        } else if (attrData.key === 'dice') {
                          // 일반 dice 보너스
                          const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                          effectDiceBonus += Number(bonusValue) || 0;
                        } else if (attrData.key === 'add') {
                          // 일반 add 보너스
                          const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                          effectAddBonus += Number(bonusValue) || 0;
                        } else if (attrData.key === 'critical') {
                          // 일반 critical 보너스
                          const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                          effectCriticalMod += Number(bonusValue) || 0;
                        }
                      } else if (rollType === 'dodge') {
                        // dodge 판정용 (reaction 보너스도 함께 적용)
                        if (attrData.key === 'reaction_dice' || attrData.key === 'dodge_dice') {
                          const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                          effectDiceBonus += Number(bonusValue) || 0;
                        } else if (attrData.key === 'reaction_add' || attrData.key === 'dodge_add') {
                          const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                          effectAddBonus += Number(bonusValue) || 0;
                        } else if (attrData.key === 'reaction_critical' || attrData.key === 'dodge_critical') {
                          const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                          effectCriticalMod += Number(bonusValue) || 0;
                        } else if (attrData.key === 'dice') {
                          // 일반 dice 보너스
                          const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                          effectDiceBonus += Number(bonusValue) || 0;
                        } else if (attrData.key === 'add') {
                          // 일반 add 보너스
                          const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                          effectAddBonus += Number(bonusValue) || 0;
                        } else if (attrData.key === 'critical') {
                          // 일반 critical 보너스
                          const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                          effectCriticalMod += Number(bonusValue) || 0;
                        }
                      }
                      
                      // 능력치/스킬 보너스는 모든 판정 타입에 적용
                      if (attrData.key === 'stat_dice' && attrData.label) {
                        // 능력치/스킬 다이스 보너스: 능력치 직접 사용 시 또는 스킬 사용 시 해당하는 것만
                        if (isAbility && attrData.label === skillKey) {
                          const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                          effectDiceBonus += Number(bonusValue) || 0;
                        } else if (!isAbility) {
                          // 스킬 사용 시: 스킬명, 스킬 그룹, 또는 base 능력치 매칭
                          const matchesDirect = attrData.label === skillKey;
                          const matchesGroup = window.DX3rdSkillGroupMatcher?.isSkillInGroup(skillKey, attrData.label);
                          const matchesBase = effectiveBaseKey && attrData.label === effectiveBaseKey;
                          if (matchesDirect || matchesGroup || matchesBase) {
                            const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                            effectDiceBonus += Number(bonusValue) || 0;
                          }
                        }
                      } else if (attrData.key === 'stat_add' && attrData.label) {
                        // 능력치/스킬 수정치 보너스
                        if (isAbility && attrData.label === skillKey) {
                          const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                          effectAddBonus += Number(bonusValue) || 0;
                        } else if (!isAbility) {
                          // 스킬 사용 시: 스킬명, 스킬 그룹, 또는 base 능력치 매칭
                          const matchesDirect = attrData.label === skillKey;
                          const matchesGroup = window.DX3rdSkillGroupMatcher?.isSkillInGroup(skillKey, attrData.label);
                          const matchesBase = effectiveBaseKey && attrData.label === effectiveBaseKey;
                          if (matchesDirect || matchesGroup || matchesBase) {
                            const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                            effectAddBonus += Number(bonusValue) || 0;
                          }
                        }
                      } else if (attrData.key === 'critical_min' && attrData.value) {
                        // 크리티컬 하한치: 가장 작은 값을 사용
                        const minValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 10;
                        const numValue = Number(minValue) || 10;
                        if (numValue < effectCriticalMin) {
                          effectCriticalMin = numValue;
                        }
                      }
                      // stat_bonus, skill_bonus는 제외 (능력치/스킬 total 값에 영향을 주므로 dice/add 계산과는 별개)
                    }
                  }
                  
                  // effect.attributes도 확인 (활성화 상태 체크하지 않음)
                  if (effectItem.system?.effect?.attributes) {
                    for (const [attrName, attrValue] of Object.entries(effectItem.system.effect.attributes)) {
                      const aKey = (typeof attrValue === 'object' && attrValue.key) ? attrValue.key : attrName;
                      const aLabel = (typeof attrValue === 'object' && attrValue.label) ? attrValue.label : 
                                    (typeof attrName === 'string' && attrName.includes(':')) ? attrName.split(':')[1] : '';
                      if (!aKey) continue;
                      
                      // 판정 타입별 보너스 계산
                      if (rollType === 'major') {
                        // major 판정용
                        if (aKey === 'major_dice') {
                          const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                            ? (Number(attrValue.value) || 0) 
                            : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                          effectDiceBonus += Number(evalValue) || 0;
                        } else if (aKey === 'major_add') {
                          const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                            ? (Number(attrValue.value) || 0) 
                            : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                          effectAddBonus += Number(evalValue) || 0;
                        } else if (aKey === 'major_critical') {
                          const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                            ? (Number(attrValue.value) || 0) 
                            : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                          effectCriticalMod += Number(evalValue) || 0;
                        } else if (aKey === 'dice') {
                          // 일반 dice 보너스
                          const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                            ? (Number(attrValue.value) || 0) 
                            : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                          effectDiceBonus += Number(evalValue) || 0;
                        } else if (aKey === 'add') {
                          // 일반 add 보너스
                          const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                            ? (Number(attrValue.value) || 0) 
                            : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                          effectAddBonus += Number(evalValue) || 0;
                        } else if (aKey === 'critical') {
                          // 일반 critical 보너스
                          const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                            ? (Number(attrValue.value) || 0) 
                            : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                          effectCriticalMod += Number(evalValue) || 0;
                        }
                      } else if (rollType === 'reaction') {
                        // reaction 판정용
                        if (aKey === 'reaction_dice') {
                          const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                            ? (Number(attrValue.value) || 0) 
                            : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                          effectDiceBonus += Number(evalValue) || 0;
                        } else if (aKey === 'reaction_add') {
                          const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                            ? (Number(attrValue.value) || 0) 
                            : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                          effectAddBonus += Number(evalValue) || 0;
                        } else if (aKey === 'reaction_critical') {
                          const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                            ? (Number(attrValue.value) || 0) 
                            : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                          effectCriticalMod += Number(evalValue) || 0;
                        } else if (aKey === 'dice') {
                          // 일반 dice 보너스
                          const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                            ? (Number(attrValue.value) || 0) 
                            : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                          effectDiceBonus += Number(evalValue) || 0;
                        } else if (aKey === 'add') {
                          // 일반 add 보너스
                          const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                            ? (Number(attrValue.value) || 0) 
                            : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                          effectAddBonus += Number(evalValue) || 0;
                        } else if (aKey === 'critical') {
                          // 일반 critical 보너스
                          const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                            ? (Number(attrValue.value) || 0) 
                            : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                          effectCriticalMod += Number(evalValue) || 0;
                        }
                      } else if (rollType === 'dodge') {
                        // dodge 판정용 (reaction 보너스도 함께 적용)
                        if (aKey === 'reaction_dice' || aKey === 'dodge_dice') {
                          const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                            ? (Number(attrValue.value) || 0) 
                            : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                          effectDiceBonus += Number(evalValue) || 0;
                        } else if (aKey === 'reaction_add' || aKey === 'dodge_add') {
                          const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                            ? (Number(attrValue.value) || 0) 
                            : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                          effectAddBonus += Number(evalValue) || 0;
                        } else if (aKey === 'reaction_critical' || aKey === 'dodge_critical') {
                          const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                            ? (Number(attrValue.value) || 0) 
                            : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                          effectCriticalMod += Number(evalValue) || 0;
                        } else if (aKey === 'dice') {
                          // 일반 dice 보너스
                          const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                            ? (Number(attrValue.value) || 0) 
                            : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                          effectDiceBonus += Number(evalValue) || 0;
                        } else if (aKey === 'add') {
                          // 일반 add 보너스
                          const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                            ? (Number(attrValue.value) || 0) 
                            : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                          effectAddBonus += Number(evalValue) || 0;
                        } else if (aKey === 'critical') {
                          // 일반 critical 보너스
                          const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                            ? (Number(attrValue.value) || 0) 
                            : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                          effectCriticalMod += Number(evalValue) || 0;
                        }
                      }
                      
                      // 능력치/스킬 보너스는 모든 판정 타입에 적용
                      if (aKey === 'stat_dice' && aLabel) {
                        // 능력치/스킬 다이스 보너스
                        if (isAbility && aLabel === skillKey) {
                          const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                            ? (Number(attrValue.value) || 0) 
                            : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                          effectDiceBonus += Number(evalValue) || 0;
                        } else if (!isAbility) {
                          // 스킬 사용 시: 스킬명, 스킬 그룹, 또는 base 능력치 매칭
                          const matchesDirect = aLabel === skillKey;
                          const matchesGroup = window.DX3rdSkillGroupMatcher?.isSkillInGroup(skillKey, aLabel);
                          const matchesBase = effectiveBaseKey && aLabel === effectiveBaseKey;
                          if (matchesDirect || matchesGroup || matchesBase) {
                            const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                              ? (Number(attrValue.value) || 0) 
                              : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                            effectDiceBonus += Number(evalValue) || 0;
                          }
                        }
                      } else if (aKey === 'stat_add' && aLabel) {
                        // 능력치/스킬 수정치 보너스
                        if (isAbility && aLabel === skillKey) {
                          const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                            ? (Number(attrValue.value) || 0) 
                            : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                          effectAddBonus += Number(evalValue) || 0;
                        } else if (!isAbility) {
                          const matchesDirect = aLabel === skillKey;
                          const matchesGroup = window.DX3rdSkillGroupMatcher?.isSkillInGroup(skillKey, aLabel);
                          const matchesBase = effectiveBaseKey && aLabel === effectiveBaseKey;
                          if (matchesDirect || matchesGroup || matchesBase) {
                            const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                              ? (Number(attrValue.value) || 0) 
                              : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                            effectAddBonus += Number(evalValue) || 0;
                          }
                        }
                      } else if (aKey === 'critical_min') {
                        // 크리티컬 하한치: 가장 작은 값을 사용
                        const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                          ? (Number(attrValue.value) || 10) 
                          : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 10);
                        const numValue = Number(evalValue) || 10;
                        if (numValue < effectCriticalMin) {
                          effectCriticalMin = numValue;
                        }
                      }
                      // stat_bonus, skill_bonus는 제외 (능력치/스킬 total 값에 영향을 주므로 dice/add 계산과는 별개)
                    }
                  }
                }
              }
            }
            
            // 크리티컬 하한치 최종 설정 (최소값 2로 제한)
            criticalMin = Math.max(2, effectCriticalMin);
            
            // 이펙트 보너스 적용
            dice += effectDiceBonus;
            add += effectAddBonus;
            critical = Math.max(criticalMin, critical + effectCriticalMod);
          }
          
          // 최종 설정
          data.system.dice = { value: dice };
          data.system.add = { value: add };
          data.system.critical = { value: critical, min: criticalMin };
        }
      }
    }

    // 공격력 계산 (실제 아이템 데이터에서 attackRoll 확인)
    const currentAttackRoll = this.item.system.attackRoll || data.system.attackRoll;
    if (currentAttackRoll && currentAttackRoll !== '-') {
      let totalAttack = 0;
      
      // 1. 액터의 기본 공격력
      if (this.actor) {
        const actorAttack = this.actor.system.attributes.attack?.value || 0;
        totalAttack += actorAttack;
      }
      
      // 2. 등록된 무기들의 공격력 합계 (실제 아이템 데이터에서 weapon 확인)
      const registeredWeapons = this.item.system.weapon || data.system.weapon || [];
      let weaponAttackSum = 0;
      
      for (const weaponId of registeredWeapons) {
        if (weaponId && weaponId !== '-') {
          const weaponItem = this.actor?.items.get(weaponId);
          if (weaponItem) {
            const weaponAttack = Number(weaponItem.system?.attack) || 0;
            weaponAttackSum += weaponAttack;
          }
        }
      }
      
      totalAttack += weaponAttackSum;
      
      // 3. 콤보 아이템 자체의 attack 보너스 추가 (활성화되지 않은 경우만)
      const comboIsActive = this.item.system?.active?.state === true;
      if (!comboIsActive) {
        if (this.item.system?.attributes) {
          for (const [attrKey, attrData] of Object.entries(this.item.system.attributes)) {
            if (!attrData || !attrData.key || !attrData.value) continue;
            
            if (attrData.key === 'attack') {
              const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, this.item, this.actor) || 0;
              totalAttack += Number(bonusValue) || 0;
            }
          }
        }
        
        if (this.item.system?.effect?.attributes) {
          for (const [attrName, attrValue] of Object.entries(this.item.system.effect.attributes)) {
            const aKey = (typeof attrValue === 'object' && attrValue.key) ? attrValue.key : attrName;
            if (!aKey || aKey !== 'attack') continue;
            
            const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
              ? (Number(attrValue.value) || 0) 
              : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, this.item, this.actor) || 0);
            totalAttack += Number(evalValue) || 0;
          }
        }
      }
      
      // 4. 이펙트 attributes의 attack 보너스 추가 (활성화되지 않은 것만)
      if (Array.isArray(data.system.effectIds)) {
        let effectAttackBonus = 0;
        
        for (const effectId of data.system.effectIds) {
          if (effectId && effectId !== '-') {
            const effectItem = this.actor?.items.get(effectId);
            if (effectItem && effectItem.type === 'effect') {
              // 활성화된 이펙트는 이미 액터의 prepareData에서 계산되었으므로 제외 (2중 계산 방지)
              const isActive = effectItem.system?.active?.state === true;
              if (isActive) continue;
              
              // 이펙트의 attributes 확인 (활성화되지 않은 것만 계산)
              if (effectItem.system?.attributes) {
                for (const [attrKey, attrData] of Object.entries(effectItem.system.attributes)) {
                  if (!attrData || !attrData.key || !attrData.value) continue;
                  
                  // attack 보너스 계산
                  if (attrData.key === 'attack') {
                    const bonusValue = window.DX3rdFormulaEvaluator?.evaluate(attrData.value, effectItem, this.actor) || 0;
                    effectAttackBonus += Number(bonusValue) || 0;
                  }
                  // stat_bonus, skill_bonus 등은 제외
                }
              }
              
              // effect.attributes도 확인 (활성화 상태 체크하지 않음)
              if (effectItem.system?.effect?.attributes) {
                for (const [attrName, attrValue] of Object.entries(effectItem.system.effect.attributes)) {
                  const aKey = (typeof attrValue === 'object' && attrValue.key) ? attrValue.key : attrName;
                  if (!aKey || aKey !== 'attack') continue;
                  
                  const evalValue = (typeof attrValue === 'object' && 'value' in attrValue) 
                    ? (Number(attrValue.value) || 0) 
                    : (window.DX3rdFormulaEvaluator?.evaluate(attrValue, effectItem, this.actor) || 0);
                  effectAttackBonus += Number(evalValue) || 0;
                }
              }
            }
          }
        }
        
        totalAttack += effectAttackBonus;
      }
      
      // 최종 공격력 설정
      data.system.attack = { value: totalAttack };
    } else {
      // system.attackRoll이 '-'이거나 설정되지 않은 경우
      data.system.attack = { value: '-' };
    }

    // 무기 탭 데이터 준비 (WeaponTabManager 사용)
    data = window.DX3rdWeaponTabManager.prepareWeaponTabData(data, this.item);

    // attributes 초기화 (기존 데이터 보존)
    if (!data.system.attributes) data.system.attributes = {};
    if (this.item.system?.attributes) {
      data.system.attributes = { ...this.item.system.attributes };
    }

    // effect.attributes 초기화 (기존 데이터 보존)
    if (!data.system.effect.attributes) data.system.effect.attributes = {};
    if (this.item.system?.effect?.attributes) {
      data.system.effect.attributes = { ...this.item.system.effect.attributes };
    }

    // 액터 스킬 데이터 추가
    if (this.actor) {
      data.system.actorSkills = this.actor.system?.attributes?.skills || {};
      // 통합 스킬 선택 옵션 생성 (콤보용 - 신드롬 제외)
      data.system.skillOptions = window.DX3rdSkillManager.getSkillSelectOptions('combo', data.system.actorSkills);
    } else {
      data.system.actorSkills = {};
      data.system.skillOptions = [];
    }

    // Description 에디터를 위한 데이터 추가 (helpers.js 사용)
    data = await window.DX3rdDescriptionManager.enrichSheetData(data, this.item);

    // getTarget 체크박스 초기화
    if (data.system.getTarget === undefined) {
      data.system.getTarget = this.item.system.getTarget || false;
    }

    // scene 체크박스 초기화
    if (data.system.scene === undefined) {
      data.system.scene = this.item.system.scene || false;
    }

    // 액터 데이터를 템플릿에 전달
    data.actor = this.actor;

    return data;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Target Tab 통합 리스너는 부모 클래스(item-sheet.js)에서 자동 설정됨
    
    // 무기 선택 체크박스 변경 시 무기 목록 비우기
    html.on('change', 'input[name="system.weaponSelect"]', async (event) => {
      const isChecked = event.currentTarget.checked;
      if (isChecked) {
        // 체크되면 무기 목록 비우기
        await this.item.update({ 'system.weapon': [] });
      }
      this.render(false);
    });
    
    // 난이도 체크박스 변경 시
    html.on('change', '.difficulty-check', async (event) => {
      const isChecked = event.currentTarget.checked;
      const $attackRollSelect = html.find('.attackroll-select');
      
      if (isChecked) {
        await this.item.update({ 
          'system.roll': 'major',
          'system.difficulty': ''
        });
        $attackRollSelect.prop('disabled', false);
      } else {
        // 체크 해제: roll을 "-"로 설정, difficulty는 자동성공 또는 "-" 입력 가능
        const currentDifficulty = this.item.system.difficulty || '';
        const freepassText = game.i18n.localize('DX3rd.Freepass');
        // 현재 난이도가 자동성공이나 "-"가 아니면 기본값으로 설정
        const newDifficulty = (currentDifficulty === freepassText || currentDifficulty === '-') 
          ? currentDifficulty 
          : freepassText;
        
        await this.item.update({ 
          'system.roll': '-',
          'system.difficulty': newDifficulty,
          'system.attackRoll': '-'
        });
        $attackRollSelect.prop('disabled', true);
      }
      this.render(false);
    });
    
    // system.roll 변경 시 난이도 체크박스 상태 및 attackRoll 상태 반영
    html.on('change', 'select[name="system.roll"]', async (event) => {
      const value = event.currentTarget.value;
      const $difficultyCheck = html.find('.difficulty-check');
      const $attackRollSelect = html.find('.attackroll-select');
      
      if (value === '-' || value === 'dodge') {
        // roll이 "-" 또는 "dodge"이면 체크 해제, attackRoll 비활성화 및 "-"로 리셋
        $difficultyCheck.prop('checked', false);
        $attackRollSelect.prop('disabled', true);
        await this.item.update({ 
          'system.attackRoll': '-'
        });
      } else {
        // roll이 설정되면 체크, attackRoll 활성화
        $difficultyCheck.prop('checked', true);
        $attackRollSelect.prop('disabled', false);
      }
    });
    
    // 난이도 입력 검증
    html.on('blur', '.difficulty-input', async (event) => {
      const value = event.currentTarget.value.trim();
      if (!value) return;
      
      const competitionText = game.i18n.localize('DX3rd.Competition');
      const referenceText = game.i18n.localize('DX3rd.Reference');
      const freepassText = game.i18n.localize('DX3rd.Freepass');
      const rollValue = this.item.system.roll || '-';
      
      // roll이 "-"이면 자동성공과 "-"만 허용
      if (rollValue === '-') {
        const isValidForNoRoll = value === freepassText || value === '-';
        if (!isValidForNoRoll) {
          ui.notifications.warn(`판정이 비활성화된 경우 난이도는 "${freepassText}" 또는 "-"만 입력할 수 있습니다.`);
          event.currentTarget.value = '';
          await this.item.update({ 'system.difficulty': '' });
        }
      } else {
        // roll이 설정된 경우 숫자, 대결, 효과참조만 허용 (자동성공과 -는 제외)
        const numValue = parseInt(value);
        const isValidNumber = !isNaN(numValue) && numValue >= 1 && Number.isInteger(parseFloat(value));
        const isValidText = value === competitionText || value === referenceText;
        
        if (!isValidNumber && !isValidText) {
          ui.notifications.warn(`판정이 활성화된 경우 난이도는 1 이상의 정수, "${competitionText}", 또는 "${referenceText}"만 입력할 수 있습니다.`);
          event.currentTarget.value = '';
          await this.item.update({ 'system.difficulty': '' });
        }
      }
    });

    // 제한 필드 입력 검증
    html.find('input[name="system.limit"]').on('input', this._onLimitInput.bind(this));
    
    // 이펙트 탭 이벤트 리스너
    html.find('.add-effect').on('click', this._onAddEffect.bind(this));
    // 이펙트 탭의 수정 버튼 클릭 시 이펙트 아이템 시트 열기
    html.find('.tab[data-tab="effect"] .item-control.item-edit').on('click', this._onEditEffect.bind(this));
    html.find('.item-control.item-delete').on('click', this._onDeleteEffect.bind(this));
    
    // 무기 탭 통합 리스너 (WeaponTabManager 사용)
    window.DX3rdWeaponTabManager.setupWeaponTabListeners(html, this);
    
    // 어트리뷰트 관리 이벤트 리스너 설정
    this._isAddingAttribute = false;
    window.DX3rdAttributeManager.setupAttributeListeners(html, this);
    window.DX3rdAttributeManager.initializeAttributeLabels(html, this.item);

    // active.runTiming 변경 시 즉시 저장
    html.on('change', 'select[name="system.active.runTiming"]', async (event) => {
      const value = event.currentTarget.value;
      try {
        await this.item.update({ 'system.active.runTiming': value });
      } catch (e) {
        console.error('DX3rd | ComboSheet active.runTiming update failed', e);
      }
    });

    // input 필드 즉시 업데이트
    html.on('change', 'input[name^="system."]', async (event) => {
      if (this._isAddingAttribute) return;
      
      const name = event.currentTarget.name;
      
      // 전용 핸들러가 있는 필드는 제외
      const excludedFields = [
        'system.getTarget',
        'system.scene',
        'system.difficulty'  // 난이도는 blur 이벤트에서 처리
      ];
      if (excludedFields.includes(name)) return;
      
      const value = event.currentTarget.type === 'checkbox' ? event.currentTarget.checked : event.currentTarget.value;
      
      // 즉시 저장
      try {
        const updates = foundry.utils.expandObject({
          [name]: event.currentTarget.type === 'number' ? parseInt(value) || 0 : 
                  event.currentTarget.type === 'checkbox' ? value : 
                  value
        });
        await this.item.update(updates);
      } catch (error) {
        console.error("DX3rd | ComboSheet input update failed", error);
      }
    });
    
    // select 필드 즉시 업데이트 (attribute-key 제외)
    html.on('change', 'select[name^="system."]:not([name$=".key"])', async (event) => {
      if (this._isAddingAttribute) return;
      
      const name = event.currentTarget.name;
      
      // Target Tab과 전용 핸들러가 있는 필드는 제외
      const excludedFields = [
        'system.getTarget',
        'system.scene',
        'system.effect.disable',
        'system.effect.runTiming',
        'system.active.disable',
        'system.active.runTiming'
      ];
      if (excludedFields.includes(name)) return;
      
      const value = event.currentTarget.value;
      
      // 기능 선택 시 능력치 자동 설정
      if (name === 'system.skill' && value && value !== '-') {
        await this._updateBaseAttribute(value);
      }
      
      // 즉시 저장
      try {
        const updates = foundry.utils.expandObject({
          [name]: value
        });
        await this.item.update(updates);
      } catch (error) {
        console.error("DX3rd | ComboSheet select update failed", error);
      }
    });
    
    // textarea 필드 즉시 업데이트
    html.on('change', 'textarea[name^="system."]', async (event) => {
      if (this._isAddingAttribute) return;
      
      const name = event.currentTarget.name;
      const value = event.currentTarget.value;
      
      // 즉시 저장
      try {
        const updates = foundry.utils.expandObject({
          [name]: value
        });
        await this.item.update(updates);
      } catch (error) {
        console.error("DX3rd | ComboSheet textarea update failed", error);
      }
    });
  }

  /**
   * 기능 선택 시 능력치 자동 설정
   */
  async _updateBaseAttribute(skillValue) {
    if (skillValue === '-' || !skillValue) {
      return;
    }

    // 기본 속성인 경우 (육체, 감각, 정신, 사회)
    if (['body', 'sense', 'mind', 'social'].includes(skillValue)) {
      try {
        await this.item.update({
          'system.base': skillValue
        });
        return;
      } catch (err) {
        console.error('DX3rd | ComboSheet _updateBaseAttribute - update failed', err);
        return;
      }
    }

    // 액터 스킬에서 능력치 찾기
    let baseAttribute = null;
    if (this.actor) {
      const actorSkill = this.actor.system?.attributes?.skills?.[skillValue];
      if (actorSkill?.base) {
        baseAttribute = actorSkill.base;
      }
    }

    if (baseAttribute) {
      try {
        await this.item.update({
          'system.base': baseAttribute
        });
      } catch (err) {
        console.error('DX3rd | ComboSheet _updateBaseAttribute - update failed', err);
      }
    }
  }


  /**
   * 이펙트 수정 버튼 클릭 시 이펙트 아이템 시트 열기
   */
  async _onEditEffect(event) {
    event.preventDefault();
    
    const li = $(event.currentTarget).closest('.item');
    const effectId = li.data('item-id');
    
    if (!effectId) {
      ui.notifications.warn("편집할 이펙트를 찾을 수 없습니다.");
      return;
    }
    
    // 액터에서 이펙트 아이템 찾기
    const effectItem = this.actor?.items.get(effectId);
    if (effectItem && effectItem.type === 'effect') {
      effectItem.sheet.render(true);
    } else {
      ui.notifications.warn("이펙트 아이템을 찾을 수 없습니다.");
    }
  }

  /**
   * 이펙트 추가
   */
  async _onAddEffect(event) {
    event.preventDefault();
    const effectId = $(event.currentTarget).closest('.add-skills').find('#actor-effect').val();
    
    if (!effectId || effectId === '-') {
      ui.notifications.warn("추가할 이펙트를 선택해주세요.");
      return;
    }

    try {
      // 현재 이펙트 배열 가져오기
      const currentEffects = this.item.system.effectIds || this.item.system.effect || [];
      
      // 이미 추가된 이펙트인지 확인
      if (currentEffects.includes(effectId)) {
        ui.notifications.warn("이미 추가된 이펙트입니다.");
        return;
      }

      // 이펙트 추가
      const newEffects = [...currentEffects, effectId];
      
      // 총 침식률 계산 (다이스 공식 파싱)
      let totalDice = 0;
      let totalAdd = 0;
      
      for (const effId of newEffects) {
        if (effId && effId !== '-') {
          const effect = this.actor?.items.get(effId);
          if (effect && effect.type === 'effect') {
            const encValue = String(effect.system.encroach?.value || '0').trim();
            
            // 다이스 공식 파싱: "2d10+5" → dice: 2, add: 5
            const diceMatch = encValue.match(/(\d+)d10/i);
            const addMatch = encValue.match(/([+-]\d+)$/);
            
            if (diceMatch) {
              totalDice += parseInt(diceMatch[1]) || 0;
            }
            
            if (addMatch) {
              totalAdd += parseInt(addMatch[1]) || 0;
            } else if (!diceMatch && !isNaN(parseInt(encValue))) {
              // 순수 숫자만 있는 경우
              totalAdd += parseInt(encValue) || 0;
            }
          }
        }
      }
      
      // 최종 침식률 공식 생성
      let totalEncroachment = '';
      if (totalDice > 0 && totalAdd > 0) {
        totalEncroachment = `${totalDice}d10+${totalAdd}`;
      } else if (totalDice > 0) {
        totalEncroachment = `${totalDice}d10`;
      } else {
        totalEncroachment = String(totalAdd);
      }
      
      await this.item.update({
        'system.effectIds': newEffects,
        'system.encroach.value': totalEncroachment
      });

      ui.notifications.info("이펙트가 추가되었습니다.");
      
      // 시트 다시 렌더링
      this.render(false);
      
    } catch (error) {
      console.error('DX3rd | ComboSheet _onAddEffect - update failed', error);
      ui.notifications.error("이펙트 추가에 실패했습니다.");
    }
  }

  /**
   * 이펙트 삭제
   */
  async _onDeleteEffect(event) {
    event.preventDefault();
    const li = $(event.currentTarget).closest('.item');
    const effectId = li.data('item-id');

    if (!effectId) {
      ui.notifications.warn("삭제할 이펙트를 찾을 수 없습니다.");
      return;
    }

    try {
      // 현재 이펙트 배열에서 제거
      const currentEffects = this.item.system.effectIds || this.item.system.effect || [];
      const newEffects = currentEffects.filter(id => id !== effectId);
      
      // 총 침식률 계산 (다이스 공식 파싱)
      let totalDice = 0;
      let totalAdd = 0;
      
      for (const effId of newEffects) {
        if (effId && effId !== '-') {
          const effect = this.actor?.items.get(effId);
          if (effect && effect.type === 'effect') {
            const encValue = String(effect.system.encroach?.value || '0').trim();
            
            // 다이스 공식 파싱
            const diceMatch = encValue.match(/(\d+)d10/i);
            const addMatch = encValue.match(/([+-]\d+)$/);
            
            if (diceMatch) {
              totalDice += parseInt(diceMatch[1]) || 0;
            }
            
            if (addMatch) {
              totalAdd += parseInt(addMatch[1]) || 0;
            } else if (!diceMatch && !isNaN(parseInt(encValue))) {
              totalAdd += parseInt(encValue) || 0;
            }
          }
        }
      }
      
      // 최종 침식률 공식 생성
      let totalEncroachment = '';
      if (totalDice > 0 && totalAdd > 0) {
        totalEncroachment = `${totalDice}d10+${totalAdd}`;
      } else if (totalDice > 0) {
        totalEncroachment = `${totalDice}d10`;
      } else {
        totalEncroachment = String(totalAdd);
      }
      
      await this.item.update({
        'system.effectIds': newEffects,
        'system.encroach.value': totalEncroachment
      });

      ui.notifications.info("이펙트가 삭제되었습니다.");
      
      // 시트 다시 렌더링
      this.render(false);
      
    } catch (error) {
      console.error('DX3rd | ComboSheet _onDeleteEffect - update failed', error);
      ui.notifications.error("이펙트 삭제에 실패했습니다.");
    }
  }

  /**
   * 제한 필드 입력 검증
   */
  _onLimitInput(event) {
    const input = event.currentTarget;
    const value = input.value;
    
    // 허용된 패턴: "-", 숫자, 또는 숫자%
    const validPattern = /^(-|\d+|\d+%)$/;
    
    if (value && !validPattern.test(value)) {
      // 잘못된 입력인 경우 이전 값으로 복원
      const previousValue = this.item.system.limit || '-';
      input.value = previousValue;
      
      // 사용자에게 알림
      ui.notifications.warn("제한은 '-', 숫자, 또는 숫자%만 입력 가능합니다.");
    }
  }

  /** @override */
  _getSubmitData(updateData) {
    let formData = super._getSubmitData(updateData);
    
    // system.attributes와 system.effect.attributes 하위 속성들이 formData에 포함되어 있는지 확인
    return formData;
  }

  /** @override */
  async _updateObject(event, formData) {
    // Target Tab의 즉시 저장 필드들은 formData에서 제외 (부모 클래스 리스너에서 처리)
    delete formData['system.getTarget'];
    delete formData['system.scene'];
    delete formData['system.effect.disable'];
    delete formData['system.effect.runTiming'];
    
    // 포함된 이펙트들의 침식률 자동 합산 (다이스 공식 파싱)
    const effectIds = formData['system.effectIds'] || this.item.system.effectIds || this.item.system.effect || [];
    let totalDice = 0;
    let totalAdd = 0;
    
    if (Array.isArray(effectIds)) {
      for (const effectId of effectIds) {
        if (effectId && effectId !== '-') {
          const effect = this.actor?.items.get(effectId);
          if (effect && effect.type === 'effect') {
            const encValue = String(effect.system.encroach?.value || '0').trim();
            
            // 다이스 공식 파싱
            const diceMatch = encValue.match(/(\d+)d10/i);
            const addMatch = encValue.match(/([+-]\d+)$/);
            
            if (diceMatch) {
              totalDice += parseInt(diceMatch[1]) || 0;
            }
            
            if (addMatch) {
              totalAdd += parseInt(addMatch[1]) || 0;
            } else if (!diceMatch && !isNaN(parseInt(encValue))) {
              totalAdd += parseInt(encValue) || 0;
            }
          }
        }
      }
    }
    
    // 최종 침식률 공식 생성
    let totalEncroachment = '';
    if (totalDice > 0 && totalAdd > 0) {
      totalEncroachment = `${totalDice}d10+${totalAdd}`;
    } else if (totalDice > 0) {
      totalEncroachment = `${totalDice}d10`;
    } else {
      totalEncroachment = String(totalAdd);
    }
    
    // 콤보의 침식률에 자동 설정 (템플릿에서 encroach 사용)
    formData['system.encroach.value'] = totalEncroachment;
    
    // 공격력 계산 (system.attackRoll이 '-'가 아닐 경우)
    const attackRoll = formData['system.attackRoll'] || this.item.system.attackRoll;
    if (attackRoll && attackRoll !== '-') {
      let totalAttack = 0;
      
      // 1. 액터의 기본 공격력
      if (this.actor) {
        const actorAttack = this.actor.system.attributes.attack?.value || 0;
        totalAttack += actorAttack;
      }
      
      // 2. 등록된 무기들의 공격력 합계
      const registeredWeapons = formData['system.weapon'] || this.item.system.weapon || [];
      let weaponAttackSum = 0;
      
      for (const weaponId of registeredWeapons) {
        if (weaponId && weaponId !== '-') {
          const weaponItem = this.actor?.items.get(weaponId);
          if (weaponItem) {
            const weaponAttack = Number(weaponItem.system?.attack) || 0;
            weaponAttackSum += weaponAttack;
          }
        }
      }
      
      totalAttack += weaponAttackSum;
      
      // 최종 공격력 설정
      formData['system.attack.value'] = totalAttack;
    } else {
      // system.attackRoll이 '-'이거나 설정되지 않은 경우
      formData['system.attack.value'] = '-';
    }
    
    // formData를 바로 사용 (expandObject는 다른 속성을 덮어쓸 수 있음)
    const result = await this.item.update(formData);
    
    return result;
  }
}

// Combo 시트 등록 (v13 호환)
const ItemsClass = foundry.documents?.collections?.Items || Items;
ItemsClass.registerSheet('double-cross-3rd', DX3rdComboSheet, {
  types: ['combo'],
  makeDefault: true
});

// 전역 노출
window.DX3rdComboSheet = DX3rdComboSheet;
})();
