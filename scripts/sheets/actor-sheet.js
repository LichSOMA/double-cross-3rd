/**
 * Double Cross 3rd Actor Sheet
 */
(function () {
    // v13 호환: foundry.appv1 네임스페이스 사용
    const ActorSheetClass = foundry.appv1?.sheets?.ActorSheet || ActorSheet;

    class DX3rdActorSheet extends ActorSheetClass {
        /** @override */
        static get defaultOptions() {
            const parentOptions = super.defaultOptions || {};
            return foundry.utils.mergeObject(parentOptions, {
                classes: ['double-cross-3rd', 'sheet', 'actor'],
                template: 'systems/double-cross-3rd/templates/actor/actor-sheet.html',
                width: 800,
                height: 600,
                tabs: [{ navSelector: '.sheet-tabs', contentSelector: '.sheet-body', initial: 'description' }]
            });
        }

        /**
         * OWNER 권한이 있는지 확인하는 헬퍼 메서드
         * @returns {boolean} OWNER 권한이 있으면 true
         */
        _hasOwnerPermission() {
            if (game.user.isGM) {
                return true;
            }
            return this.actor.testUserPermission(game.user, "OWNER");
        }

        /**
         * simple 시트를 사용해야 하는지 확인하는 헬퍼 메서드
         * @returns {boolean} simple 시트를 사용해야 하면 true
         */
        _shouldUseSimpleSheet() {
            // GM이면 항상 일반 시트
            if (game.user.isGM) {
                return false;
            }
            
            // 정확한 권한 레벨 확인
            // permission 객체에서 사용자 ID로 직접 확인하거나, testUserPermission으로 확인
            let permission = this.actor.permission[game.user.id];
            
            // INHERIT(-1)인 경우 기본 권한 확인
            if (permission === CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT || permission === undefined) {
                // 기본적으로 NONE으로 처리하되, testUserPermission으로 실제 권한 확인
                if (this.actor.testUserPermission(game.user, "OWNER")) {
                    permission = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
                } else if (this.actor.testUserPermission(game.user, "OBSERVER")) {
                    permission = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
                } else if (this.actor.testUserPermission(game.user, "LIMITED")) {
                    permission = CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED;
                } else {
                    permission = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
                }
            }
            
            // OWNER 권한이면 항상 일반 시트
            if (permission >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
                return false;
            }
            
            // LIMITED 권한이면 항상 심플 시트
            if (permission === CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED) {
                return true;
            }
            
            // OBSERVER 권한이면 actorType 확인
            if (permission === CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) {
                const actorType = this.actor.system?.actorType || "NPC";
                // PlayerCharacter 또는 Ally면 일반 시트, 그 외에는 심플 시트
                return !(actorType === "PlayerCharacter" || actorType === "Ally");
            }
            
            // 권한이 없으면 기본적으로 심플 시트 (실제로는 시트를 열 수 없지만)
            return true;
        }

        /** @override */
        get template() {
            if (this._shouldUseSimpleSheet()) {
                return 'systems/double-cross-3rd/templates/actor/actor-sheet-simple.html';
            }
            return 'systems/double-cross-3rd/templates/actor/actor-sheet.html';
        }

        /** @override */
        _getHeaderButtons() {
            // simple 시트인 경우 닫기 버튼만 표시
            if (this._shouldUseSimpleSheet()) {
                // 닫기 버튼만 반환
                return [{
                    label: game.i18n.localize("Close"),
                    class: "close",
                    icon: "fas fa-times",
                    onclick: () => this.close()
                }];
            }

            let buttons = super._getHeaderButtons();

            // ActorType 버튼 추가 (GM에게만 표시)
            if (game.user.isGM) {
                buttons.unshift({
                    label: game.i18n.localize("DX3rd.ActorType"),
                    class: "actor-type",
                    icon: "fa-solid fa-user-tag",
                    onclick: (ev) => this._onActorTypeClick(ev)
                });
            }

            return buttons;
        }

        /** @inheritdoc */
        async getData(options) {
            // simple 시트인 경우 간단한 시트 데이터만 반환
            if (this._shouldUseSimpleSheet()) {
                let data = await super.getData(options);
                let actorData = this.actor.toObject(false);
                data.actor = actorData;
                data.system = this.actor.system;

                // Description 에디터를 위한 데이터 추가 (helpers.js 사용)
                data = await window.DX3rdDescriptionManager.enrichSheetData(data, this.actor);

                return data;
            }

            let isOwner = false;
            let isEditable = this.isEditable;
            let data = await super.getData(options);
            let actorData = this.actor.toObject(false);
            data.actor = actorData;
            data.system = this.actor.system;

            // canEdit 설정 (OWNER 권한이 있는 경우에만 편집 가능)
            data.canEdit = this._hasOwnerPermission();

            // StageCRC 설정 확인
            data.stageCRCDisabled = !game.settings.get("double-cross-3rd", "stageCRC");

            // Description 에디터를 위한 데이터 추가 (helpers.js 사용)
            data = await window.DX3rdDescriptionManager.enrichSheetData(data, this.actor);

            // Owned Items
            data.items = actorData.items;
            for (let i of data.items) {
                const item = this.actor.items.get(i._id);
                i.id = item._id;
                i.isOther = ["book", "etc", "once"].includes(i.type);

                // 레벨 표시 기본값 보정 (effect/psionic 생성 직후에도 보이도록)
                if (['effect', 'psionic'].includes(i.type)) {
                    if (!i.system) i.system = {};
                    if (!i.system.level) i.system.level = {};
                    if (i.system.level.init == null) i.system.level.init = 1;
                    if (i.system.level.max == null) i.system.level.max = 1;
                    if (i.type === 'effect') {
                        const upgrade = i.system.level.upgrade ?? false;
                        const encLevel = upgrade ? Number(this.actor.system?.attributes?.encroachment?.level) || 0 : 0;
                        i.system.level.value = Number(i.system.level.init || 0) + encLevel;
                    } else {
                        i.system.level.value = Number(i.system.level.init || 0);
                    }
                }
            }
            data.items.sort((a, b) => (a.sort || 0) - (b.sort || 0));
            this._prepareCharacterItems(actorData, data.items);

            // dice-info의 기본 표시 값 계산 (전체 액터 기준)
            const diceView = this.actor.system.attributes.dice?.view || 'major';
            data.dice = 0;
            data.critical = game.settings.get("double-cross-3rd", "defaultCritical") || 10;
            data.add = 0;

            return data;
        }

        /** @override */
        _getSkillDisplay(skillKey) {
            if (!skillKey || skillKey === '-') return '-';

            // 액터의 스킬에서 찾기
            const skill = this.actor.system?.attributes?.skills?.[skillKey];
            if (skill) {
                // 스킬 이름이 DX3rd.로 시작하면 커스텀 이름 또는 로컬라이징
                if (skill.name && skill.name.startsWith('DX3rd.')) {
                    // customSkills 설정 확인
                    const customSkills = game.settings.get("double-cross-3rd", "customSkills") || {};
                    const customSkill = customSkills[skillKey];

                    if (customSkill) {
                        // 커스텀 이름이 있으면 우선 사용
                        return typeof customSkill === 'object' ? customSkill.name : customSkill;
                    } else {
                        // 커스텀 이름이 없으면 기본 로컬라이징
                        return game.i18n.localize(skill.name);
                    }
                }
                return skill.name || skillKey;
            }

            // 스킬이 없으면 기본 속성 체크
            const attributes = ['body', 'sense', 'mind', 'social'];
            if (attributes.includes(skillKey)) {
                return game.i18n.localize(`DX3rd.${skillKey.charAt(0).toUpperCase() + skillKey.slice(1)}`);
            }

            // 신드롬 체크
            if (skillKey === 'syndrome') {
                return game.i18n.localize('DX3rd.Syndrome');
            }

            // DX3rd. 접두사가 있는 스킬 키인 경우 로컬라이징 시도
            if (skillKey.startsWith('DX3rd.')) {
                return game.i18n.localize(skillKey);
            }

            return skillKey;
        }

        activateListeners(html) {
            super.activateListeners(html);

            html.find('.backtrack-roll').click(this._onBacktrackRoll.bind(this));
            html.find('.skill-roll').click(this._onSkillRoll.bind(this));
            html.find('.ability-roll').click(this._onAbilityRoll.bind(this));

            // 전역 토글 리스너는 main.js에서 등록됨

            // 스킬 관리 리스너
            html.find('.skill-create').click(this._onCreateSkill.bind(this));
            html.find('.skill-edit').click(this._onEditSkill.bind(this));
            html.find('.skill-delete').click(this._onDeleteSkill.bind(this));

            html.find('.diamond').click(this._onAbilityDiamondClick.bind(this));

            // 아이템 에딧/삭제 리스너
            html.find('.item-edit').click(this._onItemEdit.bind(this));
            html.find('.item-delete').click(this._onItemDelete.bind(this));
            html.find('.item-create').click(this._onItemCreate.bind(this));

            // echo-item 클릭 시 채팅 출력 리스너
            html.find('.echo-item').click(this._onItemNameClick.bind(this));
            
            // item-label 클릭 시 설명 토글 리스너
            html.find('.item-label').click(this._onItemLabelClick.bind(this));

            // 사용횟수 수정 리스너 (disabled되지 않는 첫 번째 입력필드만)
            html.find('.used-input:not([disabled])').on('change', this._onUsedStateChange.bind(this));

            // 활성화 체크박스 리스너
            html.find('.active-check').on('change', this._onActiveChange.bind(this));

            // 장비 체크박스 리스너
            html.find('.active-equipment').on('change', this._onEquipmentChange.bind(this));

            // Applied 효과 제거 리스너
            html.find('.remove-applied').click(this._onRemoveApplied.bind(this));

            // Applied 효과 보기 리스너
            html.find('.show-applied').click(this._onShowApplied.bind(this));

            // 신드롬 체크박스 토글 - mousedown과 click 둘 다 처리하여 완전한 차단
            html.on('mousedown', 'input.item-checkbox[name^="system.attributes.syndrome."]', this._onToggleSyndrome.bind(this));
            html.on('click', 'input.item-checkbox[name^="system.attributes.syndrome."]', this._onSyndromeClick.bind(this));

            // 드래그 앤 드롭 이벤트 처리
            html.on('dragstart', '.item', this._onDragStart.bind(this));
            html.on('dragover', this._onDragOver.bind(this));
            html.on('drop', this._onDrop.bind(this));

            // 능력치 이름 클릭 시 dice 정보 출력
            html.find('.ability-roll').click(this._onAbilityNameClick.bind(this));

            // 스킬 이름 클릭 시 dice 정보 출력
            html.find('.skill-roll').click(this._onSkillNameClick.bind(this));

            // 능력치/스킬 호버 시 dice-info 업데이트
            html.find('.ability-roll').hover(
                this._onAbilityHover.bind(this),
                this._onAbilityHoverOut.bind(this)
            );

            html.find('.skill-roll').hover(
                this._onSkillHover.bind(this),
                this._onSkillHoverOut.bind(this)
            );

            // 로이스 Titus 버튼 클릭
            html.find('.btn-titus').click(this._onTitusClick.bind(this));

            // 로이스 Sublimation 버튼 클릭
            html.find('.btn-sublimation').click(this._onSublimationClick.bind(this));

            // 재산점 클릭
            html.find('.stock-title').click(this._onStockClick.bind(this));
        }

        _calculateEncroachment(data) {
            // TODO: 침식도 계산 로직 구현
        }

        async _onSkillRoll(event) {
            event.preventDefault();
            // TODO: 스킬 롤 로직 구현
        }

        async _onAbilityRoll(event) {
            event.preventDefault();
            // TODO: 능력치 롤 로직 구현
        }

        async _onCreateSkill(event) {
            event.preventDefault();
            
            // OWNER 권한 체크
            if (!this._hasOwnerPermission()) {
                ui.notifications.warn(game.i18n.localize("DX3rd.NoPermission"));
                return;
            }
            
            // 클릭 버블링으로 능력치 이름(.ability-roll) 클릭 핸들러가 함께 실행되지 않도록 차단
            event.stopPropagation();
            const abilityId = $(event.currentTarget).data('ability-id');
            if (!abilityId) return;

            const baseAbility = this.actor.system.attributes[abilityId];
            const dice = baseAbility ? baseAbility.dice || 0 : 0;

            // Works 보너스 계산 (임시로 0으로 설정, 실제 계산은 다이얼로그에서)
            const worksBonus = 0;

            // 아이템 보너스 계산 (임시로 0으로 설정, 실제 계산은 다이얼로그에서)
            const itemBonus = 0;

            // Applied 보너스 계산 (임시로 0으로 설정, 실제 계산은 다이얼로그에서)
            const appliedBonus = 0;

            const title = game.i18n.localize("DX3rd.CreateSkill");
            new DX3rdSkillCreateDialog({
                title,
                skill: {
                    key: "",
                    name: "",
                    point: 0,
                    bonus: itemBonus + appliedBonus,
                    extra: 0,
                    works: worksBonus,
                    base: abilityId,
                    dice: dice,
                    total: worksBonus + itemBonus + appliedBonus
                },
                actorId: this.actor.id,
                buttons: {
                    create: {
                        label: game.i18n.localize("DX3rd.Create"),
                        callback: () => { }  // 실제 콜백은 다이얼로그 클래스에서 처리
                    },
                    cancel: {
                        label: game.i18n.localize("DX3rd.Cancel")
                    }
                },
                default: "create"
            }).render(true);
        }

        async _onEditSkill(event) {
            event.preventDefault();
            
            // OWNER 권한 체크
            if (!this._hasOwnerPermission()) {
                ui.notifications.warn(game.i18n.localize("DX3rd.NoPermission"));
                return;
            }
            
            const skillId = $(event.currentTarget).closest('.skill').data('skill-id');
            if (!skillId) return;

            const skill = this.actor.system.attributes.skills[skillId];
            if (!skill) return;

            // 현재 스킬의 모든 데이터를 가져옴
            const baseAbility = this.actor.system.attributes[skill.base];
            const dice = baseAbility ? baseAbility.dice || 0 : 0;

            const title = game.i18n.localize("DX3rd.EditSkill");
            new DX3rdSkillEditDialog({
                title,
                width: 900,
                skill: {
                    key: skillId,
                    name: skill.name || "",
                    point: skill.point || 0,
                    bonus: skill.bonus || 0,
                    extra: skill.extra || 0,
                    works: skill.works || 0,
                    base: skill.base,
                    dice: dice,
                    total: skill.total || 0,
                    delete: skill.delete
                },
                actorId: this.actor.id,
                buttons: {
                    cancel: {
                        label: game.i18n.localize("DX3rd.Close"),
                        callback: () => dialog.close()
                    }
                },
                default: "cancel"
            }).render(true);
        }

        async _onDeleteSkill(event) {
            event.preventDefault();
            
            // OWNER 권한 체크
            if (!this._hasOwnerPermission()) {
                ui.notifications.warn(game.i18n.localize("DX3rd.NoPermission"));
                return;
            }
            
            const skillId = $(event.currentTarget).closest('.skill').data('skill-id');
            if (!skillId) return;

            const skill = this.actor.system.attributes.skills[skillId];
            if (!skill) return;

            // 기본 스킬은 삭제 불가
            if (!skill.delete) {
                ui.notifications.error(game.i18n.localize("DX3rd.ErrorCannotDeleteDefaultSkill"));
                return;
            }

            // 삭제 확인
            const confirmed = await Dialog.confirm({
                title: game.i18n.localize("DX3rd.DeleteSkill"),
                content: game.i18n.format("DX3rd.ConfirmDeleteSkill", { name: skill.name })
            });

            if (confirmed) {
                // cthulhu 스킬 삭제 시 플래그 설정
                if (skillId === 'cthulhu') {
                    await this.actor.setFlag('double-cross-3rd', 'cthulhuDeleted', true);
                }

                await this.actor.update({
                    [`system.attributes.skills.-=${skillId}`]: null
                });
            }
        }

        async _onAbilityDiamondClick(event) {
            event.preventDefault();
            
            // OWNER 권한 체크
            if (!this._hasOwnerPermission()) {
                ui.notifications.warn(game.i18n.localize("DX3rd.NoPermission"));
                return;
            }
            
            const ability = $(event.currentTarget).data('ability'); // body, sense, mind, social
            if (!ability) return;

            const attrs = this.actor.system.attributes[ability];
            const title = game.i18n.localize("DX3rd.EditAbility");
            const abilityLabel = "DX3rd." + ability.charAt(0).toUpperCase() + ability.slice(1);

            // 신드롬 보너스 계산
            let syndromeBonus = 0;
            const syndromeList = this.actor.system.attributes.syndrome || [];

            // 액터가 가진 신드롬 아이템 개수에 따른 배율 결정
            const syndromeItems = this.actor.items.filter(item => item.type === 'syndrome');
            const totalSyndromeCount = syndromeItems.length;

            let multiplier = 1;
            if (totalSyndromeCount === 1) {
                // 퓨어브리드: 2배
                multiplier = 2;
            } else if (totalSyndromeCount >= 2) {
                // 크로스브리드/트라이브리드: 1배
                multiplier = 1;
            }

            for (const syndromeId of syndromeList) {
                const syndromeItem = this.actor.items.get(syndromeId);
                if (syndromeItem && syndromeItem.system?.attributes?.[ability]?.value) {
                    const baseValue = Number(syndromeItem.system.attributes[ability].value) || 0;
                    syndromeBonus += baseValue * multiplier;
                }
            }

            // 워크스 보너스 계산
            let worksBonus = 0;
            const worksItems = this.actor.items.filter(item => item.type === 'works');
            for (const worksItem of worksItems) {
                if (worksItem.system?.attributes?.[ability]?.value) {
                    worksBonus += window.DX3rdFormulaEvaluator.evaluate(worksItem.system.attributes[ability].value, worksItem, this.actor);
                }
            }

            // 활성화된 아이템들의 stat_bonus 계산
            let itemBonus = 0;
            const activeItems = this.actor.items.filter(item =>
                item.system?.active?.state === true &&
                ['combo', 'effect', 'spell', 'psionic', 'weapon', 'protect', 'vehicle', 'connection', 'etc', 'once'].includes(item.type)
            );

            for (const item of activeItems) {
                if (item.system?.attributes) {
                    for (const [attrKey, attrData] of Object.entries(item.system.attributes)) {
                        // stat_bonus 어트리뷰트이고 라벨이 현재 능력치와 일치하는 경우
                        if (attrData.key === 'stat_bonus' && attrData.label === ability && attrData.value) {
                            itemBonus += window.DX3rdFormulaEvaluator.evaluate(attrData.value, item, this.actor);
                        }
                    }
                }
            }

            // Applied 효과의 stat_bonus 계산
            let appliedBonus = 0;
            const appliedEffects = this.actor.system.attributes.applied || {};

            for (const [appliedKey, appliedEffect] of Object.entries(appliedEffects)) {
                if (appliedEffect && appliedEffect.attributes) {
                    // applied 효과의 attributes에서 현재 능력치와 일치하는 항목 찾기
                    for (const [attrName, attrValue] of Object.entries(appliedEffect.attributes)) {
                        if (attrName.toLowerCase() === ability.toLowerCase()) {
                            appliedBonus += Number(attrValue) || 0;
                        }
                    }
                }
            }

            const total = (attrs.point ?? 0) + (attrs.extra ?? 0) + (attrs.bonus ?? 0) + syndromeBonus + worksBonus + itemBonus + appliedBonus;

            const content = await renderTemplate("systems/double-cross-3rd/templates/dialog/ability-dialog.html", {
                title,
                abilityLabel,
                point: attrs.point,
                extra: attrs.extra,
                bonus: (attrs.bonus ?? 0) + itemBonus + appliedBonus,
                syndrome: syndromeBonus,
                works: worksBonus,
                total
            });

            new Dialog({
                title,
                content,
                buttons: {
                    ok: {
                        label: "",
                        callback: () => {
                            // 필요하다면 다이얼로그 닫기 등 추가 동작
                        }
                    }
                },
                default: "ok",
                render: html => {
                    // OK 버튼을 완전히 숨김
                    const $okBtn = html.find('button.dialog-button[data-button="ok"]');
                    $okBtn.css({
                        display: "none"
                    });

                    // 엔터 누르면 OK 버튼 클릭
                    html.closest('form').on('keydown', ev => {
                        if (ev.key === "Enter") {
                            ev.preventDefault();
                            $okBtn.click();
                            return false;
                        }
                    });

                    // 기존 input 이벤트 등...
                    const $point = html.find("#ability-point");
                    const $extra = html.find("#ability-extra");
                    const $bonus = html.find("#ability-bonus");
                    const $syndrome = html.find("#ability-syndrome");
                    const $works = html.find("#ability-works");
                    const $total = html.find("#ability-total");

                    // auto-sign 기능 추가
                    html.find('.auto-sign').on('input', function () {
                        let value = this.value.replace(/[^0-9+-]/g, '');
                        value = value.replace(/(?!^)[+-]/g, '');
                        if (value === '+' || value === '-') {
                            this.value = value;
                            return;
                        }
                        let numValue = Number(value);
                        if (isNaN(numValue)) numValue = 0;
                        if (numValue === 0) {
                            this.value = '0';
                        } else if (numValue > 0) {
                            this.value = '+' + numValue;
                        } else if (numValue < 0) {
                            this.value = numValue.toString();
                        } else {
                            this.value = '';
                        }
                    });
                    // 초기값에 기호 적용
                    html.find('.auto-sign').each(function () {
                        const value = Number(this.value) || 0;
                        if (value > 0) {
                            this.value = '+' + value;
                        } else if (value < 0) {
                            this.value = value.toString();
                        } else {
                            this.value = '0';
                        }
                    });

                    function updateTotalAndActor() {
                        // 부호 제거 후 숫자 변환
                        const p = Number($point.val().replace('+', '')) || 0;
                        const e = Number($extra.val().replace('+', '')) || 0;
                        const b = Number($bonus.val().replace('+', '')) || 0;
                        const s = Number($syndrome.val().replace('+', '')) || 0;
                        const w = Number($works.val().replace('+', '')) || 0;
                        const total = p + e + b + s + w;
                        if (total === 0) {
                            $total.val('0');
                        } else if (total > 0) {
                            $total.val('+' + total);
                        } else {
                            $total.val(total.toString());
                        }
                        // 값이 바뀔 때마다 즉시 반영
                        this.actor.update({
                            [`system.attributes.${ability}.point`]: p,
                            [`system.attributes.${ability}.extra`]: e
                        });
                    }
                    $point.on("input", updateTotalAndActor.bind(this));
                    $extra.on("input", updateTotalAndActor.bind(this));
                }
            }).render(true);
        }

        async _onItemEdit(event) {
            event.preventDefault();
            
            // OWNER 권한 체크
            if (!this._hasOwnerPermission()) {
                ui.notifications.warn(game.i18n.localize("DX3rd.NoPermission"));
                return;
            }
            
            const li = $(event.currentTarget).closest('.item');
            const itemId = li.data('item-id');
            if (!itemId) return;
            const item = this.actor.items.get(itemId);
            if (item) item.sheet.render(true);
        }

        async _onItemDelete(event) {
            event.preventDefault();
            
            // OWNER 권한 체크
            if (!this._hasOwnerPermission()) {
                ui.notifications.warn(game.i18n.localize("DX3rd.NoPermission"));
                return;
            }
            
            const li = $(event.currentTarget).closest('.item');
            const itemId = li.data('item-id');
            if (!itemId) return;
            const item = this.actor.items.get(itemId);
            if (!item) return;
            const confirmed = await Dialog.confirm({
                title: game.i18n.localize("DX3rd.DeleteItem"),
                content: game.i18n.format("DX3rd.ConfirmDeleteItem", { name: item.name })
            });
            if (confirmed) {
                await this.actor.deleteEmbeddedDocuments("Item", [itemId]);
            }
        }

        async _onItemNameClick(event) {
            event.preventDefault();
            event.stopPropagation();
            const li = $(event.currentTarget).closest('.item');
            const itemId = li.data('item-id');
            if (!itemId) return;

            // 권한 체크
            if (!this.actor.isOwner && !game.user.isGM) {
                ui.notifications.warn('이 액터에 대한 권한이 없습니다.');
                return;
            }

            const item = this.actor.items.get(itemId);
            if (!item) return;

            // 아이템 소진 여부 체크 (통합 함수 사용)
            if (window.DX3rdItemExhausted?.isItemExhausted(item)) {
                ui.notifications.warn(`${item.name}의 사용 횟수가 모두 소진되었습니다.`);
                return;
            }

            // 아이템 정보를 채팅으로 출력
            await this._sendItemToChat(item);
        }

        async _onItemLabelClick(event) {
            event.preventDefault();
            event.stopPropagation();
            
            // echo-item 클릭이면 채팅 출력으로 처리하지 않음
            if ($(event.target).closest('.echo-item').length > 0) {
                return;
            }
            
            const li = $(event.currentTarget).closest('.item');
            const itemId = li.data('item-id');
            if (!itemId) return;
            
            const itemDescription = li.find('.item-description');
            const toggleIcon = li.find('.item-details-toggle i');
            
            if (!itemDescription.length) return;
            
            // 토글 애니메이션
            if (itemDescription.is(':visible')) {
                itemDescription.slideUp(250, () => {
                    toggleIcon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
                });
            } else {
                itemDescription.slideDown(250, () => {
                    toggleIcon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
                });
            }
        }

        async _sendItemToChat(item) {
            try {
                // 액터 데이터 최신화 (침식률 변경 등 반영)
                await this.actor.prepareData();

                // 최신화된 아이템 데이터 가져오기
                const currentItem = this.actor.items.get(item.id);
                if (!currentItem) {
                    console.error('DX3rd | Item not found in actor:', item.id);
                    return;
                }

                // 아이템 타입별 정보 수집 (최신 데이터 사용)
                const itemData = {
                    id: currentItem.id,
                    name: currentItem.name,
                    type: currentItem.type,
                    description: currentItem.system.description || "",
                    img: currentItem.img
                };

                // 아이템 타입별 추가 정보 수집 (최신 데이터 사용)
                switch (currentItem.type) {
                    case 'effect':
                        // 침식률에 따른 레벨 계산
                        const baseLevel = Number(currentItem.system.level?.init || 0);
                        const upgrade = currentItem.system.level?.upgrade || false;
                        let calculatedLevel = baseLevel;

                        if (upgrade && this.actor.system?.attributes?.encroachment?.level) {
                            const encLevel = Number(this.actor.system.attributes.encroachment.level) || 0;
                            calculatedLevel += encLevel;
                        }

                        itemData.level = calculatedLevel;
                        itemData.maxLevel = Number(currentItem.system.level?.max) || itemData.level || 0;
                        itemData.timing = currentItem.system.timing || '-';
                        itemData.skill = currentItem.system.skill || '-';
                        itemData.target = currentItem.system.target || '-';
                        itemData.range = currentItem.system.range || '-';
                        itemData.encroach = currentItem.system.encroach?.value || 0;
                        itemData.limit = currentItem.system.limit || '-';
                        itemData.used = currentItem.system.used || { disable: 'notCheck', state: 0, max: 0 };
                        break;
                    case 'spell':
                        itemData.spellType = currentItem.system.spelltype || '-';
                        itemData.invoke = currentItem.system.invoke?.value || '-';
                        itemData.evocation = currentItem.system.evocation?.value || '-';
                        itemData.encroach = currentItem.system.encroach?.value || 0;
                        itemData.attributes = currentItem.system.effect?.attributes || {};
                        itemData.used = currentItem.system.used || { disable: 'notCheck', state: 0, max: 0 };
                        break;
                    case 'psionic':
                        // 사이오닉은 침식률 보정 없이 init만 사용
                        const psionicBaseLevel = Number(currentItem.system.level?.init || 0);
                        itemData.level = psionicBaseLevel;
                        itemData.maxLevel = Number(currentItem.system.level?.max) || itemData.level || 0;
                        itemData.timing = currentItem.system.timing || '-';
                        itemData.skill = currentItem.system.skill || '-';
                        itemData.target = currentItem.system.target || '-';
                        itemData.range = currentItem.system.range || '-';
                        itemData.hp = currentItem.system.hp?.value || 0;
                        itemData.limit = currentItem.system.limit || '-';
                        itemData.used = currentItem.system.used || { disable: 'notCheck', state: 0, max: 0 };
                        break;
                    case 'weapon':
                        itemData.weaponType = currentItem.system.type || '-';
                        itemData.skill = currentItem.system.skill || '-';
                        itemData.range = currentItem.system.range || '-';
                        itemData.add = window.DX3rdFormulaEvaluator.evaluate(currentItem.system.add, currentItem, this.actor);
                        itemData.attack = window.DX3rdFormulaEvaluator.evaluate(currentItem.system.attack, currentItem, this.actor);
                        itemData.guard = window.DX3rdFormulaEvaluator.evaluate(currentItem.system.guard, currentItem, this.actor);
                        itemData.used = currentItem.system.used || { disable: 'notCheck', state: 0, max: 0 };
                        itemData['attack-used'] = currentItem.system['attack-used'] || { disable: 'notCheck', state: 0, max: 0 };
                        break;
                    case 'protect':
                        itemData.dodge = window.DX3rdFormulaEvaluator.evaluate(currentItem.system.dodge, currentItem, this.actor);
                        itemData.init = window.DX3rdFormulaEvaluator.evaluate(currentItem.system.init, currentItem, this.actor);
                        itemData.armor = window.DX3rdFormulaEvaluator.evaluate(currentItem.system.armor, currentItem, this.actor);
                        itemData.used = currentItem.system.used || { disable: 'notCheck', state: 0, max: 0 };
                        break;
                    case 'vehicle':
                        itemData.vehicleType = currentItem.system.type || '-';
                        itemData.skill = currentItem.system.skill || '-';
                        itemData.attack = window.DX3rdFormulaEvaluator.evaluate(currentItem.system.attack, currentItem, this.actor);
                        itemData.init = window.DX3rdFormulaEvaluator.evaluate(currentItem.system.init, currentItem, this.actor);
                        itemData.armor = window.DX3rdFormulaEvaluator.evaluate(currentItem.system.armor, currentItem, this.actor);
                        itemData.move = window.DX3rdFormulaEvaluator.evaluate(currentItem.system.move, currentItem, this.actor);
                        itemData.used = currentItem.system.used || { disable: 'notCheck', state: 0, max: 0 };
                        break;
                    case 'connection':
                        itemData.skill = currentItem.system.skill || '-';
                        itemData.add = currentItem.system.add || 0;
                        itemData.used = currentItem.system.used || { disable: 'notCheck', state: 0, max: 0 };
                        break;
                    case 'etc':
                        itemData.etcType = currentItem.system.type || '-';
                        itemData.add = currentItem.system.add || 0;
                        itemData.used = currentItem.system.used || { disable: 'notCheck', state: 0, max: 0 };
                        break;
                    case 'once':
                        itemData.quantity = currentItem.system.quantity || 1;
                        itemData.add = currentItem.system.add || 0;
                        itemData.used = currentItem.system.used || { disable: 'notCheck', state: 0, max: 0 };
                        break;
                    case 'combo':
                        itemData.skill = currentItem.system.skill || '-';
                        itemData.base = currentItem.system.base || '-';
                        itemData.roll = currentItem.system.roll || '-';
                        itemData.difficulty = currentItem.system.difficulty || '';
                        itemData.timing = currentItem.system.timing || '-';
                        itemData.range = currentItem.system.range || '';
                        itemData.target = currentItem.system.target || '';
                        itemData.limit = currentItem.system.limit || '-';
                        itemData.used = currentItem.system.used || { disable: 'notCheck', state: 0, max: 0 };

                        // 콤보에 포함된 이펙트와 무기 정보 수집
                        itemData.effects = [];
                        itemData.weapons = [];


                        // 콤보 아이템은 system.effect와 system.weapon을 사용 (복수형이 아님)
                        if (currentItem.system.effect && Array.isArray(currentItem.system.effect)) {
                            for (const effectId of currentItem.system.effect) {
                                if (effectId && effectId !== '-') {
                                    const effect = this.actor.items.get(effectId);
                                    if (effect && effect.type === 'effect') {
                                        itemData.effects.push({
                                            id: effect.id,
                                            name: effect.name,
                                            level: effect.system.level?.value || 0,
                                            timing: effect.system.timing || '-',
                                            skill: effect.system.skill || '-',
                                            target: effect.system.target || '-',
                                            range: effect.system.range || '-',
                                            encroach: effect.system.encroach?.value || 0,
                                            limit: effect.system.limit || '-'
                                        });
                                    }
                                }
                            }
                        }

                        if (currentItem.system.weapon && Array.isArray(currentItem.system.weapon)) {
                            for (const weaponId of currentItem.system.weapon) {
                                if (weaponId && weaponId !== '-') {
                                    const weaponOrVehicle = this.actor.items.get(weaponId);
                                    if (weaponOrVehicle && (weaponOrVehicle.type === 'weapon' || weaponOrVehicle.type === 'vehicle')) {
                                        // 비클인 경우 특별 처리
                                        if (weaponOrVehicle.type === 'vehicle') {
                                            itemData.weapons.push({
                                                id: weaponOrVehicle.id,
                                                name: weaponOrVehicle.name,
                                                type: game.i18n.localize('DX3rd.Melee'), // 종별: 백병
                                                skill: weaponOrVehicle.system.skill || '-',
                                                range: game.i18n.localize('DX3rd.Engage'), // 사정거리: 교전
                                                add: 0, // 수정치: 0
                                                attack: weaponOrVehicle.system.attack || 0,
                                                guard: 0
                                            });
                                        } else {
                                            // 일반 무기
                                            itemData.weapons.push({
                                                id: weaponOrVehicle.id,
                                                name: weaponOrVehicle.name,
                                                type: weaponOrVehicle.system.type || '-',
                                                skill: weaponOrVehicle.system.skill || '-',
                                                range: weaponOrVehicle.system.range || '-',
                                                add: weaponOrVehicle.system.add || 0,
                                                attack: weaponOrVehicle.system.attack || 0,
                                                guard: weaponOrVehicle.system.guard || 0
                                            });
                                        }
                                    }
                                }
                            }
                        }
                        break;
                    case 'book':
                        itemData.decipher = currentItem.system.decipher || 0;
                        itemData.exp = currentItem.system.exp || 0;

                        // 마도서에 포함된 술식 정보 수집
                        itemData.spells = [];

                        if (currentItem.system.spells && Array.isArray(currentItem.system.spells)) {
                            for (const spellId of currentItem.system.spells) {
                                if (spellId && spellId !== '-') {
                                    // 공용 아이템에서 조회
                                    const spell = game.items.get(spellId);

                                    if (spell && spell.type === 'spell') {
                                        // 액터가 같은 이름의 술식을 가지고 있는지 확인
                                        const actorSpell = this.actor.items.find(item =>
                                            item.type === 'spell' && item.name === spell.name
                                        );
                                        const isOwned = !!actorSpell;

                                        itemData.spells.push({
                                            id: spell.id,
                                            name: spell.name,
                                            spellType: spell.system.spelltype || '-',
                                            invoke: spell.system.invoke?.value || '-',
                                            evocation: spell.system.evocation?.value || '-',
                                            encroach: spell.system.encroach?.value || 0,
                                            isOwned: isOwned
                                        });
                                    }
                                }
                            }
                        }
                        break;
                    case 'record':
                        itemData.exp = currentItem.system.exp || 0;
                        break;
                    case 'rois':
                        itemData.roisType = currentItem.system.type || '-';
                        itemData.positive = currentItem.system.positive || {};
                        itemData.negative = currentItem.system.negative || {};
                        itemData.titus = currentItem.system.titus || false;
                        itemData.sublimation = currentItem.system.sublimation || false;
                        break;
                }

                // 채팅 메시지 생성
                const chatData = {
                    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
                    content: await this._createItemChatContent(itemData),
                    speaker: {
                        actor: this.actor.id,
                        alias: this.actor.name
                    }
                };

                // 채팅 메시지 전송
                const message = await ChatMessage.create(chatData);

                // 호출 시 타이밍의 매크로 실행
                if (window.DX3rdUniversalHandler && window.DX3rdUniversalHandler.executeMacros) {
                    await window.DX3rdUniversalHandler.executeMacros(currentItem, 'onInvoke');
                }

                // 콤보 아이템의 경우 포함된 이펙트의 onInvoke 매크로도 실행
                if (currentItem.type === 'combo') {
                    const rawEffects = (currentItem.system?.effectIds ?? currentItem.system?.effect?.data ?? currentItem.system?.effect) ?? [];
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
                    
                    console.log('DX3rd | Combo chat - Effect IDs:', effectIds);
                    
                    for (const effectId of effectIds) {
                        if (!effectId || effectId === '-') continue;
                        const effectItem = this.actor.items.get(effectId);
                        if (!effectItem) {
                            console.warn('DX3rd | Combo chat - Effect item not found:', effectId);
                            continue;
                        }
                        console.log('DX3rd | Combo chat - Executing onInvoke macro for effect:', effectItem.name);
                        
                        if (window.DX3rdUniversalHandler && window.DX3rdUniversalHandler.executeMacros) {
                            await window.DX3rdUniversalHandler.executeMacros(effectItem, 'onInvoke');
                        }
                    }
                }

                // 범위 하이라이트 설정 (combo, effect, psionic, weapon, vehicle)
                if (currentItem.type === 'combo' || currentItem.type === 'effect' ||
                    currentItem.type === 'psionic' || currentItem.type === 'weapon' ||
                    currentItem.type === 'vehicle') {

                    // 무기의 경우 공격 횟수 체크
                    let shouldShowHighlight = true;
                    if (currentItem.type === 'weapon') {
                        const attackUsedDisable = currentItem.system['attack-used']?.disable || 'notCheck';
                        if (attackUsedDisable !== 'notCheck') {
                            const attackUsedState = currentItem.system['attack-used']?.state || 0;
                            const attackUsedMax = currentItem.system['attack-used']?.max || 0;
                            const isAttackExhausted = attackUsedMax <= 0 || attackUsedState >= attackUsedMax;

                            if (isAttackExhausted) {
                                shouldShowHighlight = false;
                            }
                        }
                    }

                    if (shouldShowHighlight) {
                        if (window.DX3rdUniversalHandler && window.DX3rdUniversalHandler.setRangeHighlightForItem) {
                            await window.DX3rdUniversalHandler.setRangeHighlightForItem(this.actor, currentItem);
                        } else {
                            console.warn('DX3rd | UniversalHandler not loaded yet, skipping range highlight');
                        }
                    }
                }

                // 새로 생성된 메시지에 토글 기능 초기화
                setTimeout(() => {
                    const newMessage = $(`#chat-log .message[data-message-id="${message.id}"]`);
                    if (newMessage.length > 0) {
                        const collapsibleElements = newMessage.find('.collapsible-content');
                        collapsibleElements.each((i, element) => {
                            const $el = $(element);
                            $el.removeAttr('style').addClass('collapsed');
                        });
                    }
                }, 500);

                // 토글 기능을 위한 이벤트 리스너 추가
                setTimeout(() => {
                    this._addChatToggleListeners(message.id);
                }, 500);

                // 기존 채팅 메시지 초기화는 main.js에서 처리됨

            } catch (error) {
                console.error('DX3rd | Error sending item to chat:', error);
                ui.notifications.error('아이템 정보를 채팅으로 전송하는 중 오류가 발생했습니다.');
            }
        }

        // 아이템 이름에서 || 패턴을 루비 문자로 변환하는 헬퍼 함수
        _formatItemNameWithRuby(itemName) {
            if (!itemName || typeof itemName !== 'string') {
                return itemName;
            }

            // || 패턴이 있는지 확인
            const rubyPattern = /^(.+)\|\|(.+)$/;
            const match = itemName.match(rubyPattern);

            if (match) {
                const [, mainName, rubyText] = match;
                return `<ruby class="dx3rd-ruby"><rb>${mainName}</rb><rt>${rubyText}</rt></ruby>`;
            }

            return itemName;
        }

        async _createItemChatContent(itemData) {
            let content = `<div class="dx3rd-item-chat">`;
            content += `<div class="item-header">`;
            content += `<img src="${itemData.img}" width="32" height="32" style="vertical-align: middle; margin-right: 8px;">`;

            // 아이템 이름에서 || 패턴 처리
            const formattedItemName = this._formatItemNameWithRuby(itemData.name);

            const itemNameStyle = `cursor: pointer;`;

            // 로이스 타입 표시
            if (itemData.type === 'rois') {
                let roisTypeDisplay = '';
                if (itemData.roisType && itemData.roisType !== '-') {
                    switch (itemData.roisType) {
                        case 'D':
                            roisTypeDisplay = game.i18n.localize('DX3rd.Descripted');
                            break;
                        case 'S':
                            roisTypeDisplay = game.i18n.localize('DX3rd.Superier');
                            break;
                        case 'M':
                            roisTypeDisplay = game.i18n.localize('DX3rd.Memory');
                            break;
                        case 'E':
                            roisTypeDisplay = game.i18n.localize('DX3rd.Exhaust');
                            break;
                        default:
                            roisTypeDisplay = itemData.roisType;
                    }
                    content += `<strong class="item-name-toggle" style="${itemNameStyle}">[${roisTypeDisplay}]${formattedItemName}</strong>`;
                } else {
                    // 타입이 "-"이거나 없으면 "로이스"로 표시
                    const roisLabel = game.i18n.localize('DX3rd.Rois');
                    content += `<strong class="item-name-toggle" style="${itemNameStyle}">[${roisLabel}]${formattedItemName}</strong>`;
                }
            } else {
                content += `<strong class="item-name-toggle" style="${itemNameStyle}">${formattedItemName}</strong>`;
            }
            content += `</div>`;

            // 아이템 타입별 상세 정보
            switch (itemData.type) {
                case 'effect':
                    content += `<div class="item-details effect-details collapsible-content collapsed">`;
                    content += `<div class="detail-row">`;
                    content += `<span class="detail-key">레벨:</span> <span class="detail-value">${itemData.level}</span>`;
                    content += `</div>`;
                    content += `<div class="detail-row">`;
                    const effectTimingDisplay = itemData.timing === '-' ? '-' : game.i18n.localize(`DX3rd.${itemData.timing.charAt(0).toUpperCase() + itemData.timing.slice(1)}`);
                    content += `<span class="detail-key">타이밍:</span> <span class="detail-value">${effectTimingDisplay}</span>`;
                    content += `</div>`;
                    content += `<div class="detail-row">`;
                    const effectSkillDisplay = this._getSkillDisplay(itemData.skill);
                    content += `<span class="detail-key">기능:</span> <span class="detail-value">${effectSkillDisplay}</span>`;
                    content += `</div>`;
                    content += `<div class="detail-row">`;
                    content += `<span class="detail-key">난이도:</span> <span class="detail-value">자동성공</span>`;
                    content += `</div>`;
                    content += `<div class="detail-row two-columns">`;
                    content += `<div class="detail-cell"><span class="detail-key">대상:</span> <span class="detail-value">${itemData.target}</span></div>`;
                    content += `<div class="detail-cell"><span class="detail-key">사정거리:</span> <span class="detail-value">${itemData.range}</span></div>`;
                    content += `</div>`;
                    content += `<div class="detail-row two-columns">`;
                    content += `<div class="detail-cell"><span class="detail-key">침식치:</span> <span class="detail-value">${itemData.encroach}</span></div>`;
                    content += `<div class="detail-cell"><span class="detail-key">제한:</span> <span class="detail-value">${itemData.limit}</span></div>`;
                    content += `</div>`;
                    content += `</div>`;
                    break;
                case 'psionic':
                    content += `<div class="item-details effect-details collapsible-content collapsed">`;
                    content += `<div class="detail-row">`;
                    content += `<span class="detail-key">레벨:</span> <span class="detail-value">${itemData.level}</span>`;
                    content += `</div>`;
                    content += `<div class="detail-row">`;
                    const psionicTimingDisplay = itemData.timing === '-' ? '-' : game.i18n.localize(`DX3rd.${itemData.timing.charAt(0).toUpperCase() + itemData.timing.slice(1)}`);
                    content += `<span class="detail-key">타이밍:</span> <span class="detail-value">${psionicTimingDisplay}</span>`;
                    content += `</div>`;
                    content += `<div class="detail-row">`;
                    const psionicSkillDisplay = this._getSkillDisplay(itemData.skill);
                    content += `<span class="detail-key">기능:</span> <span class="detail-value">${psionicSkillDisplay}</span>`;
                    content += `</div>`;
                    content += `<div class="detail-row">`;
                    content += `<span class="detail-key">난이도:</span> <span class="detail-value">자동성공</span>`;
                    content += `</div>`;
                    content += `<div class="detail-row two-columns">`;
                    content += `<div class="detail-cell"><span class="detail-key">대상:</span> <span class="detail-value">${itemData.target}</span></div>`;
                    content += `<div class="detail-cell"><span class="detail-key">사정거리:</span> <span class="detail-value">${itemData.range}</span></div>`;
                    content += `</div>`;
                    content += `<div class="detail-row two-columns">`;
                    content += `<div class="detail-cell"><span class="detail-key">HP:</span> <span class="detail-value">${itemData.hp}</span></div>`;
                    content += `<div class="detail-cell"><span class="detail-key">제한:</span> <span class="detail-value">${itemData.limit}</span></div>`;
                    content += `</div>`;
                    content += `</div>`;
                    break;
                case 'spell':
                    // 발동치 표시 로직
                    let invokeDisplay = '';
                    if (itemData.invoke === '-' && itemData.evocation === '-') {
                        invokeDisplay = '자동성공';
                    } else if (itemData.invoke !== '-' && itemData.evocation === '-') {
                        invokeDisplay = itemData.invoke;
                    } else if (itemData.invoke !== '-' && itemData.evocation !== '-') {
                        invokeDisplay = `${itemData.invoke}/${itemData.evocation}`;
                    } else if (itemData.invoke === '-' && itemData.evocation !== '-') {
                        invokeDisplay = itemData.evocation;
                    }

                    content += `<div class="item-details effect-details collapsible-content collapsed">`;
                    content += `<div class="detail-row">`;
                    const spellTypeDisplay = itemData.spellType === '-' ? '-' : game.i18n.localize(`DX3rd.${itemData.spellType}`);
                    content += `<span class="detail-key">종별:</span> <span class="detail-value">${spellTypeDisplay}</span>`;
                    content += `</div>`;
                    content += `<div class="detail-row">`;
                    content += `<span class="detail-key">발동치:</span> <span class="detail-value">${invokeDisplay}</span>`;
                    content += `</div>`;
                    content += `<div class="detail-row">`;
                    content += `<span class="detail-key">침식치:</span> <span class="detail-value">${itemData.encroach}</span>`;
                    content += `</div>`;
                    content += `</div>`;
                    break;
                case 'weapon':
                    content += `<div class="item-details effect-details collapsible-content collapsed">`;
                    content += `<div class="detail-row two-columns">`;
                    const weaponTypeDisplay = itemData.weaponType === '-' ? '-' : game.i18n.localize(`DX3rd.${itemData.weaponType.charAt(0).toUpperCase() + itemData.weaponType.slice(1)}`);
                    const weaponSkillDisplay = this._getSkillDisplay(itemData.skill);
                    content += `<div class="detail-cell"><span class="detail-key">종별:</span> <span class="detail-value">${weaponTypeDisplay}</span></div>`;
                    content += `<div class="detail-cell"><span class="detail-key">기능:</span> <span class="detail-value">${weaponSkillDisplay}</span></div>`;
                    content += `</div>`;
                    content += `<div class="detail-row two-columns">`;
                    content += `<div class="detail-cell"><span class="detail-key">수정치:</span> <span class="detail-value">${itemData.add}</span></div>`;
                    content += `<div class="detail-cell"><span class="detail-key">공격력:</span> <span class="detail-value">${itemData.attack}</span></div>`;
                    content += `</div>`;
                    content += `<div class="detail-row two-columns">`;
                    content += `<div class="detail-cell"><span class="detail-key">가드:</span> <span class="detail-value">${itemData.guard}</span></div>`;
                    content += `<div class="detail-cell"><span class="detail-key">사정거리:</span> <span class="detail-value">${itemData.range}</span></div>`;
                    content += `</div>`;
                    content += `</div>`;
                    break;
                case 'protect':
                    content += `<div class="item-details effect-details collapsible-content collapsed">`;
                    content += `<div class="detail-row two-columns">`;
                    content += `<div class="detail-cell"><span class="detail-key">종별:</span> <span class="detail-value">${game.i18n.localize("DX3rd.Protect")}</span></div>`;
                    content += `<div class="detail-cell"><span class="detail-key">장갑:</span> <span class="detail-value">${itemData.armor}</span></div>`;
                    content += `</div>`;
                    content += `<div class="detail-row two-columns">`;
                    content += `<div class="detail-cell"><span class="detail-key">닷지:</span> <span class="detail-value">${itemData.dodge}</span></div>`;
                    content += `<div class="detail-cell"><span class="detail-key">행동치:</span> <span class="detail-value">${itemData.init}</span></div>`;
                    content += `</div>`;
                    content += `</div>`;
                    break;
                case 'vehicle':
                    content += `<div class="item-details effect-details collapsible-content collapsed">`;
                    content += `<div class="detail-row two-columns">`;
                    const vehicleSkillDisplay = this._getSkillDisplay(itemData.skill);
                    content += `<div class="detail-cell"><span class="detail-key">종별:</span> <span class="detail-value">${game.i18n.localize("DX3rd.Vehicle")}</span></div>`;
                    content += `<div class="detail-cell"><span class="detail-key">기능:</span> <span class="detail-value">${vehicleSkillDisplay}</span></div>`;
                    content += `</div>`;
                    content += `<div class="detail-row two-columns">`;
                    content += `<div class="detail-cell"><span class="detail-key">공격력:</span> <span class="detail-value">${itemData.attack}</span></div>`;
                    content += `<div class="detail-cell"><span class="detail-key">행동치:</span> <span class="detail-value">${itemData.init}</span></div>`;
                    content += `</div>`;
                    content += `<div class="detail-row two-columns">`;
                    content += `<div class="detail-cell"><span class="detail-key">장갑:</span> <span class="detail-value">${itemData.armor}</span></div>`;
                    content += `<div class="detail-cell"><span class="detail-key">이동:</span> <span class="detail-value">${itemData.move}</span></div>`;
                    content += `</div>`;
                    content += `</div>`;
                    break;
                case 'connection':
                    content += `<div class="item-details effect-details collapsible-content collapsed">`;
                    content += `<div class="detail-row two-columns">`;
                    content += `<div class="detail-cell"><span class="detail-key">종별:</span> <span class="detail-value">${game.i18n.localize("DX3rd.Connection")}</span></div>`;
                    const connectionSkillDisplay = this._getSkillDisplay(itemData.skill);
                    content += `<div class="detail-cell"><span class="detail-key">기능:</span> <span class="detail-value">${connectionSkillDisplay}</span></div>`;
                    content += `</div>`;
                    content += `</div>`;
                    break;
                case 'etc':
                    content += `<div class="item-details effect-details collapsible-content collapsed">`;
                    content += `<div class="detail-row">`;
                    const etcTypeDisplay = itemData.etcType === '-' ? '-' : game.i18n.localize(`DX3rd.${itemData.etcType.charAt(0).toUpperCase() + itemData.etcType.slice(1)}`);
                    content += `<span class="detail-key">종별:</span> <span class="detail-value">${etcTypeDisplay}</span>`;
                    content += `</div>`;
                    content += `</div>`;
                    break;
                case 'once':
                    content += `<div class="item-details effect-details collapsible-content collapsed">`;
                    content += `<div class="detail-row">`;
                    content += `<span class="detail-key">종별:</span> <span class="detail-value">${game.i18n.localize("DX3rd.Once")}</span>`;
                    content += `</div>`;
                    content += `</div>`;
                    break;
                case 'book':
                    content += `<div class="item-details effect-details collapsible-content collapsed">`;
                    content += `<div class="detail-row">`;
                    content += `<span class="detail-key">종별:</span> <span class="detail-value">${game.i18n.localize("DX3rd.Book")}</span>`;
                    content += `</div>`;
                    content += `<div class="detail-row">`;
                    content += `<span class="detail-key">해독 난이도:</span> <span class="detail-value">${itemData.decipher || 0}</span>`;
                    content += `</div>`;
                    content += `</div>`;
                    break;
                case 'combo':
                    content += `<div class="item-details effect-details collapsible-content collapsed">`;
                    content += `<div class="detail-row">`;
                    const comboTimingDisplay = itemData.timing === '-' ? '-' : game.i18n.localize(`DX3rd.${itemData.timing.charAt(0).toUpperCase() + itemData.timing.slice(1)}`);
                    content += `<span class="detail-key">타이밍:</span> <span class="detail-value">${comboTimingDisplay}</span>`;
                    content += `</div>`;
                    content += `<div class="detail-row two-columns">`;
                    const comboSkillDisplay = this._getSkillDisplay(itemData.skill);
                    content += `<div class="detail-cell"><span class="detail-key">기능:</span> <span class="detail-value">${comboSkillDisplay}</span></div>`;
                    content += `<div class="detail-cell"><span class="detail-key">난이도:</span> <span class="detail-value">${itemData.difficulty || '-'}</span></div>`;
                    content += `</div>`;
                    content += `<div class="detail-row two-columns">`;
                    content += `<div class="detail-cell"><span class="detail-key">대상:</span> <span class="detail-value">${itemData.target || '-'}</span></div>`;
                    content += `<div class="detail-cell"><span class="detail-key">사정거리:</span> <span class="detail-value">${itemData.range || '-'}</span></div>`;
                    content += `</div>`;
                    content += `<div class="detail-row two-columns">`;
                    content += `<div class="detail-cell"><span class="detail-key">다이스:</span> <span class="detail-value">${itemData.roll || '-'}</span></div>`;
                    content += `<div class="detail-cell"><span class="detail-key">크리티컬:</span> <span class="detail-value">-</span></div>`;
                    content += `</div>`;
                    content += `<div class="detail-row two-columns">`;
                    content += `<div class="detail-cell"><span class="detail-key">수정치:</span> <span class="detail-value">-</span></div>`;
                    content += `<div class="detail-cell"><span class="detail-key">공격력:</span> <span class="detail-value">-</span></div>`;
                    content += `</div>`;
                    content += `<div class="detail-row two-columns">`;
                    content += `<div class="detail-cell"><span class="detail-key">침식치:</span> <span class="detail-value">-</span></div>`;
                    content += `<div class="detail-cell"><span class="detail-key">제한:</span> <span class="detail-value">${itemData.limit || '-'}</span></div>`;
                    content += `</div>`;
                    content += `</div>`;

                    break;
                case 'record':
                    content += `<div class="item-details effect-details">`;
                    content += `<div class="detail-row">`;
                    content += `<span class="detail-key">경험점:</span> <span class="detail-value">${itemData.exp}</span>`;
                    content += `</div>`;
                    content += `</div>`;
                    break;
                case 'rois':
                    // 로이스 타입별 조건부 표시
                    if (itemData.roisType !== 'D') {
                        // 긍정/부정 감정 표시 (D 타입이 아닌 경우, 항상 표시)
                        content += `<div class="item-details rois-details">`;
                        content += `<div class="detail-row">`;

                        // 긍정 감정
                        if (itemData.positive?.state) {
                            content += `<span class="detail-key" style="color:#73aae6; font-weight: bold;">긍정:</span> <span class="detail-value" style="color: rgb(115, 170, 230); font-weight: bold;">${itemData.positive.feeling || ''}</span>`;
                        } else {
                            content += `<span class="detail-key">${game.i18n.localize("DX3rd.Positive")}:</span> <span class="detail-value">${itemData.positive?.feeling || '-'}</span>`;
                        }
                        content += `</div>`;

                        // 부정 감정
                        content += `<div class="detail-row">`;
                        if (itemData.negative?.state) {
                            content += `<span class="detail-key" style="color:#f16060; font-weight: bold;">부정:</span> <span class="detail-value" style="color: rgb(241, 96, 96); font-weight: bold;">${itemData.negative.feeling || ''}</span>`;
                        } else {
                            content += `<span class="detail-key">${game.i18n.localize("DX3rd.Negative")}:</span> <span class="detail-value">${itemData.negative?.feeling || '-'}</span>`;
                        }
                        content += `</div>`;
                        content += `</div>`;
                    }
                    break;
            }

            // 설명이 있으면 추가
            if (itemData.description && itemData.description.trim()) {
                content += `<div class="item-description collapsible-content collapsed">`;
                content += `<div class="description-content">${itemData.description}</div>`;
                content += `</div>`;
            }

            // 마도서에 포함된 술식 버튼 추가 (설명 아래, 토글 가능)
            if (itemData.type === 'book' && itemData.spells && itemData.spells.length > 0) {
                content += `<div class="item-actions collapsible-content collapsed" style="display: none;">`;
                content += `<button class="use-item-btn book-toggle-btn" data-book-section="spells">술식 목록</button>`;
                content += `</div>`;
            }

            // 콤보 아이템의 경우 이펙트/무기 버튼 추가 (토글 가능)
            if (itemData.type === 'combo') {
                if ((itemData.effects && itemData.effects.length > 0) || (itemData.weapons && itemData.weapons.length > 0)) {
                    content += `<div class="item-actions collapsible-content collapsed" style="display: none;">`;
                    if (itemData.effects && itemData.effects.length > 0) {
                        content += `<button class="use-item-btn combo-toggle-btn" data-combo-section="effects">이펙트</button>`;
                    }
                    if (itemData.weapons && itemData.weapons.length > 0) {
                        content += `<button class="use-item-btn combo-toggle-btn" data-combo-section="weapons">무기</button>`;
                    }
                    content += `</div>`;
                }
            }

            // 아이템 사용 버튼 추가
            if (itemData.type === 'effect' || itemData.type === 'psionic' || itemData.type === 'spell' || itemData.type === 'weapon' || itemData.type === 'protect' || itemData.type === 'vehicle' || itemData.type === 'connection' || itemData.type === 'etc' || itemData.type === 'once' || itemData.type === 'combo' || itemData.type === 'book') {
                content += `<div class="item-actions">`;

                // 무기와 비클은 공격 롤 버튼 추가
                if (itemData.type === 'weapon' || itemData.type === 'vehicle') {
                    let showAttackButton = true;

                    // 무기의 경우 attack-used 횟수 체크
                    if (itemData.type === 'weapon') {
                        const attackUsedDisable = itemData['attack-used']?.disable || 'notCheck';
                        const attackUsedState = itemData['attack-used']?.state || 0;
                        const attackUsedMax = itemData['attack-used']?.max || 0;

                        // notCheck가 아니고, state >= max이면 버튼 숨김 (max === 0도 0회 사용 가능)
                        if (attackUsedDisable !== 'notCheck' && attackUsedState >= attackUsedMax) {
                            showAttackButton = false;
                        }
                    }

                    if (showAttackButton) {
                        content += `<button class="attack-roll-btn" data-item-id="${itemData.id}">${game.i18n.localize('DX3rd.AttackRoll')}</button>`;
                    }
                }

                // 모든 아이템에 사용 버튼 추가 (단, used 횟수 체크)
                let showUseButton = true;

                // used가 있는 아이템 타입만 체크 (무기는 별도 처리)
                const itemsWithUsed = ['combo', 'effect', 'spell', 'psionic', 'weapon', 'protect', 'vehicle', 'connection', 'etc', 'once'];
                if (itemsWithUsed.includes(itemData.type) && itemData.type !== 'weapon') {
                    const usedDisable = itemData.used?.disable || 'notCheck';
                    const usedState = itemData.used?.state || 0;
                    const usedMax = itemData.used?.max || 0;
                    const usedLevel = itemData.used?.level || false;

                    // displayMax 계산 (used.level이 체크되어 있으면 레벨 추가)
                    let displayMax = Number(usedMax) || 0;
                    if (usedLevel && itemData.type === 'effect') {
                        // 이펙트 아이템의 경우 침식률에 따른 레벨 수정이 적용된 수치 사용
                        const baseLevel = Number(itemData.level) || 0;
                        // upgrade 여부는 itemData에서 직접 가져올 수 없으므로 currentItem에서 확인
                        const currentItem = this.actor.items.get(itemData.id);
                        const upgrade = currentItem?.system?.level?.upgrade || false;
                        let finalLevel = baseLevel;
                        
                        if (upgrade && this.actor.system?.attributes?.encroachment?.level) {
                            const encLevel = Number(this.actor.system.attributes.encroachment.level) || 0;
                            finalLevel += encLevel;
                        }
                        
                        displayMax += finalLevel;
                    } else if (usedLevel && itemData.type === 'psionic') {
                        // 사이오닉은 침식률 보정 없이 init만 더함
                        const baseLevel = Number(itemData.level) || 0;
                        displayMax += baseLevel;
                    }

                    // notCheck가 아니고, state >= displayMax이면 버튼 숨김 (displayMax === 0도 0회 사용 가능)
                    if (usedDisable !== 'notCheck' && usedState >= displayMax) {
                        showUseButton = false;
                    }
                }

                // 무기는 used만 체크 (attack-used는 공격 버튼에서 체크)
                if (itemData.type === 'weapon') {
                    const usedDisable = itemData.used?.disable || 'notCheck';
                    const usedState = itemData.used?.state || 0;
                    const usedMax = itemData.used?.max || 0;

                    // notCheck가 아니고, state >= max이면 버튼 숨김 (max === 0도 0회 사용 가능)
                    if (usedDisable !== 'notCheck' && usedState >= usedMax) {
                        showUseButton = false;
                    }
                }

                if (showUseButton) {
                    let useText;
                    if (itemData.type === 'book') {
                        // 북은 "마도서 해독"으로 표기 (Book + Decipher 로컬라이즈 조합)
                        useText = `${game.i18n.localize('DX3rd.Book')} ${game.i18n.localize('DX3rd.Decipher')}`;
                    } else {
                        useText = game.i18n.localize(`DX3rd.${itemData.type.charAt(0).toUpperCase() + itemData.type.slice(1)}`) + " " + game.i18n.localize("DX3rd.Use");
                    }
                    content += `<button class="use-item-btn" data-item-id="${itemData.id}" data-get-target="${itemData.getTarget || false}">${useText}</button>`;
                }

                content += `</div>`;
            } else if (itemData.type === 'rois') {
                // 로이스 버튼 (D, M, E 타입 제외, 승화 이미 사용된 경우 제외)
                if (itemData.roisType !== 'D' && itemData.roisType !== 'M' && itemData.roisType !== 'E' && !itemData.sublimation) {
                    let buttonText = '';
                    let roisAction = '';
                    if (!itemData.titus) {
                        buttonText = game.i18n.localize("DX3rd.Titus");
                        roisAction = 'titus';
                    } else {
                        buttonText = game.i18n.localize("DX3rd.Sublimation");
                        roisAction = 'sublimation';
                    }

                    content += `<div class="item-actions">`;
                    content += `<button class="use-item-btn" data-item-id="${itemData.id}" data-rois-action="${roisAction}">${buttonText}</button>`;
                    content += `</div>`;
                }
            }

            content += `</div>`;
            return content;
        }

        _addChatToggleListeners(messageId) {
            // DOM이 완전히 렌더링될 때까지 대기
            setTimeout(() => {
                // Foundry VTT의 채팅 메시지 구조에 맞게 수정
                const messageElement = $(`#chat-log .message[data-message-id="${messageId}"] .message-content`);
                if (!messageElement.length) {
                    return;
                }

                const toggleElement = messageElement.find('.item-name-toggle');
                if (!toggleElement.length) {
                    return;
                }

                // 이벤트 위임을 사용하여 더 안정적으로 처리
                toggleElement.on('click.dx3rd-toggle', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    const collapsibleElements = messageElement.find('.collapsible-content');

                    // 애니메이션 중복 방지
                    if (collapsibleElements.is(':animated')) {
                        return;
                    }

                    if (collapsibleElements.hasClass('collapsed')) {
                        collapsibleElements.removeClass('collapsed').slideDown(250, 'swing');
                    } else {
                        collapsibleElements.slideUp(250, 'swing', () => {
                            collapsibleElements.addClass('collapsed');
                        });
                    }
                });
            }, 1000); // 대기 시간을 더 늘림
        }

        _addGlobalChatToggleListeners() {
            // 전역 이벤트 위임으로 채팅 로그의 모든 토글 요소 처리
            $(document).off('click.dx3rd-global-toggle').on('click.dx3rd-global-toggle', '.item-name-toggle', (event) => {
                event.preventDefault();
                event.stopPropagation();

                // Foundry VTT 채팅 메시지 구조 확인
                const messageElement = $(event.currentTarget).closest('.message');

                // 다양한 선택자 시도
                let collapsibleElements = messageElement.find('.collapsible-content');
                if (collapsibleElements.length === 0) {
                    // message-content 내부에서 찾기
                    const messageContent = messageElement.find('.message-content');
                    collapsibleElements = messageContent.find('.collapsible-content');
                }
                if (collapsibleElements.length === 0) {
                    // 직접 message 내부에서 찾기
                    collapsibleElements = messageElement.find('.collapsible-content');
                }

                if (collapsibleElements.length === 0) {
                    return;
                }

                // 애니메이션 중복 방지
                if (collapsibleElements.is(':animated')) {
                    return;
                }

                if (collapsibleElements.hasClass('collapsed')) {
                    collapsibleElements.removeClass('collapsed').slideDown(250, 'swing');
                } else {
                    collapsibleElements.slideUp(250, 'swing', () => {
                        collapsibleElements.addClass('collapsed');
                    });
                }
            });
        }

        _initializeExistingChatMessages() {
            // 기존 채팅 메시지에서 토글 요소들을 찾아서 초기화
            const existingMessages = $('#chat-log .message');

            existingMessages.each((index, messageElement) => {
                const $message = $(messageElement);
                const collapsibleElements = $message.find('.collapsible-content');

                if (collapsibleElements.length > 0) {
                    // 인라인 스타일 제거하고 CSS 클래스로 초기화
                    collapsibleElements.each((i, element) => {
                        const $el = $(element);
                        $el.removeAttr('style').addClass('collapsed');
                    });
                }
            });
        }

        async _onUsedStateChange(event) {
            event.preventDefault();

            const input = $(event.currentTarget);
            const li = input.closest('.item');
            const itemId = li.data('item-id');

            if (!itemId) {
                return;
            }

            const item = this.actor.items.get(itemId);
            if (!item) {
                return;
            }

            const newState = parseInt(input.val()) || 0;

            // disabled 상태가 아닌 경우에만 업데이트
            if (!input.prop('disabled')) {
                try {
                    await item.update({
                        'system.used.state': newState
                    });
                } catch (err) {
                    console.error("DX3rd | ActorSheet _onUsedStateChange - update failed", err);
                    ui.notifications.error(`사용횟수 업데이트 실패: ${err.message}`);
                }
            }
        }

        async _onActiveChange(event) {
            event.preventDefault();

            const checkbox = $(event.currentTarget);
            const li = checkbox.closest('.item');
            const itemId = li.data('item-id');

            if (!itemId) {
                return;
            }

            const item = this.actor.items.get(itemId);
            if (!item) {
                return;
            }

            const newState = checkbox.prop('checked');

            try {
                await item.update({
                    'system.active.state': newState
                });
            } catch (err) {
                console.error("DX3rd | ActorSheet _onActiveChange - update failed", err);
                ui.notifications.error(`활성화 상태 업데이트 실패: ${err.message}`);
            }
        }

        async _onEquipmentChange(event) {
            event.preventDefault();

            const checkbox = $(event.currentTarget);
            const li = checkbox.closest('.item');
            const itemId = li.data('item-id');

            if (!itemId) {
                return;
            }

            const item = this.actor.items.get(itemId);
            if (!item) {
                return;
            }

            const newState = checkbox.prop('checked');

            try {
                // 비클 아이템의 경우 하나만 장착 가능
                if (item.type === 'vehicle' && newState === true) {
                    // 현재 장착된 다른 비클들을 모두 해제
                    const otherVehicles = this.actor.items.filter(i =>
                        i.type === 'vehicle' &&
                        i.id !== itemId &&
                        i.system?.equipment === true
                    );

                    for (const otherVehicle of otherVehicles) {
                        await otherVehicle.update({
                            'system.equipment': false
                        });
                    }
                }

                await item.update({
                    'system.equipment': newState
                });
            } catch (err) {
                console.error("DX3rd | ActorSheet _onEquipmentChange - update failed", err);
                ui.notifications.error(`장비 상태 업데이트 실패: ${err.message}`);
            }
        }

        async _onItemCreate(event) {
            event.preventDefault();
            
            // OWNER 권한 체크
            if (!this._hasOwnerPermission()) {
                ui.notifications.warn(game.i18n.localize("DX3rd.NoPermission"));
                return;
            }
            
            const button = $(event.currentTarget);
            const type = button.data('type') || "item";
            const effectType = button.data('effectType');
            const roisType = button.data('roisType');

            // StageCRC 비활성화 시 스펠/사이오닉/마도서 아이템 생성 차단
            if (!game.settings.get("double-cross-3rd", "stageCRC") && (type === "spell" || type === "psionic" || type === "book")) {
                ui.notifications.warn("CRC 스테이지 비활성화 시 스펠, 사이오닉, 마도서 아이템을 생성할 수 없습니다.");
                return;
            }

            // 워크스 아이템 제한 (1개)
            if (type === "works") {
                const existingWorks = this.actor.items.filter(item => item.type === 'works');
                if (existingWorks.length >= 1) {
                    ui.notifications.info("Each character can only have one Works item.");
                    return;
                }
            }

            // 신드롬 아이템 제한 (3개)
            if (type === "syndrome") {
                const existingSyndromes = this.actor.items.filter(item => item.type === 'syndrome');
                if (existingSyndromes.length >= 3) {
                    ui.notifications.info("Each character can only have up to three Syndrome items.");
                    return;
                }
            }

            let typeLabel = game.i18n.localize(`DX3rd.${type.charAt(0).toUpperCase() + type.slice(1)}`);
            let itemData = {
                name: `New ${typeLabel !== `DX3rd.${type.charAt(0).toUpperCase() + type.slice(1)}` ? typeLabel : type}`,
                type: type,
                system: {}
            };
            if (effectType) itemData.system.type = effectType;
            if (roisType) itemData.system.type = roisType;
            // effect 아이템 생성 시 레벨 기본값 추가
            if (type === 'effect') {
                itemData.system.level = { init: 1, max: 1 };
            }

            await this.actor.createEmbeddedDocuments("Item", [itemData]);
        }

        async _onToggleSyndrome(event) {
            const input = event.currentTarget;
            // name 예: system.attributes.syndrome.<itemId>
            const parts = String(input.name).split('.');
            const itemId = parts[parts.length - 1];
            if (!itemId) return;

            // mousedown에서는 현재 상태의 반대값이 될 예정
            const willBeChecked = !input.checked;
            const current = Array.isArray(this.actor.system.attributes?.syndrome)
                ? [...this.actor.system.attributes.syndrome]
                : [];

            // 신드롬 아이템 개수 확인
            const syndromeItems = this.actor.items.filter(item => item.type === 'syndrome');
            const totalSyndromeCount = syndromeItems.length;

            const idx = current.indexOf(itemId);

            // 체크하려는 경우 (현재 체크되지 않은 상태에서 체크하려는 경우)
            if (willBeChecked && idx === -1) {
                // 트라이브리드이고 이미 2개가 체크된 경우 제한
                if (totalSyndromeCount === 3 && current.length >= 2) {
                    ui.notifications.info("You cannot check Optional Syndrome.");

                    // 기본 이벤트 동작 완전 차단
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();

                    // 체크박스 상태를 강제로 되돌림
                    input.checked = false;
                    input.setAttribute('checked', false);
                    input.removeAttribute('checked');

                    // 체크박스를 일시적으로 비활성화
                    input.disabled = true;
                    setTimeout(() => {
                        input.disabled = false;
                    }, 100);

                    // 이벤트 전파 완전 차단
                    return false;
                }
                current.push(itemId);
            }

            // 체크 해제하는 경우 (현재 체크된 상태에서 해제하려는 경우)
            if (!willBeChecked && idx !== -1) {
                current.splice(idx, 1);
            }

            // 업데이트가 필요한 경우에만 실행
            const needsUpdate = (willBeChecked && idx === -1) || (!willBeChecked && idx !== -1);

            if (needsUpdate) {
                try {
                    await this.actor.update({ 'system.attributes.syndrome': current });
                    this.render(false);
                } catch (e) {
                    console.error('DX3rd | ActorSheet syndrome toggle failed', e);
                }
            }
        }

        async _onSyndromeClick(event) {
            const input = event.currentTarget;
            const parts = String(input.name).split('.');
            const itemId = parts[parts.length - 1];
            if (!itemId) return;

            const current = Array.isArray(this.actor.system.attributes?.syndrome)
                ? [...this.actor.system.attributes.syndrome]
                : [];

            // 신드롬 아이템 개수 확인
            const syndromeItems = this.actor.items.filter(item => item.type === 'syndrome');
            const totalSyndromeCount = syndromeItems.length;

            const idx = current.indexOf(itemId);
            const checked = input.checked;

            // 3번째 체크 시도 차단
            if (checked && idx === -1 && totalSyndromeCount === 3 && current.length >= 2) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();

                input.checked = false;
                input.setAttribute('checked', false);
                input.removeAttribute('checked');

                ui.notifications.info("You cannot check Optional Syndrome.");
                return false;
            }

            // 정상적인 체크/해제 처리
            if (checked && idx === -1) {
                current.push(itemId);
            } else if (!checked && idx !== -1) {
                current.splice(idx, 1);
            }

            try {
                await this.actor.update({ 'system.attributes.syndrome': current });
                this.render(false);
            } catch (e) {
                console.error('DX3rd | ActorSheet syndrome click failed', e);
            }
        }

        async _onDragOver(event) {
            event.preventDefault();
        }

        _onDragStart(event) {
            const li = event.currentTarget;
            const itemId = li.dataset.itemId;

            if (!itemId) return;

            const item = this.actor.items.get(itemId);
            if (!item) return;

            // 드래그 데이터 설정
            const dragData = {
                type: 'Item',
                uuid: item.uuid,
                actorId: this.actor.id,
                itemId: itemId,
                itemType: item.type,
                sortValue: item.sort || 0
            };

            // jQuery 이벤트는 originalEvent를 통해 네이티브 이벤트에 접근
            const dataTransfer = event.originalEvent ? event.originalEvent.dataTransfer : event.dataTransfer;
            dataTransfer.setData('text/plain', JSON.stringify(dragData));
        }

        async _onDrop(event) {
            event.preventDefault();
            event.stopPropagation();

            // jQuery 이벤트는 originalEvent를 통해 네이티브 이벤트에 접근
            const dataTransfer = event.originalEvent ? event.originalEvent.dataTransfer : event.dataTransfer;

            try {
                // 드롭된 데이터 파싱
                const dataText = dataTransfer.getData('text/plain');
                if (!dataText) {
                    return;
                }

                const data = JSON.parse(dataText);

                // 아이템 드롭인지 확인
                if (data.type === 'Item') {
                    // 같은 액터의 아이템을 드래그하여 순서 변경하는 경우
                    if (data.actorId === this.actor.id) {
                        const target = event.target.closest('.item');

                        if (target) {
                            const targetItemId = target.dataset.itemId;
                            const sourceItemId = data.itemId;

                            // 자기 자신에게 드롭한 경우 무시
                            if (targetItemId === sourceItemId) return;

                            const sourceItem = this.actor.items.get(sourceItemId);
                            const targetItem = this.actor.items.get(targetItemId);

                            // 같은 타입의 아이템인지 확인
                            if (sourceItem && targetItem && sourceItem.type === targetItem.type) {
                                // 타겟 아이템의 sort 값을 사용하여 소스 아이템 업데이트
                                const siblings = this.actor.items.filter(i => i.type === sourceItem.type && i.id !== sourceItem.id);
                                const sortUpdates = SortingHelpers.performIntegerSort(sourceItem, {
                                    target: targetItem,
                                    siblings: siblings
                                });

                                const updateData = sortUpdates.map(u => {
                                    return { _id: u.target.id, sort: u.update.sort };
                                });

                                await this.actor.updateEmbeddedDocuments("Item", updateData);
                                return;
                            }
                        }

                        // 순서 변경이 아닌 경우, 기본 드롭 처리 (외부 아이템 추가)
                        return;
                    }

                    // 외부에서 새 아이템을 드롭하는 경우
                    const item = await fromUuid(data.uuid);

                    if (!item) {
                        return;
                    }

                    if (item && (item.type === 'spell' || item.type === 'psionic' || item.type === 'book')) {
                        // StageCRC 비활성화 시 스펠/사이오닉/마도서 아이템 드롭 차단
                        if (!game.settings.get("double-cross-3rd", "stageCRC")) {
                            ui.notifications.warn("CRC 스테이지 비활성화 시 스펠, 사이오닉, 마도서 아이템을 추가할 수 없습니다.");
                            return;
                        }
                    }

                    // 워크스 아이템 제한 (1개)
                    if (item.type === 'works') {
                        const existingWorks = this.actor.items.filter(actorItem => actorItem.type === 'works');
                        if (existingWorks.length >= 1) {
                            ui.notifications.info("Each character can only have one Works item.");
                            return;
                        }
                    }

                    // 신드롬 아이템 제한 (3개)
                    if (item.type === 'syndrome') {
                        const existingSyndromes = this.actor.items.filter(actorItem => actorItem.type === 'syndrome');
                        if (existingSyndromes.length >= 3) {
                            ui.notifications.info("Each character can only have up to three Syndrome items.");
                            return;
                        }
                    }

                    // 정상적인 아이템 추가 처리
                    await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
                    return; // 명시적 return으로 부모 클래스 호출 방지
                }
            } catch (error) {
                console.error('DX3rd | Item drop failed:', error);
            }
        }


        _prepareCharacterItems(actorData, items) {
            // items가 배열이 아니면 배열로 변환
            if (!Array.isArray(items)) {
                try {
                    items = Array.from(items);
                } catch (e) {
                    console.warn('Failed to convert items to array in actor sheet:', e);
                    items = [];
                }
            }

            actorData.workList = [];
            actorData.syndromeList = [];
            actorData.comboList = [];
            actorData.effectList = [];
            actorData.easyEffectList = [];
            actorData.extraEffectList = [];
            actorData.spellList = [];
            actorData.psionicsList = [];
            actorData.roisList = [];
            actorData.memoryList = [];
            actorData.weaponList = [];
            actorData.protectList = [];
            actorData.vehicleList = [];
            actorData.connectionList = [];
            actorData.bookList = [];
            actorData.etcList = [];
            actorData.onceList = [];
            actorData.recordList = [];

            for (let i of items) {
                // 각 아이템의 system 속성 안전성 보장 (기존 값 보존)
                if (!i.system) i.system = {};

                // system.used가 없는 경우에만 기본값 생성
                if (!i.system.used) {
                    i.system.used = { state: 0, max: 0, level: false, disable: "notCheck" };
                } else {
                    // system.used가 있으면 개별 속성만 기본값으로 보충
                    if (i.system.used.state == null) i.system.used.state = 0;
                    if (i.system.used.max == null) i.system.used.max = 0;
                    if (i.system.used.level == null) i.system.used.level = false;
                    if (i.system.used.disable == null || i.system.used.disable === undefined) i.system.used.disable = "notCheck";
                }

                if (!i.system.active) i.system.active = { state: false };
                if (!i.system.encroach) i.system.encroach = { value: 0 };
                if (!i.system.level) i.system.level = { value: 0 };

                // 사용횟수 표시 로직
                if (i.system.used.disable === "notCheck") {
                    // 횟수 리셋을 체크 안한다고 설정된 경우 0/0 로 표기
                    i.system.used.displayMax = 0;
                    // notCheck일 때는 level 수정 불가 (기존 값이 false가 아닌 경우에만 강제 설정)
                    if (i.system.used.level !== false) {
                        i.system.used.level = false;
                    }
                } else {
                    // 그 외에는 기본 max 값 사용
                    let maxValue = i.system.used.max || 0;

                    // 일회용 아이템의 경우 quantity와 연동
                    if (i.type === 'once') {
                        maxValue = i.system.quantity || 1;
                    }

                    // used.level에 체크되어 있다면 max + 아이템의 현재 최종 레벨
                    if (i.system.used.level === true && i.type === 'effect') {
                        // 이펙트 아이템의 경우 침식률에 따른 레벨 수정이 적용된 수치 사용
                        const baseLevel = i.system.level?.init || 0;
                        const upgrade = i.system.level?.upgrade || false;
                        let finalLevel = baseLevel;

                        if (upgrade && this.actor.system?.attributes?.encroachment?.level) {
                            const encLevel = Number(this.actor.system.attributes.encroachment.level) || 0;
                            finalLevel += encLevel;
                        }

                        maxValue += finalLevel;
                    } else if (i.system.used.level === true && i.type === 'psionic') {
                        // 사이오닉은 침식률 보정 없이 init만 더함
                        const baseLevel = i.system.level?.init || 0;
                        maxValue += baseLevel;
                    }

                    i.system.used.displayMax = maxValue;
                }

                if (i.type === 'works')
                    actorData.workList.push(i);
                else if (i.type === 'syndrome')
                    actorData.syndromeList.push(i);
                else if (i.type === 'combo')
                    actorData.comboList.push(i);
                else if (i.type === 'effect') {
                    if (i.system?.type === 'normal')
                        actorData.effectList.push(i);
                    else if (i.system?.type === 'easy')
                        actorData.easyEffectList.push(i);
                    else
                        actorData.extraEffectList.push(i);
                } else if (i.type === 'spell') {
                    actorData.spellList.push(i);
                } else if (i.type === 'psionics' || i.type === 'psionic') {
                    actorData.psionicsList.push(i);
                } else if (i.type === 'rois') {
                    if (i.system?.type === 'M')
                        actorData.memoryList.push(i);
                    else
                        actorData.roisList.push(i);
                } else if (i.type === 'weapon')
                    actorData.weaponList.push(i);
                else if (i.type === 'protect')
                    actorData.protectList.push(i);
                else if (i.type === 'vehicle')
                    actorData.vehicleList.push(i);
                else if (i.type === 'connection')
                    actorData.connectionList.push(i);
                else if (i.type === 'book')
                    actorData.bookList.push(i);
                else if (i.type === 'etc')
                    actorData.etcList.push(i);
                else if (i.type === 'once')
                    actorData.onceList.push(i);
                else if (i.type === 'record')
                    actorData.recordList.push(i);
            }

            // 모든 리스트를 sort 값으로 정렬
            const sortBySort = (a, b) => (a.sort || 0) - (b.sort || 0);
            actorData.workList.sort(sortBySort);
            actorData.syndromeList.sort(sortBySort);
            actorData.comboList.sort(sortBySort);
            actorData.effectList.sort(sortBySort);
            actorData.easyEffectList.sort(sortBySort);
            actorData.extraEffectList.sort(sortBySort);
            actorData.spellList.sort(sortBySort);
            actorData.psionicsList.sort(sortBySort);
            actorData.roisList.sort(sortBySort);
            actorData.memoryList.sort(sortBySort);
            actorData.weaponList.sort(sortBySort);
            actorData.protectList.sort(sortBySort);
            actorData.vehicleList.sort(sortBySort);
            actorData.connectionList.sort(sortBySort);
            actorData.bookList.sort(sortBySort);
            actorData.etcList.sort(sortBySort);
            actorData.onceList.sort(sortBySort);
            actorData.recordList.sort(sortBySort);

            actorData.syndromeType = "-";
            if (actorData.syndromeList.length === 1)
                actorData.syndromeType = game.i18n.localize("DX3rd.PureBreed");
            else if (actorData.syndromeList.length === 2)
                actorData.syndromeType = game.i18n.localize("DX3rd.CrossBreed");
            else if (actorData.syndromeList.length === 3)
                actorData.syndromeType = game.i18n.localize("DX3rd.TriBreed");

            actorData.applied = Object.values(this.actor.system.attributes.applied ?? {}).map((appliedEffect, index) => {
                // 새로운 applied 효과 구조에 맞게 데이터 생성
                return {
                    _id: `applied_${index}`,
                    name: appliedEffect.name || '알 수 없는 효과',
                    img: appliedEffect.img || 'icons/svg/aura.svg', // 저장된 아이콘 사용
                    system: {
                        description: this.generateAppliedEffectDescription(appliedEffect)
                    },
                    disable: appliedEffect.disable || '-',
                    appliedEffect: appliedEffect // 원본 데이터 보관
                };
            });
        }

        generateAppliedEffectDescription(appliedEffect) {
            let description = '';

            // 비활성화 타이밍 로컬라이징
            if (appliedEffect.disable && appliedEffect.disable !== '-') {
                const localizedDisable = game.i18n.localize(`DX3rd.Disable${appliedEffect.disable.charAt(0).toUpperCase() + appliedEffect.disable.slice(1)}`);
                description += `<p><strong>비활성화 타이밍:</strong> ${localizedDisable}</p>`;
            }

            // 새로운 구조 (key, label, value가 직접 있는 경우) 처리
            if (appliedEffect.key && appliedEffect.label && appliedEffect.value !== undefined) {
                description += `<p><strong>적용된 어트리뷰트:</strong></p><ul>`;
                const localizedName = window.DX3rdAttributeLocalizer?.localize(appliedEffect.label) || appliedEffect.label;
                description += `<li>${localizedName}: ${appliedEffect.value >= 0 ? '+' : ''}${appliedEffect.value}</li>`;
                description += `</ul>`;
            }
            // 기존 구조 (attributes 객체가 있는 경우) 처리
            else if (appliedEffect.attributes && Object.keys(appliedEffect.attributes).length > 0) {
                description += `<p><strong>적용된 어트리뷰트:</strong></p><ul>`;
                for (const [attrName, attrValue] of Object.entries(appliedEffect.attributes)) {
                    // 어트리뷰트 이름 로컬라이징 (공통 헬퍼 사용)
                    const localizedName = window.DX3rdAttributeLocalizer?.localize(attrName) || attrName;

                    // 새로운 객체 형식과 기존 값 형식 모두 지원
                    const actualValue = (typeof attrValue === 'object' && attrValue && 'value' in attrValue)
                        ? attrValue.value
                        : attrValue;

                    description += `<li>${localizedName}: ${actualValue >= 0 ? '+' : ''}${actualValue}</li>`;
                }
                description += `</ul>`;
            }

            return description;
        }

        async _onRemoveApplied(event) {
            event.preventDefault();
            const button = $(event.currentTarget);
            const itemElement = button.closest('.item');
            const itemId = itemElement.data('item-id');

            if (!itemId) {
                return;
            }

            // applied 효과 제거 확인
            const confirmed = await Dialog.confirm({
                title: 'Applied 효과 제거',
                content: '이 효과를 제거하시겠습니까?',
                yes: () => true,
                no: () => false,
                defaultYes: false
            });

            if (!confirmed) return;

            try {
                // applied에서 해당 효과 제거
                const applied = this.actor.system.attributes.applied || {};
                const updates = {};

                // 해당 키 찾기 - itemId가 applied_${index} 형태이므로 인덱스로 찾기
                if (itemId.startsWith('applied_')) {
                    const index = parseInt(itemId.replace('applied_', ''));
                    const appliedKeys = Object.keys(applied);
                    const appliedValues = Object.values(applied);

                    if (index >= 0 && index < appliedKeys.length) {
                        const targetKey = appliedKeys[index];
                        const appliedEffect = appliedValues[index];

                        // applied 효과 제거만 수행 (actor.js에서 자동으로 계산 반영)

                        // applied에서 효과 제거
                        updates[`system.attributes.applied.-=${targetKey}`] = null;
                    }
                }

                if (Object.keys(updates).length > 0) {
                    await this.actor.update(updates);
                    ui.notifications.info('Applied 효과가 제거되었습니다.');
                } else {
                    ui.notifications.warn('제거할 효과를 찾을 수 없습니다.');
                }

            } catch (error) {
                console.error('DX3rd | Error removing applied effect:', error);
                ui.notifications.error('효과 제거 중 오류가 발생했습니다.');
            }
        }

        async _onShowApplied(event) {
            event.preventDefault();
            const button = $(event.currentTarget);
            const itemElement = button.closest('.item');
            const itemId = itemElement.data('item-id');

            if (!itemId) {
                return;
            }

            // applied 효과 데이터 찾기
            const applied = this.actor.system.attributes.applied || {};
            const appliedValues = Object.values(applied);

            if (itemId.startsWith('applied_')) {
                const index = parseInt(itemId.replace('applied_', ''));
                if (index >= 0 && index < appliedValues.length) {
                    const appliedEffect = appliedValues[index];

                    // 데이터 검증 및 기본값 설정
                    const effectName = appliedEffect.name || '알 수 없는 효과';
                    const effectSource = appliedEffect.source || '알 수 없는 시전자';
                    const effectTimestamp = appliedEffect.timestamp || Date.now();
                    const effectDisable = appliedEffect.disable || '-';

                    // 다이얼로그 생성
                    let tableContent = '';

                    // 새로운 구조 (key, label, value가 직접 있는 경우) 처리
                    if (appliedEffect.key && appliedEffect.label && appliedEffect.value !== undefined) {
                        const localizedKey = window.DX3rdAttributeLocalizer?.localize(appliedEffect.key) || appliedEffect.key;
                        const localizedLabel = window.DX3rdAttributeLocalizer?.localize(appliedEffect.label) || appliedEffect.label;

                        tableContent = `
                            <table class="applied-effect-table">
                                <thead>
                                    <tr>
                                        <th>Key</th>
                                        <th>Label</th>
                                        <th>값</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>${localizedKey}</td>
                                        <td>${localizedLabel}</td>
                                        <td>${appliedEffect.value >= 0 ? '+' : ''}${appliedEffect.value}</td>
                                    </tr>
                                </tbody>
                            </table>
                        `;
                    }
                    // 기존 구조 (attributes 객체가 있는 경우) 처리
                    else if (appliedEffect.attributes && Object.keys(appliedEffect.attributes).length > 0) {
                        tableContent = `
                            <table class="applied-effect-table">
                                <thead>
                                    <tr>
                                        <th>Key</th>
                                        <th>Label</th>
                                        <th>값</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${Object.entries(appliedEffect.attributes).map(([attrName, attrValue]) => {
                            const key = (typeof attrValue === 'object' && attrValue) ? (attrValue.key ?? (attrName.split(':')[0] || attrName)) : (attrName.split(':')[0] || attrName);
                            const labelRaw = (typeof attrValue === 'object' && attrValue) ? (attrValue.label ?? (attrName.split(':')[1] || attrName)) : (attrName.split(':')[1] || attrName);
                            const value = (typeof attrValue === 'object' && attrValue && 'value' in attrValue) ? attrValue.value : attrValue;

                            const localizedKey = window.DX3rdAttributeLocalizer?.localize(key) || key;
                            const localizedLabel = window.DX3rdAttributeLocalizer?.localize(labelRaw) || labelRaw;

                            return `<tr>
                                            <td>${localizedKey}</td>
                                            <td>${localizedLabel}</td>
                                            <td>${value >= 0 ? '+' : ''}${value}</td>
                                        </tr>`;
                        }).join('')}
                                </tbody>
                            </table>
                        `;
                    }

                    const content = `
                        <div class="applied-effect-dialog">
                            ${tableContent || '<p>적용된 어트리뷰트가 없습니다.</p>'}
                        </div>
                    `;

                    new Dialog({
                        title: `${effectName} - 상세 정보`,
                        content: content,
                        buttons: {
                            close: {
                                icon: '<i class="fas fa-times"></i>',
                                label: '닫기',
                                callback: () => { }
                            }
                        },
                        default: 'close'
                    }).render(true);
                }
            }
        }

        async _onAbilityNameClick(event) {
            event.preventDefault();
            event.stopPropagation();
            const abilityId = $(event.currentTarget).closest('[data-ability-id]').data('ability-id');
            if (!abilityId) return;

            // 권한 체크
            if (!this.actor.isOwner && !game.user.isGM) {
                ui.notifications.warn('이 액터에 대한 권한이 없습니다.');
                return;
            }

            // UniversalHandler로 위임
            if (window.DX3rdUniversalHandler) {
                window.DX3rdUniversalHandler.showStatRollConfirmDialog(
                    this.actor,
                    'ability',
                    abilityId,
                    this._openComboBuilder.bind(this)
                );
            }
        }

        async _onSkillNameClick(event) {
            event.preventDefault();
            event.stopPropagation();
            const skillId = $(event.currentTarget).closest('[data-skill-id]').data('skill-id');
            if (!skillId) return;

            // 권한 체크
            if (!this.actor.isOwner && !game.user.isGM) {
                ui.notifications.warn('이 액터에 대한 권한이 없습니다.');
                return;
            }

            // UniversalHandler로 위임
            if (window.DX3rdUniversalHandler) {
                window.DX3rdUniversalHandler.showStatRollConfirmDialog(
                    this.actor,
                    'skill',
                    skillId,
                    this._openComboBuilder.bind(this)
                );
            }
        }

        async _openComboBuilder(targetType, targetId) {
            // 액터 보유 이펙트 목록 수집 (정렬 포함)
            const effects = this.actor.items.filter(i => i.type === 'effect');
            const effectList = effects.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map(i => i.toObject());

            // targetType이 'ability'인 경우 key는 targetId, base는 없음
            // targetType이 'skill'인 경우 key는 targetId, base는 skill의 base 속성
            let targetKey = targetId;
            let targetBase = null;

            if (targetType === 'skill') {
                const skill = this.actor.system?.attributes?.skills?.[targetId];
                if (skill) {
                    targetBase = skill.base;
                }
            }

            // 스킬 정렬: 능력치별 (기본 스킬 우선, 커스텀 스킬 후순위)
            const sortedSkills = this._getSortedSkillOptions();

            // UniversalHandler의 openComboBuilder로 위임
            if (window.DX3rdUniversalHandler) {
                await window.DX3rdUniversalHandler.openComboBuilder(this.actor, targetType, targetKey);
            }
        }

        _getSortedSkillOptions() {
            const skills = this.actor.system?.attributes?.skills || {};
            const sortedOptions = [];

            // 능력치별 기본 스킬 순서
            const skillOrder = {
                body: ['melee', 'evade'],
                sense: ['ranged', 'perception'],
                mind: ['rc', 'will', 'cthulhu'],
                social: ['negotiation', 'procure']
            };

            const attributes = ['body', 'sense', 'mind', 'social'];

            for (const attr of attributes) {
                // 능력치 자체 추가
                sortedOptions.push({
                    value: attr,
                    label: game.i18n.localize(`DX3rd.${attr.charAt(0).toUpperCase() + attr.slice(1)}`),
                    isAbility: true
                });

                // 해당 능력치의 기본 스킬들
                const defaultSkills = skillOrder[attr] || [];
                for (const skillKey of defaultSkills) {
                    const skill = skills[skillKey];
                    if (skill && skill.base === attr) {
                        let skillName = skill.name;
                        if (skillName && skillName.startsWith('DX3rd.')) {
                            skillName = game.i18n.localize(skillName);
                        }
                        sortedOptions.push({
                            value: skillKey,
                            label: skillName,
                            isAbility: false
                        });
                    }
                }

                // 해당 능력치의 커스텀 스킬들
                for (const [skillKey, skill] of Object.entries(skills)) {
                    if (skill.base === attr && !defaultSkills.includes(skillKey)) {
                        let skillName = skill.name;
                        if (skillName && skillName.startsWith('DX3rd.')) {
                            skillName = game.i18n.localize(skillName);
                        }
                        sortedOptions.push({
                            value: skillKey,
                            label: skillName,
                            isAbility: false
                        });
                    }
                }
            }

            return sortedOptions;
        }

        _onAbilityHover(event) {
            const abilityId = $(event.currentTarget).closest('[data-ability-id]').data('ability-id');
            if (!abilityId) return;

            const ability = this.actor.system.attributes[abilityId];
            if (!ability) return;

            this._updateDiceInfo(ability);
        }

        _onAbilityHoverOut(event) {
            // 원래 값으로 되돌리기 (현재 선택된 판정 타입 기준)
            this._resetDiceInfo();
        }

        _onSkillHover(event) {
            const skillId = $(event.currentTarget).closest('[data-skill-id]').data('skill-id');
            if (!skillId) return;

            const skill = this.actor.system.attributes.skills[skillId];
            if (!skill) return;

            this._updateDiceInfo(skill);
        }

        _onSkillHoverOut(event) {
            // 원래 값으로 되돌리기
            this._resetDiceInfo();
        }

        _updateDiceInfo(stat) {
            const diceView = this.actor.system.attributes.dice?.view || 'major';
            const rollType = diceView; // 'major', 'reaction', 'dodge'

            const $diceInput = this.element.find('#dice');
            const $criticalInput = this.element.find('#critical');
            const $addInput = this.element.find('#add');

            if (stat[rollType]) {
                $diceInput.val(stat[rollType].dice || 0);
                $criticalInput.val(stat[rollType].critical || (game.settings.get("double-cross-3rd", "defaultCritical") || 10));
                $addInput.val(stat[rollType].add || 0);
            } else {
                // 판정 타입별 데이터가 없으면 기본값 사용
                $diceInput.val(stat.dice || 0);
                $criticalInput.val(stat.critical || (game.settings.get("double-cross-3rd", "defaultCritical") || 10));
                $addInput.val(stat.add || 0);
            }
        }

        _resetDiceInfo() {
            // dice-info를 기본 값으로 복원 (0, defaultCritical, 0)
            const $diceInput = this.element.find('#dice');
            const $criticalInput = this.element.find('#critical');
            const $addInput = this.element.find('#add');

            $diceInput.val(0);
            $criticalInput.val(game.settings.get("double-cross-3rd", "defaultCritical") || 10);
            $addInput.val(0);
        }

        async _onTitusClick(event) {
            event.preventDefault();
            const button = $(event.currentTarget);
            const li = button.closest('.item');
            const itemId = li.data('item-id');

            if (!itemId) {
                return;
            }

            const item = this.actor.items.get(itemId);
            if (!item) {
                return;
            }

            // Titus 핸들러 호출
            if (window.DX3rdRoisHandler) {
                await window.DX3rdRoisHandler.handleTitus(this.actor.id, itemId);
            } else {
                ui.notifications.error('로이스 핸들러를 찾을 수 없습니다.');
            }
        }

        async _onSublimationClick(event) {
            event.preventDefault();
            const button = $(event.currentTarget);
            const li = button.closest('.item');
            const itemId = li.data('item-id');

            if (!itemId) {
                return;
            }

            const item = this.actor.items.get(itemId);
            if (!item) {
                return;
            }

            // 이미 승화가 사용된 경우 초기화 확인 다이얼로그 표시
            if (item.system.sublimation) {
                const confirmed = await Dialog.confirm({
                    title: "Initialize this item",
                    content: "<p>Do you want to reset Titus and Sublimation for this item?</p>",
                    yes: () => true,
                    no: () => false,
                    defaultYes: false
                });

                if (confirmed) {
                    // Titus와 Sublimation 초기화
                    await item.update({
                        "system.titus": false,
                        "system.sublimation": false
                    });
                    ui.notifications.info("로이스가 초기화되었습니다.");
                }
                return;
            }

            // 승화가 아직 사용되지 않은 경우 Sublimation 핸들러 호출
            if (window.DX3rdRoisHandler) {
                await window.DX3rdRoisHandler.handleSublimation(this.actor.id, itemId);
            } else {
                ui.notifications.error('로이스 핸들러를 찾을 수 없습니다.');
            }
        }

        /**
         * Stock 클릭 핸들러
         * @private
         */
        async _onStockClick(event) {
            event.preventDefault();

            const currentStock = this.actor.system.attributes.stock.value || 0;

            if (currentStock <= 0) {
                ui.notifications.warn("There are no stock point left to use.");
                return;
            }

            const template = `
                <div class="stock-dialog">
                    <div class="form-group">
                        <label>${game.i18n.localize("DX3rd.StockUseText")} (${game.i18n.localize("DX3rd.Current")} ${game.i18n.localize("DX3rd.Stock")}: ${currentStock})</label>
                        <input type="number" id="stock-use-amount" min="1" max="${currentStock}" value="" placeholder="" style="width: 100%; text-align: center;">
                    </div>
                </div>
                <style>
                .stock-dialog {
                    padding: 5px;
                }
                .stock-dialog .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin-top: 0px;
                    margin-bottom: 5px;
                }
                .stock-dialog label {
                    font-weight: bold;
                    font-size: 14px;
                }
                .stock-dialog input {
                    padding: 4px;
                    font-size: 14px;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                }
                </style>
            `;

            new Dialog({
                title: game.i18n.localize("DX3rd.Stock"),
                content: template,
                buttons: {
                    confirm: {
                        icon: '<i class="fas fa-check"></i>',
                        label: game.i18n.localize("DX3rd.Confirm"),
                        callback: async (html) => {
                            const useAmount = parseInt(html.find("#stock-use-amount").val());

                            // 입력값 검증
                            if (isNaN(useAmount) || useAmount < 1) {
                                ui.notifications.warn("Please enter the amount of stock points to use.");
                                return;
                            }

                            if (useAmount > currentStock) {
                                ui.notifications.warn(`Stockpoints can only be used up to ${currentStock} points.`);
                                return;
                            }

                            const newStock = Math.max(0, currentStock - useAmount);

                            await this.actor.update({
                                "system.attributes.stock.value": newStock
                            });

                            // 채팅 메시지 출력
                            const messageContent = `<div class="dx3rd-item-chat"><p>${game.i18n.localize("DX3rd.Stock")} ${useAmount}${game.i18n.localize("DX3rd.PointUsed")}</p></div>`;

                            ChatMessage.create({
                                content: messageContent,
                                speaker: ChatMessage.getSpeaker({ actor: this.actor })
                            });
                        }
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: game.i18n.localize("DX3rd.Cancel")
                    }
                },
                default: "confirm",
                render: (html) => {
                    const input = html.find("#stock-use-amount");

                    // 실시간 입력 검증
                    input.on('input', function () {
                        const value = parseInt(this.value);

                        if (value > currentStock) {
                            ui.notifications.warn(`재산점은 최대 ${currentStock}점까지만 사용할 수 있습니다.`);
                            this.value = '';
                        }
                    });
                }
            }).render(true);
        }

        /**
         * ActorType 버튼 클릭 핸들러
         * @private
         */
        async _onActorTypeClick(event) {
            event.preventDefault();

            const currentType = this.actor.system.actorType || "NPC";

            // 템플릿 로드
            const template = "systems/double-cross-3rd/templates/dialog/actor-type-dialog.html";
            const html = await renderTemplate(template, {
                currentType
            });

            // 다이얼로그 표시
            new Dialog({
                title: game.i18n.localize("DX3rd.ActorType"),
                content: html,
                buttons: {
                    confirm: {
                        icon: '<i class="fas fa-check"></i>',
                        label: game.i18n.localize("DX3rd.Confirm"),
                        callback: async (html) => {
                            const selectedType = html.find("#actor-type-select").val();

                            await this.actor.update({
                                "system.actorType": selectedType
                            });
                            ui.notifications.info(`액터 타입이 ${game.i18n.localize("DX3rd." + selectedType)}(으)로 변경되었습니다.`);
                        }
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: game.i18n.localize("DX3rd.Cancel")
                    }
                },
                default: "confirm"
            }).render(true);
        }

        /**
         * 백트랙 핸들러
         */
        async _onBacktrackRoll(event) {
            event.preventDefault();

            // 권한 체크
            if (!this.actor.isOwner && !game.user.isGM) {
                ui.notifications.warn('이 액터에 대한 권한이 없습니다.');
                return;
            }

            const currentEncroachment = Number(this.actor.system?.attributes?.encroachment?.value ?? 0);

            // M 타입 로이스 아이템 개수 확인
            const memoryRoisItems = this.actor.items.filter(item =>
                item.type === 'rois' && item.system?.type === 'M'
            );
            const memoryCount = memoryRoisItems.length;


            // 백트랙 시작 메시지 출력
            await this._sendBacktrackStartMessage(currentEncroachment);

            // 메모리가 0개면 메모리 사용 다이얼로그 스킵
            if (memoryCount === 0) {
                await this._showEroisUsageDialog(currentEncroachment, 0, 0, currentEncroachment);
            } else {
                // 메모리 사용 다이얼로그 표시
                await this._showMemoryUsageDialog(currentEncroachment, memoryCount);
            }
        }

        /**
         * 백트랙 시작 메시지 전송
         */
        async _sendBacktrackStartMessage(currentEncroachment) {
            const messageContent = `<div class="dx3rd-item-chat">${game.i18n.localize("DX3rd.BackTrackStart")}<br>${game.i18n.localize("DX3rd.Current")} ${game.i18n.localize("DX3rd.Encroachment")}: ${currentEncroachment}%</div>`;

            await ChatMessage.create({
                content: messageContent,
                speaker: ChatMessage.getSpeaker({ actor: this.actor })
            });
        }

        /**
         * 메모리 사용 다이얼로그 표시
         */
        async _showMemoryUsageDialog(currentEncroachment, memoryCount) {
            const template = `
                <div class="backtrack-dialog">
                    <div class="form-group">
                        <label>${game.i18n.localize("DX3rd.Current")} ${game.i18n.localize("DX3rd.Encroachment")}: ${currentEncroachment}%</label>
                        <p>${game.i18n.localize("DX3rd.Memory")} ${game.i18n.localize("DX3rd.Quantity")}: ${memoryCount}</p>
                        <input type="number" id="backtrack-memory-count" min="0" max="${memoryCount}" placeholder="0" style="width: 100%; text-align: center;">
                    </div>
                </div>
                <style>
                .backtrack-dialog .form-group {
                    display: flex;
                    flex-direction: column;
                    margin-top: 0px;
                    margin-bottom: 8px;
                }
                .backtrack-dialog label {
                    font-weight: bold;
                    font-size: 14px;
                }
                .backtrack-dialog p {
                    margin: 5px 0;
                    font-size: 13px;
                }
                .backtrack-dialog input {
                    padding: 4px;
                    font-size: 14px;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                }
                </style>
            `;

            new Dialog({
                title: game.i18n.localize("DX3rd.Memory") + " " + game.i18n.localize("DX3rd.Use"),
                content: template,
                buttons: {
                    execute: {
                        label: game.i18n.localize("DX3rd.Memory") + " " + game.i18n.localize("DX3rd.Use"),
                        callback: async (html) => {
                            const memoryUsed = parseInt(html.find("#backtrack-memory-count").val()) || 0;

                            if (memoryUsed < 0 || memoryUsed > memoryCount) {
                                ui.notifications.warn("올바른 메모리 로이스 개수를 입력하세요.");
                                return;
                            }

                            // 메모리 사용 처리
                            await this._processMemoryUsage(currentEncroachment, memoryUsed, memoryCount);
                        }
                    }
                },
                default: "execute"
            }).render(true);
        }

        /**
         * 메모리 사용 처리
         */
        async _processMemoryUsage(originalEncroachment, memoryUsed, memoryCount) {
            // 침식률 감소 계산
            const reduction = memoryUsed * 10;
            const afterMemoryEncroachment = Math.max(0, originalEncroachment - reduction);
            const memoryReduction = originalEncroachment - afterMemoryEncroachment;

            // 침식률 업데이트
            await this.actor.update({
                "system.attributes.encroachment.value": afterMemoryEncroachment
            });

            // 메모리 사용 메시지 출력 (0개가 아닌 경우만)
            if (memoryUsed > 0) {
                const messageContent = `<div class="dx3rd-item-chat">${game.i18n.format("DX3rd.UseMemoryCount", { count: memoryUsed })}<br>${originalEncroachment}% → ${afterMemoryEncroachment}% (${originalEncroachment - afterMemoryEncroachment > 0 ? '-' : '+'}${originalEncroachment - afterMemoryEncroachment}%)</div>`;
                await ChatMessage.create({
                    content: messageContent,
                    speaker: ChatMessage.getSpeaker({ actor: this.actor })
                });
            }

            // E 로이스 사용 다이얼로그 표시
            await this._showEroisUsageDialog(originalEncroachment, memoryUsed, memoryReduction, afterMemoryEncroachment);
        }

        /**
         * E 로이스 사용 다이얼로그 표시
         */
        async _showEroisUsageDialog(originalEncroachment, memoryUsed, memoryReduction, afterMemoryEncroachment) {
            const eroisTemplate = `
                <div class="backtrack-dialog">
                    <div class="form-group">
                        <label>${game.i18n.localize("DX3rd.Current")} ${game.i18n.localize("DX3rd.Encroachment")}: ${afterMemoryEncroachment}%</label>
                        <p>${game.i18n.localize("DX3rd.Exhaust")} ${game.i18n.localize("DX3rd.Quantity")} 입력:</p>
                        <input type="number" id="backtrack-erois-count" min="0" placeholder="0" style="width: 100%; text-align: center;">
                    </div>
                </div>
                <style>
                .backtrack-dialog .form-group {
                    display: flex;
                    flex-direction: column;
                    margin-top: 0px;
                    margin-bottom: 8px;
                }
                .backtrack-dialog label {
                    font-weight: bold;
                    font-size: 14px;
                }
                .backtrack-dialog p {
                    margin: 5px 0;
                    font-size: 13px;
                }
                .backtrack-dialog input {
                    padding: 4px;
                    font-size: 14px;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                }
                </style>
            `;

            new Dialog({
                title: game.i18n.localize("DX3rd.Exhaust") + " " + game.i18n.localize("DX3rd.Use"),
                content: eroisTemplate,
                buttons: {
                    execute: {
                        label: game.i18n.localize("DX3rd.Exhaust") + " " + game.i18n.localize("DX3rd.Use"),
                        callback: async (html) => {
                            const eroisUsed = parseInt(html.find("#backtrack-erois-count").val()) || 0;

                            if (eroisUsed < 0) {
                                ui.notifications.warn("올바른 E 로이스 개수를 입력하세요.");
                                return;
                            }

                            // E 로이스 사용 처리
                            await this._processEroisUsage(originalEncroachment, memoryUsed, memoryReduction, afterMemoryEncroachment, eroisUsed);
                        }
                    }
                },
                default: "execute"
            }).render(true);
        }

        /**
         * E 로이스 사용 처리
         */
        async _processEroisUsage(originalEncroachment, memoryUsed, memoryReduction, afterMemoryEncroachment, eroisUsed) {
            // E 로이스 개수만큼 1d10 주사위를 한 번에 굴리기
            const roll = new Roll(`${eroisUsed}d10`);
            await roll.roll();
            const totalReduction = roll.total;
            
            const afterExhaustEncroachment = Math.max(0, afterMemoryEncroachment - totalReduction);
            const eroisReduction = afterMemoryEncroachment - afterExhaustEncroachment;

            // 최종 침식률 업데이트
            await this.actor.update({
                "system.attributes.encroachment.value": afterExhaustEncroachment
            });

            // E 로이스 사용 메시지 출력 (0개가 아닌 경우만)
            if (eroisUsed > 0) {
                // 먼저 침식률 변화 메시지 출력 (주사위 롤 포함)
                const reductionAmount = afterMemoryEncroachment - afterExhaustEncroachment;
                const finalMessage = `<div class="dx3rd-item-chat">${game.i18n.format("DX3rd.UseEroisCount", { count: eroisUsed })}<br>${afterMemoryEncroachment}% → ${afterExhaustEncroachment}% (${reductionAmount > 0 ? '-' : '+'}${Math.abs(reductionAmount)}%)</div>`;
                await ChatMessage.create({
                    content: finalMessage,
                    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                    rolls: [roll]
                });
            }

            // 로이스 사용 다이얼로그 표시
            await this._showRoisDialog(originalEncroachment, memoryUsed, memoryReduction, afterMemoryEncroachment, eroisUsed, eroisReduction, afterExhaustEncroachment);
        }

        /**
         * 로이스 사용 다이얼로그 표시
         */
        async _showRoisDialog(originalEncroachment, memoryUsed, memoryReduction, afterMemoryEncroachment, eroisUsed, eroisReduction, afterExhaustEncroachment) {
            // M과 D를 제외하고 Titus가 체크되지 않은 로이스 아이템 개수 계산
            const availableRoisItems = this.actor.items.filter(item => 
                item.type === 'rois' && 
                item.system?.type !== 'M' && 
                item.system?.type !== 'D' &&
                !item.system?.titus
            );
            const roisCount = availableRoisItems.length;

            const roisTemplate = `
                <div class="backtrack-dialog">
                    <div class="form-group">
                        <label>${game.i18n.localize("DX3rd.Current")} ${game.i18n.localize("DX3rd.Encroachment")}: ${afterExhaustEncroachment}%</label>
                        <p>${game.i18n.format("DX3rd.UsebleRoisCount", { count: roisCount })}</p>
                    </div>
                </div>
                <style>
                .backtrack-dialog .form-group {
                    display: flex;
                    flex-direction: column;
                    margin-top: 0px;
                    margin-bottom: 8px;
                }
                .backtrack-dialog label {
                    font-weight: bold;
                    font-size: 14px;
                }
                .backtrack-dialog p {
                    margin: 5px 0;
                    font-size: 13px;
                }
                </style>
            `;

            new Dialog({
                title: game.i18n.localize("DX3rd.Rois") + " " + game.i18n.localize("DX3rd.Use"),
                content: roisTemplate,
                buttons: {
                    x1: {
                        label: "×1",
                        callback: async () => {
                            await this._processRoisUsage(originalEncroachment, memoryUsed, memoryReduction, afterMemoryEncroachment, eroisUsed, eroisReduction, afterExhaustEncroachment, roisCount, 1);
                        }
                    },
                    x2: {
                        label: "×2",
                        callback: async () => {
                            await this._processRoisUsage(originalEncroachment, memoryUsed, memoryReduction, afterMemoryEncroachment, eroisUsed, eroisReduction, afterExhaustEncroachment, roisCount, 2);
                        }
                    }
                }
            }).render(true);
        }

        /**
         * 로이스 사용 처리
         */
        async _processRoisUsage(originalEncroachment, memoryUsed, memoryReduction, afterMemoryEncroachment, eroisUsed, eroisReduction, afterExhaustEncroachment, roisCount, multiplier) {
            // 로이스 개수 * multiplier 만큼 주사위 굴리기
            const diceCount = roisCount * multiplier;
            const roll = new Roll(`${diceCount}d10`);
            await roll.roll();
            const totalReduction = roll.total;
            
            const finalEncroachment = Math.max(0, afterExhaustEncroachment - totalReduction);
            const roisReduction = afterExhaustEncroachment - finalEncroachment;

            // 최종 침식률 업데이트
            await this.actor.update({
                "system.attributes.encroachment.value": finalEncroachment
            });

            // 로이스 사용 메시지 출력 (주사위 롤 포함)
            const reductionAmount = afterExhaustEncroachment - finalEncroachment;
            const messageContent = `<div class="dx3rd-item-chat">${game.i18n.format("DX3rd.UseRoisVoluntary", { count: roisCount, multiplier })}<br>${afterExhaustEncroachment}% → ${finalEncroachment}% (${reductionAmount > 0 ? '-' : '+'}${Math.abs(reductionAmount)}%)</div>`;
            await ChatMessage.create({
                content: messageContent,
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                rolls: [roll]
            });

            // 최종 침식률이 100 이하이면 백트랙 완료, 아니면 EXPExtra 다이얼로그 표시
            if (finalEncroachment <= 100) {
                await this._finishBacktrack(originalEncroachment, memoryUsed, memoryReduction, afterMemoryEncroachment, eroisUsed, eroisReduction, finalEncroachment, multiplier, false);
            } else {
                await this._showEXPExtraDialog(originalEncroachment, memoryUsed, memoryReduction, afterMemoryEncroachment, eroisUsed, eroisReduction, finalEncroachment, multiplier);
            }
        }

        /**
         * EXPExtra 다이얼로그 표시
         */
        async _showEXPExtraDialog(originalEncroachment, memoryUsed, memoryReduction, afterMemoryEncroachment, eroisUsed, eroisReduction, afterRoisEncroachment, usedMultiplier) {
            // 타이터스화 되지 않은 로이스 개수 계산 (M과 D를 제외한 나머지)
            const availableRoisItems = this.actor.items.filter(item => 
                item.type === 'rois' && 
                item.system?.type !== 'M' && 
                item.system?.type !== 'D' &&
                !item.system?.titus
            );
            const roisCount = availableRoisItems.length;

            const expExtraTemplate = `
                <div class="backtrack-dialog">
                    <div class="form-group">
                        <label>${game.i18n.localize("DX3rd.Current")} ${game.i18n.localize("DX3rd.Encroachment")}: ${afterRoisEncroachment}%</label>
                        <p>${game.i18n.format("DX3rd.UsebleRoisCount", { count: roisCount })}</p>
                        <p>${game.i18n.localize("DX3rd.EXPExtra")}</p>
                    </div>
                </div>
                <style>
                .backtrack-dialog .form-group {
                    display: flex;
                    flex-direction: column;
                    margin-top: 0px;
                    margin-bottom: 8px;
                }
                .backtrack-dialog label {
                    font-weight: bold;
                    font-size: 14px;
                }
                .backtrack-dialog p {
                    margin: 5px 0;
                    font-size: 13px;
                }
                </style>
            `;

            new Dialog({
                title: game.i18n.localize("DX3rd.EXPExtra"),
                content: expExtraTemplate,
                buttons: {
                    use: {
                        label: game.i18n.localize("DX3rd.Use"),
                        callback: async () => {
                            await this._processEXPExtra(originalEncroachment, memoryUsed, memoryReduction, afterMemoryEncroachment, eroisUsed, eroisReduction, afterRoisEncroachment, roisCount, usedMultiplier);
                        }
                    },
                    skip: {
                        label: game.i18n.localize("DX3rd.Skip"),
                        callback: async () => {
                            await this._finishBacktrack(originalEncroachment, memoryUsed, memoryReduction, afterMemoryEncroachment, eroisUsed, eroisReduction, afterRoisEncroachment, usedMultiplier, false);
                        }
                    }
                }
            }).render(true);
        }

        /**
         * EXPExtra 처리
         */
        async _processEXPExtra(originalEncroachment, memoryUsed, memoryReduction, afterMemoryEncroachment, eroisUsed, eroisReduction, afterRoisEncroachment, roisCount, usedMultiplier) {
            // 로이스 개수만큼 주사위 굴리기
            const roll = new Roll(`${roisCount}d10`);
            await roll.roll();
            const totalReduction = roll.total;
            
            const finalEncroachment = Math.max(0, afterRoisEncroachment - totalReduction);
            const expExtraReduction = afterRoisEncroachment - finalEncroachment;

            // 최종 침식률 업데이트
            await this.actor.update({
                "system.attributes.encroachment.value": finalEncroachment
            });

            // EXPExtra 메시지 출력 (주사위 롤 포함)
            const reductionAmount = afterRoisEncroachment - finalEncroachment;
            const messageContent = `<div class="dx3rd-item-chat">${game.i18n.localize("DX3rd.EXPExtra")}<br>${afterRoisEncroachment}% → ${finalEncroachment}% (${reductionAmount > 0 ? '-' : '+'}${Math.abs(reductionAmount)}%)</div>`;
            await ChatMessage.create({
                content: messageContent,
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                rolls: [roll]
            });

            // 백트랙 완료 처리
            await this._finishBacktrack(originalEncroachment, memoryUsed, memoryReduction, afterMemoryEncroachment, eroisUsed, eroisReduction, finalEncroachment, usedMultiplier, true);
        }

        /**
         * 백트랙 완료 처리
         */
        async _finishBacktrack(originalEncroachment, memoryUsed, memoryReduction, afterMemoryEncroachment, eroisUsed, eroisReduction, finalEncroachment, usedMultiplier = null, usedExtra = false) {
            // 백트랙 완료 여부 판정
            const isSuccess = finalEncroachment <= 100;

            let messageContent;
            let expGain = 0;

            if (isSuccess) {
                // 성공 메시지 (녹색)
                let successMsg = `<span class="dx3rd-backtrack-success">${game.i18n.localize("DX3rd.BackTrack")} ${game.i18n.localize("DX3rd.Success")}</span>`;
                
                // EXP 계산
                if (usedExtra) {
                    // ExtraBackTrack 사용 시
                    expGain = 0;
                } else if (usedMultiplier === 2) {
                    // x2로 성공 시
                    expGain = 3;
                } else {
                    // x1로 성공 시
                    if (finalEncroachment === 100) {
                        expGain = 3;
                    } else if (finalEncroachment >= 71 && finalEncroachment <= 99) {
                        expGain = 5;
                    } else if (finalEncroachment >= 51 && finalEncroachment <= 70) {
                        expGain = 4;
                    } else if (finalEncroachment >= 31 && finalEncroachment <= 50) {
                        expGain = 3;
                    } else if (finalEncroachment >= 0 && finalEncroachment <= 30) {
                        expGain = 2;
                    }
                }
                
                successMsg += `<br>백트랙 경험점: ${expGain}점`;
                messageContent = `<div class="dx3rd-item-chat">${successMsg}</div>`;
                
                ui.notifications.info("백트랙 성공! 침식률이 100% 이하로 감소했습니다.");
            } else {
                // 실패 메시지 (빨간색)
                messageContent = `<div class="dx3rd-item-chat"><span class="dx3rd-backtrack-failure">${game.i18n.localize("DX3rd.BackTrack")} ${game.i18n.localize("DX3rd.Failure")}</span></div>`;
                
                ui.notifications.warn("백트랙 실패. 침식률이 여전히 100%를 초과합니다.");
            }

            // 채팅 메시지 전송
            await ChatMessage.create({
                content: messageContent,
                speaker: ChatMessage.getSpeaker({ actor: this.actor })
            });

            // 백트랙 레코드 생성
            await this._createBacktrackRecord(finalEncroachment, usedMultiplier, usedExtra, isSuccess, expGain);
        }

        /**
         * 백트랙 레코드 생성
         */
        async _createBacktrackRecord(finalEncroachment, usedMultiplier, usedExtra, isSuccess, expGain) {
            // 현재 날짜로 레코드 이름 생성
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const recordName = `Record(${year}.${month}.${day})`;

            // 레코드 description 생성
            let recordContent = `최종 침식률: ${finalEncroachment}%`;
            
            // 사용한 방식 표기
            if (usedExtra) {
                recordContent += ` (${game.i18n.localize("DX3rd.EXPExtra")})`;
            } else if (usedMultiplier === 2) {
                recordContent += ` (×2)`;
            } else {
                recordContent += ` (×1)`;
            }
            
            // 성공/실패 표기
            recordContent += `/${game.i18n.localize(isSuccess ? "DX3rd.Success" : "DX3rd.Failure")}`;
            
            // 성공 시 EXP 표기
            if (isSuccess) {
                recordContent += `<hr>백트랙 경험점: ${expGain}점`;
            }

            // 레코드 아이템 생성
            const recordData = {
                name: recordName,
                type: "record",
                system: {
                    description: recordContent
                }
            };

            await this.actor.createEmbeddedDocuments("Item", [recordData]);
            
            // 백트랙 초기화 실행
            await this._initializeBacktrack();
        }

        /**
         * 백트랙 초기화
         */
        async _initializeBacktrack() {
            // 모든 disable 훅 실행 (해당 액터만)
            if (window.DX3rdDisableHooks) {
                const timings = ['roll', 'major', 'reaction', 'guard', 'main', 'round', 'scene', 'session'];
                for (const timing of timings) {
                    await window.DX3rdDisableHooks.executeDisableHook(timing, this.actor);
                }
            }
            
            // Stock과 HP를 max로 회복
            const updates = {};
            if (this.actor.system?.attributes?.stock?.max !== undefined) {
                updates['system.attributes.stock.value'] = this.actor.system.attributes.stock.max;
            }
            if (this.actor.system?.attributes?.hp?.max !== undefined) {
                updates['system.attributes.hp.value'] = this.actor.system.attributes.hp.max;
            }
            
            // 침식률이 100 이하이면 init 값으로 회복
            const currentEncroachment = this.actor.system?.attributes?.encroachment?.value ?? 0;
            const initEncroachment = this.actor.system?.attributes?.encroachment?.init?.value;
            if (currentEncroachment <= 100 && initEncroachment !== undefined) {
                updates['system.attributes.encroachment.value'] = initEncroachment;
            }
            
            if (Object.keys(updates).length > 0) {
                await this.actor.update(updates);
            }
        }

    }

    // 액터 시트 등록 (v13 호환)
    const ActorsClass = foundry.documents?.collections?.Actors || Actors;
    ActorsClass.registerSheet('double-cross-3rd', DX3rdActorSheet, {
        types: ['character'],
        makeDefault: true
    });
})();

