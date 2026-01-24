# 아이템 Extend (확장 도구)

아이템 Extend는 이펙트, 사이오닉, 스펠 등의 아이템에 추가 효과를 부여하는 기능입니다. 아이템 시트 하단의 "확장 도구" 버튼으로 설정할 수 있습니다.

## Extend 종류

### 1. HP 회복 (Heal)
- **공식**: `nD10 + m` 형식의 회복량
- **타이밍**: `instant`, `afterSuccess`, `afterDamage`, `afterMain`
- **대상**: `self` (자신), `targetToken` (타겟), `targetAll` (자신+타겟)
- **옵션**:
  - `resurrect`: 리저렉트 (HP 0일 때만 사용 가능)
  - `rivival`: 전투불능 회복

### 2. HP 데미지 (Damage)
- **공식**: `nD10 + m` 형식의 데미지
- **타이밍**: `instant`, `afterSuccess`, `afterDamage`, `afterMain`
- **대상**: `self`, `targetToken`, `targetAll`
- **옵션**:
  - `ignoreReduce`: 경감 무시
  - `conditionalFormula`: 조건부 공식 (다이얼로그 입력)
  - `hpCost`: HP 비용 (아이템 사용 시 HP 소모)

### 3. 상태이상 (Condition)
- **타이밍**: `instant`, `afterSuccess`, `afterDamage`, `afterMain`
- **대상**: `self`, `targetToken`, `targetAll`
- **종류**: `poisoned`, `hatred`, `fear`, `berserk`, `rigor`, `pressure`, `dazed`
- **옵션**: `poisonedRank` (사독 랭크)

### 4. 아이템 생성
- **무기 (Weapon)**: 임시 무기 생성
- **방어구 (Protect)**: 임시 방어구 생성
- **비클 (Vehicle)**: 임시 비클 생성

## Extend 예시

아이템 시트 하단의 "확장 도구" 버튼을 눌러 UI에서 직접 설정할 수 있습니다.

### 예시 설정 값

#### 1. 성공 시 회복
- **종류**: HP 회복
- **타이밍**: 성공 시
- **대상**: 자신+타겟
- **공식**: 3D10 + 10

#### 2. 데미지 적용 시 추가 데미지
- **종류**: HP 데미지
- **타이밍**: 데미지 적용 시
- **대상**: 타겟
- **공식**: 1D10 + 0
- **옵션**: 경감 무시 체크

#### 3. 즉시 상태이상 부여
- **종류**: 상태이상
- **타이밍**: 즉시
- **대상**: 타겟
- **상태**: 사독
- **랭크**: 3

#### 4. 임시 무기 생성
- **종류**: 무기
- **이름**: 소환된 검
- **타입**: 백병
- **기능**: 백병
- **공격력**: +5
- **가드**: 0
- **사정거리**: 지근

#### 5. HP 비용 설정
- **종류**: HP 데미지
- **타이밍**: 즉시
- **대상**: 자신
- **옵션**: HP 비용 체크
- **HP 비용**: 10

---

## 주의사항

1. **타이밍**: 아이템의 `active.runTiming`과 Extend의 `timing`은 별개입니다
2. **대상 선택**: `targetToken` 또는 `targetAll` 사용 시 타겟을 미리 선택해야 합니다
3. **조건부 공식**: `conditionalFormula`를 활성화하면 사용 시마다 값을 입력받습니다
4. **아이템 생성**: 생성된 아이템은 임시 아이템으로 표시되며, 시트에서 삭제 가능합니다
5. **맨손 데이터 변경**: 무기 생성에서 맨손을 체크할 경우 아이템이 작성되는 대신 맨손의 데이터가 변경됩니다
6. **지원되지 않는 기능**: HP를 n값만큼 소모하여 그에 따라 성능이 변경되는 아이템의 작성은 지원하지 않습니다

----------

# Applied 효과 추가 매크로 가이드

## 기본 구조

```javascript
await actor.update({
  [`system.attributes.applied.고유키`]: {
    name: "효과 이름",
    source: "시전자 이름",
    disable: "비활성화 타이밍",
    img: "아이콘 경로",
    attributes: {
      // 속성들
    }
  }
});
```

---

## 어트리뷰트 (Attributes)

Applied 효과의 `attributes` 객체에 사용 가능한 속성들입니다.

### 기본 보정
- `dice`: 주사위 보정
- `add`: 고정값 보정

### 크리티컬
- `critical`: 크리티컬 값 보정
- `critical_min`: 크리티컬 하한치

### 타이밍별 보정
- `major_dice`, `major_add`, `major_critical`: 메이저 액션
- `reaction_dice`, `reaction_add`, `reaction_critical`: 리액션
- `dodge_dice`, `dodge_add`, `dodge_critical`: 닷지

### 전투 관련
- `armor`: 장갑치
- `guard`: 가드
- `reduce`: 경감
- `penetrate`: 장갑 무시
- `init`: 행동치
- `attack`: 공격력
- `damage_roll`: 데미지 롤

### 능력치/기능 보정

특정 능력치나 기능에 개별 보정을 적용합니다:

```javascript
{
  key: "속성타입",    // "stat_bonus", "stat_dice", "stat_add"
  label: "대상",      // 능력치/기능 키
  value: 보정값
}
```

**능력치 키:** `body`, `sense`, `mind`, `social`

**기능 키:** `melee`, `evade`, `ranged`, `perception`, `rc`, `will`, `negotiation`, `procure` 등

### 기타
- `hp`: HP 보정
- `move`: 이동력 보정
- `stock`: 재산점 보정

---

## 디스에이블 타이밍 (Disable)

`disable` 속성은 효과가 자동으로 제거되는 시점을 결정합니다:

- `'-'`: 수동으로만 제거 (기본값)
- `'roll'`: 판정 이후
- `'major'`: 메이저 이후
- `'reaction'`: 리액션 이후
- `'main'`: 메인 프로세스 이후
- `'turn'`: 턴 종료 시
- `'round'`: 라운드 종료 시
- `'scene'`: 장면 종료 시
- `'session'`: 세션 종료 시

---

## 샘플

### 1. 기본 버프

```javascript
const actor = canvas.tokens.controlled[0]?.actor;
if (!actor) return;

await actor.update({
  [`system.attributes.applied.buff`]: {
    name: "전투 준비",
    source: actor.name,
    disable: 'scene',
    img: 'icons/svg/aura.svg',
    attributes: {
      dice: 2,
      add: 3
    }
  }
});

ui.notifications.info("전투 준비 효과가 적용되었습니다.");
```

### 2. 크리티컬 보정

```javascript
const actor = canvas.tokens.controlled[0]?.actor;
if (!actor) return;

await actor.update({
  [`system.attributes.applied.critical_buff`]: {
    name: "정밀 조준",
    disable: 'turn',
    img: 'icons/svg/target.svg',
    attributes: {
      critical: -2,
      critical_min: 7
    }
  }
});
```

### 3. 능력치 보정

```javascript
const actor = canvas.tokens.controlled[0]?.actor;
if (!actor) return;

await actor.update({
  [`system.attributes.applied.stat_buff`]: {
    name: "능력 강화",
    disable: 'scene',
    img: 'icons/svg/aura.svg',
    attributes: {
      "stat_bonus_body": {
        key: "stat_bonus",
        label: "body",
        value: 3
      },
      "stat_dice_perception": {
        key: "stat_dice",
        label: "perception",
        value: 2
      }
    }
  }
});
```

### 4. 아이템 기반 효과

```javascript
const actor = canvas.tokens.controlled[0]?.actor;
if (!actor) return;

const item = actor.items.getName("아이템명");
if (!item) {
  ui.notifications.warn("아이템을 찾을 수 없습니다.");
  return;
}

await actor.update({
  [`system.attributes.applied.${item.id}`]: {
    itemId: item.id,
    name: item.name,
    img: item.img,
    disable: 'scene',
    attributes: {
      dice: 2,
      add: 5
    }
  }
});
```

### 5. 다이얼로그 입력 기반

```javascript
const actor = canvas.tokens.controlled[0]?.actor;
if (!actor) return;

new Dialog({
  title: "값 입력",
  content: `
    <form>
      <div class="form-group">
        <label>보정값:</label>
        <input type="number" name="value" value="0" style="width: 100%;"/>
      </div>
    </form>
  `,
  buttons: {
    ok: {
      label: "확인",
      callback: async (html) => {
        const value = parseInt(html.find('input[name="value"]').val());
        
        await actor.update({
          [`system.attributes.applied.dynamic_${Date.now()}`]: {
            name: "동적 효과",
            disable: 'round',
            img: 'icons/svg/aura.svg',
            attributes: {
              dice: value
            }
          }
        });
      }
    }
  }
}).render(true);
```

## 주의사항

1. **고유 키**: 각 효과는 고유한 키를 가져야 합니다. `Date.now()` 또는 아이템 ID 사용 권장
2. **액터 확인**: 매크로 실행 전에 항상 액터 존재 여부 확인
3. **기존 효과**: 같은 키를 사용하면 기존 효과를 덮어씁니다

---
