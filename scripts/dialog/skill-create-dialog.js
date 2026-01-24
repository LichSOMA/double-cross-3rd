/**
 * Double Cross 3rd Skill Create Dialog
 */
(function() {
    class DX3rdSkillCreateDialog extends Dialog {
        constructor(options) {
            const { skill, actorId, ...dialogOptions } = options;
            super(dialogOptions);
            this.skillData = skill;
            this.actorId = actorId;
        }

        /** @override */
        static get defaultOptions() {
            return foundry.utils.mergeObject(super.defaultOptions, {
                template: "systems/double-cross-3rd/templates/dialog/skill-create-dialog.html",
                width: 600,
                height: "auto",
                classes: ["double-cross-3rd", "dialog", "skill-dialog"],
                default: "create"
            });
        }

        /** @override */
        getData() {
            return {
                title: this.options.title,
                skill: this.skillData,
                buttons: this.options.buttons || {},
                default: this.options.default
            };
        }

        /** @override */
        activateListeners(html) {
            super.activateListeners(html);

            // 폼 submit 완전 차단
            html.closest('form').on('submit', ev => { ev.preventDefault(); });

            const actorId = this.actorId;
            const abilityId = this.skillData.base;
            const dice = this.skillData.dice;

            // base 선택을 비활성화하고 선택된 능력치로 고정
            html.find("#skill-base").val(abilityId).prop('disabled', true);

            // 스킬 값이 변경될 때마다 total 업데이트
            const $point = html.find("#skill-point");
            const $extra = html.find("#skill-extra");
            const $works = html.find("#skill-works");
            const $bonus = html.find("#skill-bonus");
            const $total = html.find("#skill-total");
            const $dice = html.find("#skill-dice");

            function updateTotal() {
                const point = Number($point.val().toString().replace('+', '')) || 0;
                const extra = Number($extra.val().toString().replace('+', '')) || 0;
                const works = Number($works.val().toString().replace('+', '')) || 0;
                const bonus = Number($bonus.val().toString().replace('+', '')) || 0;
                const total = point + extra + works + bonus;
                if (total === 0) {
                    $total.val('0');
                } else if (total > 0) {
                    $total.val('+' + total);
                } else {
                    $total.val(total.toString());
                }
                $dice.val("+" + dice + "D");
            }

            $point.on("input", updateTotal);
            $extra.on("input", updateTotal);
            $works.on("input", updateTotal);

            // auto-sign 기능 추가
            html.find('.auto-sign').on('input', function() {
                // 맨 앞에 + 또는 -가 올 수 있고, 그 뒤는 숫자만 허용
                let value = this.value.replace(/[^0-9+-]/g, '');
                value = value.replace(/(?!^)[+-]/g, ''); // 맨 앞 이외의 +, - 제거

                // 부호만 입력한 경우는 그대로 두기
                if (value === '+' || value === '-') {
                    this.value = value;
                    return;
                }

                // 숫자 변환
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
            html.find('.auto-sign').each(function() {
                const value = Number(this.value) || 0;
                if (value > 0) {
                    this.value = '+' + value;
                } else if (value < 0) {
                    this.value = value.toString();
                } else {
                    this.value = '0';
                }
            });

            // 생성 버튼 클릭 시
            html.find('.dialog-button[data-button="create"]').on('click', async (event) => {
                const actor = game.actors.get(actorId);
                if (!actor) {
                    console.error('[SkillCreateDialog] 저장 시 actor를 찾을 수 없습니다:', actorId);
                    return;
                }

                const key = html.find('#skill-key').val().trim();
                
                if (!key) {
                    console.warn('[SkillCreateDialog] 스킬 키가 비어있음');
                    ui.notifications.error(game.i18n.localize("DX3rd.ErrorSkillKeyRequired"));
                    return;
                }

                // 스킬 키가 이미 존재하는지 확인
                if (actor.system.attributes.skills[key]) {
                    console.warn('[SkillCreateDialog] 이미 존재하는 스킬 키:', key);
                    ui.notifications.error(game.i18n.localize("DX3rd.ErrorSkillKeyExists"));
                    return;
                }

                // 현재 능력치의 스킬들을 찾아서 마지막에 추가
                const skills = actor.system.attributes.skills;
                const baseSkills = Object.entries(skills)
                    .filter(([_, skill]) => skill.base === abilityId)
                    .sort((a, b) => {
                        // 기본 스킬을 먼저 정렬
                        if (a[1].delete === false && b[1].delete === true) return -1;
                        if (a[1].delete === true && b[1].delete === false) return 1;
                        // 그 다음 이름으로 정렬
                        return a[1].name.localeCompare(b[1].name);
                    });

                // 새 스킬 데이터 생성
                const newSkillData = {
                    name: html.find('#skill-name').val(),
                    point: Number(html.find('#skill-point').val()) || 0,
                    extra: Number(html.find('#skill-extra').val()) || 0,
                    bonus: 0,
                    total: Number(html.find('#skill-point').val()) || 0,  // 초기 total은 point와 동일
                    base: abilityId,
                    delete: true,
                    order: baseSkills.length,  // 현재 능력치의 스킬 개수를 order로 사용
                    dice: actor.system.attributes[abilityId].dice || 0,  // base 능력치의 dice 값
                    add: 0  // 기본값 0, 차후 수정 요소 추가 예정
                };

                try {
                    await actor.update({
                        [`system.attributes.skills.${key}`]: newSkillData
                    });
                    
                    this.close();
                } catch (err) {
                    console.error('[SkillCreateDialog] 스킬 생성 실패:', {
                        error: err,
                        actorId,
                        skillKey: key,
                        skillData: newSkillData
                    });
                }
            });

            // 취소 버튼 클릭 시
            html.find('.skill-create-cancel').on('click', () => {
                this.close();
            });
        }
    }

    // 전역으로 다이얼로그 클래스 노출
    window.DX3rdSkillCreateDialog = DX3rdSkillCreateDialog;
})(); 