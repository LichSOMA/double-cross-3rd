/**
 * Equipment Selection Dialog
 * 아이템 생성 후 장비 선택 다이얼로그
 */
(function() {

class DX3rdEquipmentSelectionDialog extends Dialog {
    constructor(dialogData = {}, options = {}) {
        // V2 Application 호환성을 위한 데이터 구조
        const processedDialogData = {
            title: dialogData.title || 'Equipment Selection',
            content: "",
            buttons: {},
            default: "",
            close: () => {}
        };
        
        super(processedDialogData, options);
        
        this.actor = dialogData.actor;
        this.items = dialogData.items;
        this.createdItemIds = dialogData.createdItemIds || [];
        this.itemType = dialogData.itemType;
        this.dialogTitle = dialogData.title; // title 대신 dialogTitle 사용
        
        // 비클은 단일 선택, 무기/방어구는 복수 선택
        this.isSingleSelect = this.itemType === 'vehicle';
        
        // Promise 생성 (다이얼로그 완료를 기다릴 수 있도록)
        this._resolvePromise = null;
        this._rejectPromise = null;
        this.promise = new Promise((resolve, reject) => {
            this._resolvePromise = resolve;
            this._rejectPromise = reject;
        });
    }
    
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            template: "systems/double-cross-3rd/templates/dialog/equipment-selection-dialog.html",
            width: 500,
            height: 400,
            classes: ["double-cross-3rd", "dialog", "equipment-selection-dialog"],
            resizable: true
        });
    }
    
    get template() {
        // 아이템 타입별로 다른 템플릿 사용
        const templates = {
            'weapon': "systems/double-cross-3rd/templates/dialog/weapon-selection-dialog.html",
            'protect': "systems/double-cross-3rd/templates/dialog/protect-selection-dialog.html",
            'vehicle': "systems/double-cross-3rd/templates/dialog/vehicle-selection-dialog.html"
        };
        return templates[this.itemType] || templates['weapon'];
    }
    
    async getData() {
        // Foundry V13 호환성을 위해 기본 데이터 구조 생성
        const data = {
            // 기본 Dialog 데이터
            title: this.dialogTitle,
            content: "",
            buttons: {},
            default: "",
            close: () => {},
            
            // 커스텀 데이터
            items: (this.items || []).map(item => this.prepareItemData(item)),
            itemType: this.itemType,
            isSingleSelect: this.isSingleSelect,
            equipmentLabel: game.i18n.localize('DX3rd.Equipment'),
            confirmLabel: game.i18n.localize('DX3rd.Confirm'),
            cancelLabel: game.i18n.localize('DX3rd.Cancel')
        };
        
        return data;
    }
    
    prepareItemData(item) {
        const baseData = {
            id: item.id,
            name: this.cleanItemName(item.name),
            equipped: item.system.equipment || false,
            isCreated: this.createdItemIds.includes(item.id),
            img: item.img || 'icons/svg/item-bag.svg'
        };
        
        // 아이템 타입별로 추가 데이터 준비
        if (this.itemType === 'weapon') {
            return {
                ...baseData,
                type: this.getSkillDisplay(item.system.type),
                skill: this.getSkillDisplay(item.system.skill),
                range: item.system.range || '-',
                add: item.system.add || '0',
                attack: item.system.attack || '0',
                guard: item.system.guard || '0'
            };
        } else if (this.itemType === 'protect') {
            return {
                ...baseData,
                dodge: item.system.dodge || '0',
                init: item.system.init || '0',
                armor: item.system.armor || '0'
            };
        } else if (this.itemType === 'vehicle') {
            return {
                ...baseData,
                skill: this.getSkillDisplay(item.system.skill),
                attack: item.system.attack || '0',
                init: item.system.init || '0',
                armor: item.system.armor || '0',
                move: item.system.move || '0'
            };
        }
        
        return baseData;
    }
    
    cleanItemName(name) {
        if (!name) return '';
        
        let cleanedName = name;
        
        // 1. [DX3rd.Fist] 같은 로컬라이징 키 제거
        cleanedName = cleanedName.replace(/\[DX3rd\.\w+\]/g, '').trim();
        
        // 2. DX3rd.TemporaryItem 같은 로컬라이징 키 제거
        const tempItemText = game.i18n.localize('DX3rd.TemporaryItem');
        cleanedName = cleanedName.replace(tempItemText, '').trim();
        
        // 3. "엑스칼리버||약속된 승리의 검" → "엑스칼리버"
        if (cleanedName.includes('||')) {
            cleanedName = cleanedName.split('||')[0].trim();
        }
        
        return cleanedName;
    }
    
    getSkillDisplay(skillKey) {
        if (!skillKey || skillKey === '-') return '-';
        
        // 로컬라이징 키인 경우
        if (typeof skillKey === 'string' && skillKey.startsWith('DX3rd.')) {
            return game.i18n.localize(skillKey);
        }
        
        // 커스텀 스킬 이름 확인
        const customSkills = game.settings.get("double-cross-3rd", "customSkills") || {};
        if (customSkills[skillKey]) {
            return typeof customSkills[skillKey] === 'object' 
                ? customSkills[skillKey].name 
                : customSkills[skillKey];
        }
        
        // 기본 로컬라이징 시도
        const localized = game.i18n.localize(`DX3rd.${skillKey}`);
        return localized !== `DX3rd.${skillKey}` ? localized : skillKey;
    }
    
    activateListeners(html) {
        super.activateListeners(html);
        
        // 체크박스 이벤트 처리
        html.find('.equipment-checkbox').on('change', (e) => {
            this.handleCheckboxChange(e);
        });
        
        // 확인 버튼
        html.find('.equipment-confirm').on('click', (e) => {
            e.preventDefault();
            this.confirmSelection();
        });
        
        // 취소 버튼
        html.find('.equipment-cancel').on('click', (e) => {
            e.preventDefault();
            this.close();
        });
    }
    
    handleCheckboxChange(event) {
        const checkbox = $(event.currentTarget);
        const itemId = checkbox.data('item-id');
        const isChecked = checkbox.is(':checked');
        
        if (this.isSingleSelect && isChecked) {
            // 비클의 경우: 다른 모든 체크박스 해제
            this.element.find('.equipment-checkbox').not(checkbox).prop('checked', false);
        }
    }
    
    async confirmSelection() {
        const checkedItems = [];
        const uncheckedItems = [];

        // 체크된/체크 해제된 아이템들 수집
        this.element.find('.equipment-checkbox').each((index, element) => {
            const checkbox = $(element);
            const itemId = checkbox.data('item-id');
            const isChecked = checkbox.is(':checked');

            if (isChecked) {
                checkedItems.push(itemId);
            } else {
                uncheckedItems.push(itemId);
            }
        });

        // 액터 아이템들 업데이트
        const updates = [];

        // 체크된 아이템들 장비 활성화
        checkedItems.forEach(itemId => {
            const item = this.actor.items.get(itemId);
            if (item && !item.system.equipment) {
                updates.push({
                    _id: itemId,
                    'system.equipment': true
                });
            }
        });

        // 체크 해제된 아이템들 장비 비활성화
        uncheckedItems.forEach(itemId => {
            const item = this.actor.items.get(itemId);
            if (item && item.system.equipment) {
                updates.push({
                    _id: itemId,
                    'system.equipment': false
                });
            }
        });

        // 일괄 업데이트
        if (updates.length > 0) {
            await this.actor.updateEmbeddedDocuments('Item', updates);
        }

        ui.notifications.info(`${this.dialogTitle} 장비 설정이 완료되었습니다.`);
        
        // Promise resolve
        if (this._resolvePromise && !this._resolved) {
            this._resolved = true;
            this._resolvePromise({ confirmed: true, checkedItems });
        }
        
        this.close();
    }
    
    async close(options = {}) {
        // Promise resolve (취소의 경우)
        if (this._resolvePromise && !this._resolved) {
            this._resolved = true;
            this._resolvePromise({ confirmed: false });
        }
        
        return super.close(options);
    }
}

// 전역 노출
window.DX3rdEquipmentSelectionDialog = DX3rdEquipmentSelectionDialog;

})();
