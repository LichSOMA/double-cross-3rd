/**
 * Double Cross 3rd Skill Edit Dialog
 */
(function() {
    class DX3rdSkillEditDialog extends Dialog {
        constructor(options) {
            const { skill, actorId, ...dialogOptions } = options;
            super(dialogOptions);
            this.skillData = skill;
            this.actorId = actorId;
        }

        /** @override */
        static get defaultOptions() {
            return foundry.utils.mergeObject(super.defaultOptions, {
                template: "systems/double-cross-3rd/templates/dialog/skill-edit-dialog.html",
                width: 600,
                height: "auto",
                classes: ["double-cross-3rd", "dialog", "skill-dialog"],
                default: "save"
            });
        }

        /** @override */
        getData() {
            return {
                title: this.options.title,
                skill: this.skillData || {},
                default: this.options.default || "save"
            };
        }

        activateListeners(html) {
            super.activateListeners(html);

            // 폼 submit 완전 차단
            html.closest('form').on('submit', ev => { ev.preventDefault(); });

            const actorId = this.actorId;
            const skillId = this.skillData?.key;
            if (!actorId || !skillId) {
                console.warn('[SkillEditDialog] actorId 또는 skillId가 없습니다.');
                return;
            }

            // 저장 버튼 클릭 시
            html.find('.skill-edit-save').on('click', async (event) => {
                const actor = game.actors.get(actorId);
                if (!actor) {
                    console.error('[SkillEditDialog] 저장 시 actor를 찾을 수 없습니다:', actorId);
                    return;
                }
                const name = html.find("#skill-name").val();
                const point = Number(html.find("#skill-point").val()) || 0;
                const extra = Number(html.find("#skill-extra").val()) || 0;
                const works = Number(html.find("#skill-works").val()) || 0;
                const base = html.find("#skill-base").val();
                const bonus = Number(html.find("#skill-bonus").val()) || 0;  // bonus 값 가져오기
                const total = point + bonus + extra + works;  // total 값 계산

                try {
                    const updateData = {
                        [`system.attributes.skills.${skillId}.name`]: name,
                        [`system.attributes.skills.${skillId}.point`]: point,
                        [`system.attributes.skills.${skillId}.extra`]: extra,
                        [`system.attributes.skills.${skillId}.bonus`]: bonus,
                        [`system.attributes.skills.${skillId}.base`]: base,
                        [`system.attributes.skills.${skillId}.total`]: total  // total 값 추가
                    };
                    await actor.update(updateData);
                    this.close();
                } catch (err) {
                    console.error('[SkillEditDialog] update 실패:', err);
                }
            });

            // 취소 버튼 클릭 시
            html.find('.skill-edit-cancel').on('click', (event) => {
                this.close();
            });

            // 휴지통(삭제) 아이콘 클릭 시
            html.find('.skill-delete').on('click', async (event) => {
                const actor = game.actors.get(actorId);
                const skillId = this.skillData?.key;
                if (!actor) {
                    console.error('[SkillEditDialog] 삭제 시 actor를 찾을 수 없습니다:', actorId);
                    return;
                }
                if (!skillId) {
                    console.error('[SkillEditDialog] 삭제 시 skillId가 없습니다.');
                    return;
                }
                try {
                    // cthulhu 스킬 삭제 시 플래그 설정
                    if (skillId === 'cthulhu') {
                        await actor.setFlag('double-cross-3rd', 'cthulhuDeleted', true);
                    }
                    
                    await actor.update({ [`system.attributes.skills.-=${skillId}`]: null });
                    this.close();
                } catch (err) {
                    console.error('[SkillEditDialog] 스킬 삭제 실패:', err);
                }
            });

            // 입력값 변경 시 바로 반영
            const $point = html.find("#skill-point");
            const $extra = html.find("#skill-extra");
            const $works = html.find("#skill-works");
            const $base = html.find("#skill-base");
            const $bonus = html.find("#skill-bonus");
            const $total = html.find("#skill-total");
            const $name = html.find("#skill-name");

            async function updateTotalAndActor() {
                const actor = game.actors.get(actorId);
                if (!actor) return;
                const point = Number($point.val().toString().replace('+', '')) || 0;
                const extra = Number($extra.val().toString().replace('+', '')) || 0;
                const works = Number($works.val().toString().replace('+', '')) || 0;
                const bonus = Number($bonus.val ? $bonus.val().toString().replace('+', '') : this.skillData.bonus || 0) || 0;
                const base = $base.val();
                const name = $name.val();
                const total = point + extra + bonus + works;
                if (total === 0) {
                    $total.val('0');
                } else if (total > 0) {
                    $total.val('+' + total);
                } else {
                    $total.val(total.toString());
                }

                // base가 바뀌면 다이스도 갱신
                const newBaseAbility = actor.system.attributes[base];
                const $dice = html.find("#skill-dice");
                const newDice = newBaseAbility ? newBaseAbility.dice || 0 : 0;
                $dice.val("+" + newDice + "D");

                // 액터 데이터에 즉시 반영
                await actor.update({
                    [`system.attributes.skills.${skillId}.name`]: name,
                    [`system.attributes.skills.${skillId}.point`]: point,
                    [`system.attributes.skills.${skillId}.extra`]: extra,
                    [`system.attributes.skills.${skillId}.base`]: base,
                    [`system.attributes.skills.${skillId}.total`]: total,
                    [`system.attributes.skills.${skillId}.dice`]: newDice,
                    [`system.attributes.skills.${skillId}.add`]: 0
                });
            }

            $point.on("input", updateTotalAndActor.bind(this));
            $extra.on("input", updateTotalAndActor.bind(this));
            $works.on("input", updateTotalAndActor.bind(this));
            $base.on("change", updateTotalAndActor.bind(this));

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

        }
    }

    // 전역으로 다이얼로그 클래스 노출
    window.DX3rdSkillEditDialog = DX3rdSkillEditDialog;
})(); 