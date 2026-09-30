# Supabase 연결 가이드

PlanDoSee는 브라우저에서 Supabase를 직접 호출하지 않습니다.

구조는 아래와 같습니다.

```text
Browser
  -> Vercel Functions (/api/*)
      -> DATABASE_URL
          -> Supabase PostgreSQL
```

이 구조에서는 DB 비밀번호나 Supabase secret key가 `index.html`, `script.js`, Network 응답에 포함되지 않습니다.

## 1. Supabase 프로젝트 만들기

1. https://supabase.com 에 로그인합니다.
2. **New project**를 선택합니다.
3. 프로젝트 이름과 Database Password를 설정합니다.
4. 생성이 끝날 때까지 기다립니다.

Database Password는 뒤에서 연결 문자열에 사용하므로 보관합니다.

## 2. 테이블 만들기

1. Supabase Dashboard에서 **SQL Editor**로 이동합니다.
2. 이 프로젝트의 `database/schema.sql` 전체를 붙여 넣습니다.
3. **Run**을 실행합니다.
4. Table Editor에서 다음 테이블이 생겼는지 확인합니다.

```text
plans
plan_versions
tasks
task_status_events
execution_logs
reviews
```

`schema.sql` 마지막에는 `anon`, `authenticated` 역할의 직접 테이블 권한을 제거하는 구문도 포함되어 있습니다. 이 프로젝트는 Vercel API를 통해서만 DB를 사용합니다.

## 3. Transaction pooler 주소 복사

Vercel Functions는 짧게 실행되는 서버리스 함수이므로 Supabase의 Transaction pooler를 사용합니다.

1. Supabase 프로젝트 상단의 **Connect**를 누릅니다.
2. **Transaction pooler**를 선택합니다.
3. URI 형식의 연결 문자열을 복사합니다.

형태는 대략 다음과 같습니다.

```text
postgresql://postgres.PROJECT_REF:PASSWORD@POOLER_HOST:6543/postgres
```

비밀번호 자리에 실제 Database Password를 넣습니다.

현재 프로젝트의 `lib/db.js`가 PostgreSQL 연결의 SSL 옵션을 처리하므로, Vercel의 `DATABASE_URL`에는 Supabase가 보여 주는 Transaction pooler URI를 그대로 사용합니다. URI 끝에 `?sslmode=require`를 추가하지 않습니다.

```text
postgresql://postgres.PROJECT_REF:PASSWORD@POOLER_HOST:6543/postgres
```

참고:
- https://supabase.com/docs/guides/database/connecting-to-postgres

## 4. Vercel 환경 변수 등록

Vercel 프로젝트에서:

```text
Settings
-> Environment Variables
-> Add New
```

다음을 추가합니다.

```text
Name  : DATABASE_URL
Value : 위에서 복사한 Transaction pooler URI
```

Production / Preview / Development 중 필요한 환경에 체크합니다.

주의:

- `DATABASE_URL`은 `script.js`에 넣지 않습니다.
- `.env` 파일을 GitHub에 올리지 않습니다.
- Supabase publishable/anon key도 현재 구조에서는 필요하지 않습니다.
- service_role/secret key도 필요하지 않습니다.

## 5. Vercel 재배포

환경 변수 저장 후 Vercel에서 다시 배포합니다.

배포가 끝나면 브라우저에서 다음 주소를 확인할 수 있습니다.

```text
https://YOUR-SITE.vercel.app/api/health
```

정상 연결이면 다음과 비슷한 JSON이 나옵니다.

```json
{
  "ok": true,
  "database": "postgres",
  "serverTime": "..."
}
```

## 6. 실제 데이터 입력

DB 연결이 끝나면 샘플 데이터가 아니라 직접 사용할 계획을 입력합니다.

권장 흐름:

```text
계획 1개 이상
-> 할 일 5개 이상
-> 실제 실행 기록 3개 이상
-> 일부 완료 처리
-> 필요하면 막힌 이유 기록
-> 돌아보기에서 개선점 저장
```

예시는 소스에 미리 저장하지 않습니다. 실제 사용하면서 만든 데이터가 서버 DB에 남아야 합니다.

## 7. 최종 확인

다음을 확인합니다.

```text
새로고침 전후 데이터 동일
계획 수정 전 버전 보존
완료 -> 진행 중 되돌리기 가능
완료 버튼 연속 요청에도 상태 이벤트 1건만 증가
실행 기록 시작/종료/실제시간/막힘 저장
돌아보기 집계 숫자와 근거 목록 일치
JSON 내보내기 정상
브라우저 소스/Network/Console에 DATABASE_URL 없음
```


## 8. 캘린더 / 기간별 돌아보기

추가 테이블은 필요하지 않습니다. 기존 `tasks.due_date`, `execution_logs.started_at`, `plan_versions.start_date/end_date`를 사용합니다.

- 캘린더: 현재 계획의 마감일, 계획 기간, 실행 기록을 조회합니다.
- 날짜 상세: `/api/executions?planId=...`와 현재 계획의 전체 할 일을 사용합니다.
- 기간별 돌아보기: `/api/review?planId=...&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` 형식으로 조회합니다.
- 전체 계획 회고 스냅샷과 개선점은 기존 `reviews` 테이블에 그대로 보존됩니다.
