// Skills Settings Dialog
(function() {
    class DX3rdSkillsSettingsDialog extends FormApplication {
        static get defaultOptions() {
            return foundry.utils.mergeObject(super.defaultOptions, {
                id: "skills-settings-dialog",
                classes: ["double-cross-3rd", "dialog", "skills-settings-dialog"],
                title: game.i18n.localize("DX3rd.SkillsSettings"),
                template: "systems/double-cross-3rd/templates/dialog/skills-settings-dialog.html",
                width: 1000,
                height: "auto",
                closeOnSubmit: false,
                submitOnChange: false,
                resizable: true
            });
        }

        async getData() {
            // 현재 기본 스킬 정의 가져오기 (actor.js의 defaultSkills와 동일하게)
            const defaultSkills = {
                melee: { name: "DX3rd.melee", base: "body", delete: false },
                evade: { name: "DX3rd.evade", base: "body", delete: false },
                ranged: { name: "DX3rd.ranged", base: "sense", delete: false },
                perception: { name: "DX3rd.perception", base: "sense", delete: false },
                rc: { name: "DX3rd.rc", base: "mind", delete: false },
                will: { name: "DX3rd.will", base: "mind", delete: false },
                negotiation: { name: "DX3rd.negotiation", base: "social", delete: false },
                procure: { name: "DX3rd.procure", base: "social", delete: false }
            };

            // stageCRC가 활성화되어 있으면 cthulhu도 추가
            const stageCRCEnabled = game.settings.get("double-cross-3rd", "stageCRC");
            if (stageCRCEnabled) {
                defaultSkills.cthulhu = { name: "DX3rd.cthulhu", base: "mind", delete: true };
            }

            // 저장된 커스텀 스킬 로드
            const customSkills = game.settings.get("double-cross-3rd", "customSkills") || {};
            
            // 모든 스킬을 능력치별로 그룹화
            const attributeGroups = [
                { key: "body", name: game.i18n.localize("DX3rd.Body") },
                { key: "sense", name: game.i18n.localize("DX3rd.Sense") },
                { key: "mind", name: game.i18n.localize("DX3rd.Mind") },
                { key: "social", name: game.i18n.localize("DX3rd.Social") }
            ];

            const skillsByAttribute = attributeGroups.map(group => {
                const groupSkills = Object.entries(defaultSkills)
                    .filter(([key, skill]) => skill.base === group.key)
                    .map(([key, skill]) => {
                        // customSkills[key]가 객체인 경우 .name 속성 사용
                        let displayName;
                        if (customSkills[key]) {
                            displayName = typeof customSkills[key] === 'object' 
                                ? customSkills[key].name 
                                : customSkills[key];
                        } else {
                            displayName = game.i18n.localize(skill.name);
                        }
                        
                        return {
                            key: key,
                            name: skill.name,
                            localizedName: displayName,
                            base: skill.base,
                            delete: skill.delete,
                            isDefault: true
                        };
                    });

                // 커스텀 스킬 추가
                Object.entries(customSkills).forEach(([key, data]) => {
                    // 기본 스킬이 아니고, cthulhu도 아닌 경우만 처리
                    if (!defaultSkills[key] && key !== 'cthulhu') {
                        // 새로운 구조 (객체) 또는 기존 구조 (문자열) 처리
                        const skillName = typeof data === 'object' ? data.name : data;
                        const skillBase = typeof data === 'object' ? data.base : 'body'; // 기본값을 'body'로 고정
                        
                        // 해당 능력치에 속하는 커스텀 스킬만 추가
                        if (skillBase === group.key) {
                            groupSkills.push({
                                key: key,
                                name: skillName,
                                localizedName: skillName,
                                base: skillBase,
                                delete: true
                            });
                        }
                    }
                });

                return {
                    attributeKey: group.key,
                    attributeName: group.name,
                    skills: groupSkills
                };
            });

            return {
                skillsByAttribute: skillsByAttribute,
                stageCRCEnabled: stageCRCEnabled
            };
        }

        activateListeners(html) {
            super.activateListeners(html);

            // 저장 버튼
            html.find('.save-skills').click(this._onSaveSkills.bind(this));

            // 스킬 추가 버튼
            html.find('.add-skill').click(this._onAddSkill.bind(this));

            // 스킬 삭제 버튼
            html.find('.delete-skill').click(this._onDeleteSkill.bind(this));

            // 커스텀 스킬 키 클릭 - 모든 액터에게 스킬 추가
            html.find('.clickable-skill-key').click(this._onAddSkillToActors.bind(this));
        }

        async _onSaveSkills(event) {
            event.preventDefault();
            
            // 기본 스킬 정의 (base 정보 포함)
            const defaultSkillBases = {
                melee: "body",
                evade: "body",
                ranged: "sense",
                perception: "sense",
                rc: "mind",
                will: "mind",
                negotiation: "social",
                procure: "social",
                cthulhu: "mind"
            };
            
            // 폼 데이터 수집
            const form = this.element.find('form')[0];
            const formData = new FormData(form);
            
            // 기존 커스텀 스킬 로드
            const customSkills = game.settings.get("double-cross-3rd", "customSkills") || {};
            
            // 각 스킬의 이름 업데이트
            for (const [key, value] of formData.entries()) {
                if (key.startsWith('skill-name-') && value.trim()) {
                    const skillKey = key.replace('skill-name-', '');
                    const trimmedValue = value.trim();
                    
                    // 기본 스킬의 경우 원래 이름과 다를 때만 저장
                    const originalName = this.getOriginalSkillName(skillKey);
                    if (originalName && trimmedValue !== originalName) {
                        // 기본 스킬의 이름을 변경한 경우 - base 정보도 함께 저장
                        const skillBase = defaultSkillBases[skillKey] || 'mind';
                        customSkills[skillKey] = {
                            name: trimmedValue,
                            base: skillBase
                        };
                    } else if (originalName && trimmedValue === originalName) {
                        // 원래 이름으로 돌아간 경우 커스텀 이름 삭제
                        delete customSkills[skillKey];
                    } else if (!originalName) {
                        // 커스텀 스킬인 경우 - 기존 구조 유지
                        if (typeof customSkills[skillKey] === 'object' && customSkills[skillKey].name) {
                            customSkills[skillKey].name = trimmedValue;
                        } else {
                            customSkills[skillKey] = trimmedValue;
                        }
                    }
                }
            }
            
            // 커스텀 스킬 저장
            await game.settings.set("double-cross-3rd", "customSkills", customSkills);
            
            // 모든 액터의 스킬 이름 업데이트
            const actors = game.actors.filter(a => a.type === 'character');
            let updatedActorCount = 0;
            
            for (const actor of actors) {
                const updates = {};
                let hasUpdates = false;
                
                // 1. 커스텀 스킬 이름 업데이트
                for (const [skillKey, customData] of Object.entries(customSkills)) {
                    // 액터가 해당 스킬을 가지고 있는지 확인
                    const actorSkill = actor.system?.attributes?.skills?.[skillKey];
                    if (actorSkill) {
                        const newName = typeof customData === 'object' ? customData.name : customData;
                        
                        // 이름이 다르면 업데이트
                        if (actorSkill.name !== newName) {
                            updates[`system.attributes.skills.${skillKey}.name`] = newName;
                            hasUpdates = true;
                        }
                    }
                }
                
                // 2. 기본 스킬의 필수 속성 확인 및 복원
                const defaultSkills = ['melee', 'evade', 'ranged', 'perception', 'rc', 'will', 'negotiation', 'procure', 'cthulhu'];
                for (const skillKey of defaultSkills) {
                    const actorSkill = actor.system?.attributes?.skills?.[skillKey];
                    if (actorSkill) {
                        // 필수 속성이 없으면 추가
                        if (actorSkill.point === undefined) {
                            updates[`system.attributes.skills.${skillKey}.point`] = 0;
                            hasUpdates = true;
                        }
                        if (actorSkill.bonus === undefined) {
                            updates[`system.attributes.skills.${skillKey}.bonus`] = 0;
                            hasUpdates = true;
                        }
                        if (actorSkill.extra === undefined) {
                            updates[`system.attributes.skills.${skillKey}.extra`] = 0;
                            hasUpdates = true;
                        }
                        if (actorSkill.base === undefined) {
                            // base 속성 추가 (defaultSkillBases에서 가져오기)
                            const skillBase = defaultSkillBases[skillKey] || 'mind';
                            updates[`system.attributes.skills.${skillKey}.base`] = skillBase;
                            hasUpdates = true;
                        }
                        if (actorSkill.delete === undefined) {
                            updates[`system.attributes.skills.${skillKey}.delete`] = false;
                            hasUpdates = true;
                        }
                    }
                }
                
                // 업데이트 실행
                if (hasUpdates) {
                    await actor.update(updates);
                    updatedActorCount++;
                }
            }
            
            ui.notifications.info(`스킬 설정이 저장되었습니다. (${updatedActorCount}명의 액터 업데이트됨)`);
            this.close();
        }

        async _onAddSkill(event) {
            const button = $(event.currentTarget);
            const attribute = button.data('attribute');
            const row = button.closest('.add-skill-row');
            const keyInput = row.find('.new-skill-key');
            const nameInput = row.find('.new-skill-name');
            const skillKey = keyInput.val().trim();
            const skillName = nameInput.val().trim();
            
            if (!skillName) {
                ui.notifications.warn('스킬 이름을 입력해주세요.');
                return;
            }
            
            if (!skillKey) {
                ui.notifications.warn('스킬 키를 입력해주세요.');
                return;
            }
            
            // 중복 키 체크
            const customSkills = game.settings.get("double-cross-3rd", "customSkills") || {};
            const defaultSkills = {
                melee: true, evade: true, ranged: true, perception: true,
                rc: true, will: true, negotiation: true, procure: true, cthulhu: true
            };
            
            if (defaultSkills[skillKey] || customSkills[skillKey]) {
                ui.notifications.warn(`스킬 키 "${skillKey}"는 이미 존재합니다.`);
                return;
            }
            
            // 커스텀 스킬 저장 (능력치 정보도 함께 저장)
            customSkills[skillKey] = {
                name: skillName,
                base: attribute
            };
            await game.settings.set("double-cross-3rd", "customSkills", customSkills);
            
            // 입력 필드 초기화 (플레이스홀더 값으로 복원)
            const keyPlaceholders = { body: "Drive", sense: "Ars", mind: "Know", social: "Info" };
            const namePlaceholders = { body: "운전: ", sense: "예술: ", mind: "지식: ", social: "정보: " };
            keyInput.val(keyPlaceholders[attribute] || '');
            nameInput.val(namePlaceholders[attribute] || '');
            
            // 다이얼로그 새로고침
            this.render(true);
            
            ui.notifications.info(`새 스킬 "${skillName}" (${skillKey})이 추가되었습니다.`);
        }

        async _onDeleteSkill(event) {
            const button = $(event.currentTarget);
            
            // disabled 상태인 경우 클릭 무시
            if (button.hasClass('disabled')) {
                return;
            }
            
            const skillKey = button.data('skill-key');
            
            if (!skillKey) return;
            
            // 확인 다이얼로그
            const confirmed = await Dialog.confirm({
                title: "스킬 삭제",
                content: `<p>정말로 이 스킬을 삭제하시겠습니까?</p><p><strong>${skillKey}</strong></p>`,
                yes: () => true,
                no: () => false
            });
            
            if (!confirmed) return;
            
            // 현재 커스텀 스킬 로드
            const customSkills = game.settings.get("double-cross-3rd", "customSkills") || {};
            delete customSkills[skillKey];
            
            // 저장
            await game.settings.set("double-cross-3rd", "customSkills", customSkills);
            
            // 다이얼로그 새로고침
            this.render(true);
            
            ui.notifications.info(`스킬 "${skillKey}"이 삭제되었습니다.`);
        }

        getOriginalSkillName(skillKey) {
            const defaultSkills = {
                melee: game.i18n.localize("DX3rd.melee"),
                evade: game.i18n.localize("DX3rd.evade"),
                ranged: game.i18n.localize("DX3rd.ranged"),
                perception: game.i18n.localize("DX3rd.perception"),
                rc: game.i18n.localize("DX3rd.rc"),
                will: game.i18n.localize("DX3rd.will"),
                negotiation: game.i18n.localize("DX3rd.negotiation"),
                procure: game.i18n.localize("DX3rd.procure"),
                cthulhu: game.i18n.localize("DX3rd.cthulhu")
            };
            
            return defaultSkills[skillKey] || null;
        }

        async _updateObject(event, formData) {
            // FormApplication의 기본 제출 처리
        }

        async _onAddSkillToActors(event) {
            event.preventDefault();
            
            const input = $(event.currentTarget);
            const skillKey = input.data('skill-key');
            const skillBase = input.data('skill-base');
            
            if (!skillKey || !skillBase) {
                ui.notifications.warn('스킬 정보를 찾을 수 없습니다.');
                return;
            }
            
            // 커스텀 스킬 정보 가져오기
            const customSkills = game.settings.get("double-cross-3rd", "customSkills") || {};
            const skillData = customSkills[skillKey];
            
            if (!skillData) {
                ui.notifications.warn(`스킬 "${skillKey}"를 찾을 수 없습니다.`);
                return;
            }
            
            const skillName = typeof skillData === 'object' ? skillData.name : skillData;
            
            // 확인 다이얼로그
            const confirmed = await Dialog.confirm({
                title: "스킬 추가 확인",
                content: `<p>스킬 "<strong>${skillName}</strong>" (${skillKey})을(를) 해당 스킬이 없는 모든 캐릭터 액터에게 추가하시겠습니까?</p>`,
                yes: () => true,
                no: () => false,
                defaultYes: false
            });
            
            if (!confirmed) return;
            
            // 모든 캐릭터 액터 찾기
            const actors = game.actors.filter(a => a.type === 'character');
            let addedCount = 0;
            let skippedCount = 0;
            
            for (const actor of actors) {
                // 이미 해당 스킬이 있는지 확인
                if (actor.system.attributes.skills[skillKey]) {
                    skippedCount++;
                    continue;
                }
                
                // 스킬 추가
                try {
                    await actor.update({
                        [`system.attributes.skills.${skillKey}`]: {
                            name: skillName,
                            point: 0,
                            bonus: 0,
                            extra: 0,
                            total: 0,
                            dice: 0,
                            add: 0,
                            base: skillBase,
                            delete: true
                        }
                    });
                    addedCount++;
                } catch (error) {
                    console.error(`DX3rd | Failed to add skill to actor ${actor.name}:`, error);
                }
            }
            
            ui.notifications.info(`스킬 "${skillName}"을(를) ${addedCount}명의 액터에게 추가했습니다. (건너뜀: ${skippedCount})`);
        }
    }

    // 전역 노출
    window.DX3rdSkillsSettingsDialog = DX3rdSkillsSettingsDialog;
})();

