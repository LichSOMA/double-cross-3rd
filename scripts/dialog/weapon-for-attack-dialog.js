/**
 * Weapon For Attack Dialog
 * 공격용 무기 선택 다이얼로그 (장비 상태 변경 없이 공격력/수정치만 적용)
 */
(function() {

class DX3rdWeaponForAttackDialog extends Dialog {
    constructor(dialogData = {}, options = {}) {
        const processedDialogData = {
            title: dialogData.title || game.i18n.localize('DX3rd.WeaponSelection'),
            content: "",
            buttons: {},
            default: "",
            close: () => {}
        };
        
        super(processedDialogData, options);
        
        this.actor = dialogData.actor;
        this.weapons = dialogData.weapons || [];
        this.callback = dialogData.callback || (() => {});
        this.attackRoll = dialogData.attackRoll; // 'melee' or 'ranged'
    }
    
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            template: "systems/double-cross-3rd/templates/dialog/weapon-for-attack-dialog.html",
            width: 800,
            height: 400,
            classes: ["double-cross-3rd", "dialog", "weapon-for-attack-dialog"],
            resizable: true
        });
    }
    
    async getData() {
        // 무기 데이터 준비 및 정렬
        const preparedWeapons = this.weapons.map(weapon => this.prepareWeaponData(weapon));
        
        // 정렬: 사용 가능 무기 → 소진된 무기 (각각 장비 중 → 무기(sort순) → 비클(sort순))
        const sortedWeapons = preparedWeapons.sort((a, b) => {
            // 1. 공격 횟수 소진 여부 (사용 가능한 무기 우선)
            if (!a.attackExhausted && b.attackExhausted) return -1;
            if (a.attackExhausted && !b.attackExhausted) return 1;
            
            // 2. 소진 상태가 같으면 장비 중인 아이템 우선
            if (a.equipped && !b.equipped) return -1;
            if (!a.equipped && b.equipped) return 1;
            
            // 3. 장비 상태가 같으면: 무기 우선, 비클 후순위
            if (!a.isVehicle && b.isVehicle) return -1;
            if (a.isVehicle && !b.isVehicle) return 1;
            
            // 4. 같은 타입이면 sort 값으로 정렬
            return a.sort - b.sort;
        });
        
        const data = {
            title: game.i18n.localize('DX3rd.WeaponSelection'),
            items: sortedWeapons,
            attackRoll: this.attackRoll,
            confirmLabel: game.i18n.localize('DX3rd.Confirm'),
            cancelLabel: game.i18n.localize('DX3rd.Cancel')
        };
        
        return data;
    }
    
    prepareWeaponData(weapon) {
        // 비클인 경우 특수 처리 (비클은 attack-used 필드 없음)
        if (weapon.type === 'vehicle') {
            return {
                id: weapon.id,
                name: this.cleanItemName(weapon.name),
                type: game.i18n.localize('DX3rd.Melee'),
                skill: this.getSkillDisplay(weapon.system.skill),
                range: game.i18n.localize('DX3rd.Engage'),
                add: '0',
                attack: weapon.system.attack || '0',
                guard: '0',
                equipped: weapon.system.equipment || false,
                isVehicle: true,
                sort: weapon.sort || 0,
                attackExhausted: false,  // 비클은 항상 사용 가능
                attackUsedState: 0,
                attackUsedMax: 0
            };
        }
        
        // 일반 무기 - attack-used 횟수 체크
        const attackUsedDisable = weapon.system['attack-used']?.disable || 'notCheck';
        const attackUsedState = weapon.system['attack-used']?.state || 0;
        const attackUsedMax = weapon.system['attack-used']?.max || 0;
        
        // 공격 횟수 소진 여부 확인
        const isAttackExhausted = attackUsedDisable !== 'notCheck' && (attackUsedMax <= 0 || attackUsedState >= attackUsedMax);
        
        return {
            id: weapon.id,
            name: this.cleanItemName(weapon.name),
            type: this.getSkillDisplay(weapon.system.type),
            skill: this.getSkillDisplay(weapon.system.skill),
            range: weapon.system.range || '-',
            add: weapon.system.add || '0',
            attack: weapon.system.attack || '0',
            guard: weapon.system.guard || '0',
            equipped: weapon.system.equipment || false,
            isVehicle: false,
            sort: weapon.sort || 0,
            attackExhausted: isAttackExhausted,
            attackUsedState: attackUsedState,
            attackUsedMax: attackUsedMax
        };
    }
    
    cleanItemName(name) {
        if (!name) return '';
        
        let cleanedName = name;
        
        // [DX3rd.Fist] 제거
        cleanedName = cleanedName.replace(/\[DX3rd\.\w+\]/g, '').trim();
        
        // (임시 아이템) 제거
        const tempItemText = game.i18n.localize('DX3rd.TemporaryItem');
        cleanedName = cleanedName.replace(tempItemText, '').trim();
        
        // 루비 텍스트 제거
        if (cleanedName.includes('||')) {
            cleanedName = cleanedName.split('||')[0].trim();
        }
        
        return cleanedName;
    }
    
    getSkillDisplay(skillKey) {
        if (!skillKey || skillKey === '-') return '-';
        
        if (typeof skillKey === 'string' && skillKey.startsWith('DX3rd.')) {
            return game.i18n.localize(skillKey);
        }
        
        const customSkills = game.settings.get("double-cross-3rd", "customSkills") || {};
        if (customSkills[skillKey]) {
            return typeof customSkills[skillKey] === 'object' 
                ? customSkills[skillKey].name 
                : customSkills[skillKey];
        }
        
        const localized = game.i18n.localize(`DX3rd.${skillKey}`);
        return localized !== `DX3rd.${skillKey}` ? localized : skillKey;
    }
    
    activateListeners(html) {
        super.activateListeners(html);
        
        // 무기 행 클릭 시 체크박스 토글
        html.find('.weapon-row').on('click', (e) => {
            // 체크박스 직접 클릭한 경우는 제외
            if ($(e.target).hasClass('weapon-checkbox')) return;
            
            const $row = $(e.currentTarget);
            const $checkbox = $row.find('.weapon-checkbox');
            
            // 비활성화된 체크박스는 토글하지 않음
            if ($checkbox.prop('disabled')) return;
            
            $checkbox.prop('checked', !$checkbox.prop('checked'));
        });
        
        // 확인 버튼
        html.find('.weapon-confirm').on('click', (e) => {
            e.preventDefault();
            this.confirmSelection();
        });
        
        // 취소 버튼
        html.find('.weapon-cancel').on('click', (e) => {
            e.preventDefault();
            this.close();
        });
    }
    
    async confirmSelection() {
        const selectedWeaponIds = [];
        this.element.find('.weapon-checkbox:checked').each((i, el) => {
            selectedWeaponIds.push($(el).data('weapon-id'));
        });
        
        if (selectedWeaponIds.length === 0) {
            ui.notifications.warn('무기를 선택해주세요.');
            return;
        }
        
        // 선택된 모든 무기의 보너스 합산
        let totalAttack = 0;
        let totalAdd = 0;
        const weaponNames = [];
        
        selectedWeaponIds.forEach(weaponId => {
            const weapon = this.weapons.find(w => w.id === weaponId);
            if (weapon) {
                totalAttack += parseInt(weapon.system.attack) || 0;
                totalAdd += parseInt(weapon.system.add) || 0;
                weaponNames.push(this.cleanItemName(weapon.name));
            }
        });
        
        // 무기의 attack, add 값과 사용된 무기 ID 목록을 콜백으로 전달
        const weaponBonus = {
            attack: totalAttack,
            add: totalAdd,
            weaponName: weaponNames.join(', '),
            weaponIds: selectedWeaponIds  // 사용된 무기 ID 목록 추가
        };
        
        this.callback(weaponBonus);
        this.close();
    }
}

// 전역 노출
window.DX3rdWeaponForAttackDialog = DX3rdWeaponForAttackDialog;

})();

