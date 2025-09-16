# Vercel 배포 가이드

이 가이드는 관리자 인증 시스템이 포함된 특허 현황 조회 시스템을 Vercel에 배포하는 방법을 설명합니다.

## 1. Vercel 환경변수 설정

Vercel 대시보드에서 다음 환경변수들을 설정해야 합니다:

### 기존 환경변수 (유지)
```
NODE_ENV=production
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
DEFAULT_CUSTOMER_NUMBER=120190612244
# KIPRIS API 관련 환경변수 제거됨 (크롤링 기반으로 전환)
```

### 새로운 환경변수 (추가 필요)
```
# 관리자 계정 설정
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123!@#

# 세션 보안 설정
SESSION_SECRET=unic-patent-admin-session-secret-key-2024-production
SESSION_TIMEOUT=3600000
```

## 2. 환경변수 설정 방법

### 방법 1: Vercel CLI 사용
```bash
# Vercel CLI 설치 (아직 설치하지 않은 경우)
npm install -g vercel

# 환경변수 설정
vercel env add ADMIN_USERNAME
# 값 입력: admin

vercel env add ADMIN_PASSWORD
# 값 입력: admin123!@#

vercel env add SESSION_SECRET
# 값 입력: unic-patent-admin-session-secret-key-2024-production

vercel env add SESSION_TIMEOUT
# 값 입력: 3600000
```

### 방법 2: Vercel 대시보드 사용
1. [Vercel 대시보드](https://vercel.com/dashboard)에 로그인
2. 프로젝트 선택
3. Settings > Environment Variables 메뉴
4. 위의 환경변수들을 하나씩 추가

## 3. 보안 고려사항

### 강력한 비밀번호 설정
운영 환경에서는 반드시 강력한 비밀번호로 변경하세요:
```
ADMIN_PASSWORD=Your-Super-Strong-Password-Here!@#$2024
```

### SESSION_SECRET 보안
SESSION_SECRET은 최소 32자리 이상의 랜덤한 문자열을 사용하세요:
```bash
# Node.js에서 랜덤 문자열 생성
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 4. 배포 후 테스트

### 1. 기본 기능 테스트
- 메인 페이지: `https://your-app.vercel.app/`
- 등록특허 현황: `https://your-app.vercel.app/registered`
- 출원특허 현황: `https://your-app.vercel.app/application`

### 2. 관리자 기능 테스트
- Admin 메뉴 클릭 → 로그인 페이지 이동 확인
- 관리자 로그인: `https://your-app.vercel.app/admin/login`
- 관리자 등록특허 현황: `https://your-app.vercel.app/admin/registered`
- 일괄생성 기능 테스트

### 3. API 엔드포인트 테스트
- `/api/admin-login` - 관리자 로그인 API
- `/api/admin-logout` - 관리자 로그아웃 API
- `/api/admin-bulk-generate` - 일괄생성 API

## 5. 변경된 파일 목록

### 새로 생성된 파일
- `api/admin-login.js` - 관리자 로그인 서버리스 함수
- `api/admin-logout.js` - 관리자 로그아웃 서버리스 함수
- `api/admin-bulk-generate.js` - 일괄생성 서버리스 함수

### 수정된 파일
- `api/index.js` - 관리자 라우팅 추가
- `views/admin-login.ejs` - API 경로 수정
- `views/admin-registered.ejs` - API 경로 수정
- `views/partials/admin-nav.ejs` - API 경로 수정

## 6. 알려진 제한사항

### Vercel 서버리스 환경의 특징
1. **파일 시스템**: 임시 파일만 생성 가능
2. **세션 관리**: 쿠키 기반 간단한 인증 사용
3. **메모리 제한**: 1024MB (Pro: 3008MB)
4. **실행 시간**: 10초 (Pro: 900초)

### 개선 권장사항
1. **외부 세션 스토리지**: Redis 또는 데이터베이스 사용
2. **JWT 토큰**: 보다 보안적인 인증 방식
3. **파일 저장소**: AWS S3, Cloudinary 등 외부 저장소
4. **로깅 시스템**: 외부 로깅 서비스 연동

## 7. 트러블슈팅

### 환경변수 오류
```
Error: ADMIN_USERNAME is not defined
```
→ Vercel 환경변수 설정 확인

### 세션 오류
```
Error: session middleware requires secret
```
→ SESSION_SECRET 환경변수 설정 확인

### 권한 오류
```
Error: 관리자 권한이 필요합니다
```
→ 쿠키 설정 및 도메인 확인

## 8. 배포 명령어

```bash
# 프로젝트 배포
vercel --prod

# 환경변수 확인
vercel env ls

# 로그 확인
vercel logs
```

## 9. 운영 후 모니터링

1. **접속 로그 모니터링**
2. **오류 로그 확인**
3. **성능 메트릭 추적**
4. **보안 이벤트 모니터링**

---

**중요**: 운영 환경에서는 반드시 강력한 패스워드를 설정하고, HTTPS를 사용하며, 정기적인 보안 점검을 수행하세요.