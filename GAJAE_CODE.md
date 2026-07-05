# Gajae-Code Luvel Workflow

Luvel 개발에서는 Gajae-Code를 별도 코딩 에이전트 실행 하네스로만 사용한다. 앱 코드나 CI에 런타임 의존성으로 추가하지 않는다.

## 기본 흐름

1. 요구가 모호하면 `deep-interview`로 질문을 먼저 정리한다.
2. 구현 전 `ralplan`으로 변경 범위, 대상 파일, 검증 명령을 확정한다.
3. 실행은 `ultragoal`로 목표, 수정, 검증 증거를 기록한다.
4. 병렬 작업은 파일 소유권이 분리될 때만 `team`을 쓴다.

## Luvel 적용 기준

- 식단 관련 파일은 사용자가 명시하지 않으면 Gajae-Code 작업 범위에서도 제외한다.
- 크롤러/마스터 데이터 작업은 `apps/backend/data_tools`, `apps/backend/app/adapters`, 관련 테스트를 우선 범위로 둔다.
- 코드 변경 전 `git status --short --branch`와 관련 diff를 확인한다.
- 완료 전 최소 검증은 변경 범위 테스트와 문법 컴파일이다.

## 실행 예시

```powershell
gjc --worktree JHJ/luvel-crawler-fix
```

```text
/skill:deep-interview clarify ambiguous Luvel crawler requirements
/skill:ralplan build a scoped implementation plan
gjc ultragoal create-goals --brief-file <approved-plan>
gjc ultragoal complete-goals
```
