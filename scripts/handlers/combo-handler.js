// Combo 아이템 핸들러
(function() {
console.log("DX3rd | ComboHandler script loading...");

window.DX3rdComboHandler = {
    /**
     * 스킬 키로부터 표시 이름 가져오기 (커스텀 스킬 및 로컬라이징 처리)
     */
    getSkillDisplayName(skillKey, skillStat) {
        if (!skillKey) return '';
        
        let label = skillStat?.name || '';
        if (label && label.startsWith('DX3rd.')) {
            // customSkills 설정 확인
            const customSkills = game.settings.get("double-cross-3rd", "customSkills") || {};
            const customSkill = customSkills[skillKey];
            
            if (customSkill) {
                // 커스텀 이름이 있으면 우선 사용
                return typeof customSkill === 'object' ? customSkill.name : customSkill;
            } else {
                // 커스텀 이름이 없으면 기본 로컬라이징
                return game.i18n.localize(label);
            }
        }
        return label || skillKey;
    },
    
    async handle(actorId, itemIdOrObject, getTarget) {
        console.log("DX3rd | ComboHandler handle called", { actorId, itemIdOrObject, getTarget });
        
        const actor = game.actors.get(actorId);
        if (!actor) { 
            ui.notifications.warn("Actor not found"); 
            return; 
        }
        
        // itemIdOrObject가 문자열이면 액터의 아이템에서 조회, 객체면 그대로 사용 (임시 콤보)
        let item;
        if (typeof itemIdOrObject === 'string') {
            // 액터의 아이템에서 먼저 찾고, 없으면 game.items에서 찾기
            item = actor.items.get(itemIdOrObject) || game.items.get(itemIdOrObject);
            if (!item) { 
                ui.notifications.warn("Item not found"); 
                return; 
            }
        } else if (typeof itemIdOrObject === 'object') {
            // 임시 콤보 아이템 객체
            item = itemIdOrObject;
            console.log("DX3rd | ComboHandler - Using temporary combo item", item);
        } else {
            ui.notifications.warn("Invalid item parameter");
            return;
        }

        // 1. instant 익스텐션 병합·실행 (공통 - 롤 타입 무관)
        await this.processInstantExtensions(actor, item);

        // 2. 콤보 롤 타입 분기
        const rollType = item.system?.roll ?? '-';
        
        if (rollType === '-') {
            // No-roll: instant만 처리했으므로 끝
            console.log("DX3rd | ComboHandler - No-roll combo completed");
        } else {
            // Roll: 롤 다이얼로그 표시 (afterSuccess는 채팅 버튼에서 처리)
            await this.handleComboRoll(actor, item, rollType, getTarget);
        }
    },
    
    /**
     * instant 익스텐션 병합 및 실행 (롤 타입 무관 공통 처리)
     * 콤보 + 포함된 이펙트들의 instant 익스텐션을 수집·병합·실행
     */
    async processInstantExtensions(actor, item) {
        console.log("DX3rd | ComboHandler - Processing instant extensions (common for all roll types)");
        const handler = window.DX3rdUniversalHandler;
        if (!handler) return;

        // 콤보 본체의 instant 매크로/어플라이드는 이미 handleItemUse에서 실행됨 → 중복 방지
        console.log('DX3rd | ComboHandler - Skipping combo item instant macro/apply (already done in handleItemUse)');

        // 2) 포함 이펙트의 즉시 처리 + 익스텐드 수집
        // effect 참조 정규화: 배열/객체/단일 값 모두 ID 배열로 변환
        const rawEffects = (item.system?.effectIds ?? item.system?.effect?.data ?? item.system?.effect) ?? [];
        let effectIds = [];
        if (Array.isArray(rawEffects)) {
            effectIds = rawEffects.filter(e => e && e !== '-');
        } else if (rawEffects && typeof rawEffects === 'object') {
            effectIds = Object.values(rawEffects)
                .map(v => (typeof v === 'string' ? v : (v?.id || null)))
                .filter(e => e && e !== '-');
        } else if (typeof rawEffects === 'string') {
            if (rawEffects && rawEffects !== '-') effectIds = [rawEffects];
        }
        console.log('DX3rd | ComboHandler - Effects normalized', { rawEffects, effectIds });
        const collectedExtensions = [];

        // 현재 선택된 타겟을 저장(instant 병합 실행 시 공유)
        const selectedTargetIds = Array.from(game.user.targets || []).map(t => t.id);

        const pushExtensionsFrom = (srcItem) => {
            const ext = srcItem.getFlag('double-cross-3rd', 'itemExtend') || {};
            // 부모 아이템의 runTiming 저장 (익스텐션의 등록 타이밍 결정에 사용)
            const parentRunTiming = srcItem.system?.active?.runTiming || 'instant';
            
            const pushIf = (typeKey) => {
                const d = ext[typeKey];
                if (!d || !d.activate) return;
                
                // 공통 필드
                const baseData = {
                    type: typeKey,
                    itemId: srcItem.id,
                    itemName: srcItem.name,
                    actorId: actor.id,
                    parentRunTiming: parentRunTiming // 부모 아이템의 runTiming 저장
                };
                
                // 타입별 필드 구성
                if (typeKey === 'heal' || typeKey === 'damage' || typeKey === 'condition') {
                    collectedExtensions.push({
                        ...baseData,
                        timing: d.timing || 'instant',
                        target: d.target || 'self',
                        formulaDice: d.formulaDice ?? d.dice ?? 0,
                        formulaAdd: d.formulaAdd ?? d.add ?? 0,
                        ignoreReduce: !!d.ignoreReduce,
                        resurrect: !!d.resurrect,
                        rivival: !!d.rivival,
                        conditionType: d.type,
                        poisonedRank: d.poisonedRank || null,
                        conditionalFormula: !!d.conditionalFormula
                    });
                } else if (typeKey === 'weapon' || typeKey === 'protect' || typeKey === 'vehicle') {
                    // 아이템 생성 익스텐션은 부모 아이템의 runTiming을 따름
                    collectedExtensions.push({
                        ...baseData,
                        timing: 'instant', // 아이템 생성은 instant만 지원
                        extensionData: d // 전체 데이터 보존
                    });
                }
            };
            pushIf('heal');
            pushIf('damage');
            pushIf('condition');
            pushIf('weapon');
            pushIf('protect');
            pushIf('vehicle');
        };

        // 콤보 본체 즉시 활성화/매크로/어플라이드는 위에서 처리했고, 익스텐드만 수집
        console.log('DX3rd | ComboHandler - Collecting extensions from combo item:', item.name);
        pushExtensionsFrom(item);

        // 포함된 무기의 공격 횟수 증가 (notCheck가 아닌 경우)
        const weaponIds = item.system?.weapon || [];
        if (Array.isArray(weaponIds) && weaponIds.length > 0) {
            for (const weaponId of weaponIds) {
                if (!weaponId || weaponId === '-') continue;
                const weaponItem = actor.items.get(weaponId);
                if (!weaponItem) {
                    console.warn('DX3rd | ComboHandler - Weapon item not found:', weaponId);
                    continue;
                }
                // weapon 타입만 attack-used 증가 (vehicle은 attack-used 필드 없음)
                if (weaponItem.type === 'weapon') {
                    const attackUsedDisable = weaponItem.system['attack-used']?.disable || 'notCheck';
                    if (attackUsedDisable !== 'notCheck') {
                        const currentAttackUsedState = weaponItem.system['attack-used']?.state || 0;
                        await weaponItem.update({ 'system.attack-used.state': currentAttackUsedState + 1 });
                        console.log('DX3rd | ComboHandler - Weapon attack count increased:', weaponItem.name, currentAttackUsedState, '→', currentAttackUsedState + 1);
                    }
                }
            }
        }

        for (const effectId of effectIds) {
            if (!effectId || effectId === '-') continue;
            const effectItem = actor.items.get(effectId);
            if (!effectItem) {
                console.warn('DX3rd | ComboHandler - Effect item not found:', effectId);
                continue;
            }
            console.log('DX3rd | ComboHandler - Processing effect item:', effectItem.name, 'ID:', effectId);

            // 포함된 이펙트의 사용 횟수 증가 (notCheck가 아닌 경우)
            const effectUsedDisable = effectItem.system?.used?.disable || 'notCheck';
            if (effectUsedDisable !== 'notCheck') {
                const currentEffectUsedState = effectItem.system?.used?.state || 0;
                await effectItem.update({ 'system.used.state': currentEffectUsedState + 1 });
                console.log('DX3rd | ComboHandler - Effect used count increased:', effectItem.name, currentEffectUsedState, '→', currentEffectUsedState + 1);
            }

            // 호출 시(onInvoke) 타이밍의 매크로 실행
            try {
                await handler.executeMacros(effectItem, 'onInvoke');
                console.log('DX3rd | ComboHandler - Effect onInvoke macros executed:', effectItem.name);
            } catch (e) {
                console.warn('DX3rd | ComboHandler - effect onInvoke macro execution failed:', effectItem?.name, e);
            }

            // 이펙트 즉시 처리
            try {
                if (effectItem.system?.active?.runTiming === 'instant' && !effectItem.system?.active?.state) {
                    await effectItem.update({ 'system.active.state': true });
                    console.log('DX3rd | ComboHandler - Effect activated (instant):', effectItem.name);
                }
                await handler.executeMacros(effectItem, 'instant');
                await handler.applyToTargets(actor, effectItem, 'instant');
            } catch (e) {
                console.warn('DX3rd | ComboHandler - effect instant process skipped:', effectItem?.name, e);
            }

            // 이펙트 익스텐드 수집
            pushExtensionsFrom(effectItem);
        }

        // 3) 익스텐드 병합 (같은 타이밍 + 같은 대상, custom 분리)
        try {
            const buckets = handler.groupExtensionsByKey(collectedExtensions);
            const merged = handler.mergeGroupedExtensionBuckets(actor, buckets);
            console.log('DX3rd | ComboHandler - Merged extension buckets:', merged);
            console.log('DX3rd | ComboHandler - Bucket count by timing:', {
                instant: merged.filter(b => b.timing === 'instant').length,
                afterMain: merged.filter(b => b.timing === 'afterMain').length,
                afterMainInstant: merged.filter(b => b.timing === 'afterMain' && b.parentRunTiming === 'instant').length,
                afterSuccess: merged.filter(b => b.timing === 'afterSuccess').length,
                afterDamage: merged.filter(b => b.timing === 'afterDamage').length
            });

            // instant 및 afterMain 버킷 처리
            for (const b of merged) {
                console.log('DX3rd | ComboHandler - Processing bucket:', b.type, 'timing:', b.timing, 'target:', b.target, 'parentRunTiming:', b.parentRunTiming);
                
                // instant는 즉시 실행, afterMain은 큐에 등록, 나머지는 건너뜀
                if (b.timing === 'instant') {
                    // instant 타이밍 즉시 실행
                    console.log('DX3rd | ComboHandler - Executing instant extension:', b.type);
                    if (b.type === 'heal' && !b.custom) {
                    const healData = {
                        formulaDice: b.merged?.dice || 0,
                        formulaAdd: b.merged?.add || 0,
                        target: b.target,
                        selectedTargetIds,
                        resurrect: b.resurrect || false,
                        rivival: b.rivival || false,
                        // 콤보 병합 트리거 - 트리거 아이템 이름은 콤보 이름
                        triggerItemName: item.name
                    };
                    await handler.executeHealExtensionNow(actor, healData, null);
                } else if (b.type === 'damage' && !b.custom) {
                    const damageData = {
                        formulaDice: b.merged?.dice || 0,
                        formulaAdd: b.merged?.add || 0,
                        target: b.target,
                        selectedTargetIds,
                        ignoreReduce: b.ignoreReduce || false,
                        triggerItemName: item.name
                    };
                    await handler.executeDamageExtensionNow(actor, damageData, null);
                } else if (b.type === 'condition' && !b.custom) {
                    // 같은 대상이면 서로 다른 컨디션도 한 번의 다이얼로그로 병합 처리
                    const conditionTypes = b.merged?.conditions || [];
                    await handler.executeConditionExtensionsNowBulk(actor, {
                        conditionTypes,
                        target: b.target,
                        selectedTargetIds,
                        triggerItemName: item.name,
                        poisonedRank: b.poisonedRank || null
                    });
                } else if (b.type === 'weapon' || b.type === 'protect' || b.type === 'vehicle') {
                    // 아이템 생성은 병합하지 않고 각 소스별로 개별 생성
                    for (const src of b.sources) {
                        const srcItem = actor.items.get(src.itemId);
                        if (!srcItem) continue;
                        try {
                            await handler.executeItemExtension(actor, b.type, src.raw.extensionData || {}, srcItem);
                            console.log(`DX3rd | ComboHandler - Created ${b.type} from:`, srcItem.name);
                        } catch (e) {
                            console.warn(`DX3rd | ComboHandler - Failed to create ${b.type} from ${srcItem.name}:`, e);
                        }
                    }
                    } else if (b.custom) {
                        // 버킷 단위 custom(임의 공식)은 기존 단일 다이얼로그 흐름으로 처리하도록 개별 소스 실행을 유지
                        // → 별도 병합 다이얼로그 구현 전까지는 스킵 (중복 창 방지 목적)
                        console.log('DX3rd | ComboHandler - Skipping custom bucket for now (kept for existing dialog):', b);
                    }
                } else if (b.timing === 'afterMain' && b.parentRunTiming === 'instant') {
                    // afterMain 타이밍은 큐에 등록
                    // 단, parentRunTiming이 instant인 경우만 여기서 등록 (afterSuccess/afterDamage는 해당 타이밍에서 등록)
                    console.log('DX3rd | ComboHandler - Registering afterMain extension (parentRunTiming=instant):', b.type, 'merged data:', b.merged);
                    if (b.type === 'heal') {
                        const healData = {
                            formulaDice: b.merged?.dice || 0,
                            formulaAdd: b.merged?.add || 0,
                            target: b.target,
                            selectedTargetIds,
                            resurrect: false,
                            rivival: false,
                            triggerItemName: item.name
                        };
                        console.log('DX3rd | ComboHandler - AfterMain heal data:', healData);
                        handler.addToAfterMainQueue(actor, healData, null, 'heal');
                    } else if (b.type === 'damage') {
                        const damageData = {
                            formulaDice: b.merged?.dice || 0,
                            formulaAdd: b.merged?.add || 0,
                            target: b.target,
                            selectedTargetIds,
                            ignoreReduce: b.ignoreReduce || false,
                            triggerItemName: item.name
                        };
                        console.log('DX3rd | ComboHandler - AfterMain damage data:', damageData);
                        handler.addToAfterMainQueue(actor, damageData, null, 'damage');
                    } else if (b.type === 'condition') {
                        const conditionData = {
                            conditionTypes: b.merged?.conditions || [],
                            target: b.target,
                            selectedTargetIds,
                            triggerItemName: item.name,
                            poisonedRank: b.poisonedRank || null
                        };
                        console.log('DX3rd | ComboHandler - AfterMain condition data:', conditionData);
                        handler.addToAfterMainQueue(actor, conditionData, null, 'condition');
                    }
                } else {
                    // instant, afterMain이 아닌 타이밍은 건너뜀 (afterSuccess, afterDamage는 별도 처리)
                    console.log('DX3rd | ComboHandler - Skipping bucket (not instant/afterMain):', b.type, 'timing:', b.timing);
                }
            }
        } catch (e) {
            console.warn('DX3rd | ComboHandler - merge/execute instant extensions failed:', e);
        }
    },
    
    /**
     * afterSuccess 익스텐션 수집 및 병합 (롤 있는 콤보용)
     * 활성화/매크로/어플라이드도 함께 수집하여 반환
     * @returns {Object} { activations: [], macros: [], applies: [], extensions: [merged buckets] }
     */
    async collectAfterSuccessData(actor, item) {
        console.log("DX3rd | ComboHandler - Collecting afterSuccess data for combo:", item.name);
        const handler = window.DX3rdUniversalHandler;
        if (!handler) return null;

        const result = {
            activations: [], // { itemId, itemName }
            macros: [],      // { itemId, itemName, macroName, timing }
            applies: [],     // { itemId, itemName }
            extensions: [],  // merged buckets (afterSuccess)
            afterMainExtensions: [] // merged buckets (afterMain, runTiming이 afterSuccess인 경우)
        };

        // effect 참조 정규화 (임시 콤보의 effect.data도 지원)
        const rawEffects = (item.system?.effectIds ?? item.system?.effect?.data ?? item.system?.effect) ?? [];
        let effectIds = [];
        if (Array.isArray(rawEffects)) {
            effectIds = rawEffects.filter(e => e && e !== '-');
        } else if (rawEffects && typeof rawEffects === 'object') {
            effectIds = Object.values(rawEffects)
                .map(v => (typeof v === 'string' ? v : (v?.id || null)))
                .filter(e => e && e !== '-');
        } else if (typeof rawEffects === 'string') {
            if (rawEffects && rawEffects !== '-') effectIds = [rawEffects];
        }

        const selectedTargetIds = Array.from(game.user.targets || []).map(t => t.id);
        const collectedExtensions = [];

        // 익스텐션 수집 함수
        const pushExtensionsFrom = (srcItem) => {
            const ext = srcItem.getFlag('double-cross-3rd', 'itemExtend') || {};
            // 부모 아이템의 runTiming 저장 (익스텐션의 등록 타이밍 결정에 사용)
            const parentRunTiming = srcItem.system?.active?.runTiming || 'instant';
            
            const pushIf = (typeKey) => {
                const d = ext[typeKey];
                if (!d || !d.activate) return;
                
                const baseData = {
                    type: typeKey,
                    itemId: srcItem.id,
                    itemName: srcItem.name,
                    actorId: actor.id,
                    parentRunTiming: parentRunTiming // 부모 아이템의 runTiming 저장
                };
                
                if (typeKey === 'heal' || typeKey === 'damage' || typeKey === 'condition') {
                    collectedExtensions.push({
                        ...baseData,
                        timing: d.timing || 'instant',
                        target: d.target || 'self',
                        formulaDice: d.formulaDice ?? d.dice ?? 0,
                        formulaAdd: d.formulaAdd ?? d.add ?? 0,
                        ignoreReduce: !!d.ignoreReduce,
                        resurrect: !!d.resurrect,
                        rivival: !!d.rivival,
                        conditionType: d.type,
                        poisonedRank: d.poisonedRank || null,
                        conditionalFormula: !!d.conditionalFormula
                    });
                } else if (typeKey === 'weapon' || typeKey === 'protect' || typeKey === 'vehicle') {
                    collectedExtensions.push({
                        ...baseData,
                        timing: 'instant',
                        extensionData: d
                    });
                }
            };
            pushIf('heal');
            pushIf('damage');
            pushIf('condition');
            pushIf('weapon');
            pushIf('protect');
            pushIf('vehicle');
        };

        // 콤보 본체 수집
        console.log('DX3rd | ComboHandler - Checking combo body for afterSuccess:', {
            activeRunTiming: item.system?.active?.runTiming,
            activeState: item.system?.active?.state,
            effectRunTiming: item.system?.effect?.runTiming,
            getTarget: item.system?.getTarget
        });
        
        // 1) 활성화 (disable이 'notCheck'가 아닌 경우에만)
        const activeDisable = item.system?.active?.disable ?? '-';
        if (item.system?.active?.runTiming === 'afterSuccess' && !item.system?.active?.state && activeDisable !== 'notCheck') {
            result.activations.push({ itemId: item.id, itemName: item.name });
            console.log('DX3rd | ComboHandler - Added combo activation:', item.name);
        }
        // 2) 매크로 (문자열 파싱)
        const comboMacroString = item.system?.macro || '';
        if (comboMacroString) {
            const macroMatches = comboMacroString.match(/\[([^\]]+)\]/g) || [];
            for (const match of macroMatches) {
                const macroName = match.slice(1, -1);
                const macro = game.macros?.getName(macroName);
                if (macro) {
                    const macroTiming = macro.getFlag('double-cross-3rd', 'runTiming') || 'instant';
                    if (macroTiming === 'afterSuccess') {
                        result.macros.push({ itemId: item.id, itemName: item.name, macroName: macroName, timing: macroTiming });
                        console.log('DX3rd | ComboHandler - Added combo macro:', macroName);
                    }
                }
            }
        }
        // 3) 어플라이드 (콤보는 어플라이드가 있는지 확인 필요)
        if (item.system?.getTarget && item.system?.effect?.runTiming === 'afterSuccess') {
            result.applies.push({ itemId: item.id, itemName: item.name });
            console.log('DX3rd | ComboHandler - Added combo apply:', item.name);
        }
        // 4) 익스텐션
        pushExtensionsFrom(item);

        // 포함된 이펙트들 수집
        for (const effectId of effectIds) {
            if (!effectId || effectId === '-') continue;
            const effectItem = actor.items.get(effectId);
            if (!effectItem) continue;
            
            console.log('DX3rd | ComboHandler - Checking effect for afterSuccess:', effectItem.name, {
                activeRunTiming: effectItem.system?.active?.runTiming,
                activeState: effectItem.system?.active?.state,
                effectRunTiming: effectItem.system?.effect?.runTiming,
                getTarget: effectItem.system?.getTarget
            });

            // 1) 활성화 (disable이 'notCheck'가 아닌 경우에만)
            const effectActiveDisable = effectItem.system?.active?.disable ?? '-';
            if (effectItem.system?.active?.runTiming === 'afterSuccess' && !effectItem.system?.active?.state && effectActiveDisable !== 'notCheck') {
                result.activations.push({ itemId: effectItem.id, itemName: effectItem.name });
                console.log('DX3rd | ComboHandler - Added effect activation:', effectItem.name);
            }
            // 2) 매크로 (문자열 파싱)
            const effectMacroString = effectItem.system?.macro || '';
            if (effectMacroString) {
                const macroMatches = effectMacroString.match(/\[([^\]]+)\]/g) || [];
                for (const match of macroMatches) {
                    const macroName = match.slice(1, -1);
                    const macro = game.macros?.getName(macroName);
                    if (macro) {
                        const macroTiming = macro.getFlag('double-cross-3rd', 'runTiming') || 'instant';
                        if (macroTiming === 'afterSuccess') {
                            result.macros.push({ itemId: effectItem.id, itemName: effectItem.name, macroName: macroName, timing: macroTiming });
                            console.log('DX3rd | ComboHandler - Added effect macro:', macroName, 'from:', effectItem.name);
                        }
                    }
                }
            }
            // 3) 어플라이드
            if (effectItem.system?.getTarget && effectItem.system?.effect?.runTiming === 'afterSuccess') {
                result.applies.push({ itemId: effectItem.id, itemName: effectItem.name });
                console.log('DX3rd | ComboHandler - Added effect apply:', effectItem.name);
            }
            // 4) 익스텐션
            pushExtensionsFrom(effectItem);
        }

        // 익스텐션 병합 (afterSuccess + afterMain)
        console.log('DX3rd | ComboHandler - Collected extensions count:', collectedExtensions.length);
        
        // afterSuccess 타이밍 익스텐션 병합
        const afterSuccessExtensions = collectedExtensions.filter(e => e.timing === 'afterSuccess');
        console.log('DX3rd | ComboHandler - AfterSuccess extensions count:', afterSuccessExtensions.length);
        if (afterSuccessExtensions.length > 0) {
            const buckets = handler.groupExtensionsByKey(afterSuccessExtensions);
            const merged = handler.mergeGroupedExtensionBuckets(actor, buckets);
            console.log('DX3rd | ComboHandler - Merged afterSuccess buckets:', merged.length);
            result.extensions = merged.map(b => ({
                ...b,
                selectedTargetIds // 현재 타겟 저장
            }));
        }
        
        // afterMain 타이밍 익스텐션 병합 (parentRunTiming이 afterSuccess인 것만)
        const afterMainExtensions = collectedExtensions.filter(e => 
            e.timing === 'afterMain' && e.parentRunTiming === 'afterSuccess'
        );
        console.log('DX3rd | ComboHandler - AfterMain extensions (parentRunTiming=afterSuccess):', afterMainExtensions.length);
        if (afterMainExtensions.length > 0) {
            const buckets = handler.groupExtensionsByKey(afterMainExtensions);
            const merged = handler.mergeGroupedExtensionBuckets(actor, buckets);
            console.log('DX3rd | ComboHandler - Merged afterMain buckets:', merged.length);
            result.afterMainExtensions = merged.map(b => ({
                ...b,
                selectedTargetIds // 현재 타겟 저장
            }));
        }

        console.log('DX3rd | ComboHandler - Collected afterSuccess data:', result);
        return result;
    },
    
    /**
     * afterDamage 익스텐션 수집 및 병합 (롤 있는 콤보용)
     * afterSuccess와 동일한 구조이지만 afterDamage 타이밍만 필터
     * @returns {Object} { activations: [], macros: [], applies: [], extensions: [merged buckets] }
     */
    async collectAfterDamageData(actor, item) {
        console.log("DX3rd | ComboHandler - Collecting afterDamage data for combo:", item.name);
        const handler = window.DX3rdUniversalHandler;
        if (!handler) return null;

        const result = {
            activations: [], // { itemId, itemName }
            macros: [],      // { itemId, itemName, macroName, timing }
            applies: [],     // { itemId, itemName }
            extensions: [],  // merged buckets (afterDamage)
            afterMainExtensions: [] // merged buckets (afterMain, runTiming이 afterDamage인 경우)
        };

        // effect 참조 정규화 (임시 콤보의 effect.data도 지원)
        const rawEffects = (item.system?.effectIds ?? item.system?.effect?.data ?? item.system?.effect) ?? [];
        let effectIds = [];
        if (Array.isArray(rawEffects)) {
            effectIds = rawEffects.filter(e => e && e !== '-');
        } else if (rawEffects && typeof rawEffects === 'object') {
            effectIds = Object.values(rawEffects)
                .map(v => (typeof v === 'string' ? v : (v?.id || null)))
                .filter(e => e && e !== '-');
        } else if (typeof rawEffects === 'string') {
            if (rawEffects && rawEffects !== '-') effectIds = [rawEffects];
        }

        const selectedTargetIds = Array.from(game.user.targets || []).map(t => t.id);
        const collectedExtensions = [];

        // 익스텐션 수집 함수
        const pushExtensionsFrom = (srcItem) => {
            const ext = srcItem.getFlag('double-cross-3rd', 'itemExtend') || {};
            // 부모 아이템의 runTiming 저장 (익스텐션의 등록 타이밍 결정에 사용)
            const parentRunTiming = srcItem.system?.active?.runTiming || 'instant';
            
            const pushIf = (typeKey) => {
                const d = ext[typeKey];
                if (!d || !d.activate) return;
                
                const baseData = {
                    type: typeKey,
                    itemId: srcItem.id,
                    itemName: srcItem.name,
                    actorId: actor.id,
                    parentRunTiming: parentRunTiming // 부모 아이템의 runTiming 저장
                };
                
                if (typeKey === 'heal' || typeKey === 'damage' || typeKey === 'condition') {
                    collectedExtensions.push({
                        ...baseData,
                        timing: d.timing || 'instant',
                        target: d.target || 'self',
                        formulaDice: d.formulaDice ?? d.dice ?? 0,
                        formulaAdd: d.formulaAdd ?? d.add ?? 0,
                        ignoreReduce: !!d.ignoreReduce,
                        resurrect: !!d.resurrect,
                        rivival: !!d.rivival,
                        conditionType: d.type,
                        poisonedRank: d.poisonedRank || null,
                        conditionalFormula: !!d.conditionalFormula
                    });
                } else if (typeKey === 'weapon' || typeKey === 'protect' || typeKey === 'vehicle') {
                    // 아이템 생성은 afterDamage에서 하지 않음 (instant만)
                    console.log(`DX3rd | ComboHandler - Skipping ${typeKey} extension for afterDamage (instant only)`);
                }
            };
            pushIf('heal');
            pushIf('damage');
            pushIf('condition');
            pushIf('weapon');
            pushIf('protect');
            pushIf('vehicle');
        };

        // 콤보 본체 수집
        // 1) 활성화 (disable이 'notCheck'가 아닌 경우에만)
        const activeDisable = item.system?.active?.disable ?? '-';
        if (item.system?.active?.runTiming === 'afterDamage' && !item.system?.active?.state && activeDisable !== 'notCheck') {
            result.activations.push({ itemId: item.id, itemName: item.name });
        }
        // 2) 매크로 (문자열 파싱)
        const comboMacroStringDamage = item.system?.macro || '';
        if (comboMacroStringDamage) {
            const macroMatches = comboMacroStringDamage.match(/\[([^\]]+)\]/g) || [];
            for (const match of macroMatches) {
                const macroName = match.slice(1, -1);
                const macro = game.macros?.getName(macroName);
                if (macro) {
                    const macroTiming = macro.getFlag('double-cross-3rd', 'runTiming') || 'instant';
                    if (macroTiming === 'afterDamage') {
                        result.macros.push({ itemId: item.id, itemName: item.name, macroName: macroName, timing: macroTiming });
                        console.log('DX3rd | ComboHandler - Added combo macro (afterDamage):', macroName);
                    }
                }
            }
        }
        // 3) 어플라이드
        if (item.system?.getTarget && item.system?.effect?.runTiming === 'afterDamage') {
            result.applies.push({ itemId: item.id, itemName: item.name });
        }
        // 4) 익스텐션
        pushExtensionsFrom(item);

        // 포함된 이펙트들 수집
        for (const effectId of effectIds) {
            const effectItem = actor.items.get(effectId);
            if (!effectItem) continue;
            
            // 1) 활성화 (disable이 'notCheck'가 아닌 경우에만)
            const effectActiveDisable = effectItem.system?.active?.disable ?? '-';
            if (effectItem.system?.active?.runTiming === 'afterDamage' && !effectItem.system?.active?.state && effectActiveDisable !== 'notCheck') {
                result.activations.push({ itemId: effectItem.id, itemName: effectItem.name });
            }
            // 2) 매크로 (문자열 파싱)
            const effectMacroStringDamage = effectItem.system?.macro || '';
            if (effectMacroStringDamage) {
                const macroMatches = effectMacroStringDamage.match(/\[([^\]]+)\]/g) || [];
                for (const match of macroMatches) {
                    const macroName = match.slice(1, -1);
                    const macro = game.macros?.getName(macroName);
                    if (macro) {
                        const macroTiming = macro.getFlag('double-cross-3rd', 'runTiming') || 'instant';
                        if (macroTiming === 'afterDamage') {
                            result.macros.push({ itemId: effectItem.id, itemName: effectItem.name, macroName: macroName, timing: macroTiming });
                            console.log('DX3rd | ComboHandler - Added effect macro (afterDamage):', macroName, 'from:', effectItem.name);
                        }
                    }
                }
            }
            // 3) 어플라이드
            if (effectItem.system?.getTarget && effectItem.system?.effect?.runTiming === 'afterDamage') {
                result.applies.push({ itemId: effectItem.id, itemName: effectItem.name });
            }
            // 4) 익스텐션
            pushExtensionsFrom(effectItem);
        }

        // 익스텐션 병합 (afterDamage + afterMain)
        console.log('DX3rd | ComboHandler - Collected extensions count:', collectedExtensions.length);
        
        // afterDamage 타이밍 익스텐션 병합
        const afterDamageExtensions = collectedExtensions.filter(e => e.timing === 'afterDamage');
        console.log('DX3rd | ComboHandler - AfterDamage extensions count:', afterDamageExtensions.length);
        if (afterDamageExtensions.length > 0) {
            const buckets = handler.groupExtensionsByKey(afterDamageExtensions);
            const merged = handler.mergeGroupedExtensionBuckets(actor, buckets);
            console.log('DX3rd | ComboHandler - Merged afterDamage buckets:', merged.length);
            result.extensions = merged.map(b => ({
                ...b,
                selectedTargetIds // 현재 타겟 저장
            }));
        }
        
        // afterMain 타이밍 익스텐션 병합 (parentRunTiming이 afterDamage인 것만)
        const afterMainExtensions = collectedExtensions.filter(e => 
            e.timing === 'afterMain' && e.parentRunTiming === 'afterDamage'
        );
        console.log('DX3rd | ComboHandler - AfterMain extensions (parentRunTiming=afterDamage):', afterMainExtensions.length);
        if (afterMainExtensions.length > 0) {
            const buckets = handler.groupExtensionsByKey(afterMainExtensions);
            const merged = handler.mergeGroupedExtensionBuckets(actor, buckets);
            console.log('DX3rd | ComboHandler - Merged afterMain buckets:', merged.length);
            result.afterMainExtensions = merged.map(b => ({
                ...b,
                selectedTargetIds // 현재 타겟 저장
            }));
        }

        console.log('DX3rd | ComboHandler - Collected afterDamage data:', result);
        return result;
    },
    
    /**
     * 판정 콤보 처리 (system.roll !== '-')
     * 침식률/활성화는 이미 handleItemUse에서 처리됨
     */
    async handleComboRoll(actor, item, rollType, getTarget) {
        console.log("DX3rd | ComboHandler - Combo roll processing", { rollType });
        
        const handler = window.DX3rdUniversalHandler;
        if (!handler) {
            console.error("DX3rd | UniversalHandler not found");
            return;
        }
        
        // 무기 선택이 활성화된 경우, 무기 선택 다이얼로그 표시
        if (item.system?.weaponSelect && item.system?.attackRoll && item.system.attackRoll !== '-') {
            await this.showWeaponSelectionForAttack(actor, item, rollType);
            return;
        }
        
        // 무기 선택이 비활성화되어 있지만 공격 판정인 경우, 등록된 무기 보너스 적용
        if (!item.system?.weaponSelect && item.system?.attackRoll && item.system.attackRoll !== '-') {
            console.log('DX3rd | ComboHandler - Attack roll without weapon selection, using registered weapons');
            const registeredWeaponBonus = this.calculateRegisteredWeaponBonus(actor, item);
            
            // 등록된 무기 중 사용 가능한 무기가 하나라도 있으면 보너스 적용
            const hasAvailableWeapons = registeredWeaponBonus.weaponIds.length > 0;
            
            if (hasAvailableWeapons) {
                // 사용 가능한 무기가 있으면 보너스 적용
                const weaponBonus = (registeredWeaponBonus.attack > 0 || registeredWeaponBonus.add !== 0) 
                    ? registeredWeaponBonus 
                    : null;
                
                await this.handleComboRollWithWeapon(actor, item, rollType, weaponBonus);
                return;
            }
            // weaponSelect가 false이면 무기 선택 다이얼로그를 열지 않고 일반 판정으로 진행
        }
        
        // 아이템의 스킬로 stat 데이터 가져오기
        const skillKey = item.system?.skill;
        if (!skillKey || skillKey === '-') {
            ui.notifications.warn('콤보의 기능이 설정되지 않았습니다.');
            return;
        }
        
        // 스킬 또는 능력치 데이터 가져오기
        const attributes = ['body', 'sense', 'mind', 'social'];
        let stat = null;
        let label = '';
        
        if (attributes.includes(skillKey)) {
            // 능력치
            stat = actor.system.attributes[skillKey];
            label = game.i18n.localize(`DX3rd.${skillKey.charAt(0).toUpperCase() + skillKey.slice(1)}`);
        } else if (skillKey === 'syndrome') {
            // 신드롬
            stat = actor.system.attributes.syndrome;
            label = stat?.name || game.i18n.localize('DX3rd.Syndrome');
            if (label && label.startsWith('DX3rd.')) {
                label = game.i18n.localize(label);
            }
        } else if (skillKey === 'text') {
            // 텍스트
            stat = actor.system.attributes.text;
            label = stat?.name || game.i18n.localize('DX3rd.Text');
            if (label && label.startsWith('DX3rd.')) {
                label = game.i18n.localize(label);
            }
        } else if (skillKey === 'cthulhu') {
            // 크툴루 신화
            stat = actor.system.attributes.skills?.cthulhu;
            label = stat?.name || game.i18n.localize('DX3rd.cthulhu');
            if (label && label.startsWith('DX3rd.')) {
                label = game.i18n.localize(label);
            }
        } else {
            // 스킬 - system.base 설정 확인
            const customBase = item.system?.base;
            if (customBase && customBase !== '-' && attributes.includes(customBase)) {
                // 커스텀 base 사용 - 스킬 보정 계산
                const baseStat = actor.system.attributes[customBase];
                const skillStat = actor.system.attributes.skills?.[skillKey];
                const originalBaseStat = actor.system.attributes[skillStat?.base];
                
                if (baseStat && skillStat && originalBaseStat) {
                    // 스킬의 순수 보정 계산
                    const skillDiceBonus = (skillStat.dice || 0) - (originalBaseStat.dice || 0);
                    const skillAddBonus = (skillStat.add || 0) - (originalBaseStat.add || 0);
                    
                    // 커스텀 base + 스킬 보정으로 새로운 stat 객체 생성
                    stat = {
                        ...baseStat,
                        dice: (baseStat.dice || 0) + skillDiceBonus,
                        add: (baseStat.add || 0) + skillAddBonus,
                        major: {
                            dice: (baseStat.major?.dice || 0) + skillDiceBonus,
                            add: (baseStat.major?.add || 0) + skillAddBonus,
                            critical: baseStat.major?.critical || 10
                        },
                        reaction: {
                            dice: (baseStat.reaction?.dice || 0) + skillDiceBonus,
                            add: (baseStat.reaction?.add || 0) + skillAddBonus,
                            critical: baseStat.reaction?.critical || 10
                        },
                        dodge: {
                            dice: (baseStat.dodge?.dice || 0) + skillDiceBonus,
                            add: (baseStat.dodge?.add || 0) + skillAddBonus,
                            critical: baseStat.dodge?.critical || 10
                        }
                    };
                    
                    const skillLabel = this.getSkillDisplayName(skillKey, skillStat);
                    label = `${game.i18n.localize(`DX3rd.${customBase.charAt(0).toUpperCase() + customBase.slice(1)}`)}(${skillLabel})`;
                    console.log(`DX3rd | ComboHandler - Using custom base: ${customBase} for skill: ${skillKey}`);
                    console.log(`DX3rd | ComboHandler - Skill bonus: dice=${skillDiceBonus}, add=${skillAddBonus}`);
                    console.log(`DX3rd | ComboHandler - Final stat:`, stat);
                } else {
                    // 폴백: 기본 base 사용
                    stat = baseStat;
                    label = game.i18n.localize(`DX3rd.${customBase.charAt(0).toUpperCase() + customBase.slice(1)}`);
                }
            } else {
                // 기본 스킬 사용
                stat = actor.system.attributes.skills?.[skillKey];
                if (stat) {
                    label = this.getSkillDisplayName(skillKey, stat);
                }
            }
        }
        
        if (!stat) {
            ui.notifications.warn('기능 데이터를 찾을 수 없습니다.');
            return;
        }
        
        // afterSuccess와 afterDamage 데이터 수집
        const afterSuccessData = await this.collectAfterSuccessData(actor, item);
        const afterDamageData = await this.collectAfterDamageData(actor, item);
        
        // 판정 다이얼로그 표시 (afterSuccess와 afterDamage 데이터 전달)
        handler.showStatRollDialog(actor, stat, label, rollType, item, null, null, afterSuccessData, afterDamageData);
    },
    
    /**
     * 공격용 무기 선택 다이얼로그 표시
     */
    async showWeaponSelectionForAttack(actor, item, rollType) {
        const attackRollType = item.system.attackRoll;
        
        // 액터의 모든 무기 + 비클 가져오기 (종별 필터링 제거)
        const allWeapons = actor.items.filter(w => w.type === 'weapon' || w.type === 'vehicle');
        
        if (allWeapons.length === 0) {
            ui.notifications.warn('무기/비클이 없습니다.');
            return;
        }
        
        // 무기 선택 다이얼로그 표시
        new window.DX3rdWeaponForAttackDialog({
            actor: actor,
            weapons: allWeapons,
            attackRoll: attackRollType,
            title: game.i18n.localize('DX3rd.WeaponSelection'),
            callback: async (weaponBonus) => {
                // 무기 보너스를 적용하여 판정 다이얼로그 표시
                await this.handleComboRollWithWeapon(actor, item, rollType, weaponBonus);
            }
        }).render(true);
    },
    
    /**
     * 무기 탭에 등록된 무기들의 보너스 계산 (공격 횟수가 남은 무기만)
     */
    calculateRegisteredWeaponBonus(actor, item) {
        const weaponBonus = { attack: 0, add: 0, weaponName: '', weaponIds: [] };
        
        // 무기 탭에 등록된 무기들 가져오기
        const registeredWeapons = item.system?.weapon || [];
        
        console.log('DX3rd | ComboHandler - Registered weapons:', registeredWeapons);
        
        // 각 등록된 무기의 보너스 합산 (공격 횟수가 남은 무기만)
        for (const weaponId of registeredWeapons) {
            if (weaponId && weaponId !== '-') {
                // 액터의 아이템에서 직접 무기 데이터 가져오기
                const weaponItem = actor.items.get(weaponId);
                if (weaponItem && weaponItem.type === 'weapon') {
                    // 공격 횟수 체크 (weapon만, vehicle은 attack-used 없음)
                    const attackUsedDisable = weaponItem.system['attack-used']?.disable || 'notCheck';
                    const attackUsedState = weaponItem.system['attack-used']?.state || 0;
                    const attackUsedMax = weaponItem.system['attack-used']?.max || 0;
                    const isAttackExhausted = attackUsedDisable !== 'notCheck' && (attackUsedMax <= 0 || attackUsedState >= attackUsedMax);
                    
                    // 공격 횟수가 소진된 무기는 제외
                    if (isAttackExhausted) {
                        console.log(`DX3rd | ComboHandler - Weapon ${weaponItem.name} attack exhausted, skipping (${attackUsedState}/${attackUsedMax})`);
                        continue;
                    }
                    
                    // 공격력 합산 (문자열로 저장됨)
                    const attackValue = Number(weaponItem.system?.attack) || 0;
                    weaponBonus.attack += attackValue;
                    
                    // 수정치 합산 (문자열로 저장됨)
                    const addValue = Number(weaponItem.system?.add) || 0;
                    weaponBonus.add += addValue;
                    
                    // 무기 이름 추가 (루비 텍스트 제거)
                    const cleanWeaponName = weaponItem.name.split('||')[0].trim();
                    if (!weaponBonus.weaponName) {
                        weaponBonus.weaponName = cleanWeaponName;
                    } else {
                        weaponBonus.weaponName += `, ${cleanWeaponName}`;
                    }
                    
                    // 무기 ID 추가
                    weaponBonus.weaponIds.push(weaponId);
                    
                    console.log(`DX3rd | ComboHandler - Weapon ${weaponItem.name}: attack=${attackValue}, add=${addValue}`);
                } else if (weaponItem) {
                    console.log(`DX3rd | ComboHandler - Item ${weaponItem.name} is not a weapon, skipping`);
                } else {
                    console.warn(`DX3rd | ComboHandler - Weapon not found: ${weaponId}`);
                }
            }
        }
        
        console.log('DX3rd | ComboHandler - Total weapon bonus:', weaponBonus);
        return weaponBonus;
    },

    /**
     * 무기 보너스를 적용한 판정 처리
     */
    async handleComboRollWithWeapon(actor, item, rollType, weaponBonus) {
        const handler = window.DX3rdUniversalHandler;
        
        // 아이템의 스킬로 stat 데이터 가져오기
        const skillKey = item.system?.skill;
        if (!skillKey || skillKey === '-') {
            ui.notifications.warn('콤보의 기능이 설정되지 않았습니다.');
            return;
        }
        
        // 스킬 또는 능력치 데이터 가져오기
        const attributes = ['body', 'sense', 'mind', 'social'];
        let stat = null;
        let label = '';
        
        if (attributes.includes(skillKey)) {
            stat = actor.system.attributes[skillKey];
            label = game.i18n.localize(`DX3rd.${skillKey.charAt(0).toUpperCase() + skillKey.slice(1)}`);
        } else {
            // 스킬 - system.base 설정 확인
            const customBase = item.system?.base;
            if (customBase && customBase !== '-' && attributes.includes(customBase)) {
                // 커스텀 base 사용 - 스킬 보정 계산
                const baseStat = actor.system.attributes[customBase];
                const skillStat = actor.system.attributes.skills?.[skillKey];
                const originalBaseStat = actor.system.attributes[skillStat?.base];
                
                if (baseStat && skillStat && originalBaseStat) {
                    // 스킬의 순수 보정 계산
                    const skillDiceBonus = (skillStat.dice || 0) - (originalBaseStat.dice || 0);
                    const skillAddBonus = (skillStat.add || 0) - (originalBaseStat.add || 0);
                    
                    // 커스텀 base + 스킬 보정으로 새로운 stat 객체 생성
                    stat = {
                        ...baseStat,
                        dice: (baseStat.dice || 0) + skillDiceBonus,
                        add: (baseStat.add || 0) + skillAddBonus,
                        major: {
                            dice: (baseStat.major?.dice || 0) + skillDiceBonus,
                            add: (baseStat.major?.add || 0) + skillAddBonus,
                            critical: baseStat.major?.critical || 10
                        },
                        reaction: {
                            dice: (baseStat.reaction?.dice || 0) + skillDiceBonus,
                            add: (baseStat.reaction?.add || 0) + skillAddBonus,
                            critical: baseStat.reaction?.critical || 10
                        },
                        dodge: {
                            dice: (baseStat.dodge?.dice || 0) + skillDiceBonus,
                            add: (baseStat.dodge?.add || 0) + skillAddBonus,
                            critical: baseStat.dodge?.critical || 10
                        }
                    };
                    
                    const skillLabel = this.getSkillDisplayName(skillKey, skillStat);
                    label = `${game.i18n.localize(`DX3rd.${customBase.charAt(0).toUpperCase() + customBase.slice(1)}`)}(${skillLabel})`;
                    console.log(`DX3rd | ComboHandler - Using custom base: ${customBase} for skill: ${skillKey}`);
                    console.log(`DX3rd | ComboHandler - Skill bonus: dice=${skillDiceBonus}, add=${skillAddBonus}`);
                    console.log(`DX3rd | ComboHandler - Final stat:`, stat);
                } else {
                    // 폴백: 기본 base 사용
                    stat = baseStat;
                    label = game.i18n.localize(`DX3rd.${customBase.charAt(0).toUpperCase() + customBase.slice(1)}`);
                }
            } else {
                // 기본 스킬 사용
                stat = actor.system.attributes.skills?.[skillKey];
                if (stat) {
                    label = this.getSkillDisplayName(skillKey, stat);
                }
            }
        }
        
        if (!stat) {
            ui.notifications.warn('기능 데이터를 찾을 수 없습니다.');
            return;
        }
        
        // afterSuccess와 afterDamage 데이터 수집
        const afterSuccessData = await this.collectAfterSuccessData(actor, item);
        const afterDamageData = await this.collectAfterDamageData(actor, item);
        
        console.log('DX3rd | ComboHandler - Weapon bonus to apply:', weaponBonus);
        handler.showStatRollDialog(actor, stat, label, rollType, item, null, weaponBonus, afterSuccessData, afterDamageData);
    }
};

console.log("DX3rd | ComboHandler script loaded");
})();
