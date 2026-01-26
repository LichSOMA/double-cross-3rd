/**
 * Item Extend Dialog - Complete Rewrite
 * 아이템 확장 도구 다이얼로그
 */
(function() {

class DX3rdItemExtendDialog extends Dialog {
    constructor(dialogData = {}, options = {}) {
        super(dialogData, options);
        
        this.actorId = dialogData.actorId;
        this.itemId = dialogData.itemId;
        this.currentTopTab = 'hp';
        this.currentSubTab = 'heal';
        this.tempFormData = {};  // 임시 폼 데이터 저장소
    }
    
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            template: "systems/double-cross-3rd/templates/dialog/item-extend-dialog.html",
            width: 650,
            height: 550,
            classes: ["double-cross-3rd", "dialog", "item-extend-dialog"]
        });
    }
    
    async getData() {
        const data = await super.getData();
        
        let item = null;
        let actor = null;
        let skills = {};
        
        // 아이템 가져오기: 액터에 속한 아이템 또는 독립 아이템
        if (this.actorId && this.itemId) {
            actor = game.actors.get(this.actorId);
            if (actor) {
                item = actor.items.get(this.itemId);
                // 액터의 스킬 목록 가져오기
                skills = actor.system.attributes.skills || {};
            }
        } else if (this.itemId) {
            // 독립 아이템 (액터 없음)
            item = game.items.get(this.itemId);
            // 기본 스킬 목록만 사용 (template.json의 기본 스킬들)
            skills = {
                melee: { name: "DX3rd.melee" },
                evade: { name: "DX3rd.evade" },
                ranged: { name: "DX3rd.ranged" },
                perception: { name: "DX3rd.perception" },
                rc: { name: "DX3rd.rc" },
                will: { name: "DX3rd.will" },
                negotiation: { name: "DX3rd.negotiation" },
                procure: { name: "DX3rd.procure" }
            };
        }
        
        if (item) {
            data.actor = actor;
            data.item = item;
            data.itemType = item.type; // 아이템 타입 저장
            // 저장된 확장 데이터 로드
            this.savedItemExtend = item.getFlag('double-cross-3rd', 'itemExtend') || {};
            
            data.actorSkills = skills;
            
            // weapon용 스킬 옵션
            data.weaponSkillOptions = window.DX3rdSkillManager.getSkillSelectOptions('weapon', skills);
            
            // vehicle용 스킬 옵션
            data.vehicleSkillOptions = window.DX3rdSkillManager.getSkillSelectOptions('vehicle', skills);
        }
        
        return data;
    }
    
    activateListeners(html) {
        super.activateListeners(html);
        
        // 탭 전환 이벤트 설정
        this.setupTabEvents(html);
        
        // 하단 버튼 이벤트
        html.find('.dx3rd-dialog-confirm').on('click', (e) => {
            e.preventDefault();
            this.executeAction();
        });
        html.find('.dx3rd-dialog-cancel').on('click', (e) => {
            e.preventDefault();
            this.close();
        });
        
        // 초기 탭 설정
        this.initializeTabs(html);
        
        // 웨폰 탭 특수 처리 (맨손 체크박스)
        this.setupWeaponFistToggle(html);
        
        // HP 회복 탭 특수 처리 (리저렉트 체크박스)
        this.setupHealResurrectToggle(html);
        
        // HP 데미지 탭 특수 처리 (조건부 공식 체크박스)
        this.setupDamageConditionalFormulaToggle(html);

        // Condition 탭 특수 처리 (사독 랭크 토글)
        this.setupConditionPoisonedToggle(html);
    }
    
    setupTabEvents(html) {
        // 상단 탭 클릭 이벤트
        html.find('.top-tab').on('click', (event) => {
            event.preventDefault();
            const topTab = event.currentTarget.dataset.tab;
            this.switchTopTab(topTab, html);
        });
        
        // 서브 탭 클릭 이벤트
        html.find('.sub-tab').on('click', (event) => {
            event.preventDefault();
            const subTab = event.currentTarget.dataset.tab;
            this.switchSubTab(subTab, html);
        });
    }
    
    initializeTabs(html) {
        // 기본 탭 설정 (AffectCharacter > Heal)
        setTimeout(() => {
            this.switchTopTab('affectCharacter', html);
            this.switchSubTab('heal', html);
            // 초기 탭 값 주입
            this.applySavedToForm(html, 'heal');
        }, 50);
    }
    
    switchTopTab(topTab, html) {
        // 상단 탭 버튼 상태 업데이트
        html.find('.top-tab').removeClass('active');
        html.find(`.top-tab[data-tab="${topTab}"]`).addClass('active');
        
        // 서브탭 숨기기
        html.find('.sub-tabs').removeClass('active');
        
        // 해당 서브탭 표시
        html.find(`#${topTab}-sub-tabs`).addClass('active');
        
        // 첫 번째 서브탭 자동 선택
        const firstSubTab = html.find(`#${topTab}-sub-tabs .sub-tab`).first();
        if (firstSubTab.length > 0) {
            const subTabName = firstSubTab.data('tab');
            this.switchSubTab(subTabName, html);
        }
        
        this.currentTopTab = topTab;
    }
    
    switchSubTab(subTab, html) {
        // 1. 현재 탭의 데이터를 임시 저장
        if (this.currentSubTab) {
            const currentFormData = this.getFormData();
            this.tempFormData[this.currentSubTab] = currentFormData[this.currentSubTab];
        }
        
        // 서브탭 버튼 상태 업데이트
        html.find('.sub-tab').removeClass('active');
        html.find(`.sub-tab[data-tab="${subTab}"]`).addClass('active');
        
        // 콘텐츠 섹션 숨기기
        html.find('.content-section').removeClass('active');
        
        // 해당 콘텐츠 표시
        html.find(`#${subTab}-content`).addClass('active');
        
        this.currentSubTab = subTab;
        
        // 2. 임시 저장된 데이터가 있으면 복원, 없으면 저장된 값 로드
        if (this.tempFormData[subTab]) {
            this.applyDataToForm(html, subTab, this.tempFormData[subTab]);
        } else {
            // 저장값 주입
            this.applySavedToForm(html, subTab);
        }
        
        // 웨폰 탭으로 전환 시 맨손 토글 재설정
        if (subTab === 'weapon') {
            this.setupWeaponFistToggle(html);
        }
        
        // HP 회복 탭으로 전환 시 리저렉트 토글 재설정
        if (subTab === 'heal') {
            this.setupHealResurrectToggle(html);
        }
        
        // HP 데미지 탭으로 전환 시 조건부 공식 토글 재설정
        if (subTab === 'damage') {
            this.setupDamageConditionalFormulaToggle(html);
        }
        
        // protect, once, etc 아이템의 타이밍 고정 설정
        if (subTab === 'heal' || subTab === 'damage' || subTab === 'condition') {
            this.setupTimingLockForRestrictedItems(html, subTab);
        }
    }

    // 웨폰 맨손 체크박스 토글 처리
    setupWeaponFistToggle(html) {
        const weaponContent = html.find('#weapon-content');
        if (weaponContent.length === 0) return;

        const fistCheckbox = weaponContent.find('input[name="weaponFist"]');
        const nameField = weaponContent.find('input[name="weaponName"]');
        const amountField = weaponContent.find('input[name="weaponAmount"]');

        // 초기 상태 설정
        this.toggleWeaponFields(fistCheckbox.is(':checked'), nameField, amountField);

        // 체크박스 변경 이벤트
        fistCheckbox.on('change', (e) => {
            const isChecked = $(e.currentTarget).is(':checked');
            this.toggleWeaponFields(isChecked, nameField, amountField);
        });
    }

    // 웨폰 필드 활성화/비활성화 토글
    toggleWeaponFields(isFistMode, nameField, amountField) {
        if (isFistMode) {
            // 맨손 모드: 이름 필드는 활성화, 개수 필드만 비활성화
            nameField.prop('disabled', false);
            nameField.removeClass('disabled');
            amountField.prop('disabled', true);
            amountField.addClass('disabled');
        } else {
            // 일반 모드: 모든 필드 활성화
            nameField.prop('disabled', false);
            nameField.removeClass('disabled');
            amountField.prop('disabled', false);
            amountField.removeClass('disabled');
        }
    }

    // HP 회복 리저렉트 체크박스 토글 처리
    setupHealResurrectToggle(html) {
        const healContent = html.find('#heal-content');
        if (healContent.length === 0) return;

        const resurrectCheckbox = healContent.find('input[name="healResurrect"]');
        const diceField = healContent.find('input[name="healFormulaDice"]');
        const addField = healContent.find('input[name="healFormulaAdd"]');
        const timingSelect = healContent.find('select[name="healTiming"]');
        const targetSelect = healContent.find('select[name="healTarget"]');
        const rivivalCheckbox = healContent.find('input[name="healRivival"]');
        const activateCheckbox = healContent.find('input[name="healActivate"]');

        // 초기 상태 설정
        this.toggleHealResurrectFields(resurrectCheckbox.is(':checked'), diceField, addField, timingSelect, targetSelect, rivivalCheckbox, activateCheckbox);

        // 체크박스 변경 이벤트
        resurrectCheckbox.on('change', (e) => {
            const isChecked = $(e.currentTarget).is(':checked');
            this.toggleHealResurrectFields(isChecked, diceField, addField, timingSelect, targetSelect, rivivalCheckbox, activateCheckbox);
        });
    }

    // 리저렉트 필드 자동 설정/토글
    toggleHealResurrectFields(isResurrectMode, diceField, addField, timingSelect, targetSelect, rivivalCheckbox, activateCheckbox) {
        if (isResurrectMode) {
            // 리저렉트 모드: 값 자동 설정 및 비활성화
            diceField.val('[' + game.i18n.localize('DX3rd.Level') + ']');
            diceField.prop('disabled', true);
            diceField.addClass('disabled');
            
            addField.val('0');
            addField.prop('disabled', true);
            addField.addClass('disabled');
            
            timingSelect.val('instant');
            timingSelect.prop('disabled', true);
            timingSelect.addClass('disabled');
            
            targetSelect.val('self');
            targetSelect.prop('disabled', true);
            targetSelect.addClass('disabled');
            
            rivivalCheckbox.prop('checked', true);
            rivivalCheckbox.prop('disabled', true);
            
            activateCheckbox.prop('checked', true);
            activateCheckbox.prop('disabled', true);
        } else {
            // 일반 모드: 모든 필드 활성화
            diceField.prop('disabled', false);
            diceField.removeClass('disabled');
            
            addField.prop('disabled', false);
            addField.removeClass('disabled');
            
            timingSelect.prop('disabled', false);
            timingSelect.removeClass('disabled');
            
            targetSelect.prop('disabled', false);
            targetSelect.removeClass('disabled');
            
            rivivalCheckbox.prop('disabled', false);
            activateCheckbox.prop('disabled', false);
        }
    }

    // HP 데미지 조건부 공식 체크박스 토글 처리
    setupDamageConditionalFormulaToggle(html) {
        const damageContent = html.find('#damage-content');
        if (damageContent.length === 0) return;

        const conditionalCheckbox = damageContent.find('input[name="damageConditionalFormula"]');
        const diceField = damageContent.find('input[name="damageFormulaDice"]');
        const addField = damageContent.find('input[name="damageFormulaAdd"]');

        // 초기 상태 설정
        this.toggleDamageConditionalFields(conditionalCheckbox.is(':checked'), diceField, addField);

        // 체크박스 변경 이벤트
        conditionalCheckbox.on('change', (e) => {
            const isChecked = $(e.currentTarget).is(':checked');
            this.toggleDamageConditionalFields(isChecked, diceField, addField);
        });
    }

    // 조건부 공식 필드 자동 설정/토글
    toggleDamageConditionalFields(isConditionalMode, diceField, addField) {
        if (isConditionalMode) {
            // 조건부 공식 모드: 값 비우고 비활성화
            diceField.val('');
            diceField.prop('disabled', true);
            diceField.addClass('disabled');
            
            addField.val('');
            addField.prop('disabled', true);
            addField.addClass('disabled');
        } else {
            // 일반 모드: 필드 활성화
            diceField.prop('disabled', false);
            diceField.removeClass('disabled');
            
            addField.prop('disabled', false);
            addField.removeClass('disabled');
        }
    }

    // 컨디션 탭: 사독 랭크 입력 토글
    setupConditionPoisonedToggle(html) {
        const section = html.find('#condition-content');
        if (section.length === 0) return;

        const typeSelect = section.find('select[name="conditionType"]');
        const rankInput = section.find('input[name="poisonedRank"]');

        const applyToggle = () => {
            const type = typeSelect.val();
            const isPoison = type === 'poisoned';
            if (isPoison) {
                rankInput.prop('disabled', false);
                rankInput.removeClass('disabled');
            } else {
                rankInput.val('');
                rankInput.prop('disabled', true);
                rankInput.addClass('disabled');
            }
        };

        // 초기 상태
        applyToggle();
        // 변경 시 토글
        typeSelect.on('change', applyToggle);
    }

    // protect, once, etc 아이템의 타이밍을 "즉시"로 고정
    setupTimingLockForRestrictedItems(html, subTab) {
        try {
            const actor = game.actors.get(this.actorId);
            const item = actor?.items?.get(this.itemId) || game.items.get(this.itemId);
            if (!item) return;

            const restrictedTypes = ['protect', 'once', 'etc'];
            if (!restrictedTypes.includes(item.type)) return;

            // 타이밍 필드명 결정
            const timingFieldName = `${subTab}Timing`;
            const section = html.find(`#${subTab}-content`);
            if (section.length === 0) return;

            const timingSelect = section.find(`select[name="${timingFieldName}"]`);
            if (timingSelect.length === 0) return;

            // "즉시"로 고정하고 비활성화
            timingSelect.val('instant');
            timingSelect.prop('disabled', true);
            timingSelect.addClass('disabled');
        } catch (e) {
            console.warn('DX3rd | setupTimingLockForRestrictedItems failed', e);
        }
    }

    // 저장된 값을 현재 폼에 주입
    applySavedToForm(html, subTab) {
        try {
            const saved = (this.savedItemExtend && this.savedItemExtend[subTab]) || null;
            if (!saved) return;
            this.applyDataToForm(html, subTab, saved);
        } catch (e) {
            console.warn('DX3rd | applySavedToForm failed', e);
        }
    }
    
    // 데이터를 폼에 적용 (공통 함수)
    applyDataToForm(html, subTab, data) {
        try {
            if (!data) return;
            
            const prefixMap = {
                heal: 'heal',
                damage: 'damage',
                weapon: 'weapon',
                protect: 'protect',
                vehicle: 'vehicle',
                condition: 'condition'
            };
            const prefix = prefixMap[subTab] || '';
            const section = html.find(`#${subTab}-content`);
            const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
            
            Object.entries(data).forEach(([key, value]) => {
                const candidates = [];
                if (prefix) candidates.push(`${prefix}${cap(key)}`);
                candidates.push(key);
                for (const name of candidates) {
                    const $input = section.find(`[name="${name}"]`);
                    if ($input.length) {
                        if ($input.attr('type') === 'checkbox') {
                            $input.prop('checked', !!value);
                        } else if ($input.is('select')) {
                            $input.val(value);
                        } else {
                            $input.val(value ?? '');
                        }
                        break;
                    }
                }
            });
            
            // 데이터 적용 후 토글 상태 업데이트
            this.updateToggleStatesAfterDataLoad(html, subTab, data);
        } catch (e) {
            console.warn('DX3rd | applyDataToForm failed', e);
        }
    }
    
    // 데이터 로드 후 토글 상태 업데이트
    updateToggleStatesAfterDataLoad(html, subTab, data) {
        try {
            if (!data) return;
            
            // Heal 탭: 리저렉트 체크박스에 따른 필드 상태 업데이트
            if (subTab === 'heal' && data.resurrect !== undefined) {
                const healContent = html.find('#heal-content');
                if (healContent.length > 0) {
                    const resurrectCheckbox = healContent.find('input[name="healResurrect"]');
                    const diceField = healContent.find('input[name="healFormulaDice"]');
                    const addField = healContent.find('input[name="healFormulaAdd"]');
                    const timingSelect = healContent.find('select[name="healTiming"]');
                    const targetSelect = healContent.find('select[name="healTarget"]');
                    const rivivalCheckbox = healContent.find('input[name="healRivival"]');
                    const activateCheckbox = healContent.find('input[name="healActivate"]');
                    
                    this.toggleHealResurrectFields(
                        resurrectCheckbox.is(':checked'),
                        diceField, addField, timingSelect, targetSelect,
                        rivivalCheckbox, activateCheckbox
                    );
                }
            }
            
            // Damage 탭: 조건부 공식 체크박스에 따른 필드 상태 업데이트
            if (subTab === 'damage' && data.conditionalFormula !== undefined) {
                const damageContent = html.find('#damage-content');
                if (damageContent.length > 0) {
                    const conditionalCheckbox = damageContent.find('input[name="damageConditionalFormula"]');
                    const diceField = damageContent.find('input[name="damageFormulaDice"]');
                    const addField = damageContent.find('input[name="damageFormulaAdd"]');
                    
                    this.toggleDamageConditionalFields(
                        conditionalCheckbox.is(':checked'),
                        diceField, addField
                    );
                }
            }
            
            // Weapon 탭: 맨손 체크박스에 따른 필드 상태 업데이트
            if (subTab === 'weapon' && data.fist !== undefined) {
                const weaponContent = html.find('#weapon-content');
                if (weaponContent.length > 0) {
                    const fistCheckbox = weaponContent.find('input[name="weaponFist"]');
                    const nameField = weaponContent.find('input[name="weaponName"]');
                    const amountField = weaponContent.find('input[name="weaponAmount"]');
                    
                    this.toggleWeaponFields(
                        fistCheckbox.is(':checked'),
                        nameField, amountField
                    );
                }
            }
            
            // Condition 탭: 사독 타입에 따른 랭크 필드 상태 업데이트
            if (subTab === 'condition' && data.type !== undefined) {
                const conditionContent = html.find('#condition-content');
                if (conditionContent.length > 0) {
                    const typeSelect = conditionContent.find('select[name="conditionType"]');
                    const rankInput = conditionContent.find('input[name="poisonedRank"]');
                    
                    const type = typeSelect.val();
                    const isPoison = type === 'poisoned';
                    if (isPoison) {
                        rankInput.prop('disabled', false);
                        rankInput.removeClass('disabled');
                    } else {
                        rankInput.prop('disabled', true);
                        rankInput.addClass('disabled');
                    }
                }
            }
        } catch (e) {
            console.warn('DX3rd | updateToggleStatesAfterDataLoad failed', e);
        }
    }
    
    // 폼 데이터 수집 (모든 탭)
    getFormData() {
        const formData = {};
        const html = this.element.find('.window-content');
        
        // HP Recovery 데이터 (항상 수집)
        const healSection = html.find('#heal-content');
        if (healSection.length > 0) {
            formData.heal = {
                formulaDice: html.find('input[name="healFormulaDice"]').val(),
                formulaAdd: html.find('input[name="healFormulaAdd"]').val(),
                timing: html.find('select[name="healTiming"]').val(),
                target: html.find('select[name="healTarget"]').val(),
                resurrect: html.find('input[name="healResurrect"]').is(':checked'),
                rivival: html.find('input[name="healRivival"]').is(':checked'),
                activate: html.find('input[name="healActivate"]').is(':checked')
            };
        }
        
        // HP Damage 데이터 (항상 수집)
        const damageSection = html.find('#damage-content');
        if (damageSection.length > 0) {
            formData.damage = {
                formulaDice: html.find('input[name="damageFormulaDice"]').val(),
                formulaAdd: html.find('input[name="damageFormulaAdd"]').val(),
                timing: html.find('select[name="damageTiming"]').val(),
                target: html.find('select[name="damageTarget"]').val(),
                ignoreReduce: html.find('input[name="ignoreReduce"]').is(':checked'),
                conditionalFormula: html.find('input[name="damageConditionalFormula"]').is(':checked'),
                activate: html.find('input[name="damageActivate"]').is(':checked'),
                hpCost: html.find('input[name="hpCost"]').val(),
                hpCostActivate: html.find('input[name="hpCostActivate"]').is(':checked')
            };
        }
        
        // Weapon 데이터 (항상 수집)
        const weaponSection = html.find('#weapon-content');
        if (weaponSection.length > 0) {
            formData.weapon = {
                name: html.find('input[name="weaponName"]').val(),
                type: html.find('select[name="weaponType"]').val(),
                skill: html.find('select[name="weaponSkill"]').val(),
                add: html.find('input[name="weaponAdd"]').val(),
                attack: html.find('input[name="weaponAttack"]').val(),
                guard: html.find('input[name="weaponGuard"]').val(),
                range: html.find('input[name="weaponRange"]').val(),
                amount: html.find('input[name="weaponAmount"]').val(),
                fist: html.find('input[name="weaponFist"]').is(':checked'),
                activate: html.find('input[name="weaponActivate"]').is(':checked')
            };
        }
        
        // Protect 데이터 (항상 수집)
        const protectSection = html.find('#protect-content');
        if (protectSection.length > 0) {
            formData.protect = {
                name: html.find('input[name="protectName"]').val(),
                dodge: html.find('input[name="protectDodge"]').val(),
                init: html.find('input[name="protectInit"]').val(),
                armor: html.find('input[name="protectArmor"]').val(),
                activate: html.find('input[name="protectActivate"]').is(':checked')
            };
        }
        
        // Vehicle 데이터 (항상 수집)
        const vehicleSection = html.find('#vehicle-content');
        if (vehicleSection.length > 0) {
            formData.vehicle = {
                name: html.find('input[name="vehicleName"]').val(),
                skill: html.find('select[name="vehicleSkill"]').val(),
                attack: html.find('input[name="vehicleAttack"]').val(),
                init: html.find('input[name="vehicleInit"]').val(),
                armor: html.find('input[name="vehicleArmor"]').val(),
                move: html.find('input[name="vehicleMove"]').val(),
                activate: html.find('input[name="vehicleActivate"]').is(':checked')
            };
        }
        
        // Condition 데이터 (항상 수집)
        const conditionSection = html.find('#condition-content');
        if (conditionSection.length > 0) {
            formData.condition = {
                timing: html.find('select[name="conditionTiming"]').val(),
                target: html.find('select[name="conditionTarget"]').val(),
                type: html.find('select[name="conditionType"]').val(),
                activate: html.find('input[name="conditionActivate"]').is(':checked'),
                poisonedRank: (html.find('select[name="conditionType"]').val() === 'poisoned')
                    ? html.find('input[name="poisonedRank"]').val()
                    : null
            };
        }
        
        return formData;
    }
    
    // 실행 버튼 클릭 처리
    async executeAction() {
        // 현재 활성 탭의 데이터를 tempFormData에 저장
        if (this.currentSubTab) {
            const currentFormData = this.getFormData();
            this.tempFormData[this.currentSubTab] = currentFormData[this.currentSubTab];
        }

        try {
            // 아이템 가져오기: 액터에 속한 아이템 또는 독립 아이템
            let item = null;
            if (this.actorId) {
                const actor = game.actors.get(this.actorId);
                item = actor?.items?.get(this.itemId);
            } else {
                // 독립 아이템 (액터 없음)
                item = game.items.get(this.itemId);
            }
            
            if (!item) {
                ui.notifications.warn('아이템을 찾을 수 없습니다.');
                return;
            }

            // 기존 저장된 데이터를 가져오기
            const existing = foundry.utils.deepClone(item.getFlag('double-cross-3rd', 'itemExtend') || {});
            
            // tempFormData에 있는 탭만 업데이트 (변경된 탭만)
            for (const [tabName, tabData] of Object.entries(this.tempFormData)) {
                if (tabData && Object.keys(tabData).length > 0) {
                    existing[tabName] = tabData;
                }
            }

            await item.setFlag('double-cross-3rd', 'itemExtend', existing);
            ui.notifications.info('확장 도구 설정이 모두 저장되었습니다.');
            
            this.close();
        } catch (err) {
            console.error('DX3rd | ItemExtend save error', err);
            ui.notifications.error('저장 중 오류가 발생했습니다. 콘솔을 확인하세요.');
        }
    }

}

// 전역 노출
window.DX3rdItemExtendDialog = DX3rdItemExtendDialog;

})();