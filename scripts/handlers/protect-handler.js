// Protect 아이템 핸들러
(function() {
window.DX3rdProtectHandler = {
    async handle(actorId, itemId) {
        const actor = game.actors.get(actorId);
        // 액터의 아이템에서 먼저 찾고, 없으면 game.items에서 찾기
        const item = actor?.items.get(itemId) || game.items.get(itemId);
        
        if (!actor || !item) {
            console.error("DX3rd | ProtectHandler - Actor or Item not found", { actorId, itemId });
            return;
        }
        
        // 수식 평가 결과 로그
        const rawData = {
            dodge: item.system.dodge,
            init: item.system.init,
            armor: item.system.armor
        };
        
        const evaluatedData = {
            dodge: window.DX3rdFormulaEvaluator.evaluate(item.system.dodge, item, actor),
            init: window.DX3rdFormulaEvaluator.evaluate(item.system.init, item, actor),
            armor: window.DX3rdFormulaEvaluator.evaluate(item.system.armor, item, actor)
        };
        
        // TODO: 프로텍트 아이템 사용 로직 구현
    }
};
})();
